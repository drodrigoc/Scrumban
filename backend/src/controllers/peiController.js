const logger    = require('../config/logger');
const db        = require('../config/database');
const auditoria = require('../services/auditoria');

/*
 * Plan Estratégico Institucional (PEI)
 *
 *   Línea 1 (con su objetivo estratégico)
 *     └ Acción 7
 *         └ Actividad 20 — indicador y fuente de verificación
 *
 * Las acciones y las actividades tienen numeración corrida en todo el plan
 * (acciones 1 a 27, actividades 1 a 96), como en el documento.
 *
 * Cada proyecto se alinea eligiendo actividades; la acción, el objetivo y
 * la línea salen de ahí. Por cada actividad vinculada se controla si se
 * cumplió, con su evidencia: un enlace o una tarea del proyecto.
 */

// ── Utilidades ─────────────────────────────────────────────────────────────

const faltaTabla = (res, err) => {
  if (err.code !== 'ER_NO_SUCH_TABLE') return false;
  res.status(503).json({
    message: 'Falta actualizar la base de datos: ejecuta database/actualizaciones/2026-11-07_plan_estrategico.sql',
  });
  return true;
};

const responderError = (res, err, accion) => {
  if (faltaTabla(res, err)) return;
  logger.error(`Error al ${accion}`, { message: err.message, code: err.code });
  res.status(500).json({ message: `Error al ${accion}` });
};

const texto = (v, max) => {
  if (v === undefined) return undefined;
  const t = String(v ?? '').trim();
  return t ? t.slice(0, max) : null;
};

const entero = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};

// ── Catálogo: lectura ──────────────────────────────────────────────────────

async function leerArbol() {
  const [[plan]]      = await db.query('SELECT * FROM pei_plan WHERE id = 1');
  const [lineas]      = await db.query('SELECT * FROM pei_lineas ORDER BY numero');
  const [acciones]    = await db.query('SELECT * FROM pei_acciones ORDER BY numero');
  const [actividades] = await db.query('SELECT * FROM pei_actividades ORDER BY numero');

  const porAccion = new Map();
  for (const a of actividades) {
    if (!porAccion.has(a.accion_id)) porAccion.set(a.accion_id, []);
    porAccion.get(a.accion_id).push(a);
  }
  const porLinea = new Map();
  for (const a of acciones) {
    if (!porLinea.has(a.linea_id)) porLinea.set(a.linea_id, []);
    porLinea.get(a.linea_id).push({ ...a, actividades: porAccion.get(a.id) || [] });
  }
  return {
    plan: plan || null,
    lineas: lineas.map(l => ({ ...l, acciones: porLinea.get(l.id) || [] })),
  };
}

// GET /api/pei — todo el catálogo en árbol (lo usa también el proyecto)
exports.getArbol = async (req, res) => {
  try {
    res.json(await leerArbol());
  } catch (err) {
    responderError(res, err, 'consultar el plan estratégico');
  }
};

// PUT /api/pei/plan — nombre, periodo, misión y visión (administrador)
exports.updatePlan = async (req, res) => {
  try {
    const nombre = texto(req.body.nombre, 255);
    const inicio = entero(req.body.anio_inicio);
    const fin    = entero(req.body.anio_fin);
    if (!nombre) return res.status(400).json({ message: 'Escribe el nombre del plan', campo: 'nombre' });
    if (!(inicio >= 2000 && inicio <= 2100) || !(fin >= 2000 && fin <= 2100)) {
      return res.status(400).json({ message: 'Los años del plan no son válidos', campo: 'anio_inicio' });
    }
    if (fin < inicio) return res.status(400).json({ message: 'El año final no puede ser anterior al inicial', campo: 'anio_fin' });

    const mision = texto(req.body.mision, 5000);
    const vision = texto(req.body.vision, 5000);
    await db.query(
      `INSERT INTO pei_plan (id, nombre, anio_inicio, anio_fin, mision, vision) VALUES (1, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), anio_inicio = VALUES(anio_inicio),
         anio_fin = VALUES(anio_fin), mision = VALUES(mision), vision = VALUES(vision)`,
      [nombre, inicio, fin, mision ?? null, vision ?? null]
    );
    auditoria.registrar(req, {
      accion: 'pei_catalogo_modificado', entidad: 'pei', entidadId: 1,
      entidadNombre: nombre, detalle: 'Datos generales del plan',
    });
    const [[plan]] = await db.query('SELECT * FROM pei_plan WHERE id = 1');
    res.json(plan);
  } catch (err) {
    responderError(res, err, 'guardar los datos del plan');
  }
};

