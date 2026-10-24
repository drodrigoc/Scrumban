const logger = require('../config/logger');
const db     = require('../config/database');
const sgcCarpetas = require('../services/sgcCarpetas');

/*
 * Catálogo SGC en cuatro niveles:
 *
 *   Dimensión 1 → Criterio 1.1 → Indicador 1.1.1 → Evidencia 1.1.1.1
 *
 * Los códigos son numéricos y cada nivel empieza con el código de su
 * padre. Las pruebas (archivos) se adjuntan a las evidencias desde las
 * tareas.
 */

// ── Validación de códigos ────────────────────────────────────────────────

const PROFUNDIDAD = { dimension: 1, criterio: 2, indicador: 3, evidencia: 4 };
const NOMBRE_NIVEL = { dimension: 'dimensión', criterio: 'criterio', indicador: 'indicador', evidencia: 'evidencia' };

// Indicador provisional creado por la migración ("1.1.0 — Por clasificar")
const esProvisional = (codigoIndicador) => /\.0$/.test(codigoIndicador || '');

/**
 * Devuelve un mensaje de error o null.
 * Ej.: una evidencia del indicador 1.1.2 debe ser 1.1.2.N
 */
function validarCodigo(nivel, codigo, codigoPadre) {
  const partes = String(codigo).split('.');
  const esperadas = PROFUNDIDAD[nivel];

  if (!/^\d+(\.\d+)*$/.test(codigo) || partes.length !== esperadas) {
    const ejemplo = ['1', '1.1', '1.1.1', '1.1.1.1'][esperadas - 1];
    return `El código de ${NOMBRE_NIVEL[nivel]} debe tener ${esperadas} nivel${esperadas > 1 ? 'es' : ''} numérico${esperadas > 1 ? 's' : ''}, por ejemplo ${ejemplo}`;
  }
  if (codigoPadre && !codigo.startsWith(`${codigoPadre}.`)) {
    return `El código debe empezar con ${codigoPadre}. (el código de su ${NOMBRE_NIVEL[Object.keys(PROFUNDIDAD)[esperadas - 2]]})`;
  }
  return null;
}

const limpiar = (v) => (typeof v === 'string' ? v.trim() : v);

function responderError(res, err, accion) {
  if (err.code === 'ER_DUP_ENTRY') {
    const codigo = (err.sqlMessage || '').match(/'([^']+)'/)?.[1];
    return res.status(409).json({ message: `Ya existe un registro con el código ${codigo || 'indicado'}` });
  }
  if (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR') {
    return res.status(503).json({ message: 'Falta aplicar la migración v6 en la base de datos.' });
  }
  logger.error(err);
  res.status(500).json({ message: `Error al ${accion}` });
}

// Columnas de una evidencia con todo su árbol, para listas y búsquedas
const SELECT_EVIDENCIA = `
  SELECT e.id, e.evidencia, e.nombre_evidencia, e.descripcion, e.indicador_id,
         i.codigo AS indicador, i.nombre AS indicador_nombre,
         c.id AS criterio_id, c.codigo AS criterio, c.nombre AS criterio_nombre,
         d.id AS dimension_id, d.codigo AS dimension, d.nombre AS dimension_nombre
    FROM sgc_evidencias e
    LEFT JOIN sgc_indicadores i ON i.id = e.indicador_id
    LEFT JOIN sgc_criterios   c ON c.id = i.criterio_id
    LEFT JOIN sgc_dimensiones d ON d.id = c.dimension_id`;

// Orden natural de códigos: 1.2 antes que 1.10
const ordenCodigos = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

// ── Lecturas ─────────────────────────────────────────────────────────────

// GET /api/sgc — todas las evidencias con su árbol (buscador de las tareas)
exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.query(SELECT_EVIDENCIA);
    res.json(rows.sort((a, b) => ordenCodigos(a.evidencia, b.evidencia)));
  } catch (err) {
    responderError(res, err, 'obtener evidencias SGC');
  }
};

