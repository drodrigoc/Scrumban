const jwt = require('jsonwebtoken');
const db = require('../config/database');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token no proporcionado' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [users] = await db.query(
      'SELECT id, name, email, role, sgc_access, is_active, avatar, unit FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (!users.length) {
      return res.status(401).json({ message: 'Usuario no encontrado' });
    }

    if (!users[0].is_active) {
      return res.status(403).json({ message: 'Cuenta deshabilitada. Contacte al administrador.' });
    }

    req.user = users[0];
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expirado' });
    }
    return res.status(401).json({ message: 'Token inválido' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'No tienes permisos para esta acción' });
    }
    next();
  };
};

// Bloquea acceso si el usuario tiene rol 'viewer' en el proyecto
// Solo aplica a usuarios no-admin; admins siempre pasan.
const denyProjectViewer = async (req, res, next) => {
  try {
    if (req.user.role === 'admin') return next();

    const projectId = req.params.project_id || req.params.id;
    if (!projectId) return next();

    const [rows] = await db.query(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, req.user.id]
    );

    if (rows.length && rows[0].role === 'viewer') {
      return res.status(403).json({ message: 'Los visores no pueden modificar tareas en este proyecto' });
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Permite acceso a SGC si es admin, superViewer, o tiene sgc_access = true
const authorizeSGC = (req, res, next) => {
  const { role, sgc_access } = req.user;
  if (role === 'admin' || role === 'superViewer' || sgc_access) return next();
  return res.status(403).json({ message: 'No tienes permisos para acceder al SGC' });
};

module.exports = { authenticate, authorize, denyProjectViewer, authorizeSGC };