// ── Catálogo: escritura (administrador) ────────────────────────────────────

const NIVELES = {
  linea: {
    tabla: 'pei_lineas', etiqueta: 'línea',
    hijos: { tabla: 'pei_acciones', campo: 'linea_id', texto: 'acciones' },
  },
  accion: {
    tabla: 'pei_acciones', etiqueta: 'acción',
    padre: { campo: 'linea_id', tabla: 'pei_lineas', etiqueta: 'línea' },
    hijos: { tabla: 'pei_actividades', campo: 'accion_id', texto: 'actividades' },
  },
  actividad: {
    tabla: 'pei_actividades', etiqueta: 'actividad',
    padre: { campo: 'accion_id', tabla: 'pei_acciones', etiqueta: 'acción' },
    hijos: { tabla: 'project_pei', campo: 'actividad_id', texto: 'proyectos vinculados' },
  },
};

const describir = (nivel, fila) => {
  const n = NIVELES[nivel].etiqueta;
  return `${n[0].toUpperCase()}${n.slice(1)} ${fila.numero} — ${fila.nombre}`;
};

/** Lee y valida los campos de un nivel. Devuelve { datos } o { error, campo }. */
function leerCampos(nivel, body, { crear }) {
  const datos = {};
  const numero = entero(body.numero);
  if (crear || body.numero !== undefined) {
    if (!(numero > 0)) return { error: 'El número debe ser un entero mayor que cero', campo: 'numero' };
    datos.numero = numero;
  }
  if (crear || body.nombre !== undefined) {
    const nombre = texto(body.nombre, nivel === 'linea' ? 255 : 500);
    if (!nombre) return { error: 'Escribe el nombre', campo: 'nombre' };
    datos.nombre = nombre;
  }

  const conf = NIVELES[nivel];
  if (conf.padre && (crear || body[conf.padre.campo] !== undefined)) {
    const padre = entero(body[conf.padre.campo]);
    if (!(padre > 0)) return { error: `Elige la ${conf.padre.etiqueta}`, campo: conf.padre.campo };
    datos[conf.padre.campo] = padre;
  }

  if (nivel === 'linea') {
    for (const [c, max] of [['objetivo', 5000], ['responsable', 255]]) {
      if (body[c] !== undefined) datos[c] = texto(body[c], max);
    }
  }
  if (nivel === 'accion' && body.recursos !== undefined) datos.recursos = texto(body.recursos, 5000);
  if (nivel === 'actividad') {
    for (const c of ['indicador', 'fuente_verificacion']) {
      if (body[c] !== undefined) datos[c] = texto(body[c], 500);
    }
    for (const c of ['periodo_inicio', 'periodo_fin']) {
      if (body[c] === undefined) continue;
      const anio = entero(body[c]);
      if (anio !== null && !(anio >= 2000 && anio <= 2100)) return { error: 'Año no válido', campo: c };
      datos[c] = anio;
    }
    if (datos.periodo_inicio && datos.periodo_fin && datos.periodo_fin < datos.periodo_inicio) {
      return { error: 'El año final no puede ser anterior al inicial', campo: 'periodo_fin' };
    }
  }
  return { datos };
}

async function validarPadre(conf, datos) {
  if (!conf.padre || !datos[conf.padre.campo]) return null;
  const [[padre]] = await db.query(`SELECT id FROM ${conf.padre.tabla} WHERE id = ?`, [datos[conf.padre.campo]]);
  return padre ? null : `La ${conf.padre.etiqueta} elegida no existe`;
}

const duplicado = (res, err, nivel, numero) => {
  if (err.code !== 'ER_DUP_ENTRY') return false;
  res.status(409).json({ message: `Ya existe la ${NIVELES[nivel].etiqueta} número ${numero}`, campo: 'numero' });
  return true;
};