// GET /api/sgc/arbol — el catálogo completo anidado, con conteos
exports.getArbol = async (req, res) => {
  try {
    const [[dims], [crits], [inds], [evs]] = await Promise.all([
      db.query('SELECT * FROM sgc_dimensiones'),
      db.query('SELECT * FROM sgc_criterios'),
      db.query('SELECT * FROM sgc_indicadores'),
      db.query(`
        SELECT e.*,
               (SELECT COUNT(*) FROM task_sgc ts WHERE ts.evidencia_id = e.id) AS total_tareas,
               (SELECT COUNT(*) FROM task_attachments ta
                 WHERE ta.evidencia_id = e.id AND ta.category = 'sgc')        AS total_archivos
          FROM sgc_evidencias e`),
    ]);

    const porPadre = (lista, campo) => lista.reduce((acc, x) => {
      (acc[x[campo]] ||= []).push(x);
      return acc;
    }, {});

    const evPorIndicador  = porPadre(evs,   'indicador_id');
    const indPorCriterio  = porPadre(inds,  'criterio_id');
    const critPorDimension = porPadre(crits, 'dimension_id');
    const porCodigo = (campo) => (a, b) => ordenCodigos(a[campo], b[campo]);

    const arbol = dims.sort(porCodigo('codigo')).map(d => ({
      ...d,
      criterios: (critPorDimension[d.id] || []).sort(porCodigo('codigo')).map(c => ({
        ...c,
        indicadores: (indPorCriterio[c.id] || []).sort(porCodigo('codigo')).map(i => ({
          ...i,
          provisional: esProvisional(i.codigo),
          evidencias: (evPorIndicador[i.id] || []).sort(porCodigo('evidencia')).map(e => ({
            ...e,
            total_tareas:   Number(e.total_tareas),
            total_archivos: Number(e.total_archivos),
          })),
        })),
      })),
    }));

    res.json(arbol);
  } catch (err) {
    responderError(res, err, 'obtener el catálogo SGC');
  }
};

// GET /api/sgc/with-tasks — evidencias con sus tareas (pestaña Visualización)
exports.getAllWithTasks = async (req, res) => {
  try {
    const [evidencias] = await db.query(SELECT_EVIDENCIA);
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

    res.json(
      evidencias
        .sort((a, b) => ordenCodigos(a.evidencia, b.evidencia))
        .map(e => ({ ...e, tasks: tasksByEvidencia[e.id] || [] }))
    );
  } catch (err) {
    responderError(res, err, 'obtener evidencias con tareas');
  }
};

// ── Niveles 1 a 3: dimensiones, criterios, indicadores ───────────────────

// Configuración de cada nivel: tabla, padre y cómo se llama su hijo
const NIVELES = {
  dimension: { tabla: 'sgc_dimensiones', padre: null,                                    hijos: { tabla: 'sgc_criterios',   campo: 'dimension_id', nombre: 'criterio' } },
  criterio:  { tabla: 'sgc_criterios',   padre: { campo: 'dimension_id', tabla: 'sgc_dimensiones' }, hijos: { tabla: 'sgc_indicadores', campo: 'criterio_id',  nombre: 'indicador' } },
  indicador: { tabla: 'sgc_indicadores', padre: { campo: 'criterio_id',  tabla: 'sgc_criterios' },   hijos: { tabla: 'sgc_evidencias',  campo: 'indicador_id', nombre: 'evidencia' } },
};

async function codigoPadre(nivel, padreId) {
  const conf = NIVELES[nivel].padre;
  if (!conf) return { codigo: null };
  const [[padre]] = await db.query(`SELECT codigo FROM ${conf.tabla} WHERE id = ?`, [padreId]);
  return padre ? { codigo: padre.codigo } : null;
}

const crearNivel = (nivel) => async (req, res) => {
  try {
    const conf = NIVELES[nivel];
    const codigo = limpiar(req.body.codigo);
    const nombre = limpiar(req.body.nombre);
    const descripcion = limpiar(req.body.descripcion) || null;
    const padreId = conf.padre ? req.body[conf.padre.campo] : null;

    if (!codigo || !nombre) return res.status(400).json({ message: 'El código y el nombre son requeridos' });

    const padre = await codigoPadre(nivel, padreId);
    if (!padre) {
      return res.status(400).json({
        message: nivel === 'criterio'
          ? 'Selecciona la dimensión a la que pertenece'
          : 'Selecciona el criterio al que pertenece',
      });
    }

    const error = validarCodigo(nivel, codigo, padre.codigo);
    if (error) return res.status(400).json({ message: error });

    const campos  = ['codigo', 'nombre', 'descripcion', ...(conf.padre ? [conf.padre.campo] : [])];
    const valores = [codigo, nombre, descripcion, ...(conf.padre ? [padreId] : [])];

    const [result] = await db.query(
      `INSERT INTO ${conf.tabla} (${campos.join(', ')}) VALUES (${campos.map(() => '?').join(', ')})`,
      valores
    );
    const [[fila]] = await db.query(`SELECT * FROM ${conf.tabla} WHERE id = ?`, [result.insertId]);
    res.status(201).json(fila);
  } catch (err) {
    responderError(res, err, `crear el ${NOMBRE_NIVEL[nivel]}`);
  }
};

