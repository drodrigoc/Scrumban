/**
 * Punto único de salida de las notificaciones.
 *
 * Cada evento crea la notificación dentro del sistema (la campana) y
 * encola también el correo, que sale cuando hay una cuenta de correo
 * conectada. Los avisos por correo no son opcionales para el usuario. Así ninguna notificación queda sin
 * su correo ni al revés.
 *
 * Nada de lo que pase aquí debe interrumpir la acción del usuario: los
 * errores se registran y se ignoran.
 */

const db     = require('../config/database');
const logger = require('../config/logger');
const email  = require('./email');
const { render } = require('./plantillasCorreo');

const PRIORIDADES = { low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica' };
const ESTADOS     = { pending: 'Pendiente', in_progress: 'En proceso', in_review: 'En revisión', completed: 'Completada' };
const ROLES       = { coordinator: 'coordinador', member: 'miembro', viewer: 'visor' };

/**
 * @param {object}  n
 * @param {number}  n.userId   destinatario
 * @param {string}  n.titulo   título de la notificación en la campana
 * @param {string}  n.mensaje
 * @param {string}  n.tipo     uno de los tipos de la tabla notifications
 * @param {object} [n.correo]  { plantilla, datos } para enviar también un correo
 */
async function notificar({ userId, titulo, mensaje, tipo, refId = null, refType = null, correo = null }) {
  if (!userId) return;

  try {
    await db.query(
      'INSERT INTO notifications (user_id, title, message, type, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, titulo, mensaje, tipo, refId, refType]
    );
  } catch (error) {
    logger.warn('No se pudo crear la notificación', { userId, tipo, message: error.message });
  }

  if (!correo) return;

  try {
    const [[usuario]] = await db.query(
      'SELECT email, is_active FROM users WHERE id = ?', [userId]
    );
    if (!usuario?.email || !usuario.is_active) return;

    const { asunto, html, texto } = render(correo.plantilla, correo.datos);
    await email.encolar({ para: usuario.email, userId, asunto, html, texto, tipo: correo.plantilla });
  } catch (error) {
    logger.warn('No se pudo encolar el correo de notificación', { userId, tipo, message: error.message });
  }
}

// ── Contexto ─────────────────────────────────────────────────────────────

async function contextoTarea(taskId) {
  const [[tarea]] = await db.query(
    `SELECT t.id, t.title, t.priority, t.due_date, t.status, t.project_id,
            t.assignee_id, t.created_by, p.name AS proyecto
       FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.id = ?`,
    [taskId]
  );
  return tarea || null;
}

// Las columnas del tablero son personalizables: se usa el nombre que ve el equipo
async function nombreEstado(projectId, status) {
  try {
    const [[col]] = await db.query(
      'SELECT label FROM project_kanban_columns WHERE project_id = ? AND column_key = ?',
      [projectId, status]
    );
    if (col) return col.label;
  } catch { /* sin tabla de columnas: se usa el nombre por defecto */ }
  return ESTADOS[status] || status;
}

async function nombreUsuario(userId) {
  if (!userId) return null;
  const [[u]] = await db.query('SELECT name FROM users WHERE id = ?', [userId]);
  return u?.name || null;
}

const datosTarea = (t, actor) => ({
  tarea:     t.title,
  proyecto:  t.proyecto,
  prioridad: PRIORIDADES[t.priority] || t.priority,
  vence:     t.due_date,
  projectId: t.project_id,
  taskId:    t.id,
  actor:     actor.name,
});

// ── Eventos ──────────────────────────────────────────────────────────────

async function tareaAsignada({ taskId, assigneeId, actor }) {
  if (!assigneeId || Number(assigneeId) === actor.id) return;
  const t = await contextoTarea(taskId);
  if (!t) return;

  await notificar({
    userId: Number(assigneeId),
    titulo: 'Nueva tarea asignada',
    mensaje: `${actor.name} te asignó la tarea "${t.title}"`,
    tipo: 'task_assigned', refId: t.id, refType: 'task',
    correo: { plantilla: 'tareaAsignada', datos: datosTarea(t, actor) },
  });
}

// Avisa al responsable anterior de que la tarea ya no está a su cargo
async function tareaReasignada({ taskId, anteriorId, nuevoId, actor }) {
  if (!anteriorId || anteriorId === actor.id || anteriorId === Number(nuevoId)) return;
  const t = await contextoTarea(taskId);
  if (!t) return;

  const nuevoResponsable = (await nombreUsuario(nuevoId)) || 'nadie (quedó sin asignar)';

  await notificar({
    userId: anteriorId,
    titulo: 'Tarea reasignada',
    mensaje: `La tarea "${t.title}" ahora está a cargo de ${nuevoResponsable}`,
    tipo: 'task_assigned', refId: t.id, refType: 'task',
    correo: { plantilla: 'tareaReasignada', datos: { ...datosTarea(t, actor), nuevoResponsable } },
  });
}

/**
 * Cambio de estado: avisa al responsable si lo movió otra persona, y a
 * quien creó la tarea cuando se completa. Los cambios intermedios no le
 * llegan al creador para no llenarle la bandeja.
 */
async function cambioEstado({ taskId, anterior, nuevo, actor }) {
  const t = await contextoTarea(taskId);
  if (!t) return;

  const datos = {
    ...datosTarea(t, actor),
    estadoAnterior: await nombreEstado(t.project_id, anterior),
    estadoNuevo:    await nombreEstado(t.project_id, nuevo),
    completada:     nuevo === 'completed',
  };
  const mensaje = `La tarea "${t.title}" cambió a ${datos.estadoNuevo}`;

  if (t.assignee_id && t.assignee_id !== actor.id) {
    await notificar({
      userId: t.assignee_id, titulo: 'Estado de tarea actualizado', mensaje,
      tipo: 'status_changed', refId: t.id, refType: 'task',
      correo: { plantilla: 'cambioEstado', datos },
    });
  }

  if (datos.completada && t.created_by && t.created_by !== actor.id && t.created_by !== t.assignee_id) {
    await notificar({
      userId: t.created_by, titulo: 'Tarea completada', mensaje,
      tipo: 'status_changed', refId: t.id, refType: 'task',
      correo: { plantilla: 'cambioEstado', datos },
    });
  }
}

// Comentario: al responsable y a quien creó la tarea, salvo a quien comentó
async function comentario({ taskId, actor, contenido }) {
  const t = await contextoTarea(taskId);
  if (!t) return;

  const destinatarios = [...new Set([t.assignee_id, t.created_by])]
    .filter(id => id && id !== actor.id);

  for (const userId of destinatarios) {
    await notificar({
      userId,
      titulo: 'Nuevo comentario',
      mensaje: `${actor.name} comentó en "${t.title}"`,
      tipo: 'comment_added', refId: t.id, refType: 'task',
      correo: { plantilla: 'comentario', datos: { ...datosTarea(t, actor), comentario: contenido } },
    });
  }
}

async function agregadoProyecto({ projectId, userId, rol, actor }) {
  if (!userId || Number(userId) === actor.id) return;
  const [[p]] = await db.query('SELECT name FROM projects WHERE id = ?', [projectId]);
  if (!p) return;

  await notificar({
    userId: Number(userId),
    titulo: 'Añadido a proyecto',
    mensaje: `${actor.name} te agregó al proyecto "${p.name}"`,
    tipo: 'project_update', refId: Number(projectId), refType: 'project',
    correo: {
      plantilla: 'agregadoProyecto',
      datos: { proyecto: p.name, projectId, actor: actor.name, rol: ROLES[rol] || 'miembro' },
    },
  });
}

module.exports = {
  notificar,
  tareaAsignada,
  tareaReasignada,
  cambioEstado,
  comentario,
  agregadoProyecto,
};