const crearNivel = (nivel) => async (req, res) => {
  const conf = NIVELES[nivel];
  const { datos, error, campo } = leerCampos(nivel, req.body, { crear: true });
  if (error) return res.status(400).json({ message: error, campo });
  try {
    const malPadre = await validarPadre(conf, datos);
    if (malPadre) return res.status(400).json({ message: malPadre, campo: conf.padre.campo });

    const [r] = await db.query(`INSERT INTO ${conf.tabla} SET ?`, [datos]);
    const [[fila]] = await db.query(`SELECT * FROM ${conf.tabla} WHERE id = ?`, [r.insertId]);
    auditoria.registrar(req, {
      accion: 'pei_catalogo_creado', entidad: 'pei', entidadId: fila.id, entidadNombre: describir(nivel, fila),
    });
    res.status(201).json(fila);
  } catch (err) {
    if (duplicado(res, err, nivel, datos.numero)) return;
    responderError(res, err, `crear la ${conf.etiqueta}`);
  }
};

const actualizarNivel = (nivel) => async (req, res) => {
  const conf = NIVELES[nivel];
  const { datos, error, campo } = leerCampos(nivel, req.body, { crear: false });
  if (error) return res.status(400).json({ message: error, campo });
  try {
    const [[actual]] = await db.query(`SELECT * FROM ${conf.tabla} WHERE id = ?`, [req.params.id]);
    if (!actual) return res.status(404).json({ message: `No se encontró la ${conf.etiqueta}` });
    if (!Object.keys(datos).length) return res.status(400).json({ message: 'Sin campos para actualizar' });

    // El periodo se compara con lo guardado si solo cambia un extremo
    if (nivel === 'actividad') {
      const ini = 'periodo_inicio' in datos ? datos.periodo_inicio : actual.periodo_inicio;
      const fin = 'periodo_fin'    in datos ? datos.periodo_fin    : actual.periodo_fin;
      if (ini && fin && fin < ini) {
        return res.status(400).json({ message: 'El año final no puede ser anterior al inicial', campo: 'periodo_fin' });
      }
    }
    const malPadre = await validarPadre(conf, datos);
    if (malPadre) return res.status(400).json({ message: malPadre, campo: conf.padre.campo });

    await db.query(`UPDATE ${conf.tabla} SET ? WHERE id = ?`, [datos, req.params.id]);
    const [[fila]] = await db.query(`SELECT * FROM ${conf.tabla} WHERE id = ?`, [req.params.id]);

    const cambios = Object.keys(datos)
      .filter(c => String(actual[c] ?? '') !== String(fila[c] ?? ''))
      .map(c => `${c}: ${actual[c] ?? '—'} → ${fila[c] ?? '—'}`)
      .join('; ');
    if (cambios) {
      auditoria.registrar(req, {
        accion: 'pei_catalogo_modificado', entidad: 'pei', entidadId: fila.id,
        entidadNombre: describir(nivel, fila), detalle: cambios,
      });
    }
    res.json(fila);
  } catch (err) {
    if (duplicado(res, err, nivel, datos.numero)) return;
    responderError(res, err, `actualizar la ${conf.etiqueta}`);
  }
};

const eliminarNivel = (nivel) => async (req, res) => {
  const conf = NIVELES[nivel];
  try {
    const [[actual]] = await db.query(`SELECT * FROM ${conf.tabla} WHERE id = ?`, [req.params.id]);
    if (!actual) return res.status(404).json({ message: `No se encontró la ${conf.etiqueta}` });

    const [[{ n }]] = await db.query(
      `SELECT COUNT(*) AS n FROM ${conf.hijos.tabla} WHERE ${conf.hijos.campo} = ?`, [req.params.id]
    );
    if (n > 0) {
      return res.status(409).json({
        message: `No se puede eliminar: tiene ${n} ${conf.hijos.texto}. Quítalos primero.`,
      });
    }
    await db.query(`DELETE FROM ${conf.tabla} WHERE id = ?`, [req.params.id]);
    auditoria.registrar(req, {
      accion: 'pei_catalogo_eliminado', entidad: 'pei', entidadId: actual.id, entidadNombre: describir(nivel, actual),
    });
    res.json({ message: 'Eliminado' });
  } catch (err) {
    responderError(res, err, `eliminar la ${conf.etiqueta}`);
  }
};

