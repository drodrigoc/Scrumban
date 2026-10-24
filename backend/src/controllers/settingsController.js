const jwt    = require('jsonwebtoken');
const db     = require('../config/database');
const logger = require('../config/logger');
const email  = require('../services/email');
const oauth  = require('../services/googleOAuth');
const { render, urlApp } = require('../services/plantillasCorreo');

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Vuelve a la pantalla de configuración con el resultado en la URL
const volver = (res, params) =>
  res.redirect(`${urlApp()}/settings/email?${new URLSearchParams(params)}`);

// GET /api/settings/email
exports.getEmail = async (req, res) => {
  try {
    const [estado, cola] = await Promise.all([email.estado(), email.resumenCola()]);
    res.json({ ...estado, cola });
  } catch (error) {
    logger.error(error);
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ message: 'Falta aplicar la migración v5 en la base de datos.' });
    }
    res.status(500).json({ message: 'No se pudo cargar la configuración de correo' });
  }
};

// PUT /api/settings/email  { nombre, remitente, activo }
exports.updateEmail = async (req, res) => {
  try {
    const { nombre, remitente, activo } = req.body;
    if (remitente && !EMAIL_VALIDO.test(remitente)) {
      return res.status(400).json({ message: 'La dirección del remitente no es un correo válido' });
    }
    await email.actualizarAjustes({ nombre, remitente, activo }, req.user.id);
    res.json(await email.estado());
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'No se pudo guardar la configuración de correo' });
  }
};

// POST /api/settings/email/oauth/start → { url } para iniciar sesión en Google
exports.startOAuth = async (req, res) => {
  if (!oauth.estaConfigurado()) {
    return res.status(400).json({
      message: 'Faltan las credenciales del cliente OAuth de Google en las variables del servidor ' +
               '(GOOGLE_OAUTH_CLIENT_JSON y GOOGLE_OAUTH_REDIRECT_URI).',
    });
  }

  // El "state" viaja a Google y vuelve en el callback: prueba que la
  // solicitud la inició este administrador hace menos de 10 minutos
  const state = jwt.sign({ uid: req.user.id, fin: 'correo' }, process.env.JWT_SECRET, { expiresIn: '10m' });
  res.json({ url: oauth.urlAutorizacion(state) });
};

// GET /api/settings/email/oauth/callback — Google redirige aquí
// No lleva sesión (es una redirección del navegador): se autentica con el state
exports.oauthCallback = async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return volver(res, { resultado: 'error', detalle: error === 'access_denied' ? 'Se canceló la autorización en Google.' : error });
  }

  let uid;
  try {
    const datos = jwt.verify(String(state), process.env.JWT_SECRET);
    if (datos.fin !== 'correo') throw new Error('state inválido');
    uid = datos.uid;
  } catch {
    return volver(res, { resultado: 'error', detalle: 'La solicitud expiró o no es válida. Vuelve a intentarlo.' });
  }

  try {
    const [[admin]] = await db.query('SELECT id, role, is_active FROM users WHERE id = ?', [uid]);
    if (!admin || admin.role !== 'admin' || !admin.is_active) {
      return volver(res, { resultado: 'error', detalle: 'Solo un administrador puede conectar la cuenta de correo.' });
    }

    const { refreshToken, email: cuenta, verificado } = await oauth.canjearCodigo(String(code));

    if (!refreshToken) {
      return volver(res, { resultado: 'error', detalle: 'Google no entregó un token permanente. Vuelve a intentarlo.' });
    }
    if (!verificado) {
      return volver(res, { resultado: 'error', detalle: 'La cuenta de Google no tiene el correo verificado.' });
    }

    await email.conectarCuenta({ email: cuenta, refreshToken }, uid);
    logger.info('Cuenta de correo del sistema conectada', { cuenta, por: uid });
    volver(res, { resultado: 'conectado', cuenta });
  } catch (err) {
    logger.error('Error al conectar la cuenta de correo', { message: err.message });
    volver(res, { resultado: 'error', detalle: `Google rechazó la conexión: ${err.message}` });
  }
};

// POST /api/settings/email/test — envía al momento, sin pasar por la cola,
// para saber de inmediato si funciona
exports.testEmail = async (req, res) => {
  try {
    const estado = await email.estado();
    const para = req.body?.para || req.user.email;
    if (!EMAIL_VALIDO.test(para)) return res.status(400).json({ message: 'Correo de destino inválido' });

    const { asunto, html, texto } = render('prueba', { actor: req.user.name, remitente: estado.remitente });
    await email.enviarAhora({ para, asunto, html, texto });
    res.json({ message: `Correo de prueba enviado a ${para}` });
  } catch (error) {
    logger.warn('Falló el correo de prueba', { message: error.message });
    res.status(502).json({ message: `No se pudo enviar: ${error.message}` });
  }
};

// POST /api/settings/email/retry — reencola los fallidos de los últimos 7 días
exports.retryFailed = async (req, res) => {
  try {
    const n = await email.reintentarFallidos();
    res.json({ message: n ? `${n} correo(s) vuelven a la cola` : 'No hay correos fallidos recientes', reintentados: n });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'No se pudieron reintentar los correos' });
  }
};

// DELETE /api/settings/email — desconecta la cuenta y revoca el permiso en Google
exports.disconnect = async (req, res) => {
  try {
    await email.desconectarCuenta(req.user.id);
    res.json({ message: 'Cuenta de correo desconectada' });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'No se pudo desconectar la cuenta' });
  }
};
