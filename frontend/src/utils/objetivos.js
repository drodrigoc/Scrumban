/*
 * Los objetivos de un proyecto se guardan en un solo campo de texto, uno
 * por línea. El formulario los edita como una lista y la ficha los muestra
 * numerados.
 */

/** Texto guardado → lista de objetivos (sin vacíos). */
export function separarObjetivos(texto) {
  return String(texto || '')
    .split(/\r?\n/)
    .map(o => o.trim())
    .filter(Boolean);
}

/**
 * Lista del formulario → texto para guardar. Un salto de línea dentro de un
 * objetivo se vuelve espacio, para que no se parta en dos al leerlo.
 */
export function unirObjetivos(lista) {
  const limpios = lista
    .map(o => String(o || '').replace(/\s*\r?\n\s*/g, ' ').trim())
    .filter(Boolean);
  return limpios.length ? limpios.join('\n') : null;
}