exports.createLinea     = crearNivel('linea');
exports.updateLinea     = actualizarNivel('linea');
exports.deleteLinea     = eliminarNivel('linea');
exports.createAccion    = crearNivel('accion');
exports.updateAccion    = actualizarNivel('accion');
exports.deleteAccion    = eliminarNivel('accion');
exports.createActividad = crearNivel('actividad');
exports.updateActividad = actualizarNivel('actividad');
exports.deleteActividad = eliminarNivel('actividad');

// ── Alineación de un proyecto ──────────────────────────────────────────────

const SELECT_VINCULO = `
  SELECT pp.id, pp.project_id, pp.actividad_id, pp.cumplido, pp.cumplido_at,
         pp.evidencia_url, pp.evidencia_task_id, pp.nota, pp.created_at,
         uc.name AS cumplido_por_nombre,
         t.title AS evidencia_task_titulo,
         act.numero AS actividad_numero, act.nombre AS actividad_nombre,
         act.indicador, act.fuente_verificacion, act.periodo_inicio, act.periodo_fin,
         ac.id AS accion_id, ac.numero AS accion_numero, ac.nombre AS accion_nombre,
         l.id AS linea_id, l.numero AS linea_numero, l.nombre AS linea_nombre,
         l.objetivo AS linea_objetivo, l.responsable AS linea_responsable
    FROM project_pei pp
    JOIN pei_actividades act ON act.id = pp.actividad_id
    JOIN pei_acciones ac     ON ac.id = act.accion_id
    JOIN pei_lineas l        ON l.id = ac.linea_id
    LEFT JOIN users uc       ON uc.id = pp.cumplido_por
    LEFT JOIN tasks t        ON t.id = pp.evidencia_task_id`;

const formatear = (v) => ({ ...v, cumplido: Boolean(v.cumplido) });

const consultarVinculo = async (id) => {
  const [[v]] = await db.query(`${SELECT_VINCULO} WHERE pp.id = ?`, [id]);
  return v ? formatear(v) : null;
};

const nombreActividad = (v) => `Actividad ${v.actividad_numero} — ${v.actividad_nombre}`;

// GET /api/projects/:id/pei
exports.getProyecto = async (req, res) => {
  try {
    const [vinculos] = await db.query(
      `${SELECT_VINCULO} WHERE pp.project_id = ? ORDER BY l.numero, ac.numero, act.numero`,
      [req.params.id]
    );
    const [[plan]] = await db.query('SELECT nombre, anio_inicio, anio_fin, mision, vision FROM pei_plan WHERE id = 1');
    res.json({ plan: plan || null, vinculos: vinculos.map(formatear) });
  } catch (err) {
    responderError(res, err, 'consultar la alineación del proyecto');
  }
};

// POST /api/projects/:id/pei  { actividad_id }
exports.vincular = async (req, res) => {
  try {
    const actividadId = entero(req.body.actividad_id);
    if (!(actividadId > 0)) return res.status(400).json({ message: 'Elige la actividad estratégica' });
    const [[act]] = await db.query('SELECT id FROM pei_actividades WHERE id = ?', [actividadId]);
    if (!act) return res.status(400).json({ message: 'La actividad estratégica no existe' });

    const [r] = await db.query(
      'INSERT INTO project_pei (project_id, actividad_id, created_by) VALUES (?, ?, ?)',
      [req.params.id, actividadId, req.user.id]
    );
    const vinculo = await consultarVinculo(r.insertId);
    auditoria.registrar(req, {
      accion: 'pei_vinculada', entidad: 'proyecto', entidadId: Number(req.params.id),
      detalle: nombreActividad(vinculo),
    });
    res.status(201).json(vinculo);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Esa actividad ya está vinculada al proyecto' });
    }
    responderError(res, err, 'vincular la actividad');
  }
};

