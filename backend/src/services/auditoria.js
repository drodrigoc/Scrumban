const logger = require('../config/logger');
const db     = require('../config/database');

/*
 * Bitácora de auditoría: quién entra al sistema, quién falla al intentarlo
 * y quién cambia usuarios, proyectos, el correo del sistema o el catálogo
 * SGC. La consulta un administrador en Administración → Auditoría.
 *
 * Cada registro guarda una copia del nombre y el correo de la persona y
 * del nombre de lo que se modificó, para que siga siendo legible aunque
 * después se eliminen. Nunca guarda contraseñas ni tokens.
 *
 * Los registros de más de un año se borran solos.
 */

// accion → categoría y nombre que ve el administrador
const ACCIONES = {
  login:                      { categoria: 'acceso',        etiqueta: 'Inicio de sesión' },
  login_fallido:              { categoria: 'acceso',        etiqueta: 'Intento de inicio fallido' },
  login_bloqueado:            { categoria: 'acceso',        etiqueta: 'Bloqueo por demasiados intentos' },
  logout:                     { categoria: 'acceso',        etiqueta: 'Cierre de sesión' },
  recuperacion_solicitada:    { categoria: 'acceso',        etiqueta: 'Recuperación de contraseña solicitada' },
  contrasena_restablecida:    { categoria: 'acceso',        etiqueta: 'Contraseña restablecida por correo' },

  usuario_creado:             { categoria: 'usuarios',      etiqueta: 'Usuario creado' },
  usuario_modificado:         { categoria: 'usuarios',      etiqueta: 'Usuario modificado' },
  usuario_habilitado:         { categoria: 'usuarios',      etiqueta: 'Usuario habilitado' },
  usuario_deshabilitado:      { categoria: 'usuarios',      etiqueta: 'Usuario deshabilitado' },
  contrasena_cambiada_admin:  { categoria: 'usuarios',      etiqueta: 'Contraseña restablecida por un administrador' },

  proyecto_creado:            { categoria: 'proyectos',     etiqueta: 'Proyecto creado' },
  proyecto_archivado:         { categoria: 'proyectos',     etiqueta: 'Proyecto archivado' },
  proyecto_restaurado:        { categoria: 'proyectos',     etiqueta: 'Proyecto restaurado' },
  proyecto_eliminado:         { categoria: 'proyectos',     etiqueta: 'Proyecto eliminado' },
  miembro_agregado:           { categoria: 'proyectos',     etiqueta: 'Miembro agregado' },
  miembro_quitado:            { categoria: 'proyectos',     etiqueta: 'Miembro quitado' },
  rol_miembro_cambiado:       { categoria: 'proyectos',     etiqueta: 'Rol de miembro cambiado' },
  pei_vinculada:              { categoria: 'proyectos',     etiqueta: 'Actividad estratégica vinculada' },
  pei_desvinculada:           { categoria: 'proyectos',     etiqueta: 'Actividad estratégica desvinculada' },
  pei_cumplida:               { categoria: 'proyectos',     etiqueta: 'Actividad estratégica cumplida' },
  pei_reabierta:              { categoria: 'proyectos',     etiqueta: 'Actividad estratégica reabierta' },
  poa_bloqueado:              { categoria: 'proyectos',     etiqueta: 'Planificación POA bloqueada' },
  poa_desbloqueado:           { categoria: 'proyectos',     etiqueta: 'Planificación POA desbloqueada' },
  poa_bloqueo_masivo:         { categoria: 'proyectos',     etiqueta: 'Todos los proyectos POA bloqueados' },
  poa_desbloqueo_masivo:      { categoria: 'proyectos',     etiqueta: 'Todos los proyectos POA desbloqueados' },
  poa_cierre_programado:      { categoria: 'proyectos',     etiqueta: 'Cierre del POA programado' },

  correo_conectado:           { categoria: 'configuracion', etiqueta: 'Cuenta de correo conectada' },
  correo_desconectado:        { categoria: 'configuracion', etiqueta: 'Cuenta de correo desconectada' },
  correo_ajustes:             { categoria: 'configuracion', etiqueta: 'Ajustes de correo cambiados' },

  sgc_catalogo_creado:        { categoria: 'sgc',           etiqueta: 'Elemento del catálogo SGC creado' },
  sgc_catalogo_modificado:    { categoria: 'sgc',           etiqueta: 'Elemento del catálogo SGC modificado' },
  sgc_catalogo_eliminado:     { categoria: 'sgc',           etiqueta: 'Elemento del catálogo SGC eliminado' },

  pei_catalogo_creado:        { categoria: 'pei',           etiqueta: 'Elemento del plan estratégico creado' },
  pei_catalogo_modificado:    { categoria: 'pei',           etiqueta: 'Elemento del plan estratégico modificado' },
  pei_catalogo_eliminado:     { categoria: 'pei',           etiqueta: 'Elemento del plan estratégico eliminado' },
};

