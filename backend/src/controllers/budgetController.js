const logger = require('../config/logger');
const db     = require('../config/database');

const TIPOS = ['fijo', 'variable'];

const toNumber = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/*
 * Presupuesto del proyecto = suma de lo estimado en sus partidas.
 *
 * Ejecutado de cada partida:
 *   - fija:     lo que se escribe a mano (salarios, prestaciones…)
 *   - variable: la suma del costo de las tareas asignadas a ella
 *
 * Las tareas con costo y sin partida también cuentan como gasto del
 * proyecto: se muestran aparte para que alguien les asigne partida.
 */

// Tareas con costo o con partida, para el desglose de cada partida
async function tareasConCosto(projectId) {
  const [tareas] = await db.query(
    `SELECT id, title, costo, budget_item_id, status, archived_at
       FROM tasks
      WHERE project_id = ? AND (budget_item_id IS NOT NULL OR costo > 0)
      ORDER BY title`,
    [projectId]
  );
  return tareas.map(t => ({ ...t, costo: toNumber(t.costo) }));
}

function calcular(items, tareas) {
  const porPartida = new Map();
  const sinPartida = [];
  for (const t of tareas) {
    if (t.budget_item_id) {
      if (!porPartida.has(t.budget_item_id)) porPartida.set(t.budget_item_id, []);
      porPartida.get(t.budget_item_id).push(t);
    } else if (t.costo > 0) {
      sinPartida.push(t);
    }
  }

  const partidas = items.map(it => {
    const asignadas = porPartida.get(it.id) || [];
    // Si una partida pasó de variable a fija conservando tareas (no debería:
    // se impide al editar), sus tareas se tratan como sin partida
    if (it.tipo === 'fijo' && asignadas.length) sinPartida.push(...asignadas);
    const estimado  = toNumber(it.monto_estimado);
    const ejecutado = it.tipo === 'fijo'
      ? toNumber(it.monto_ejecutado)
      : asignadas.reduce((s, t) => s + t.costo, 0);
    return {
      ...it,
      monto_estimado: estimado,
      ejecutado,
      disponible: estimado - ejecutado,
      origen: it.tipo === 'fijo' ? 'manual' : 'tareas',
      tareas: it.tipo === 'variable' ? asignadas : [],
    };
  });

  const suma = (lista, campo) => lista.reduce((s, x) => s + x[campo], 0);
  const fijas     = partidas.filter(p => p.tipo === 'fijo');
  const variables = partidas.filter(p => p.tipo === 'variable');
  const gastoSinPartida = suma(sinPartida, 'costo');

  const presupuesto = suma(partidas, 'monto_estimado');
  const ejecutado   = suma(partidas, 'ejecutado') + gastoSinPartida;

  return {
    items: partidas,
    sin_partida: { total: gastoSinPartida, tareas: sinPartida },
    summary: {
      presupuesto,
      ejecutado,
      disponible: presupuesto - ejecutado,
      porcentaje: presupuesto > 0 ? Math.round((ejecutado / presupuesto) * 100) : null,
      estimado_fijo:      suma(fijas, 'monto_estimado'),
      ejecutado_fijo:     suma(fijas, 'ejecutado'),
      estimado_variable:  suma(variables, 'monto_estimado'),
      ejecutado_variable: suma(variables, 'ejecutado') + gastoSinPartida,
    },
  };
}

// GET /api/projects/:id/budget
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
    res.json(calcular(items, await tareasConCosto(id)));
  } catch (error) {
    if (error.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(503).json({
        message: 'Falta actualizar la base de datos: ejecuta database/actualizaciones/2026-11-06_partidas_en_tareas.sql',
      });
    }
    logger.error(error);
    res.status(500).json({ message: 'Error al obtener el presupuesto' });
  }
};

const consultarPartida = async (itemId) => {
  const [[item]] = await db.query(
    `SELECT b.*, u.name AS created_by_name
       FROM project_budget_items b
       LEFT JOIN users u ON u.id = b.created_by
      WHERE b.id = ?`,
    [itemId]
  );
  return item;
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
    const tipoFinal = tipo || 'fijo';

    const [result] = await db.query(
      `INSERT INTO project_budget_items
         (project_id, tipo, categoria, descripcion, monto_estimado, monto_ejecutado, fecha, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        tipoFinal,
        categoria.trim(),
        descripcion?.trim() || null,
        toNumber(monto_estimado),
        // En las variables el ejecutado sale de las tareas
        tipoFinal === 'fijo' ? toNumber(monto_ejecutado) : 0,
        fecha || null,
        req.user.id,
      ]
    );

    res.status(201).json(await consultarPartida(result.insertId));
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
    if (categoria !== undefined && !categoria?.trim()) {
      return res.status(400).json({ message: 'La categoría es requerida' });
    }

    const [[actual]] = await db.query(
      'SELECT id, tipo FROM project_budget_items WHERE id = ? AND project_id = ?',
      [itemId, id]
    );
    if (!actual) return res.status(404).json({ message: 'Partida no encontrada' });

    const tipoFinal = tipo || actual.tipo;

    // Una partida fija no recibe tareas: si tiene, primero hay que moverlas
    if (tipoFinal === 'fijo' && actual.tipo === 'variable') {
      const [[{ n }]] = await db.query(
        'SELECT COUNT(*) AS n FROM tasks WHERE budget_item_id = ?', [itemId]
      );
      if (n > 0) {
        return res.status(409).json({
          message: `La partida tiene ${n} tarea${n === 1 ? '' : 's'} asignada${n === 1 ? '' : 's'}. ` +
                   `Cámbiala${n === 1 ? '' : 's'} a otra partida antes de convertirla en fija.`,
        });
      }
    }

    const fields = [];
    const values = [];

    if (tipo)                       { fields.push('tipo = ?');           values.push(tipo); }
    if (categoria !== undefined)    { fields.push('categoria = ?');      values.push(categoria.trim()); }
    if (descripcion !== undefined)  { fields.push('descripcion = ?');    values.push(descripcion?.trim() || null); }
    if (monto_estimado !== undefined) { fields.push('monto_estimado = ?'); values.push(toNumber(monto_estimado)); }
    if (monto_ejecutado !== undefined && tipoFinal === 'fijo') {
      fields.push('monto_ejecutado = ?'); values.push(toNumber(monto_ejecutado));
    }
    if (fecha !== undefined)        { fields.push('fecha = ?');          values.push(fecha || null); }

    if (!fields.length) return res.status(400).json({ message: 'Sin campos para actualizar' });

    values.push(itemId, id);
    await db.query(
      `UPDATE project_budget_items SET ${fields.join(', ')} WHERE id = ? AND project_id = ?`,
      values
    );

    res.json(await consultarPartida(itemId));
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al actualizar la partida' });
  }
};

// DELETE /api/projects/:id/budget/:itemId
// Sus tareas quedan sin partida (la llave foránea las pone en NULL)
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
