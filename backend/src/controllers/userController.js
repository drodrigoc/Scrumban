const logger = require('../config/logger');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

exports.getAll = async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, name, email, role, sgc_access, unit, is_active, avatar, created_at FROM users ORDER BY name'
    );
    res.json(users);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al obtener usuarios' });
  }
};

exports.getById = async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, name, email, role, sgc_access, unit, is_active, avatar, created_at FROM users WHERE id = ?',
      [req.params.id]
    );
    if (!users.length) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json(users[0]);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al obtener usuario' });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, email, password, role, unit } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Nombre, email y contraseña son requeridos' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing.length) {
      return res.status(409).json({ message: 'El email ya está registrado' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (name, email, password, role, unit) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), email.toLowerCase().trim(), hashed, role || 'member', unit || null]
    );

    res.status(201).json({
      id: result.insertId,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      role: role || 'member',
      unit: unit || null,
      is_active: true,
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al crear usuario' });
  }
};

exports.update = async (req, res) => {
  try {
    const { name, email, role, unit, is_active, avatar, sgc_access } = req.body;
    const { id } = req.params;

    if (req.user.role !== 'admin' && req.user.id !== parseInt(id)) {
      return res.status(403).json({ message: 'Sin permisos para editar este usuario' });
    }

    const fields = [];
    const values = [];

    if (name)              { fields.push('name = ?');      values.push(name.trim()); }
    if (email)             { fields.push('email = ?');     values.push(email.toLowerCase().trim()); }
    if (avatar !== undefined) { fields.push('avatar = ?'); values.push(avatar); }
    if (unit !== undefined)   { fields.push('unit = ?');   values.push(unit || null); }

    if (req.user.role === 'admin') {
      if (role)                     { fields.push('role = ?');       values.push(role); }
      if (is_active !== undefined)  { fields.push('is_active = ?');  values.push(is_active); }
      if (sgc_access !== undefined) { fields.push('sgc_access = ?'); values.push(sgc_access ? 1 : 0); }
    }

    if (!fields.length) return res.status(400).json({ message: 'No hay campos para actualizar' });

    values.push(id);
    await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);

    const [updated] = await db.query(
      'SELECT id, name, email, role, sgc_access, unit, is_active, avatar FROM users WHERE id = ?',
      [id]
    );
    res.json(updated[0]);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al actualizar usuario' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    const { id } = req.params;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, id]);
    res.json({ message: 'Contraseña restablecida correctamente' });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al restablecer contraseña' });
  }
};

exports.toggleStatus = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.id === parseInt(id)) {
      return res.status(400).json({ message: 'No puedes deshabilitar tu propia cuenta' });
    }
    await db.query('UPDATE users SET is_active = NOT is_active WHERE id = ?', [id]);
    const [users] = await db.query(
      'SELECT id, name, email, role, unit, is_active FROM users WHERE id = ?',
      [id]
    );
    res.json(users[0]);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al cambiar estado' });
  }
};

exports.getStats = async (req, res) => {
  try {
    const [stats] = await db.query(`
      SELECT
        u.id, u.name, u.avatar, u.unit,
        COUNT(DISTINCT t.id) as total_tasks,
        SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
        SUM(CASE WHEN t.status != 'completed' AND t.due_date < CURDATE() THEN 1 ELSE 0 END) as overdue_tasks
      FROM users u
      LEFT JOIN tasks t ON t.assignee_id = u.id
      WHERE u.is_active = 1
      GROUP BY u.id
      ORDER BY total_tasks DESC
    `);
    res.json(stats);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al obtener estadísticas' });
  }
};

exports.getTeamOverview = async (req, res) => {
  try {
    const { role, unit, id: coordId } = req.user;
    const isCoordinator = role === 'coordinator';

    // Coordinator without a unit assigned cannot see any members
    if (isCoordinator && !unit) {
      return res.json({ members: [], restricted: true, unit: null });
    }

    // ── Scope helpers (safe to interpolate: coordId comes from verified JWT) ──
    //
    // "Visible projects" for a coordinator = projects they own OR are a member of.
    const visibleProjectsSql = `
      SELECT id FROM projects WHERE owner_id = ${coordId}
      UNION
      SELECT project_id FROM project_members WHERE user_id = ${coordId}
    `;

    // "Visible members" for a coordinator = users from their unit
    //   + users who are project_members of any visible project
    //   + users who have tasks assigned in any visible project
    // This covers the case where someone from another unit was added to a coordinator's project.
    const memberWhere = isCoordinator
      ? `WHERE u.is_active = 1
           AND (
             u.unit = ?
             OR u.id IN (
               SELECT DISTINCT pm.user_id
               FROM project_members pm
               WHERE pm.project_id IN (${visibleProjectsSql})
             )
           )`
      : 'WHERE u.is_active = 1';

    const memberParams = isCoordinator ? [unit] : [];

    // Task stats in the members query are scoped to visible projects for coordinators
    // so the numbers reflect only work within the coordinator's scope.
    const taskJoinFilter = isCoordinator
      ? `AND t.project_id IN (${visibleProjectsSql})`
      : '';

    const [members] = await db.query(`
      SELECT
        u.id, u.name, u.email, u.role, u.unit, u.avatar,
        COUNT(DISTINCT t.id)                                                                 AS total_tasks,
        SUM(CASE WHEN t.status = 'pending'     THEN 1 ELSE 0 END)                           AS pending_tasks,
        SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END)                           AS in_progress_tasks,
        SUM(CASE WHEN t.status = 'in_review'   THEN 1 ELSE 0 END)                           AS in_review_tasks,
        SUM(CASE WHEN t.status = 'completed'   THEN 1 ELSE 0 END)                           AS completed_tasks,
        SUM(CASE WHEN t.status != 'completed' AND t.due_date < CURDATE() THEN 1 ELSE 0 END) AS overdue_tasks
      FROM users u
      LEFT JOIN tasks t ON t.assignee_id = u.id ${taskJoinFilter}
      ${memberWhere}
      GROUP BY u.id
      ORDER BY u.unit, u.name
    `, memberParams);

    // Fetch task details only for visible members, scoped to visible projects
    let tasks = [];
    if (members.length) {
      const ids          = members.map(m => m.id);
      const placeholders = ids.map(() => '?').join(',');

      const taskProjectFilter = isCoordinator
        ? `AND t.project_id IN (${visibleProjectsSql})`
        : '';

      const [rows] = await db.query(`
        SELECT
          t.id, t.title, t.status, t.priority, t.due_date, t.start_date, t.progress,
          t.assignee_id,
          p.id AS project_id, p.name AS project_name, p.color AS project_color
        FROM tasks t
        JOIN projects p ON p.id = t.project_id
        WHERE t.assignee_id IN (${placeholders})
          ${taskProjectFilter}
        ORDER BY
          CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END,
          CASE WHEN t.due_date IS NULL     THEN 1 ELSE 0 END,
          t.due_date ASC
      `, ids);
      tasks = rows;
    }

    const result = members.map(m => ({
      ...m,
      tasks: tasks.filter(t => t.assignee_id === m.id),
    }));

    res.json({
      members:    result,
      restricted: isCoordinator,
      unit:       isCoordinator ? unit : null,
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al obtener visión del equipo' });
  }
};
