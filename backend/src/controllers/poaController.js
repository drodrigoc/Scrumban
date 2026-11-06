const logger        = require('../config/logger');
const db            = require('../config/database');
const configuracion = require('../services/configuracion');
const auditoria     = require('../services/auditoria');
const cierre        = require('../services/poaCierre');

/*
 * Administración → Control del POA (solo administradores).
 *
 * Bloquear la planificación de un proyecto POA impide que su dueño o sus
 * coordinadores cambien sus datos, alineación estratégica, cronograma macro
 * y partidas del presupuesto. La ejecución sigue abierta: tareas, costos,
 * evidencias y el ejecutado de las partidas fijas.
 */

const faltaBase = (res, err) => {
  if (err.code !== 'ER_BAD_FIELD_ERROR') return false;
  res.status(503).json({
    message: 'Falta actualizar la base de datos: carga database/actualizaciones/2026-11-08_proyectos_poa.sql',
  });
  return true;
};

const responderError = (res, err, accion) => {
  if (faltaBase(res, err)) return;
  logger.error(`Error al ${accion}`, { message: err.message });
  res.status(500).json({ message: `Error al ${accion}` });
};

async function leerCierre() {
  const fecha = await configuracion.obtener(cierre.CLAVE);
  if (!fecha) return null;
  const porId = Number(await configuracion.obtener(cierre.CLAVE_POR)) || null;
  const [[persona]] = porId ? await db.query('SELECT name FROM users WHERE id = ?', [porId]) : [[null]];
  return { fecha, programado_por: persona?.name || null };
}

// GET /api/poa
exports.listar = async (req, res) => {
  try {
    const [proyectos] = await db.query(
      `SELECT p.id, p.name, p.color, p.status, p.start_date, p.end_date, p.poa_aprobacion,
              p.planificacion_bloqueada AS bloqueado, p.bloqueada_at,
              ub.name AS bloqueada_por_nombre,
              o.name AS owner_name, o.unit AS owner_unit,
              COALESCE((SELECT SUM(b.monto_estimado) FROM project_budget_items b WHERE b.project_id = p.id), 0) AS presupuesto
         FROM projects p
         LEFT JOIN users o  ON o.id = p.owner_id
         LEFT JOIN users ub ON ub.id = p.bloqueada_por
        WHERE p.es_poa = 1 AND p.archived_at IS NULL
        ORDER BY o.unit, p.name`
    );
    const lista = proyectos.map(p => ({ ...p, bloqueado: Boolean(p.bloqueado), presupuesto: Number(p.presupuesto) || 0 }));
    res.json({
      proyectos: lista,
      cierre: await leerCierre(),
      resumen: {
        total: lista.length,
        bloqueados: lista.filter(p => p.bloqueado).length,
      },
    });
  } catch (err) {
    responderError(res, err, 'consultar los proyectos del POA');
  }
};

// PUT /api/poa/proyectos/:id/bloqueo  { bloqueado }
exports.bloqueo = async (req, res) => {
  try {
    const bloquear = req.body.bloqueado === true;
    const [[p]] = await db.query(
      'SELECT id, name, es_poa, archived_at, planificacion_bloqueada FROM projects WHERE id = ?', [req.params.id]
    );
    if (!p) return res.status(404).json({ message: 'Proyecto no encontrado' });
    if (!p.es_poa) return res.status(400).json({ message: 'Solo se bloquean proyectos que vienen del POA' });
    if (p.archived_at) return res.status(400).json({ message: 'El proyecto está archivado: ya es de solo lectura' });

    if (Boolean(p.planificacion_bloqueada) !== bloquear) {
      await db.query(
        `UPDATE projects SET planificacion_bloqueada = ?, bloqueada_at = ?, bloqueada_por = ? WHERE id = ?`,
        bloquear ? [1, new Date(), req.user.id, p.id] : [0, null, null, p.id]
      );
      auditoria.registrar(req, {
        accion: bloquear ? 'poa_bloqueado' : 'poa_desbloqueado',
        entidad: 'proyecto', entidadId: p.id, entidadNombre: p.name,
      });
    }
    res.json({ id: p.id, bloqueado: bloquear });
  } catch (err) {
    responderError(res, err, 'cambiar el bloqueo del proyecto');
  }
};

// POST /api/poa/bloquear-todos
exports.bloquearTodos = async (req, res) => {
  try {
    const n = await cierre.bloquearTodos(req.user.id);
    auditoria.registrar(req, {
      accion: 'poa_bloqueo_masivo', entidad: 'proyecto', entidadNombre: 'Proyectos POA',
      detalle: `${n} proyecto(s) bloqueado(s)`,
    });
    res.json({ cambiados: n });
  } catch (err) {
    responderError(res, err, 'bloquear los proyectos del POA');
  }
};

// POST /api/poa/desbloquear-todos
exports.desbloquearTodos = async (req, res) => {
  try {
    const [r] = await db.query(
      `UPDATE projects SET planificacion_bloqueada = 0, bloqueada_at = NULL, bloqueada_por = NULL
        WHERE es_poa = 1 AND archived_at IS NULL AND planificacion_bloqueada = 1`
    );
    auditoria.registrar(req, {
      accion: 'poa_desbloqueo_masivo', entidad: 'proyecto', entidadNombre: 'Proyectos POA',
      detalle: `${r.affectedRows} proyecto(s) desbloqueado(s)`,
    });
    res.json({ cambiados: r.affectedRows });
  } catch (err) {
    responderError(res, err, 'desbloquear los proyectos del POA');
  }
};

// PUT /api/poa/cierre  { fecha: instante ISO | null }
exports.programarCierre = async (req, res) => {
  try {
    const { fecha } = req.body;
    if (fecha) {
      const d = new Date(fecha);
      if (Number.isNaN(d.getTime())) return res.status(400).json({ message: 'Fecha no válida', campo: 'fecha' });
      if (d <= new Date()) {
        return res.status(400).json({
          message: 'La fecha del cierre ya pasó. Para bloquear ahora usa "Bloquear todos".', campo: 'fecha',
        });
      }
      await configuracion.guardar({ [cierre.CLAVE]: d.toISOString(), [cierre.CLAVE_POR]: req.user.id }, req.user.id);
    } else {
      await configuracion.guardar({ [cierre.CLAVE]: null, [cierre.CLAVE_POR]: null }, req.user.id);
    }
    auditoria.registrar(req, {
      accion: 'poa_cierre_programado', entidad: 'proyecto', entidadNombre: 'Proyectos POA',
      detalle: fecha ? `Cierre programado para ${new Date(fecha).toISOString()}` : 'Cierre programado cancelado',
    });
    res.json({ cierre: await leerCierre() });
  } catch (err) {
    responderError(res, err, 'programar el cierre del POA');
  }
};
