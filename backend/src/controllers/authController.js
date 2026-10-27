const logger = require('../config/logger');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');
const email = require('../services/email');
const { render, urlApp } = require('../services/plantillasCorreo');

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

    const [users] = await db.query(
      'SELECT id, name, email, password, role, sgc_access, is_active, avatar FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );

    const user = users[0];

    // Si el email no existe se compara contra un hash falso: así la respuesta
    // tarda lo mismo y no se puede descubrir qué correos están registrados
    const isMatch = await bcrypt.compare(String(password), user && user.password ? user.password : HASH_FALSO);
    if (!user || !isMatch) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    // La cuenta deshabilitada se informa solo con la contraseña correcta,
    // para no revelar a terceros qué emails existen
    if (!user.is_active) {
      return res.status(403).json({ message: 'Cuenta deshabilitada. Contacte al administrador.' });
    }

    const token = generateToken(user.id);

    const { password: _, ...userWithoutPassword } = user;
    res.json({ token, user: userWithoutPassword });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, name, email, role, sgc_access, is_active, avatar, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    res.json(users[0]);
  } catch (error) {
    logger.error('GetMe error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
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
    if (!users.length || !users[0].is_active) return res.json(respuesta);

    const usuario = users[0];
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
      'SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > NOW()',
      [hashToken(token)]
    );

    if (!users.length) {
      return res.status(400).json({ message: 'Token inválido o expirado' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query(
      'UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
      [hashed, users[0].id]
    );

    res.json({ message: 'Contraseña restablecida correctamente' });
  } catch (error) {
    logger.error('ResetPassword error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};
