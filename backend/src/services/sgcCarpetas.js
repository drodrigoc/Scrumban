/**
 * Rutas de carpetas del SGC en Google Drive, a partir del catálogo:
 *
 *   SGC/
 *   └── 1 — Gestión institucional/          (dimensión)
 *       └── 1.1 — Planificación/            (criterio)
 *           └── 1.1.1 — Plan estratégico/   (indicador)
 *               └── 1.1.1.1 — Acta…/        (evidencia: aquí van las pruebas)
 *
 * Es el único lugar que arma estas rutas: lo usan las subidas, el cambio
 * de evidencia de un archivo, la edición del catálogo y los scripts.
 */

const db     = require('../config/database');
const gdrive = require('./gdrive');

const RAIZ = process.env.GDRIVE_FOLDER_SGC || 'SGC';

// Una barra dentro del nombre partiría la ruta en Drive
const nombreCarpeta = (texto, max = 120) =>
  String(texto).replace(/[/\\]/g, '-').replace(/\s+/g, ' ').trim().slice(0, max) || 'Sin nombre';

const etiqueta = (codigo, nombre) => nombreCarpeta(`${codigo} — ${nombre}`);

// Consultas que suben desde un nivel hasta la dimensión
const CONSULTAS = {
  dimension: `
    SELECT d.codigo AS d_codigo, d.nombre AS d_nombre
      FROM sgc_dimensiones d WHERE d.id = ?`,
  criterio: `
    SELECT d.codigo AS d_codigo, d.nombre AS d_nombre,
           c.codigo AS c_codigo, c.nombre AS c_nombre
      FROM sgc_criterios c
      JOIN sgc_dimensiones d ON d.id = c.dimension_id
     WHERE c.id = ?`,
  indicador: `
    SELECT d.codigo AS d_codigo, d.nombre AS d_nombre,
           c.codigo AS c_codigo, c.nombre AS c_nombre,
           i.codigo AS i_codigo, i.nombre AS i_nombre
      FROM sgc_indicadores i
      JOIN sgc_criterios   c ON c.id = i.criterio_id
      JOIN sgc_dimensiones d ON d.id = c.dimension_id
     WHERE i.id = ?`,
  evidencia: `
    SELECT d.codigo AS d_codigo, d.nombre AS d_nombre,
           c.codigo AS c_codigo, c.nombre AS c_nombre,
           i.codigo AS i_codigo, i.nombre AS i_nombre,
           e.evidencia AS e_codigo, e.nombre_evidencia AS e_nombre
      FROM sgc_evidencias e
      LEFT JOIN sgc_indicadores i ON i.id = e.indicador_id
      LEFT JOIN sgc_criterios   c ON c.id = i.criterio_id
      LEFT JOIN sgc_dimensiones d ON d.id = c.dimension_id
     WHERE e.id = ?`,
};

/**
 * Ruta de carpetas hasta el nivel indicado.
 * @param {'dimension'|'criterio'|'indicador'|'evidencia'} nivel
 * @returns {Promise<string[]|null>} null si el registro no existe
 */
async function rutaDeNivel(nivel, id) {
  const [[f]] = await db.query(CONSULTAS[nivel], [id]);
  if (!f) return null;

  // Evidencia sin indicador asignado: no hay árbol del que colgarla
  if (nivel === 'evidencia' && !f.i_codigo) {
    return [RAIZ, 'Sin clasificar', etiqueta(f.e_codigo, f.e_nombre)];
  }

  const ruta = [RAIZ, etiqueta(f.d_codigo, f.d_nombre)];
  if (f.c_codigo) ruta.push(etiqueta(f.c_codigo, f.c_nombre));
  if (f.i_codigo) ruta.push(etiqueta(f.i_codigo, f.i_nombre));
  if (f.e_codigo) ruta.push(etiqueta(f.e_codigo, f.e_nombre));
  return ruta;
}

// Carpeta de una evidencia, creando la ruta si hace falta
async function carpetaEvidencia(evidenciaId) {
  const ruta = await rutaDeNivel('evidencia', evidenciaId);
  if (!ruta) throw new Error(`Evidencia ${evidenciaId} no encontrada`);
  return gdrive.ensurePath(ruta);
}

/**
 * Hace que una carpeta siga un cambio del catálogo: la renombra y, si
 * cambió de padre, la mueve. Como las carpetas hijas viven dentro, un
 * solo movimiento arrastra todo lo que hay debajo.
 *
 * No lanza: devuelve un aviso si no se pudo, para que editar el catálogo
 * no falle por un problema de Drive pero el administrador se entere.
 */
async function reubicar(rutaVieja, rutaNueva) {
  if (!gdrive.isEnabled() || !rutaVieja || !rutaNueva) return null;
  if (rutaVieja.join('/') === rutaNueva.join('/')) return null;

  try {
    // Si nunca se subió nada a ese nivel, no hay carpeta que mover
    const carpetaId = await gdrive.findPath(rutaVieja);
    if (!carpetaId) return null;

    const nuevoPadre = await gdrive.ensurePath(rutaNueva.slice(0, -1));
    await gdrive.renameFolder(carpetaId, rutaNueva.at(-1), nuevoPadre);
    return null;
  } catch (error) {
    return `El cambio se guardó, pero la carpeta en Google Drive quedó como "${rutaVieja.at(-1)}" ` +
           `(${error.message}). Revísala manualmente en la unidad compartida.`;
  }
}

module.exports = { rutaDeNivel, carpetaEvidencia, reubicar, nombreCarpeta, RAIZ };
