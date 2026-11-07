const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { consultar } = require('../services/columnasOpcionales');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token no proporcionado' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // pei_access es nueva: si la base aún no la tiene, se lee sin ella
    const [users] = await consultar(db, 'pei_access',
      'SELECT id, name, email, role, sgc_access, pei_access, is_active, avatar, unit FROM users WHERE id = ?',
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
//
// Un proyecto archivado queda de solo lectura para todos: se consulta, pero
// no se modifica hasta restaurarlo.
//
// Archivar, restaurar y eliminar un proyecto: el administrador, en todos; el
// coordinador (rol general), en los de su unidad. La unidad de un proyecto es
// la de su dueño, y también cuentan los que el coordinador es dueño o
// coordina. Eliminar exige además que el proyecto ya esté archivado.

/**
 * @param {object} user     req.user
 * @param {object} proyecto { owner_id, owner_unit, archived_at }
 * @param {string|null} rol rol del usuario en el proyecto (project_members)
 */
function permisosDeArchivo(user, proyecto, rol) {
  const esCoordinador = user.role === 'coordinator' && (
    proyecto.owner_id === user.id ||
    rol === 'coordinator' ||
    (Boolean(user.unit) && proyecto.owner_unit === user.unit)
  );
  const archivar = user.role === 'admin' || esCoordinador;
  return { archivar, eliminar: archivar && Boolean(proyecto.archived_at) };
}

// Si la base todavía no tiene las columnas del POA (falta cargar la
// actualización 2026-11-08), los permisos se calculan como antes en lugar
// de romper todas las rutas de proyectos
let hayColumnasPoa = true;

async function leerProyecto(projectId) {
  if (hayColumnasPoa) {
    try {
      const [[p]] = await db.query(
        `SELECT p.owner_id, p.archived_at, p.es_poa, p.planificacion_bloqueada, u.unit AS owner_unit
           FROM projects p LEFT JOIN users u ON u.id = p.owner_id
          WHERE p.id = ?`,
        [projectId]
      );
      return p;
    } catch (err) {
      if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
      hayColumnasPoa = false;
    }
  }
  const [[p]] = await db.query(
    `SELECT p.owner_id, p.archived_at, u.unit AS owner_unit
       FROM projects p LEFT JOIN users u ON u.id = p.owner_id
      WHERE p.id = ?`,
    [projectId]
  );
  return p;
}

/**
 * Planificación de un proyecto POA bloqueada por la administración: nadie
 * salvo un administrador cambia sus datos, alineación estratégica,
 * cronograma macro ni las partidas del presupuesto. La ejecución sigue
 * abierta (tareas, costos, evidencias, ejecutado de partidas fijas).
 */
const planificacionBloqueada = (p) => Boolean(p?.es_poa) && Boolean(p?.planificacion_bloqueada);

// Igual que con el POA: sin la columna (falta la actualización 2026-11-09)
// nadie tiene costos fijos delegados, pero las rutas siguen funcionando
let hayColumnaFijos = true;

async function leerMiembro(projectId, userId) {
  if (hayColumnaFijos) {
    try {
      const [[m]] = await db.query(
        'SELECT role, ver_costos_fijos FROM project_members WHERE project_id = ? AND user_id = ?',
        [projectId, userId]
      );
      return m;
    } catch (err) {
      if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
      hayColumnaFijos = false;
    }
  }
  const [[m]] = await db.query(
    'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, userId]
  );
  return m;
}

/*
 * Costos fijos (salarios, prestaciones): información reservada.
 *   - Los ven el administrador, el coordinador y el Super Visor del sistema.
 *   - El administrador o el coordinador del sistema pueden delegarlos a un
 *     coordinador de un proyecto concreto (project_members.ver_costos_fijos).
 */
const ROLES_COSTOS_FIJOS = ['admin', 'coordinator', 'superViewer'];

async function accesoAProyecto(user, projectId) {
  const proyecto = await leerProyecto(projectId);
  if (!proyecto) return null;

  const miembro = await leerMiembro(projectId, user.id);
  const esDueno = proyecto.owner_id === user.id;
  const rol = miembro?.role || null;
  const archivado = Boolean(proyecto.archived_at);

  const permisos = permisosDeArchivo(user, proyecto, rol);
  // El coordinador de la unidad ve sus proyectos aunque no sea miembro
  const lectura = user.role === 'admin' || esDueno || Boolean(rol) || user.role === 'superViewer' || permisos.archivar;
  const gestion = user.role === 'admin' || esDueno || rol === 'coordinator' || (user.role === 'coordinator' && Boolean(rol));
  const escritura = gestion || (Boolean(rol) && rol !== 'viewer');

  const bloqueado = planificacionBloqueada(proyecto);

  return {
    lectura,
    escritura: escritura && !archivado,
    gestion:   gestion && !archivado,
    // Cambiar la planificación: como gestión, salvo que esté bloqueada
    // (el administrador puede siempre)
    planificacion: gestion && !archivado && (!bloqueado || user.role === 'admin'),
    bloqueado,
    costosFijos: ROLES_COSTOS_FIJOS.includes(user.role)
      || (rol === 'coordinator' && Boolean(miembro?.ver_costos_fijos)),
    // Delegar los costos fijos a un coordinador del proyecto: administrador o
    // coordinador del sistema que gestiona el proyecto
    delegarFijos: ['admin', 'coordinator'].includes(user.role) && gestion && !archivado,
    archivado,
    ...permisos,
  };
}

const MENSAJES_ACCESO = {
  lectura:   'Sin acceso a este proyecto',
  escritura: 'No tienes permiso para modificar este proyecto',
  gestion:   'Solo el dueño o un coordinador del proyecto puede hacer esto',
  planificacion: 'Solo el dueño o un coordinador del proyecto puede hacer esto',
};

const MENSAJE_BLOQUEO = 'La planificación de este proyecto POA está bloqueada por la administración. '
  + 'Pide a un administrador que la desbloquee si necesitas cambiarla.';

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

    if (!req.acceso[nivel]) {
      const message = req.acceso.archivado && req.acceso.lectura
        ? 'El proyecto está archivado: restáuralo para modificarlo'
        : nivel === 'planificacion' && req.acceso.gestion && req.acceso.bloqueado
          ? MENSAJE_BLOQUEO
          : MENSAJES_ACCESO[nivel];
      return res.status(403).json({ message, ...(nivel === 'planificacion' && req.acceso.bloqueado && { bloqueado: true }) });
    }
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

// Plan estratégico (tablero y página): igual que el SGC, el administrador, el
// Super Visor y quien tenga pei_access
const authorizePEI = (req, res, next) => {
  const { role, pei_access } = req.user;
  if (role === 'admin' || role === 'superViewer' || pei_access) return next();
  return res.status(403).json({ message: 'No tienes permisos para acceder al Plan estratégico' });
};

module.exports = {
  authenticate, authorize, authorizeSGC, authorizePEI,
  accesoAProyecto, permisosDeArchivo, requireProjectAccess, requireTaskInProject,
  planificacionBloqueada, MENSAJE_BLOQUEO,
};
