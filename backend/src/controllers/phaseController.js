const logger = require('../config/logger');
const db     = require('../config/database');

// GET /api/projects/:id/phases
// Cada fase incluye el avance calculado a partir de sus tareas
// (salvo que tenga un progress manual guardado).
exports.getAll = async (req, res) => {
  try {
    const { id } = req.params;

    const [phases] = await db.query(
      `SELECT * FROM project_phases WHERE project_id = ? ORDER BY position ASC, id ASC`,
      [id]
    );

    if (!phases.length) return res.json([]);

    // Las tareas archivadas siguen contando: son trabajo terminado
    const [stats] = await db.query(
      `SELECT phase_id,
              COUNT(*) AS total_tasks,
              COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_tasks
         FROM tasks
        WHERE project_id = ? AND phase_id IS NOT NULL
        GROUP BY phase_id`,
      [id]
    );

    const statsByPhase = Object.fromEntries(stats.map(s => [s.phase_id, s]));

    res.json(phases.map(p => {
      const s = statsByPhase[p.id];
      const total     = s ? Number(s.total_tasks) : 0;
      const completed = s ? Number(s.completed_tasks) : 0;
      const calculado = total > 0 ? Math.round((completed / total) * 100) : 0;

      return {
        ...p,
        total_tasks:     total,
        completed_tasks: completed,
        // progress manual gana sobre el calculado; si no hay tareas ni valor manual → 0
        progress: p.progress != null ? p.progress : calculado,
        progress_source: p.progress != null ? 'manual' : 'tareas',
      };
    }));
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al obtener las fases' });
  }
};

// POST /api/projects/:id/phases
exports.create = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, start_date, end_date, color, position, progress } = req.body;

    if (!name?.trim()) return res.status(400).json({ message: 'El nombre de la fase es requerido' });

    let pos = position;
    if (pos === undefined || pos === null) {
      const [[maxPos]] = await db.query(
        'SELECT COALESCE(MAX(position), 0) AS max FROM project_phases WHERE project_id = ?',
        [id]
      );
      pos = Number(maxPos.max) + 1;
    }

    const [result] = await db.query(
      `INSERT INTO project_phases (project_id, name, description, start_date, end_date, position, color, progress)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        name.trim(),
        description?.trim() || null,
        start_date || null,
        end_date   || null,
        pos,
        color || '#6366F1',
        progress ?? null,
      ]
    );

    const [[phase]] = await db.query('SELECT * FROM project_phases WHERE id = ?', [result.insertId]);
    res.status(201).json({ ...phase, total_tasks: 0, completed_tasks: 0, progress: phase.progress ?? 0 });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al crear la fase' });
  }
};

// PUT /api/projects/:id/phases/:phaseId
exports.update = async (req, res) => {
  try {
    const { id, phaseId } = req.params;
    const { name, description, start_date, end_date, color, position, progress } = req.body;

    const fields = [];
    const values = [];

    if (name)                      { fields.push('name = ?');        values.push(name.trim()); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description?.trim() || null); }
    if (start_date !== undefined)  { fields.push('start_date = ?');  values.push(start_date || null); }
    if (end_date !== undefined)    { fields.push('end_date = ?');    values.push(end_date || null); }
    if (color)                     { fields.push('color = ?');       values.push(color); }
    if (position !== undefined)    { fields.push('position = ?');    values.push(position); }
    // progress === null vuelve al cálculo automático desde las tareas
    if (progress !== undefined)    { fields.push('progress = ?');    values.push(progress === null || progress === '' ? null : parseInt(progress, 10)); }

    if (!fields.length) return res.status(400).json({ message: 'Sin campos para actualizar' });

    values.push(phaseId, id);
    const [result] = await db.query(
      `UPDATE project_phases SET ${fields.join(', ')} WHERE id = ? AND project_id = ?`,
      values
    );

    if (!result.affectedRows) return res.status(404).json({ message: 'Fase no encontrada' });

    const [[phase]] = await db.query('SELECT * FROM project_phases WHERE id = ?', [phaseId]);
    res.json(phase);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al actualizar la fase' });
  }
};

// DELETE /api/projects/:id/phases/:phaseId
// Las tareas vinculadas quedan sin fase (FK ON DELETE SET NULL)
exports.remove = async (req, res) => {
  try {
    const { id, phaseId } = req.params;
    const [result] = await db.query(
      'DELETE FROM project_phases WHERE id = ? AND project_id = ?',
      [phaseId, id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Fase no encontrada' });
    res.json({ message: 'Fase eliminada' });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al eliminar la fase' });
  }
};
