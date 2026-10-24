/**
 * Plantillas de los correos de notificación.
 *
 * Todo texto que viene de los usuarios (títulos, comentarios, nombres) se
 * escapa antes de entrar al HTML. Los estilos van en línea porque la
 * mayoría de los clientes de correo ignora las hojas de estilo.
 */

const esc = (texto) => String(texto ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// La URL del frontend puede venir como lista separada por comas (CORS);
// para los enlaces se usa la primera
const urlApp = () => (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '');

const urlTarea = (projectId, taskId) => `${urlApp()}/projects/${projectId}/kanban?tarea=${taskId}`;

const fecha = (valor) => {
  if (!valor) return null;
  const d = new Date(String(valor).split('T')[0] + 'T12:00:00');
  return d.toLocaleDateString('es-SV', { day: 'numeric', month: 'long', year: 'numeric' });
};

const COLOR = '#2B5D63';

function layout({ titulo, intro, filas = [], cita = null, boton = null, pie }) {
  const tabla = filas.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:18px 0;border-collapse:collapse">
        ${filas.map(([k, v]) => `
          <tr>
            <td style="padding:7px 0;color:#6b7280;font-size:13px;width:120px;vertical-align:top">${esc(k)}</td>
            <td style="padding:7px 0;color:#111827;font-size:14px">${esc(v)}</td>
          </tr>`).join('')}
      </table>`
    : '';

  const bloqueCita = cita
    ? `<div style="margin:16px 0;padding:12px 14px;border-left:3px solid ${COLOR};background:#f3f6f6;color:#374151;font-size:14px;white-space:pre-wrap">${esc(cita)}</div>`
    : '';

  const bloqueBoton = boton
    ? `<p style="margin:24px 0 8px"><a href="${esc(boton.url)}" style="display:inline-block;background:${COLOR};color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:6px;font-size:14px;font-weight:600">${esc(boton.texto)}</a></p>`
    : '';

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f2ee;font-family:Segoe UI,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f2ee;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;border:1px solid #e5e7eb">
        <tr><td style="padding:28px 28px 8px">
          <h1 style="margin:0 0 10px;font-size:20px;line-height:1.3;color:#111827">${esc(titulo)}</h1>
          <p style="margin:0;font-size:15px;line-height:1.55;color:#374151">${intro}</p>
          ${tabla}${bloqueCita}${bloqueBoton}
        </td></tr>
        <tr><td style="padding:16px 28px 24px;border-top:1px solid #f0f0f0;font-size:12px;color:#9ca3af;line-height:1.5">
          ${pie || 'Recibes este correo porque tienes las notificaciones activadas en el sistema de proyectos. Puedes desactivarlas desde tu menú de usuario.'}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// Versión en texto plano, para clientes que no muestran HTML
const textoPlano = (lineas) => lineas.filter(Boolean).join('\n');

// ── Plantillas ───────────────────────────────────────────────────────────

const plantillas = {
  tareaAsignada: (d) => ({
    asunto: `Nueva tarea asignada: ${d.tarea}`,
    html: layout({
      titulo: 'Tienes una nueva tarea',
      intro:  `<b>${esc(d.actor)}</b> te asignó una tarea en el proyecto <b>${esc(d.proyecto)}</b>.`,
      filas:  [['Tarea', d.tarea], ['Prioridad', d.prioridad], ['Fecha límite', fecha(d.vence) || 'Sin fecha']],
      boton:  { texto: 'Abrir la tarea', url: urlTarea(d.projectId, d.taskId) },
    }),
    texto: textoPlano([
      `${d.actor} te asignó la tarea "${d.tarea}" en el proyecto ${d.proyecto}.`,
      d.vence && `Fecha límite: ${fecha(d.vence)}`,
      `Abrir: ${urlTarea(d.projectId, d.taskId)}`,
    ]),
  }),

  tareaReasignada: (d) => ({
    asunto: `Tarea reasignada: ${d.tarea}`,
    html: layout({
      titulo: 'Una tarea ya no está a tu cargo',
      intro:  `<b>${esc(d.actor)}</b> reasignó la tarea <b>${esc(d.tarea)}</b> del proyecto <b>${esc(d.proyecto)}</b> a <b>${esc(d.nuevoResponsable)}</b>.`,
      boton:  { texto: 'Ver la tarea', url: urlTarea(d.projectId, d.taskId) },
    }),
    texto: textoPlano([
      `${d.actor} reasignó la tarea "${d.tarea}" (${d.proyecto}) a ${d.nuevoResponsable}.`,
      `Ver: ${urlTarea(d.projectId, d.taskId)}`,
    ]),
  }),

  cambioEstado: (d) => ({
    asunto: `${d.tarea}: ${d.estadoNuevo}`,
    html: layout({
      titulo: d.completada ? 'Tarea completada' : 'Cambió el estado de una tarea',
      intro:  `<b>${esc(d.actor)}</b> movió la tarea <b>${esc(d.tarea)}</b> del proyecto <b>${esc(d.proyecto)}</b>.`,
      filas:  [['Antes', d.estadoAnterior], ['Ahora', d.estadoNuevo]],
      boton:  { texto: 'Abrir la tarea', url: urlTarea(d.projectId, d.taskId) },
    }),
    texto: textoPlano([
      `${d.actor} cambió "${d.tarea}" (${d.proyecto}) de ${d.estadoAnterior} a ${d.estadoNuevo}.`,
      `Abrir: ${urlTarea(d.projectId, d.taskId)}`,
    ]),
  }),

  comentario: (d) => ({
    asunto: `Nuevo comentario en: ${d.tarea}`,
    html: layout({
      titulo: 'Nuevo comentario',
      intro:  `<b>${esc(d.actor)}</b> comentó en la tarea <b>${esc(d.tarea)}</b> del proyecto <b>${esc(d.proyecto)}</b>:`,
      cita:   d.comentario.length > 600 ? `${d.comentario.slice(0, 600)}…` : d.comentario,
      boton:  { texto: 'Responder en la tarea', url: urlTarea(d.projectId, d.taskId) },
    }),
    texto: textoPlano([
      `${d.actor} comentó en "${d.tarea}" (${d.proyecto}):`,
      d.comentario,
      `Responder: ${urlTarea(d.projectId, d.taskId)}`,
    ]),
  }),

  agregadoProyecto: (d) => ({
    asunto: `Te agregaron al proyecto ${d.proyecto}`,
    html: layout({
      titulo: 'Te agregaron a un proyecto',
      intro:  `<b>${esc(d.actor)}</b> te agregó al proyecto <b>${esc(d.proyecto)}</b> como <b>${esc(d.rol)}</b>.`,
      boton:  { texto: 'Abrir el proyecto', url: `${urlApp()}/projects/${d.projectId}` },
    }),
    texto: textoPlano([
      `${d.actor} te agregó al proyecto ${d.proyecto} como ${d.rol}.`,
      `Abrir: ${urlApp()}/projects/${d.projectId}`,
    ]),
  }),

  recuperarContrasena: (d) => ({
    asunto: 'Restablece tu contraseña',
    html: layout({
      titulo: 'Restablece tu contraseña',
      intro:  `Hola ${esc(d.nombre)}. Recibimos una solicitud para restablecer la contraseña de tu cuenta. El enlace vale por <b>una hora</b>.`,
      boton:  { texto: 'Crear una contraseña nueva', url: d.enlace },
      pie:    'Si no fuiste tú quien lo pidió, ignora este correo: tu contraseña no cambia hasta que uses el enlace.',
    }),
    texto: textoPlano([
      `Hola ${d.nombre}. Para restablecer tu contraseña entra a este enlace (vale por una hora):`,
      d.enlace,
      'Si no fuiste tú quien lo pidió, ignora este correo.',
    ]),
  }),

  prueba: (d) => ({
    asunto: 'Correo de prueba del sistema de proyectos',
    html: layout({
      titulo: 'La cuenta de correo funciona',
      intro:  `Este es un correo de prueba enviado por <b>${esc(d.actor)}</b> desde la configuración del sistema. Si lo recibiste, las notificaciones están listas.`,
      filas:  [['Enviado desde', d.remitente]],
      pie:    'Correo de prueba. No requiere ninguna acción.',
    }),
    texto: `Correo de prueba enviado por ${d.actor} desde ${d.remitente}. Si lo recibiste, las notificaciones están listas.`,
  }),
};

function render(nombre, datos) {
  const plantilla = plantillas[nombre];
  if (!plantilla) throw new Error(`Plantilla de correo desconocida: ${nombre}`);
  return plantilla(datos);
}

module.exports = { render, urlApp };