const CATEGORIAS = {
  acceso:        'Accesos',
  usuarios:      'Usuarios',
  proyectos:     'Proyectos',
  configuracion: 'Configuración',
  sgc:           'Catálogo SGC',
  pei:           'Plan estratégico',
};

// Si no se da el nombre de lo modificado, se busca aquí
const NOMBRE_DE = {
  proyecto: 'SELECT name AS nombre FROM projects WHERE id = ?',
  usuario:  'SELECT name AS nombre FROM users WHERE id = ?',
};

const recortar = (texto, max) => (texto == null ? null : String(texto).slice(0, max));

/**
 * Registra un evento. Nunca lanza: si la bitácora falla, la acción que la
 * provocó ya ocurrió y no debe revertirse por eso.
 *
 * @param {object} req       la petición (de ahí salen la IP, el navegador y, si
 *                           no se indica otra, la persona: req.user)
 * @param {object} e
 * @param {string} e.accion  una de ACCIONES
 * @param {'exito'|'fallo'} [e.resultado]
 * @param {object} [e.usuario]   { id, name, email } cuando no es req.user
 * @param {string} [e.correo]    correo intentado (inicios fallidos)
 * @param {string} [e.entidad]   'usuario' | 'proyecto' | 'sgc' | 'correo'
 * @param {number} [e.entidadId]
 * @param {string} [e.entidadNombre]
 * @param {string} [e.detalle]   texto legible: "rol: miembro → coordinador"
 */
async function registrar(req, e) {
  try {
    const conf = ACCIONES[e.accion];
    if (!conf) throw new Error(`Acción de auditoría desconocida: ${e.accion}`);

    const persona = e.usuario || req.user || null;
    let entidadNombre = e.entidadNombre ?? null;
    if (!entidadNombre && e.entidadId && NOMBRE_DE[e.entidad]) {
      const [[fila]] = await db.query(NOMBRE_DE[e.entidad], [e.entidadId]);
      entidadNombre = fila?.nombre ?? null;
    }

    await db.query(
      `INSERT INTO auditoria
         (user_id, usuario_nombre, usuario_correo, accion, categoria, resultado,
          entidad, entidad_id, entidad_nombre, detalle, ip, navegador)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        persona?.id || null,
        recortar(persona?.name, 255),
        recortar(e.correo || persona?.email, 255),
        e.accion, conf.categoria, e.resultado || 'exito',
        e.entidad || null, e.entidadId || null, recortar(entidadNombre, 255),
        recortar(e.detalle, 1000),
        recortar(req?.ip, 45),
        recortar(req?.get?.('user-agent'), 255),
      ]
    );
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      logger.warn('Auditoría: la base de datos no tiene la tabla auditoria');
    } else {
      logger.error('No se pudo registrar en la auditoría', { accion: e.accion, message: err.message });
    }
  }
}

// ── Conservación: un año ───────────────────────────────────────────────
const UN_DIA = 24 * 60 * 60 * 1000;

async function purgarAntiguos() {
  try {
    const [r] = await db.query('DELETE FROM auditoria WHERE creado_en < DATE_SUB(NOW(), INTERVAL 1 YEAR)');
    if (r.affectedRows) logger.info('Auditoría: registros de más de un año eliminados', { cantidad: r.affectedRows });
  } catch (err) {
    if (err.code !== 'ER_NO_SUCH_TABLE') logger.error('Auditoría: no se pudo depurar', { message: err.message });
  }
}

function iniciarDepuracion() {
  purgarAntiguos();
  setInterval(purgarAntiguos, UN_DIA).unref();
}

module.exports = { registrar, iniciarDepuracion, ACCIONES, CATEGORIAS };
