const logger = require('../config/logger');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');
const email = require('../services/email');
const { render, urlApp } = require('../services/plantillasCorreo');
const auditoria = require('../services/auditoria');
const { consultar } = require('../services/columnasOpcionales');

// En la base solo se guarda el hash del token de recuperación: si alguien
// leyera la tabla, no podría usar los enlaces vigentes
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

// Hash bcrypt (costo 10) de una contraseña descartable; solo sirve para
// igualar el tiempo de respuesta del login cuando el email no existe
const HASH_FALSO = '$2a$10$SM.DVlMYErm/WfAxCudsHekRW78X7nhf.frdH87uB1AufENxn0NSO';

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  });
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email y contraseña son requeridos' });
    }

    const [users] = await consultar(db, 'pei_access',
      'SELECT id, name, email, password, role, sgc_access, pei_access, is_active, avatar FROM users WHERE email = ?',
      'SELECT id, name, email, password, role, sgc_access, is_active, avatar FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );

    const user = users[0];

    // Si el email no existe se compara contra un hash falso: así la respuesta
    // tarda lo mismo y no se puede descubrir qué correos están registrados
    const isMatch = await bcrypt.compare(String(password), user && user.password ? user.password : HASH_FALSO);
    if (!user || !isMatch) {
      // Al usuario se le responde igual en ambos casos; la auditoría sí
      // distingue el motivo para que el administrador pueda ayudarle
      auditoria.registrar(req, {
        accion: 'login_fallido', resultado: 'fallo',
        usuario: user ? { id: user.id, name: user.name, email: user.email } : null,
        correo: String(email).toLowerCase().trim(),
        detalle: user ? 'Contraseña incorrecta' : 'El correo no está registrado',
      });
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    // La cuenta deshabilitada se informa solo con la contraseña correcta,
    // para no revelar a terceros qué emails existen
    if (!user.is_active) {
      auditoria.registrar(req, {
        accion: 'login_fallido', resultado: 'fallo', usuario: user,
        detalle: 'La cuenta está deshabilitada',
      });
      return res.status(403).json({ message: 'Cuenta deshabilitada. Contacte al administrador.' });
    }

    const token = generateToken(user.id);
    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id])
      .catch(err => logger.warn('No se pudo guardar el último acceso', { message: err.message }));
    auditoria.registrar(req, { accion: 'login', usuario: user });

    const { password: _, ...userWithoutPassword } = user;
    res.json({ token, user: userWithoutPassword });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const [users] = await consultar(db, 'pei_access',
      'SELECT id, name, email, role, sgc_access, pei_access, is_active, avatar, created_at FROM users WHERE id = ?',
      'SELECT id, name, email, role, sgc_access, is_active, avatar, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    res.json(users[0]);
  } catch (error) {
    logger.error('GetMe error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// El token JWT no se puede invalidar en el servidor: el cierre de sesión
// solo queda registrado y el navegador borra su copia
exports.logout = async (req, res) => {
  await auditoria.registrar(req, { accion: 'logout' });
  res.json({ message: 'Sesión cerrada' });
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const respuesta = { message: 'Si el email existe, recibirás instrucciones para restablecer tu contraseña' };

    const [users] = await db.query(
      'SELECT id, name, email, is_active FROM users WHERE email = ?',
      [email?.toLowerCase().trim()]
    );

    // Siempre responder igual para no revelar si el email existe
    if (!users.length || !users[0].is_active) {
      auditoria.registrar(req, {
        accion: 'recuperacion_solicitada', resultado: 'fallo',
        usuario: users[0] || null, correo: String(email || '').toLowerCase().trim() || null,
        detalle: users.length ? 'La cuenta está deshabilitada' : 'El correo no está registrado',
      });
      return res.json(respuesta);
    }

    const usuario = users[0];
    auditoria.registrar(req, { accion: 'recuperacion_solicitada', usuario });
    const resetToken = crypto.randomBytes(32).toString('hex');

    // El vencimiento se calcula en MySQL, igual que la comparación al
    // restablecer, para que no dependa de la zona horaria del servidor
    await db.query(
      'UPDATE users SET reset_token = ?, reset_token_expires = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?',
      [hashToken(resetToken), usuario.id]
    );

    try {
      const { asunto, html, texto } = render('recuperarContrasena', {
        nombre: usuario.name,
        enlace: `${urlApp()}/forgot-password?token=${resetToken}`,
      });
      await email.encolar({ para: usuario.email, userId: usuario.id, asunto, html, texto, tipo: 'recuperarContrasena' });
    } catch (error) {
      logger.error('No se pudo encolar el correo de recuperación', { message: error.message });
    }

    res.json(respuesta);
  } catch (error) {
    logger.error('ForgotPassword error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: 'Token y contraseña (mín. 8 caracteres) requeridos' });
    }

    const [users] = await db.query(
      'SELECT id, name, email FROM users WHERE reset_token = ? AND reset_token_expires > NOW()',
      [hashToken(token)]
    );

    if (!users.length) {
      auditoria.registrar(req, {
        accion: 'contrasena_restablecida', resultado: 'fallo',
        detalle: 'Enlace de recuperación inválido o vencido',
      });
      return res.status(400).json({ message: 'Token inválido o expirado' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query(
      'UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
      [hashed, users[0].id]
    );
    auditoria.registrar(req, { accion: 'contrasena_restablecida', usuario: users[0] });

    res.json({ message: 'Contraseña restablecida correctamente' });
  } catch (error) {
    logger.error('ResetPassword error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};
