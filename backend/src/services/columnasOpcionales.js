/*
 * Consultas que usan una columna nueva de la base de datos.
 *
 * Si el backend se actualiza antes de cargar el archivo de
 * database/actualizaciones que crea la columna, la consulta fallaría con
 * ER_BAD_FIELD_ERROR. Para lecturas que corren en cada petición (como la
 * del usuario al autenticarse) eso dejaría a todos fuera del sistema; aquí
 * se repite la consulta sin la columna y se recuerda para no volver a
 * intentarlo hasta reiniciar.
 */

const faltan = new Set();

/**
 * @param {object} db         conexión (config/database)
 * @param {string} clave      nombre corto de la columna, para recordar que falta
 * @param {string} conColumna consulta que usa la columna nueva
 * @param {string} sinColumna la misma consulta sin ella
 * @param {Array}  params
 */
async function consultar(db, clave, conColumna, sinColumna, params = []) {
  if (!faltan.has(clave)) {
    try {
      return await db.query(conColumna, params);
    } catch (err) {
      if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
      faltan.add(clave);
    }
  }
  return db.query(sinColumna, params);
}

module.exports = { consultar };