const actualizarNivel = (nivel) => async (req, res) => {
  try {
    const conf = NIVELES[nivel];
    const { id } = req.params;

    const [[actual]] = await db.query(`SELECT * FROM ${conf.tabla} WHERE id = ?`, [id]);
    if (!actual) return res.status(404).json({ message: 'Registro no encontrado' });

    const codigo = limpiar(req.body.codigo) ?? actual.codigo;
    const nombre = limpiar(req.body.nombre) ?? actual.nombre;
    const descripcion = req.body.descripcion !== undefined ? (limpiar(req.body.descripcion) || null) : actual.descripcion;
    const padreId = conf.padre ? (req.body[conf.padre.campo] ?? actual[conf.padre.campo]) : null;

    if (!codigo || !nombre) return res.status(400).json({ message: 'El código y el nombre son requeridos' });

    const padre = await codigoPadre(nivel, padreId);
    if (!padre) return res.status(400).json({ message: 'El nivel superior indicado no existe' });

    // Los indicadores provisionales de la migración conservan su código .0
    if (!(nivel === 'indicador' && esProvisional(actual.codigo) && codigo === actual.codigo)) {
      const error = validarCodigo(nivel, codigo, padre.codigo);
      if (error) return res.status(400).json({ message: error });
    }

    // Cambiar el código de un nivel con hijos dejaría los códigos de abajo
    // inconsistentes (1.1.x dentro de un criterio que ahora es 1.2)
    if (codigo !== actual.codigo) {
      const [[{ n }]] = await db.query(
        `SELECT COUNT(*) AS n FROM ${conf.hijos.tabla} WHERE ${conf.hijos.campo} = ?`, [id]
      );
      if (n > 0) {
        return res.status(409).json({
          message: `No se puede cambiar el código: tiene ${n} ${conf.hijos.nombre}${n > 1 ? 's' : ''} cuyos códigos dependen de él. ` +
                   'Cambia primero sus códigos o muévelos a otro nivel.',
        });
      }
    }

    const rutaVieja = await sgcCarpetas.rutaDeNivel(nivel, id);

    const sets    = ['codigo = ?', 'nombre = ?', 'descripcion = ?', ...(conf.padre ? [`${conf.padre.campo} = ?`] : [])];
    const valores = [codigo, nombre, descripcion, ...(conf.padre ? [padreId] : []), id];
    await db.query(`UPDATE ${conf.tabla} SET ${sets.join(', ')} WHERE id = ?`, valores);

    const aviso = await sgcCarpetas.reubicar(rutaVieja, await sgcCarpetas.rutaDeNivel(nivel, id));
    const [[fila]] = await db.query(`SELECT * FROM ${conf.tabla} WHERE id = ?`, [id]);
    res.json(aviso ? { ...fila, drive_aviso: aviso } : fila);
  } catch (err) {
    responderError(res, err, `actualizar el ${NOMBRE_NIVEL[nivel]}`);
  }
};

