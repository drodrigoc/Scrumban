/**
 * Correo de notificaciones a través de la API de Gmail.
 *
 * Los correos no se envían en el momento de la acción (asignar una tarea,
 * comentar...): se guardan en email_queue y un proceso en segundo plano
 * los envía y reintenta. Así, si Gmail tarda o falla, la acción del
 * usuario no se pone lenta ni da error.
 *
 * La cuenta que envía se conecta desde la pantalla "Correo del sistema"
 * y se puede cambiar ahí mismo, sin redesplegar.
 */

const crypto = require('crypto');
const db     = require('../config/database');
const logger = require('../config/logger');
const config = require('./configuracion');
const oauth  = require('./googleOAuth');
const { cifrar, descifrar } = require('./secretos');

const GMAIL_SEND = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

const MAX_INTENTOS   = 5;
const LOTE           = 10;
const INTERVALO_MS   = 15 * 1000;

// Claves en system_settings
const K = {
  cuenta:      'email.account',       // cuenta de Google conectada
  remitente:   'email.from_email',    // dirección que ven los destinatarios (puede ser un alias)
  nombre:      'email.from_name',
  token:       'email.refresh_token', // cifrado
  activo:      'email.enabled',
  conectadoEn: 'email.connected_at',
  conectadoPor:'email.connected_by',
  error:       'email.last_error',    // último error de conexión con Google
};

const NOMBRE_POR_DEFECTO = 'USO Projects';

// ── Configuración ────────────────────────────────────────────────────────

async function estado() {
  const c = await config.todas();
  return {
    cliente_configurado: oauth.estaConfigurado(),
    cliente:             oauth.diagnostico(),
    conectado:           Boolean(c[K.token]),
    cuenta:              c[K.cuenta] || null,
    remitente:           c[K.remitente] || c[K.cuenta] || null,
    nombre:              c[K.nombre] || NOMBRE_POR_DEFECTO,
    activo:              c[K.activo] !== '0',
    conectado_en:        c[K.conectadoEn] || null,
    ultimo_error:        c[K.error] || null,
  };
}

// Listo para enviar: hay cuenta conectada y el envío está activado
async function estaListo() {
  const e = await estado();
  return e.cliente_configurado && e.conectado && e.activo;
}

async function conectarCuenta({ email, refreshToken }, userId) {
  const actual = await config.obtener(K.token);
  if (actual) await oauth.revocar(descifrar(actual)).catch(() => {});

  await config.guardar({
    [K.cuenta]:       email,
    [K.remitente]:    email,
    [K.token]:        cifrar(refreshToken),
    [K.activo]:       '1',
    [K.conectadoEn]:  new Date().toISOString(),
    [K.conectadoPor]: userId,
    [K.error]:        null,
  }, userId);
  accesoCache = null;
}

async function desconectarCuenta(userId) {
  const actual = await config.obtener(K.token);
  if (actual) await oauth.revocar(descifrar(actual)).catch(() => {});

  await config.guardar({
    [K.cuenta]: null, [K.remitente]: null, [K.token]: null,
    [K.conectadoEn]: null, [K.conectadoPor]: null, [K.error]: null,
  }, userId);
  accesoCache = null;
}

async function actualizarAjustes({ nombre, remitente, activo }, userId) {
  const cambios = {};
  if (nombre !== undefined)    cambios[K.nombre]    = String(nombre).trim().slice(0, 100) || NOMBRE_POR_DEFECTO;
  if (remitente !== undefined) cambios[K.remitente] = String(remitente).trim().toLowerCase() || null;
  if (activo !== undefined)    cambios[K.activo]    = activo ? '1' : '0';
  await config.guardar(cambios, userId);
}

// ── Token de acceso ──────────────────────────────────────────────────────

let accesoCache = null; // { token, hasta }

async function tokenAcceso() {
  if (accesoCache && Date.now() < accesoCache.hasta) return accesoCache.token;

  const cifrado = await config.obtener(K.token);
  if (!cifrado) throw new Error('No hay una cuenta de correo conectada');

  try {
    const { accessToken, expiraEn } = await oauth.renovarAcceso(descifrar(cifrado));
    accesoCache = { token: accessToken, hasta: Date.now() + (expiraEn - 60) * 1000 };
    if (await config.obtener(K.error)) await config.guardar({ [K.error]: null });
    return accessToken;
  } catch (error) {
    // invalid_grant: alguien revocó el permiso o cambió la contraseña de la cuenta
    const mensaje = error.codigo === 'invalid_grant'
      ? 'Google revocó el permiso de la cuenta de correo. Vuelve a conectarla.'
      : `No se pudo renovar el acceso a Gmail: ${error.message}`;
    await config.guardar({ [K.error]: mensaje });
    throw new Error(mensaje);
  }
}

// ── Construcción del mensaje ─────────────────────────────────────────────

// Encabezados con acentos: RFC 2047
const encabezado = (texto) =>
  /^[\x20-\x7E]*$/.test(texto) ? texto : `=?UTF-8?B?${Buffer.from(texto, 'utf8').toString('base64')}?=`;

