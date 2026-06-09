const logger = require('../config/logger');
const db     = require('../config/database');

// GET /api/sgc
exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM sgc_evidencias ORDER BY evidencia ASC'
    );
    res.json(rows);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ message: 'Error al obtener evidencias SGC' });
  }
};

// GET /api/sgc/with-tasks (admin)
exports.getAllWithTasks = async (req, res) => {
  try {
    const [evidencias] = await db.query(
      'SELECT * FROM sgc_evidencias ORDER BY evidencia ASC'
    );

    if (!evidencias.length) return res.json([]);

    const [taskLinks] = await db.query(`
      SELECT
        ts.evidencia_id,
        t.id, t.title, t.status, t.priority, t.due_date,
        u.name  AS assignee_name,
        p.name  AS project_name,
        p.id    AS project_id
      FROM task_sgc ts
      JOIN tasks    t ON t.id = ts.task_id
      LEFT JOIN users u ON u.id = t.assignee_id
      JOIN projects p   ON p.id = t.project_id
      ORDER BY ts.evidencia_id, t.created_at DESC
    `);

    const tasksByEvidencia = taskLinks.reduce((acc, row) => {
      if (!acc[row.evidencia_id]) acc[row.evidencia_id] = [];
      acc[row.evidencia_id].push({
        id:            row.id,
        title:         row.title,
        status:        row.status,
        priority:      row.priority,
        due_date:      row.due_date,
        assignee_name: row.assignee_name,
        project_name:  row.project_name,
        project_id:    row.project_id,
      });
      return acc;
    }, {});

    res.json(evidencias.map(e => ({ ...e, tasks: tasksByEvidencia[e.id] || [] })));
  } catch (err) {
    logger.error(err);
    res.status(500).json({ message: 'Error al obtener evidencias con tareas' });
  }
};

// POST /api/sgc (admin)
exports.create = async (req, res) => {
  try {
    const { dimension, criterio, evidencia, nombre_evidencia, descripcion } = req.body;
    if (!dimension?.trim() || !criterio?.trim() || !evidencia?.trim() || !nombre_evidencia?.trim()) {
      return res.status(400).json({ message: 'Dimensión, criterio, evidencia y nombre son requeridos' });
    }
    const [result] = await db.query(
      'INSERT INTO sgc_evidencias (dimension, criterio, evidencia, nombre_evidencia, descripcion) VALUES (?, ?, ?, ?, ?)',
      [dimension.trim(), criterio.trim(), evidencia.trim(), nombre_evidencia.trim(), descripcion?.trim() || null]
    );
    const [rows] = await db.query('SELECT * FROM sgc_evidencias WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: `La evidencia "${req.body.evidencia}" ya existe` });
    }
    logger.error(err);
    res.status(500).json({ message: 'Error al crear evidencia' });
  }
};

// PUT /api/sgc/:id (admin)
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { dimension, criterio, evidencia, nombre_evidencia, descripcion } = req.body;
    if (!dimension?.trim() || !criterio?.trim() || !evidencia?.trim() || !nombre_evidencia?.trim()) {
      return res.status(400).json({ message: 'Dimensión, criterio, evidencia y nombre son requeridos' });
    }
    const [existing] = await db.query('SELECT id FROM sgc_evidencias WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ message: 'Evidencia no encontrada' });

    await db.query(
      'UPDATE sgc_evidencias SET dimension = ?, criterio = ?, evidencia = ?, nombre_evidencia = ?, descripcion = ? WHERE id = ?',
      [dimension.trim(), criterio.trim(), evidencia.trim(), nombre_evidencia.trim(), descripcion?.trim() || null, id]
    );
    const [rows] = await db.query('SELECT * FROM sgc_evidencias WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: `La evidencia "${req.body.evidencia}" ya existe` });
    }
    logger.error(err);
    res.status(500).json({ message: 'Error al actualizar evidencia' });
  }
};

// DELETE /api/sgc/:id (admin)
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await db.query('SELECT id FROM sgc_evidencias WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ message: 'Evidencia no encontrada' });

    await db.query('DELETE FROM sgc_evidencias WHERE id = ?', [id]);
    res.json({ message: 'Evidencia eliminada' });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ message: 'Error al eliminar evidencia' });
  }
};
