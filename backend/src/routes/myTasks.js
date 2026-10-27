const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const { status, priority, project_id } = req.query;

    // Las tareas archivadas no aparecen en "Mis tareas"
    // Solo de proyectos a los que todavía tiene acceso: si lo sacaron de
    // un proyecto, sus tareas de ahí dejan de mostrarse
    let where = `WHERE t.assignee_id = ? AND t.archived_at IS NULL
                   AND (? = 'admin' OR p.owner_id = ? OR EXISTS (
                     SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ?))`;
    const params = [req.user.id, req.user.role, req.user.id, req.user.id];

    if (status)     { where += ' AND t.status = ?';     params.push(status); }
    if (priority)   { where += ' AND t.priority = ?';   params.push(priority); }
    if (project_id) { where += ' AND t.project_id = ?'; params.push(project_id); }

    const [tasks] = await db.query(`
      SELECT t.*,
        p.name  AS project_name,
        p.color AS project_color,
        p.id    AS project_id
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      ${where}
      ORDER BY
        FIELD(t.status, 'pending', 'in_progress', 'in_review', 'completed'),
        FIELD(t.priority, 'critical', 'high', 'medium', 'low'),
        t.due_date ASC,
        t.created_at DESC
    `, params);

    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener tareas' });
  }
});

module.exports = router;