const base64Lineas = (texto) =>
  Buffer.from(texto, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');

function construirMime({ de, nombre, para, asunto, html, texto }) {
  const limite = `=_${crypto.randomBytes(12).toString('hex')}`;
  return [
    `From: ${encabezado(nombre)} <${de}>`,
    `To: ${para}`,
    `Subject: ${encabezado(asunto)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${limite}"`,
    '',
    `--${limite}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lineas(texto || ''),
    `--${limite}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lineas(html),
    `--${limite}--`,
    '',
  ].join('\r\n');
}

async function enviarAhora({ para, asunto, html, texto }) {
  const e = await estado();
  if (!e.conectado) throw new Error('No hay una cuenta de correo conectada');

  const mime = construirMime({ de: e.remitente, nombre: e.nombre, para, asunto, html, texto });
  const res = await fetch(GMAIL_SEND, {
    method:  'POST',
    headers: { Authorization: `Bearer ${await tokenAcceso()}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ raw: Buffer.from(mime, 'utf8').toString('base64url') }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) accesoCache = null;
    throw new Error(data?.error?.message || `Gmail respondió ${res.status}`);
  }
}

// ── Cola ─────────────────────────────────────────────────────────────────

/**
 * Agrega un correo a la cola. Si no hay cuenta conectada o el envío está
 * desactivado, no encola nada: si se encolara, al conectar la cuenta
 * saldría de golpe todo lo acumulado y ya desactualizado.
 */
async function encolar({ para, userId = null, asunto, html, texto, tipo }) {
  if (!para || !(await estaListo())) return false;

  await db.query(
    `INSERT INTO email_queue (to_email, to_user_id, subject, html, text_body, event_type)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [para, userId, String(asunto).slice(0, 255), html, texto || null, tipo]
  );
  return true;
}

let procesando = false;

async function procesarCola() {
  if (procesando) return;
  procesando = true;

  try {
    if (!(await estaListo())) return;

    const [pendientes] = await db.query(
      `SELECT * FROM email_queue
        WHERE status = 'pending' AND send_after <= NOW()
        ORDER BY id LIMIT ?`,
      [LOTE]
    );

    for (const correo of pendientes) {
      // Se reserva la fila antes de enviar: si hubiera dos procesos
      // corriendo, solo uno se queda con cada correo
      const [reserva] = await db.query(
        `UPDATE email_queue SET status = 'sending', attempts = attempts + 1
          WHERE id = ? AND status = 'pending'`,
        [correo.id]
      );
      if (!reserva.affectedRows) continue;

      try {
        await enviarAhora({ para: correo.to_email, asunto: correo.subject, html: correo.html, texto: correo.text_body });
        await db.query(
          `UPDATE email_queue SET status = 'sent', sent_at = NOW(), last_error = NULL WHERE id = ?`,
          [correo.id]
        );
      } catch (error) {
        const intentos = correo.attempts + 1;
        const agotado  = intentos >= MAX_INTENTOS;
        // Espera creciente entre reintentos: 1, 2, 4, 8 minutos
        const espera   = 60 * 2 ** (intentos - 1);

        await db.query(
          `UPDATE email_queue
              SET status = ?, last_error = ?, send_after = DATE_ADD(NOW(), INTERVAL ? SECOND)
            WHERE id = ?`,
          [agotado ? 'failed' : 'pending', String(error.message).slice(0, 1000), espera, correo.id]
        );
        logger.warn('No se pudo enviar un correo', { id: correo.id, intento: intentos, error: error.message });

        // Si el problema es la conexión con Google, no tiene sentido
        // seguir intentando con el resto del lote
        if (/conectada|revocó|renovar el acceso/.test(error.message)) break;
      }
    }
  } catch (error) {
    // Sin la migración v5 las tablas no existen: se avisa una sola vez en
    // lugar de llenar el log cada 15 segundos
    if (error.code === 'ER_NO_SUCH_TABLE') {
      if (!avisoSinTablas) logger.warn('Correo desactivado: falta aplicar la migración v5');
      avisoSinTablas = true;
    } else {
      logger.error('Error procesando la cola de correos', { message: error.message });
    }
  } finally {
    procesando = false;
  }
}

let avisoSinTablas = false;

async function resumenCola() {
  const [[conteo]] = await db.query(`
    SELECT
      SUM(status IN ('pending','sending'))                                   AS pendientes,
      SUM(status = 'sent'   AND sent_at   >= DATE_SUB(NOW(), INTERVAL 1 DAY)) AS enviados_24h,
      SUM(status = 'failed' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS fallidos_7d
    FROM email_queue
  `);
  const [fallidos] = await db.query(`
    SELECT id, to_email, subject, event_type, last_error, attempts, created_at
      FROM email_queue WHERE status = 'failed'
     ORDER BY id DESC LIMIT 10
  `);
  return {
    pendientes:   Number(conteo.pendientes || 0),
    enviados_24h: Number(conteo.enviados_24h || 0),
    fallidos_7d:  Number(conteo.fallidos_7d || 0),
    fallidos,
  };
}

// Vuelve a poner en cola los fallidos (por ejemplo, tras reconectar la cuenta)
async function reintentarFallidos() {
  const [r] = await db.query(
    `UPDATE email_queue SET status = 'pending', attempts = 0, send_after = NOW()
      WHERE status = 'failed' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
  );
  return r.affectedRows;
}

function iniciarProceso() {
  // Correos que quedaron "enviándose" si el servidor se reinició a mitad
  db.query(
    `UPDATE email_queue SET status = 'pending'
      WHERE status = 'sending' AND send_after < DATE_SUB(NOW(), INTERVAL 5 MINUTE)`
  ).catch(() => {});

  setInterval(procesarCola, INTERVALO_MS).unref();
  logger.info('Proceso de envío de correos iniciado', { cada_segundos: INTERVALO_MS / 1000 });
}

module.exports = {
  estado,
  estaListo,
  conectarCuenta,
  desconectarCuenta,
  actualizarAjustes,
  enviarAhora,
  encolar,
  resumenCola,
  reintentarFallidos,
  iniciarProceso,
};
