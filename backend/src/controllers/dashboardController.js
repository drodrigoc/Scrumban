const logger = require('../config/logger');
const db = require('../config/database');

exports.getStats = async (req, res) => {
  try {
    const userId  = req.user.id;
    const role    = req.user.role;
    const isAdmin = role === 'admin' || role === 'superViewer';

    // ── Filtros ──────────────────────────────────────────────────────────────
    // Para admin/superViewer: sin restricción.
    // Para coordinador: solo proyectos donde es dueño o miembro.
    // Para el resto: ídem coordinador (sus propios proyectos).
    const projectWhere = isAdmin
      ? 'WHERE 1=1'
      : `WHERE (p.owner_id = ${userId} OR EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = p.id AND pm.user_id = ${userId}
         ))`;

    // Sub-select reutilizable de proyectos visibles por el usuario
    const visibleProjects = isAdmin
      ? 'SELECT id FROM projects'
      : `SELECT id FROM projects WHERE owner_id = ${userId}
         UNION
         SELECT project_id FROM project_members WHERE user_id = ${userId}`;

    const taskWhere = isAdmin
      ? 'WHERE 1=1'
      : `WHERE t.project_id IN (${visibleProjects})`;

    // ── Proyectos por estado ─────────────────────────────────────────────────
    const [projectStats] = await db.query(`
      SELECT status, COUNT(*) AS count
      FROM projects p
      ${projectWhere}
      GROUP BY status
    `);

    // ── Tareas por estado ────────────────────────────────────────────────────
    const [taskStats] = await db.query(`
      SELECT status, COUNT(*) AS count
      FROM tasks t
      ${taskWhere}
      GROUP BY status
    `);

    // ── Tareas vencidas ──────────────────────────────────────────────────────
    const [overdueResult] = await db.query(`
      SELECT COUNT(*) AS count
      FROM tasks t
      ${taskWhere}
        AND t.status != 'completed'
        AND t.due_date < CURDATE()
    `);

    // ── Tareas próximas a vencer (7 días) ────────────────────────────────────
    const [dueSoonResult] = await db.query(`
      SELECT COUNT(*) AS count
      FROM tasks t
      ${taskWhere}
        AND t.status != 'completed'
        AND t.due_date >= CURDATE()
        AND t.due_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
    `);

    // ── Proyectos activos con progreso ───────────────────────────────────────
    const [projectsProgress] = await db.query(`
      SELECT p.id, p.name, p.color, p.status,
        COUNT(t.id)                                                    AS total_tasks,
        SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END)       AS done_tasks
      FROM projects p
      LEFT JOIN tasks t ON t.project_id = p.id
      ${projectWhere} AND p.status = 'active'
      GROUP BY p.id
      ORDER BY p.name
      LIMIT 6
    `);

    // ── Carga de trabajo por usuario ─────────────────────────────────────────
    // Se filtra la tarea por proyecto visible; la condición va en el JOIN
    // para que el LEFT JOIN cuente solo las tareas relevantes.
    const taskJoinFilter = isAdmin
      ? ''
      : `AND t.project_id IN (${visibleProjects})`;

    const [workload] = await db.query(`
      SELECT u.id, u.name, u.avatar,
        COUNT(t.id)                                                        AS total_assigned,
        SUM(CASE WHEN t.status != 'completed' THEN 1 ELSE 0 END)          AS pending
      FROM users u
      LEFT JOIN tasks t
        ON t.assignee_id = u.id
        AND t.status != 'completed'
        ${taskJoinFilter}
      WHERE u.is_active = 1
      GROUP BY u.id
      HAVING total_assigned > 0
      ORDER BY total_assigned DESC
      LIMIT 8
    `);

    // ── Actividad reciente ───────────────────────────────────────────────────
    const activityProjectFilter = isAdmin
      ? ''
      : `AND t.project_id IN (${visibleProjects})`;

    const [recentActivity] = await db.query(`
      SELECT th.id, th.field_changed, th.created_at,
             t.title  AS task_title,
             u.name   AS user_name,
             p.name   AS project_name
      FROM task_history th
      JOIN tasks    t ON t.id  = th.task_id
      JOIN users    u ON u.id  = th.user_id
      JOIN projects p ON p.id  = t.project_id
      WHERE 1=1 ${activityProjectFilter}
      ORDER BY th.created_at DESC
      LIMIT 10
    `);

    // ── Respuesta ────────────────────────────────────────────────────────────
    const projectsMap = projectStats.reduce((acc, s) => { acc[s.status] = s.count; return acc; }, {});
    const tasksMap    = taskStats.reduce((acc, s)    => { acc[s.status] = s.count; return acc; }, {});

    res.json({
      projects: {
        active:    projectsMap.active    || 0,
        paused:    projectsMap.paused    || 0,
        completed: projectsMap.completed || 0,
        cancelled: projectsMap.cancelled || 0,
        total: Object.values(projectsMap).reduce((a, b) => a + b, 0),
      },
      tasks: {
        pending:     tasksMap.pending     || 0,
        in_progress: tasksMap.in_progress || 0,
        in_review:   tasksMap.in_review   || 0,
        completed:   tasksMap.completed   || 0,
        overdue:     overdueResult[0].count,
        due_soon:    dueSoonResult[0].count,
        total: Object.values(tasksMap).reduce((a, b) => a + b, 0),
      },
      projectsProgress: projectsProgress.map(p => ({
        ...p,
        progress: p.total_tasks > 0 ? Math.round((p.done_tasks / p.total_tasks) * 100) : 0,
      })),
      workload,
      recentActivity,
    });
  } catch (error) {
    logger.error('Dashboard error:', error);
    res.status(500).json({ message: 'Error al obtener estadísticas' });
  }
};
