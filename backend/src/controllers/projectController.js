const logger = require('../config/logger');
const db = require('../config/database');

exports.getAll = async (req, res) => {
  try {
    let query;
    let params = [];

    if (['admin', 'superViewer'].includes(req.user.role)) {
      query = `
        SELECT p.*, u.name as owner_name,
          COUNT(DISTINCT t.id) as total_tasks,
          COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_tasks,
          COUNT(DISTINCT pm.user_id) as member_count
        FROM projects p
        LEFT JOIN users u ON p.owner_id = u.id
        LEFT JOIN tasks t ON t.project_id = p.id
        LEFT JOIN project_members pm ON pm.project_id = p.id
        GROUP BY p.id
        ORDER BY p.updated_at DESC
      `;
    } else {
      query = `
        SELECT p.*, u.name as owner_name,
          COUNT(DISTINCT t.id) as total_tasks,
          COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_tasks,
          COUNT(DISTINCT pm.user_id) as member_count
        FROM projects p
        LEFT JOIN users u ON p.owner_id = u.id
        LEFT JOIN tasks t ON t.project_id = p.id
        LEFT JOIN project_members pm ON pm.project_id = p.id
        WHERE p.owner_id = ? OR EXISTS (
          SELECT 1 FROM project_members pm2 WHERE pm2.project_id = p.id AND pm2.user_id = ?
        )
        GROUP BY p.id
        ORDER BY p.updated_at DESC
      `;
      params = [req.user.id, req.user.id];
    }

    const [projects] = await db.query(query, params);

    // Progreso = tareas completadas / total (columna 'completed' es fija)
    const enriched = projects.map(p => ({
      ...p,
      progress: p.total_tasks > 0
        ? Math.round((p.completed_tasks / p.total_tasks) * 100)
        : (p.progress || 0),
    }));

    res.json(enriched);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al obtener proyectos' });
  }
};

