const logger        = require('../config/logger');
const db            = require('../config/database');
const configuracion = require('./configuracion');
const auditoria     = require('./auditoria');

/*
 * Cierre programado de la planificación del POA.
 *
 * El administrador elige una fecha y hora; al llegar, se bloquea la
 * planificación de todos los proyectos POA que no estén archivados y la
 * programación se borra (es de una sola vez). Después se puede desbloquear
 * cualquier proyecto a mano.
 *
 * Se revisa al arrancar el servidor y cada 5 minutos.
 */

const CLAVE = 'poa_cierre_programado';      // fecha ISO del cierre
const CLAVE_POR = 'poa_cierre_programado_por'; // id de quien lo programó
const CADA_MS = 5 * 60 * 1000;

/** Bloquea todos los proyectos POA activos. Devuelve cuántos cambió. */
async function bloquearTodos(userId) {
  const [r] = await db.query(
    `UPDATE projects
        SET planificacion_bloqueada = 1, bloqueada_at = NOW(), bloqueada_por = ?
      WHERE es_poa = 1 AND archived_at IS NULL AND planificacion_bloqueada = 0`,
    [userId || null]
  );
  return r.affectedRows;
}

async function revisar() {
  try {
    const valor = await configuracion.obtener(CLAVE);
    if (!valor) return;
    const cuando = new Date(valor);
    if (Number.isNaN(cuando.getTime()) || cuando > new Date()) return;

    const porId = Number(await configuracion.obtener(CLAVE_POR)) || null;
    const n = await bloquearTodos(porId);
    await configuracion.guardar({ [CLAVE]: null, [CLAVE_POR]: null });

    const [[persona]] = porId
      ? await db.query('SELECT id, name, email FROM users WHERE id = ?', [porId])
      : [[null]];
    auditoria.registrar(null, {
      accion: 'poa_bloqueo_masivo',
      usuario: persona || { id: null, name: 'Sistema (cierre programado)', email: null },
      entidad: 'proyecto',
      entidadNombre: 'Proyectos POA',
      detalle: `Cierre programado para ${cuando.toISOString()}: ${n} proyecto(s) bloqueado(s)`,
    });
    logger.info(`Cierre programado del POA aplicado: ${n} proyecto(s) bloqueado(s)`);
  } catch (err) {
    // Sin las columnas o la tabla aún no se puede aplicar: se reintenta luego
    if (!['ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_TABLE'].includes(err.code)) {
      logger.error('No se pudo aplicar el cierre programado del POA', { message: err.message });
    }
  }
}

function iniciar() {
  revisar();
  setInterval(revisar, CADA_MS).unref();
}

module.exports = { iniciar, revisar, bloquearTodos, CLAVE, CLAVE_POR };
