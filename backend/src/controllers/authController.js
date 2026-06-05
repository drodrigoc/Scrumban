const logger = require('../config/logger');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email y contraseña son requeridos' });
    }

    const [users] = await db.query(
      'SELECT id, name, email, password, role, is_active, avatar FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );

    if (!users.length) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const user = users[0];

    if (!user.is_active) {
      return res.status(403).json({ message: 'Cuenta deshabilitada. Contacte al administrador.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
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
      'SELECT id, name, email, role, is_active, avatar, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    res.json(users[0]);
  } catch (error) {
    logger.error('GetMe error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Se requieren ambas contraseñas' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 8 caracteres' });
    }

    const [users] = await db.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
    const isMatch = await bcrypt.compare(currentPassword, users[0].password);

    if (!isMatch) {
      return res.status(400).json({ message: 'Contraseña actual incorrecta' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    logger.error('ChangePassword error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const [users] = await db.query('SELECT id FROM users WHERE email = ?', [email?.toLowerCase().trim()]);

    // Siempre responder igual para no revelar si el email existe
    if (!users.length) {
      return res.json({ message: 'Si el email existe, recibirás instrucciones para restablecer tu contraseña' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await db.query(
      'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
      [resetToken, expires, users[0].id]
    );

    // En producción enviar email; aquí solo devolvemos el token para desarrollo
    res.json({
      message: 'Si el email existe, recibirás instrucciones para restablecer tu contraseña',
      ...(process.env.NODE_ENV === 'development' && { resetToken }),
    });
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
      [token]
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