exports.getById = async (req, res) => {
  try {
    const [projects] = await db.query(
      `SELECT p.*, u.name as owner_name
       FROM projects p LEFT JOIN users u ON p.owner_id = u.id WHERE p.id = ?`,
      [req.params.id]
    );

    if (!projects.length) return res.status(404).json({ message: 'Proyecto no encontrado' });

    const project = projects[0];

    // Verificar acceso
    if (!['admin', 'superViewer'].includes(req.user.role) && project.owner_id !== req.user.id) {
      const [membership] = await db.query(
        'SELECT id FROM project_members WHERE project_id = ? AND user_id = ?',
        [req.params.id, req.user.id]
      );
      if (!membership.length) return res.status(403).json({ message: 'Sin acceso a este proyecto' });
    }

    // Obtener miembros
    const [members] = await db.query(
      `SELECT u.id, u.name, u.email, u.avatar, u.role as system_role, pm.role as project_role
       FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ?`,
      [req.params.id]
    );

    // Contar tareas por estado
    const [taskStats] = await db.query(
      `SELECT status, COUNT(*) as count FROM tasks WHERE project_id = ? GROUP BY status`,
      [req.params.id]
    );

    // Total de costos de tareas
    const [costResult] = await db.query(
      `SELECT COALESCE(SUM(costo), 0) as total_costo FROM tasks WHERE project_id = ? AND costo IS NOT NULL`,
      [req.params.id]
    );

    res.json({ ...project, members, taskStats, total_costo: parseFloat(costResult[0].total_costo) });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al obtener proyecto' });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, description, objectives, start_date, end_date, status, color, members, presupuesto } = req.body;

    if (!name) return res.status(400).json({ message: 'El nombre es requerido' });

    const [result] = await db.query(
      `INSERT INTO projects (name, description, objectives, start_date, end_date, status, color, owner_id, presupuesto)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description, objectives, start_date, end_date, status || 'active', color || '#3B82F6', req.user.id, presupuesto || null]
    );

    const projectId = result.insertId;

    // Agregar miembros si se proporcionaron
    if (members && members.length) {
      const memberValues = members.map(m => [projectId, m.user_id, m.role || 'member']);
      await db.query('INSERT INTO project_members (project_id, user_id, role) VALUES ?', [memberValues]);
    }

    const [projects] = await db.query('SELECT * FROM projects WHERE id = ?', [projectId]);
    res.status(201).json(projects[0]);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al crear proyecto' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, objectives, start_date, end_date, status, color, presupuesto } = req.body;

    const fields = [];
    const values = [];

    if (name) { fields.push('name = ?'); values.push(name); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (objectives !== undefined) { fields.push('objectives = ?'); values.push(objectives); }
    if (start_date) { fields.push('start_date = ?'); values.push(start_date); }
    if (end_date) { fields.push('end_date = ?'); values.push(end_date); }
    if (status) { fields.push('status = ?'); values.push(status); }
    if (color) { fields.push('color = ?'); values.push(color); }
    if (presupuesto !== undefined) { fields.push('presupuesto = ?'); values.push(presupuesto || null); }

    if (!fields.length) return res.status(400).json({ message: 'Sin campos para actualizar' });

    values.push(id);
    await db.query(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, values);

    const [projects] = await db.query('SELECT * FROM projects WHERE id = ?', [id]);
    res.json(projects[0]);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al actualizar proyecto' });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const [projects] = await db.query('SELECT owner_id FROM projects WHERE id = ?', [id]);

    if (!projects.length) return res.status(404).json({ message: 'Proyecto no encontrado' });
    if (req.user.role !== 'admin' && projects[0].owner_id !== req.user.id) {
      return res.status(403).json({ message: 'Solo el dueño o admin puede eliminar el proyecto' });
    }

    await db.query('DELETE FROM projects WHERE id = ?', [id]);
    res.json({ message: 'Proyecto eliminado' });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al eliminar proyecto' });
  }
};

exports.addMember = async (req, res) => {
  try {
    const { user_id, role } = req.body;
    const { id } = req.params;

    const [existing] = await db.query(
      'SELECT id FROM project_members WHERE project_id = ? AND user_id = ?',
      [id, user_id]
    );
    if (existing.length) return res.status(409).json({ message: 'El usuario ya es miembro' });

    await db.query(
      'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)',
      [id, user_id, role || 'member']
    );

    await createNotification(user_id, 'Añadido a proyecto', `Has sido añadido a un proyecto`, 'project_update', id, 'project');

    res.status(201).json({ message: 'Miembro agregado' });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al agregar miembro' });
  }
};

exports.updateMemberRole = async (req, res) => {
  try {
    const { role } = req.body;
    const { id, userId } = req.params;

    const allowed = ['coordinator', 'member', 'viewer'];
    if (!allowed.includes(role)) {
      return res.status(400).json({ message: 'Rol no válido' });
    }

    // Solo puede cambiar roles: admin, coordinador global, dueño del proyecto
    // o quien tenga project_role = coordinator en este proyecto
    if (!['admin', 'coordinator'].includes(req.user.role)) {
      const [proj] = await db.query('SELECT owner_id FROM projects WHERE id = ?', [id]);
      if (!proj.length) return res.status(404).json({ message: 'Proyecto no encontrado' });

      if (proj[0].owner_id !== req.user.id) {
        const [membership] = await db.query(
          'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
          [id, req.user.id]
        );
        if (!membership.length || membership[0].role !== 'coordinator') {
          return res.status(403).json({ message: 'Sin permisos para cambiar roles' });
        }
      }
    }

    await db.query(
      'UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?',
      [role, id, userId]
    );
    res.json({ message: 'Rol actualizado' });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al actualizar rol' });
  }
};

exports.removeMember = async (req, res) => {
  try {
    await db.query(
      'DELETE FROM project_members WHERE project_id = ? AND user_id = ?',
      [req.params.id, req.params.userId]
    );
    res.json({ message: 'Miembro eliminado' });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al eliminar miembro' });
  }
};

exports.getLabels = async (req, res) => {
  try {
    const [labels] = await db.query('SELECT * FROM labels WHERE project_id = ?', [req.params.id]);
    res.json(labels);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener etiquetas' });
  }
};

exports.createLabel = async (req, res) => {
  try {
    const { name, color } = req.body;
    const [result] = await db.query(
      'INSERT INTO labels (name, color, project_id) VALUES (?, ?, ?)',
      [name, color || '#6366F1', req.params.id]
    );
    res.status(201).json({ id: result.insertId, name, color: color || '#6366F1', project_id: req.params.id });
  } catch (error) {
    res.status(500).json({ message: 'Error al crear etiqueta' });
  }
};

async function createNotification(userId, title, message, type, refId, refType) {
  try {
    await db.query(
      'INSERT INTO notifications (user_id, title, message, type, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, title, message, type, refId, refType]
    );
  } catch (_) {}
}
