const logger = require('../config/logger');
const db     = require('../config/database');

const TIPOS = ['fijo', 'variable'];

const toNumber = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

// GET /api/projects/:id/budget
// Devuelve las partidas + un resumen con totales por tipo
exports.getAll = async (req, res) => {
  try {
    const { id } = req.params;

    const [items] = await db.query(
      `SELECT b.*, u.name AS created_by_name
         FROM project_budget_items b
         LEFT JOIN users u ON u.id = b.created_by
        WHERE b.project_id = ?
        ORDER BY b.tipo ASC, b.categoria ASC, b.id ASC`,
      [id]
    );

    const [[project]] = await db.query(
      'SELECT presupuesto FROM projects WHERE id = ?',
      [id]
    );

    // Costo real registrado en las tareas del proyecto (referencia aparte)
    const [[tareas]] = await db.query(
      `SELECT COALESCE(SUM(costo), 0) AS total_costo_tareas
         FROM tasks WHERE project_id = ? AND costo IS NOT NULL`,
      [id]
    );

    const summary = items.reduce((acc, it) => {
      const est = toNumber(it.monto_estimado);
      const eje = toNumber(it.monto_ejecutado);
      acc.estimado_total  += est;
      acc.ejecutado_total += eje;
      if (it.tipo === 'fijo') {
        acc.estimado_fijo  += est;
        acc.ejecutado_fijo += eje;
      } else {
        acc.estimado_variable  += est;
        acc.ejecutado_variable += eje;
      }
      return acc;
    }, {
      estimado_fijo: 0, estimado_variable: 0, estimado_total: 0,
      ejecutado_fijo: 0, ejecutado_variable: 0, ejecutado_total: 0,
    });

    const presupuesto = project?.presupuesto != null ? toNumber(project.presupuesto) : null;

    res.json({
      items,
      summary: {
        ...summary,
        presupuesto,
        // Cuánto del presupuesto autorizado queda sin asignar a partidas
        sin_asignar: presupuesto != null ? presupuesto - summary.estimado_total : null,
        // Diferencia entre lo planeado y lo realmente gastado
        variacion: summary.estimado_total - summary.ejecutado_total,
        total_costo_tareas: toNumber(tareas.total_costo_tareas),
      },
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al obtener el presupuesto' });
  }
};

// POST /api/projects/:id/budget
exports.create = async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo, categoria, descripcion, monto_estimado, monto_ejecutado, fecha } = req.body;

    if (!categoria?.trim()) {
      return res.status(400).json({ message: 'La categoría es requerida' });
    }
    if (tipo && !TIPOS.includes(tipo)) {
      return res.status(400).json({ message: 'El tipo debe ser "fijo" o "variable"' });
    }

    const [result] = await db.query(
      `INSERT INTO project_budget_items
         (project_id, tipo, categoria, descripcion, monto_estimado, monto_ejecutado, fecha, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        tipo || 'fijo',
        categoria.trim(),
        descripcion?.trim() || null,
        toNumber(monto_estimado),
        toNumber(monto_ejecutado),
        fecha || null,
        req.user.id,
      ]
    );

    const [[item]] = await db.query(
      `SELECT b.*, u.name AS created_by_name
         FROM project_budget_items b
         LEFT JOIN users u ON u.id = b.created_by
        WHERE b.id = ?`,
      [result.insertId]
    );

    res.status(201).json(item);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al crear la partida' });
  }
};

// PUT /api/projects/:id/budget/:itemId
exports.update = async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { tipo, categoria, descripcion, monto_estimado, monto_ejecutado, fecha } = req.body;

    if (tipo && !TIPOS.includes(tipo)) {
      return res.status(400).json({ message: 'El tipo debe ser "fijo" o "variable"' });
    }

    const fields = [];
    const values = [];

    if (tipo)                       { fields.push('tipo = ?');            values.push(tipo); }
    if (categoria !== undefined)    { fields.push('categoria = ?');       values.push(categoria?.trim() || ''); }
    if (descripcion !== undefined)  { fields.push('descripcion = ?');     values.push(descripcion?.trim() || null); }
    if (monto_estimado !== undefined)  { fields.push('monto_estimado = ?');  values.push(toNumber(monto_estimado)); }
    if (monto_ejecutado !== undefined) { fields.push('monto_ejecutado = ?'); values.push(toNumber(monto_ejecutado)); }
    if (fecha !== undefined)        { fields.push('fecha = ?');           values.push(fecha || null); }

    if (!fields.length) return res.status(400).json({ message: 'Sin campos para actualizar' });

    values.push(itemId, id);
    const [result] = await db.query(
      `UPDATE project_budget_items SET ${fields.join(', ')} WHERE id = ? AND project_id = ?`,
      values
    );

    if (!result.affectedRows) return res.status(404).json({ message: 'Partida no encontrada' });

    const [[item]] = await db.query(
      `SELECT b.*, u.name AS created_by_name
         FROM project_budget_items b
         LEFT JOIN users u ON u.id = b.created_by
        WHERE b.id = ?`,
      [itemId]
    );

    res.json(item);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al actualizar la partida' });
  }
};

// DELETE /api/projects/:id/budget/:itemId
exports.remove = async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const [result] = await db.query(
      'DELETE FROM project_budget_items WHERE id = ? AND project_id = ?',
      [itemId, id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Partida no encontrada' });
    res.json({ message: 'Partida eliminada' });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al eliminar la partida' });
  }
};