// PUT /api/projects/:id/pei/:vinculoId  { cumplido, evidencia_url, evidencia_task_id, nota }
exports.actualizarVinculo = async (req, res) => {
  try {
    const { id, vinculoId } = req.params;
    const [[actual]] = await db.query(
      'SELECT * FROM project_pei WHERE id = ? AND project_id = ?', [vinculoId, id]
    );
    if (!actual) return res.status(404).json({ message: 'La actividad no está vinculada a este proyecto' });

    const datos = {};

    if (req.body.evidencia_url !== undefined) {
      const url = texto(req.body.evidencia_url, 1000);
      if (url && !/^https?:\/\/\S+$/i.test(url)) {
        return res.status(400).json({ message: 'El enlace debe empezar con http:// o https://', campo: 'evidencia_url' });
      }
      datos.evidencia_url = url;
    }
    if (req.body.evidencia_task_id !== undefined) {
      const tareaId = entero(req.body.evidencia_task_id);
      if (Number.isNaN(tareaId)) return res.status(400).json({ message: 'Tarea no válida', campo: 'evidencia_task_id' });
      if (tareaId) {
        const [[t]] = await db.query('SELECT id FROM tasks WHERE id = ? AND project_id = ?', [tareaId, id]);
        if (!t) return res.status(400).json({ message: 'La tarea no pertenece a este proyecto', campo: 'evidencia_task_id' });
      }
      datos.evidencia_task_id = tareaId;
    }
    if (req.body.nota !== undefined) datos.nota = texto(req.body.nota, 1000);

    let evento = null;
    if (req.body.cumplido !== undefined) {
      const cumplido = req.body.cumplido === true || req.body.cumplido === 1 || req.body.cumplido === '1';
      // Sin evidencia no se puede dar por cumplida: es lo que pide la
      // fuente de verificación del plan
      const url   = 'evidencia_url'     in datos ? datos.evidencia_url     : actual.evidencia_url;
      const tarea = 'evidencia_task_id' in datos ? datos.evidencia_task_id : actual.evidencia_task_id;
      if (cumplido && !url && !tarea) {
        return res.status(400).json({
          message: 'Para marcarla como cumplida agrega la evidencia: un enlace o la tarea que la contiene',
          campo: 'evidencia',
        });
      }
      if (cumplido !== Boolean(actual.cumplido)) {
        datos.cumplido     = cumplido ? 1 : 0;
        datos.cumplido_at  = cumplido ? new Date() : null;
        datos.cumplido_por = cumplido ? req.user.id : null;
        evento = cumplido ? 'pei_cumplida' : 'pei_reabierta';
      }
    }

    // Una actividad cumplida no puede quedarse sin evidencia
    if (Boolean(actual.cumplido) && datos.cumplido === undefined) {
      const url   = 'evidencia_url'     in datos ? datos.evidencia_url     : actual.evidencia_url;
      const tarea = 'evidencia_task_id' in datos ? datos.evidencia_task_id : actual.evidencia_task_id;
      if (!url && !tarea) {
        return res.status(400).json({
          message: 'Una actividad cumplida necesita evidencia. Reábrela si quieres quitarla.',
          campo: 'evidencia',
        });
      }
    }

    if (Object.keys(datos).length) {
      await db.query('UPDATE project_pei SET ? WHERE id = ?', [datos, vinculoId]);
    }
    const vinculo = await consultarVinculo(vinculoId);
    if (evento) {
      auditoria.registrar(req, {
        accion: evento, entidad: 'proyecto', entidadId: Number(id), detalle: nombreActividad(vinculo),
      });
    }
    res.json(vinculo);
  } catch (err) {
    responderError(res, err, 'actualizar la actividad vinculada');
  }
};

// DELETE /api/projects/:id/pei/:vinculoId
exports.desvincular = async (req, res) => {
  try {
    const { id, vinculoId } = req.params;
    const vinculo = await consultarVinculo(vinculoId);
    if (!vinculo || String(vinculo.project_id) !== String(id)) {
      return res.status(404).json({ message: 'La actividad no está vinculada a este proyecto' });
    }
    await db.query('DELETE FROM project_pei WHERE id = ?', [vinculoId]);
    auditoria.registrar(req, {
      accion: 'pei_desvinculada', entidad: 'proyecto', entidadId: Number(id), detalle: nombreActividad(vinculo),
    });
    res.json({ message: 'Actividad desvinculada' });
  } catch (err) {
    responderError(res, err, 'desvincular la actividad');
  }
};

// ── Tablero consolidado ────────────────────────────────────────────────────

