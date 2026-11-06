const logger = require('../config/logger');
const db = require('../config/database');
const notificaciones = require('../services/notificaciones');
const { permisosDeArchivo } = require('../middleware/auth');
const { eliminarAdjunto } = require('./taskController');
const auditoria = require('../services/auditoria');

const ROL_LEGIBLE = { coordinator: 'coordinador', member: 'miembro', viewer: 'observador' };
const nombreDe = async (userId) => {
  const [[u]] = await db.query('SELECT name, email FROM users WHERE id = ?', [userId]);
  return u ? `${u.name} <${u.email}>` : `usuario #${userId}`;
};

const ROLES_PROYECTO = ['coordinator', 'member', 'viewer'];

// GET /api/projects            → proyectos activos
// GET /api/projects?archivados=1 → solo los archivados
exports.getAll = async (req, res) => {
  try {
    const archivados = req.query.archivados === '1' || req.query.archivados === 'true';
    const veTodos = ['admin', 'superViewer'].includes(req.user.role);

    const condiciones = [archivados ? 'p.archived_at IS NOT NULL' : 'p.archived_at IS NULL'];
    const params = [req.user.id];
    if (!veTodos) {
      // El coordinador ve además los proyectos de su unidad (la del dueño)
      const deSuUnidad = req.user.role === 'coordinator' && req.user.unit;
      condiciones.push(`(p.owner_id = ? OR EXISTS (
        SELECT 1 FROM project_members pm2 WHERE pm2.project_id = p.id AND pm2.user_id = ?
      )${deSuUnidad ? ' OR u.unit = ?' : ''})`);
      params.push(req.user.id, req.user.id);
      if (deSuUnidad) params.push(req.user.unit);
    }

    const [projects] = await db.query(`
      SELECT p.*, u.name AS owner_name, u.unit AS owner_unit,
        ab.name AS archived_by_name,
        (SELECT role FROM project_members WHERE project_id = p.id AND user_id = ?) AS mi_rol,
        COUNT(DISTINCT t.id) AS total_tasks,
        COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) AS completed_tasks,
        COUNT(DISTINCT pm.user_id) AS member_count
      FROM projects p
      LEFT JOIN users u  ON p.owner_id = u.id
      LEFT JOIN users ab ON p.archived_by = ab.id
      LEFT JOIN tasks t ON t.project_id = p.id
      LEFT JOIN project_members pm ON pm.project_id = p.id
      WHERE ${condiciones.join(' AND ')}
      GROUP BY p.id
      ORDER BY ${archivados ? 'p.archived_at' : 'p.updated_at'} DESC
    `, params);

    // Progreso = tareas completadas / total (columna 'completed' es fija),
    // y qué puede hacer quien consulta con cada proyecto
    const enriched = projects.map(({ mi_rol, ...proyecto }) => {
      const permisos = permisosDeArchivo(req.user, proyecto, mi_rol);
      return {
        ...proyecto,
        progress: proyecto.total_tasks > 0
          ? Math.round((proyecto.completed_tasks / proyecto.total_tasks) * 100)
          : (proyecto.progress || 0),
        puede_editar: !proyecto.archived_at && (req.user.role === 'admin' || proyecto.owner_id === req.user.id),
        puede_archivar: permisos.archivar,
        puede_eliminar: permisos.eliminar,
      };
    });

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
    // El acceso ya lo verificó la ruta (requireProjectAccess)

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

    // Qué puede hacer quien consulta, para que la interfaz no ofrezca
    // acciones que el servidor va a rechazar
    const { lectura, escritura, gestion, archivar, eliminar } = req.acceso;
    res.json({
      ...project, members, taskStats, total_costo: parseFloat(costResult[0].total_costo),
      mi_acceso: { lectura, escritura, gestion, archivar, eliminar },
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al obtener proyecto' });
  }
};

exports.create = async (req, res) => {
  try {
    // Igual que en la interfaz: solo administradores y coordinadores crean
    // proyectos (el Super Visor es de solo lectura)
    if (!['admin', 'coordinator'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Solo administradores y coordinadores pueden crear proyectos' });
    }

    const { name, description, objectives, start_date, end_date, status, color, members, presupuesto } = req.body;

    if (!name) return res.status(400).json({ message: 'El nombre es requerido' });

    if (members?.some(m => m.role && !ROLES_PROYECTO.includes(m.role))) {
      return res.status(400).json({ message: 'Rol de miembro no válido' });
    }

    // El proyecto y sus miembros se guardan juntos: si falla un miembro,
    // no queda un proyecto a medias
    const conn = await db.getConnection();
    let projectId;
    try {
      await conn.beginTransaction();
      const [result] = await conn.query(
        `INSERT INTO projects (name, description, objectives, start_date, end_date, status, color, owner_id, presupuesto)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, description, objectives, start_date, end_date, status || 'active', color || '#3B82F6', req.user.id, presupuesto || null]
      );
      projectId = result.insertId;

      if (members && members.length) {
        const memberValues = members.map(m => [projectId, m.user_id, m.role || 'member']);
        await conn.query('INSERT INTO project_members (project_id, user_id, role) VALUES ?', [memberValues]);
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    const [projects] = await db.query('SELECT * FROM projects WHERE id = ?', [projectId]);
    auditoria.registrar(req, {
      accion: 'proyecto_creado', entidad: 'proyecto', entidadId: projectId, entidadNombre: projects[0].name,
      detalle: members?.length ? `${members.length} miembro(s) iniciales` : null,
    });
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

// PATCH /api/projects/:id/archive — sale de la lista y queda de solo lectura
exports.archive = async (req, res) => {
  try {
    if (!req.acceso.archivar) {
      return res.status(403).json({ message: 'Solo un administrador o el coordinador de la unidad puede archivar este proyecto' });
    }
    if (req.acceso.archivado) return res.status(400).json({ message: 'El proyecto ya está archivado' });

    await db.query('UPDATE projects SET archived_at = NOW(), archived_by = ? WHERE id = ?', [req.user.id, req.params.id]);
    auditoria.registrar(req, { accion: 'proyecto_archivado', entidad: 'proyecto', entidadId: Number(req.params.id) });
    res.json({ message: 'Proyecto archivado' });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al archivar el proyecto' });
  }
};

// PATCH /api/projects/:id/unarchive — vuelve a la lista con todo lo que tenía
exports.unarchive = async (req, res) => {
  try {
    if (!req.acceso.archivar) {
      return res.status(403).json({ message: 'Solo un administrador o el coordinador de la unidad puede restaurar este proyecto' });
    }
    if (!req.acceso.archivado) return res.status(400).json({ message: 'El proyecto no está archivado' });

    await db.query('UPDATE projects SET archived_at = NULL, archived_by = NULL WHERE id = ?', [req.params.id]);
    auditoria.registrar(req, { accion: 'proyecto_restaurado', entidad: 'proyecto', entidadId: Number(req.params.id) });
    res.json({ message: 'Proyecto restaurado' });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al restaurar el proyecto' });
  }
};

// DELETE /api/projects/:id   body: { confirmar: "<nombre exacto del proyecto>" }
//
// Borrar un proyecto arrastra sus tareas, comentarios, historial,
// presupuesto y fases, y no se puede deshacer. Por eso:
//   - solo el administrador o el coordinador de la unidad
//   - solo si ya está archivado
//   - hay que escribir su nombre para confirmar
//   - si tiene pruebas SGC no se elimina: son evidencia de acreditación
//   - sus archivos van a la papelera de Drive (o se borran del disco), para
//     que no queden huérfanos
exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.acceso.archivar) {
      return res.status(403).json({ message: 'Solo un administrador o el coordinador de la unidad puede eliminar este proyecto' });
    }
    if (!req.acceso.archivado) {
      return res.status(400).json({ message: 'Primero archiva el proyecto: solo se eliminan proyectos archivados' });
    }

    const [[proyecto]] = await db.query('SELECT name FROM projects WHERE id = ?', [id]);
    if (String(req.body?.confirmar ?? '').trim() !== proyecto.name.trim()) {
      return res.status(400).json({ message: 'Escribe el nombre exacto del proyecto para confirmar' });
    }

    const [[{ pruebas }]] = await db.query(
      `SELECT COUNT(*) AS pruebas FROM task_attachments ta JOIN tasks t ON t.id = ta.task_id
        WHERE t.project_id = ? AND ta.category = 'sgc'`, [id]
    );
    if (Number(pruebas)) {
      return res.status(409).json({
        message: `El proyecto tiene ${pruebas} prueba(s) SGC. Las evidencias de acreditación no se eliminan: déjalo archivado.`,
      });
    }

    // Primero los archivos: si Drive falla, el proyecto queda intacto
    const [adjuntos] = await db.query(
      'SELECT ta.* FROM task_attachments ta JOIN tasks t ON t.id = ta.task_id WHERE t.project_id = ?', [id]
    );
    for (const adjunto of adjuntos) await eliminarAdjunto(adjunto);

    await db.query('DELETE FROM projects WHERE id = ?', [id]);
    logger.info('Proyecto eliminado', { projectId: Number(id), nombre: proyecto.name, archivos: adjuntos.length, userId: req.user.id });
    auditoria.registrar(req, {
      accion: 'proyecto_eliminado', entidad: 'proyecto', entidadId: Number(id), entidadNombre: proyecto.name,
      detalle: `${adjuntos.length} archivo(s) eliminados con el proyecto`,
    });
    res.json({ message: 'Proyecto eliminado', archivos: adjuntos.length });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al eliminar el proyecto. Si tenía archivos, algunos pudieron quedar en la papelera.' });
  }
};

exports.addMember = async (req, res) => {
  try {
    const { user_id, role } = req.body;
    const { id } = req.params;

    if (role && !ROLES_PROYECTO.includes(role)) {
      return res.status(400).json({ message: 'Rol no válido' });
    }
    const [[usuario]] = await db.query('SELECT id FROM users WHERE id = ? AND is_active = 1', [user_id]);
    if (!usuario) return res.status(400).json({ message: 'El usuario no existe o está deshabilitado' });

    const [existing] = await db.query(
      'SELECT id FROM project_members WHERE project_id = ? AND user_id = ?',
      [id, user_id]
    );
    if (existing.length) return res.status(409).json({ message: 'El usuario ya es miembro' });

    await db.query(
      'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)',
      [id, user_id, role || 'member']
    );

    await notificaciones.agregadoProyecto({ projectId: id, userId: user_id, rol: role || 'member', actor: req.user });
    auditoria.registrar(req, {
      accion: 'miembro_agregado', entidad: 'proyecto', entidadId: Number(id),
      detalle: `${await nombreDe(user_id)} como ${ROL_LEGIBLE[role || 'member']}`,
    });

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

    if (!ROLES_PROYECTO.includes(role)) {
      return res.status(400).json({ message: 'Rol no válido' });
    }
    // Quién puede cambiar roles lo decide la ruta (nivel "gestion")

    const [[actual]] = await db.query(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [id, userId]
    );
    if (!actual) return res.status(404).json({ message: 'El usuario no es miembro del proyecto' });

    await db.query(
      'UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?',
      [role, id, userId]
    );
    if (actual.role !== role) {
      auditoria.registrar(req, {
        accion: 'rol_miembro_cambiado', entidad: 'proyecto', entidadId: Number(id),
        detalle: `${await nombreDe(userId)}: ${ROL_LEGIBLE[actual.role] || actual.role} → ${ROL_LEGIBLE[role]}`,
      });
    }
    res.json({ message: 'Rol actualizado' });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al actualizar rol' });
  }
};

exports.removeMember = async (req, res) => {
  try {
    const [r] = await db.query(
      'DELETE FROM project_members WHERE project_id = ? AND user_id = ?',
      [req.params.id, req.params.userId]
    );
    if (r.affectedRows) {
      auditoria.registrar(req, {
        accion: 'miembro_quitado', entidad: 'proyecto', entidadId: Number(req.params.id),
        detalle: await nombreDe(req.params.userId),
      });
    }
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
    logger.error(error);
    res.status(500).json({ message: 'Error al obtener etiquetas' });
  }
};

exports.createLabel = async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'El nombre es requerido' });
    const [result] = await db.query(
      'INSERT INTO labels (name, color, project_id) VALUES (?, ?, ?)',
      [name, color || '#6366F1', req.params.id]
    );
    res.status(201).json({ id: result.insertId, name, color: color || '#6366F1', project_id: req.params.id });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al crear etiqueta' });
  }
};

// ── Columnas del tablero Kanban ──────────────────────────────────────────
// Antes vivían en el localStorage de cada navegador, así que cada usuario
// veía un tablero distinto. Ahora se guardan por proyecto en la BD.

const DEFAULT_COLUMNS = [
  { column_key: 'pending',     label: 'Pendiente',   color: 'bg-gray-400',  ring: 'ring-gray-400'  },
  { column_key: 'in_progress', label: 'En Proceso',  color: 'bg-blue-500',  ring: 'ring-blue-400'  },
  { column_key: 'in_review',   label: 'En Revisión', color: 'bg-amber-500', ring: 'ring-amber-400' },
  { column_key: 'completed',   label: 'Completado',  color: 'bg-green-500', ring: 'ring-green-400' },
];

exports.getColumns = async (req, res) => {
  try {
    const [columns] = await db.query(
      `SELECT column_key, label, color, ring, position
         FROM project_kanban_columns
        WHERE project_id = ?
        ORDER BY position ASC, id ASC`,
      [req.params.id]
    );

    // Sin configuración guardada → columnas por defecto (aún no persistidas)
    if (!columns.length) {
      return res.json({
        columns: DEFAULT_COLUMNS.map((c, i) => ({ ...c, position: i })),
        is_default: true,
      });
    }

    res.json({ columns, is_default: false });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al obtener las columnas del tablero' });
  }
};

// PUT /api/projects/:id/columns — reemplaza la configuración completa
exports.saveColumns = async (req, res) => {
  const { columns } = req.body;

  if (!Array.isArray(columns) || !columns.length) {
    return res.status(400).json({ message: 'Se requiere al menos una columna' });
  }
  if (columns.some(c => !c || typeof c !== 'object' || typeof c.column_key !== 'string' || !c.column_key.trim())) {
    return res.status(400).json({ message: 'Cada columna necesita una clave' });
  }
  if (!columns.some(c => c.column_key === 'completed')) {
    return res.status(400).json({ message: 'La columna "completed" no se puede eliminar' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM project_kanban_columns WHERE project_id = ?', [req.params.id]);

    const values = columns.map((c, i) => [
      req.params.id,
      String(c.column_key).slice(0, 100),
      String(c.label || c.column_key).slice(0, 100),
      c.color || 'bg-gray-400',
      c.ring  || 'ring-gray-400',
      c.position ?? i,
    ]);

    await conn.query(
      'INSERT INTO project_kanban_columns (project_id, column_key, label, color, ring, position) VALUES ?',
      [values]
    );
    await conn.commit();

    const [saved] = await conn.query(
      `SELECT column_key, label, color, ring, position
         FROM project_kanban_columns WHERE project_id = ? ORDER BY position ASC, id ASC`,
      [req.params.id]
    );
    res.json({ columns: saved, is_default: false });
  } catch (error) {
    await conn.rollback();
    logger.error(error);
    res.status(500).json({ message: 'Error al guardar las columnas del tablero' });
  } finally {
    conn.release();
  }
};
