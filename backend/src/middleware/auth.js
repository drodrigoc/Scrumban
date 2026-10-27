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

// ── Acceso a un proyecto ─────────────────────────────────────────────────
//
// Qué puede hacer cada usuario dentro de un proyecto:
//
//   lectura    ver el proyecto, sus tareas, comentarios y archivos
//   escritura  crear y editar tareas, checklist, comentarios y adjuntos
//   gestion    editar el proyecto, sus miembros, presupuesto y fases
//
//   admin                          todo, en todos los proyectos
//   dueño del proyecto             todo
//   coordinador del proyecto       todo (también el coordinador global
//                                  que sea miembro del proyecto)
//   miembro del proyecto           lectura y escritura
//   visor del proyecto             solo lectura
//   superViewer                    solo lectura, en todos los proyectos
//   cualquier otro                 nada
//
// Antes solo se bloqueaba a los visores, así que quien no era miembro
// pasaba como si lo fuera.
async function accesoAProyecto(user, projectId) {
  const [[proyecto]] = await db.query('SELECT owner_id FROM projects WHERE id = ?', [projectId]);
  if (!proyecto) return null;

  if (user.role === 'admin') return { lectura: true, escritura: true, gestion: true };

  const [[miembro]] = await db.query(
    'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
    [projectId, user.id]
  );
  const esDueno = proyecto.owner_id === user.id;
  const rol = miembro?.role || null;

  const gestion = esDueno || rol === 'coordinator' || (user.role === 'coordinator' && Boolean(rol));
  return {
    lectura:   esDueno || Boolean(rol) || user.role === 'superViewer',
    escritura: gestion || (Boolean(rol) && rol !== 'viewer'),
    gestion,
  };
}

const MENSAJES_ACCESO = {
  lectura:   'Sin acceso a este proyecto',
  escritura: 'No tienes permiso para modificar este proyecto',
  gestion:   'Solo el dueño o un coordinador del proyecto puede hacer esto',
};

/**
 * Exige un nivel de acceso sobre el proyecto de la URL
 * (:project_id en las rutas de tareas, :id en las de proyectos).
 * Deja el resultado en req.acceso para no consultarlo dos veces.
 */
const requireProjectAccess = (nivel) => async (req, res, next) => {
  try {
    const projectId = Number(req.params.project_id ?? req.params.id);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ message: 'Proyecto no válido' });
    }

    if (!req.acceso || req.acceso.projectId !== projectId) {
      const acceso = await accesoAProyecto(req.user, projectId);
      if (!acceso) return res.status(404).json({ message: 'Proyecto no encontrado' });
      req.acceso = { ...acceso, projectId };
    }

    if (!req.acceso[nivel]) return res.status(403).json({ message: MENSAJES_ACCESO[nivel] });
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * La tarea de la URL (:task_id o :id) tiene que pertenecer al proyecto de
 * la URL. Sin esto, con acceso a un proyecto se podía leer o modificar una
 * tarea de cualquier otro cambiando solo su id.
 */
const requireTaskInProject = async (req, res, next) => {
  try {
    const taskId = Number(req.params.task_id ?? req.params.id);
    const projectId = Number(req.params.project_id);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(404).json({ message: 'Tarea no encontrada' });
    }
    const [[tarea]] = await db.query(
      'SELECT id FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]
    );
    if (!tarea) return res.status(404).json({ message: 'Tarea no encontrada' });
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

module.exports = {
  authenticate, authorize, authorizeSGC,
  accesoAProyecto, requireProjectAccess, requireTaskInProject,
};