// GET /api/pei/tablero?anio=2027
// Proyectos del año (los que se cruzan con él; sin fechas, por su año de
// creación). Sin año, todos. Incluye los archivados: también ejecutaron.
exports.getTablero = async (req, res) => {
  try {
    const anio = entero(req.query.anio);
    if (Number.isNaN(anio) || (anio && !(anio >= 2000 && anio <= 2100))) {
      return res.status(400).json({ message: 'Año no válido' });
    }

    const filtro = anio
      ? `WHERE (p.start_date IS NULL AND p.end_date IS NULL AND YEAR(p.created_at) = ?)
            OR (COALESCE(YEAR(p.start_date), 0) <= ? AND COALESCE(YEAR(p.end_date), 9999) >= ?
                AND (p.start_date IS NOT NULL OR p.end_date IS NOT NULL))`
      : '';
    const [proyectos] = await db.query(
      `SELECT p.id, p.name, p.color, p.status, p.archived_at,
              COALESCE((SELECT SUM(b.monto_estimado) FROM project_budget_items b WHERE b.project_id = p.id), 0) AS presupuesto
         FROM projects p ${filtro}
        ORDER BY p.name`,
      anio ? [anio, anio, anio] : []
    );
    const ids = proyectos.map(p => p.id);

    const { plan, lineas } = await leerArbol();
    const [vinculos] = ids.length
      ? await db.query(
          'SELECT project_id, actividad_id, cumplido FROM project_pei WHERE project_id IN (?)', [ids]
        )
      : [[]];

    const proyectoPorId = new Map(proyectos.map(p => [p.id, {
      id: p.id, name: p.name, color: p.color, status: p.status,
      archivado: Boolean(p.archived_at), presupuesto: Number(p.presupuesto) || 0,
    }]));
    const vinculosPorActividad = new Map();
    for (const v of vinculos) {
      if (!vinculosPorActividad.has(v.actividad_id)) vinculosPorActividad.set(v.actividad_id, []);
      vinculosPorActividad.get(v.actividad_id).push({
        ...proyectoPorId.get(v.project_id), cumplido: Boolean(v.cumplido),
      });
    }

    const resumenLineas = lineas.map(l => {
      const proyectosLinea = new Map();
      let actividadesPlan = 0, cubiertas = 0, total = 0, cumplidos = 0;
      const acciones = l.acciones.map(a => ({
        id: a.id, numero: a.numero, nombre: a.nombre,
        actividades: a.actividades.map(act => {
          actividadesPlan++;
          const lista = vinculosPorActividad.get(act.id) || [];
          if (lista.length) cubiertas++;
          total += lista.length;
          cumplidos += lista.filter(x => x.cumplido).length;
          for (const p of lista) proyectosLinea.set(p.id, p);
          return {
            id: act.id, numero: act.numero, nombre: act.nombre, indicador: act.indicador,
            proyectos: lista,
          };
        }),
      }));
      return {
        id: l.id, numero: l.numero, nombre: l.nombre, objetivo: l.objetivo, responsable: l.responsable,
        actividades_plan: actividadesPlan,
        actividades_cubiertas: cubiertas,
        vinculos: total,
        cumplidos,
        proyectos: proyectosLinea.size,
        // Un proyecto que responde a varias líneas cuenta completo en cada una
        presupuesto: [...proyectosLinea.values()].reduce((s, p) => s + p.presupuesto, 0),
        acciones,
      };
    });

    const alineados = new Set(vinculos.map(v => v.project_id));
    const suma = (campo) => resumenLineas.reduce((s, l) => s + l[campo], 0);
    res.json({
      plan,
      anio: anio || null,
      resumen: {
        proyectos: proyectos.length,
        proyectos_alineados: alineados.size,
        actividades_plan: suma('actividades_plan'),
        actividades_cubiertas: suma('actividades_cubiertas'),
        vinculos: vinculos.length,
        cumplidos: vinculos.filter(v => v.cumplido).length,
        presupuesto_alineado: proyectos.filter(p => alineados.has(p.id))
          .reduce((s, p) => s + (Number(p.presupuesto) || 0), 0),
      },
      lineas: resumenLineas,
      sin_alinear: proyectos.filter(p => !alineados.has(p.id)).map(p => proyectoPorId.get(p.id)),
    });
  } catch (err) {
    responderError(res, err, 'armar el tablero del plan estratégico');
  }
};