const eliminarNivel = (nivel) => async (req, res) => {
  try {
    const conf = NIVELES[nivel];
    const { id } = req.params;

    const [[{ n }]] = await db.query(
      `SELECT COUNT(*) AS n FROM ${conf.hijos.tabla} WHERE ${conf.hijos.campo} = ?`, [id]
    );
    if (n > 0) {
      return res.status(409).json({
        message: `No se puede eliminar: tiene ${n} ${conf.hijos.nombre}${n > 1 ? 's' : ''}. Elimínalos o muévelos primero.`,
      });
    }

    const [result] = await db.query(`DELETE FROM ${conf.tabla} WHERE id = ?`, [id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Registro no encontrado' });
    res.json({ message: 'Eliminado' });
  } catch (err) {
    responderError(res, err, `eliminar el ${NOMBRE_NIVEL[nivel]}`);
  }
};

exports.createDimension = crearNivel('dimension');
exports.updateDimension = actualizarNivel('dimension');
exports.deleteDimension = eliminarNivel('dimension');
exports.createCriterio  = crearNivel('criterio');
exports.updateCriterio  = actualizarNivel('criterio');
exports.deleteCriterio  = eliminarNivel('criterio');
exports.createIndicador = crearNivel('indicador');
exports.updateIndicador = actualizarNivel('indicador');
exports.deleteIndicador = eliminarNivel('indicador');

// ── Nivel 4: evidencias ──────────────────────────────────────────────────

async function datosIndicador(indicadorId) {
  const [[ind]] = await db.query('SELECT id, codigo FROM sgc_indicadores WHERE id = ?', [indicadorId]);
  return ind || null;
}

// POST /api/sgc  { indicador_id, evidencia, nombre_evidencia, descripcion }
exports.create = async (req, res) => {
  try {
    const evidencia = limpiar(req.body.evidencia);
    const nombre = limpiar(req.body.nombre_evidencia);
    const descripcion = limpiar(req.body.descripcion) || null;

    if (!evidencia || !nombre) return res.status(400).json({ message: 'El código y el nombre de la evidencia son requeridos' });

    const indicador = await datosIndicador(req.body.indicador_id);
    if (!indicador) return res.status(400).json({ message: 'Selecciona el indicador al que pertenece la evidencia' });

    const error = validarCodigo('evidencia', evidencia, indicador.codigo);
    if (error) return res.status(400).json({ message: error });

    const [result] = await db.query(
      'INSERT INTO sgc_evidencias (indicador_id, evidencia, nombre_evidencia, descripcion) VALUES (?, ?, ?, ?)',
      [indicador.id, evidencia, nombre, descripcion]
    );
    const [[fila]] = await db.query(`${SELECT_EVIDENCIA} WHERE e.id = ?`, [result.insertId]);
    res.status(201).json(fila);
  } catch (err) {
    responderError(res, err, 'crear la evidencia');
  }
};

// PUT /api/sgc/:id
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const [[actual]] = await db.query('SELECT * FROM sgc_evidencias WHERE id = ?', [id]);
    if (!actual) return res.status(404).json({ message: 'Evidencia no encontrada' });

    const evidencia = limpiar(req.body.evidencia) ?? actual.evidencia;
    const nombre = limpiar(req.body.nombre_evidencia) ?? actual.nombre_evidencia;
    const descripcion = req.body.descripcion !== undefined ? (limpiar(req.body.descripcion) || null) : actual.descripcion;
    const indicadorId = req.body.indicador_id ?? actual.indicador_id;

    if (!evidencia || !nombre) return res.status(400).json({ message: 'El código y el nombre de la evidencia son requeridos' });

    const indicador = await datosIndicador(indicadorId);
    if (!indicador) return res.status(400).json({ message: 'Selecciona el indicador al que pertenece la evidencia' });

    // Las evidencias que siguen en "Por clasificar" pueden conservar su
    // código anterior hasta que se las mueva a su indicador real
    const sinTocar = esProvisional(indicador.codigo) && evidencia === actual.evidencia;
    if (!sinTocar) {
      const error = validarCodigo('evidencia', evidencia, indicador.codigo);
      if (error) return res.status(400).json({ message: error });
    }

    const rutaVieja = await sgcCarpetas.rutaDeNivel('evidencia', id);

    await db.query(
      'UPDATE sgc_evidencias SET indicador_id = ?, evidencia = ?, nombre_evidencia = ?, descripcion = ? WHERE id = ?',
      [indicador.id, evidencia, nombre, descripcion, id]
    );

    // Si cambió de indicador, de código o de nombre, su carpeta lo sigue
    const aviso = await sgcCarpetas.reubicar(rutaVieja, await sgcCarpetas.rutaDeNivel('evidencia', id));
    const [[fila]] = await db.query(`${SELECT_EVIDENCIA} WHERE e.id = ?`, [id]);
    res.json(aviso ? { ...fila, drive_aviso: aviso } : fila);
  } catch (err) {
    responderError(res, err, 'actualizar la evidencia');
  }
};

// DELETE /api/sgc/:id — sus archivos no se borran: quedan sin evidencia
exports.remove = async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM sgc_evidencias WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Evidencia no encontrada' });
    res.json({ message: 'Evidencia eliminada' });
  } catch (err) {
    responderError(res, err, 'eliminar la evidencia');
  }
};
