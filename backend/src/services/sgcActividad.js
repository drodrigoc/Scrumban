const logger = require('../config/logger');
const db     = require('../config/database');

/*
 * Bitácora de los archivos SGC: qué se subió, se movió a otra evidencia
 * o se eliminó, quién y cuándo.
 *
 * Guarda una copia de los nombres y códigos (archivo, evidencia, tarea,
 * persona) porque la bitácora tiene que seguir leyéndose aunque después
 * se borre el archivo, la tarea o la evidencia.
 */

const ACCIONES = ['subida', 'reasignacion', 'eliminacion'];

/**
 * Registra una acción. Nunca lanza: si la bitácora falla, la subida o el
 * borrado que la provocó ya ocurrió y no debe revertirse por eso.
 *
 * @param {object} p
 * @param {'subida'|'reasignacion'|'eliminacion'} p.accion
 * @param {object} p.usuario      req.user
 * @param {object} p.adjunto      fila de task_attachments (o lo que devolvió guardarAdjunto)
 * @param {number} p.taskId
 * @param {number} p.projectId
 * @param {number} [p.evidenciaId]         evidencia del archivo (la nueva, si se reasignó)
 * @param {number} [p.evidenciaAnteriorId] solo para reasignaciones
 */
async function registrar({ accion, usuario, adjunto, taskId, projectId, evidenciaId, evidenciaAnteriorId = null }) {
  try {
    const ids = [evidenciaId, evidenciaAnteriorId].filter(Boolean);
    const [[tarea], [evidencias]] = await Promise.all([
      db.query('SELECT title FROM tasks WHERE id = ?', [taskId]).then(([r]) => r),
      ids.length
        ? db.query('SELECT id, evidencia FROM sgc_evidencias WHERE id IN (?)', [ids])
        : Promise.resolve([[]]),
    ]);
    const codigo = (id) => evidencias.find(e => e.id === id)?.evidencia || null;

    await db.query(
      `INSERT INTO sgc_actividad
         (accion, user_id, usuario_nombre, attachment_id, filename,
          evidencia_id, evidencia_codigo, evidencia_anterior,
          task_id, task_titulo, project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [accion, usuario.id, usuario.name || null, adjunto.id, adjunto.filename,
       evidenciaId || null, codigo(evidenciaId), codigo(evidenciaAnteriorId),
       taskId, tarea?.title || null, projectId || null]
    );
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      logger.warn('Bitácora SGC: falta aplicar la migración v7 (tabla sgc_actividad)');
    } else {
      logger.error(err);
    }
  }
}

module.exports = { registrar, ACCIONES };
