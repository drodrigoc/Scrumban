const ExcelJS = require('exceljs');
const { ESTADOS, ZONA } = require('./sgcCobertura');

/*
 * Reporte de cobertura SGC para auditoría, en Excel:
 *
 *   Resumen     dimensión → criterio → indicador, con cuántas evidencias
 *               hay en cada estado y el porcentaje con evidencia
 *   Evidencias  una fila por evidencia, con su estado y su motivo
 *   Archivos    una fila por archivo, con enlace a Drive
 */

const ORDEN_ESTADOS = ['con_evidencia', 'en_curso', 'planificada', 'en_riesgo', 'sin_trabajo'];

// Excel no tiene zonas horarias: se escribe la hora tal como se lee en
// la institución, no en UTC.
function fechaLocal(valor) {
  if (!valor) return null;
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(valor)).map(p => [p.type, p.value])
  );
  return new Date(Date.UTC(+partes.year, +partes.month - 1, +partes.day, +partes.hour, +partes.minute));
}

const conteoVacio = () => Object.fromEntries(ORDEN_ESTADOS.map(e => [e, 0]));

/** Filas del resumen: cada dimensión seguida de sus criterios e indicadores. */
function filasResumen(evidencias) {
  const nodos = new Map();
  const nodo = (nivel, codigo, nombre, profundidad) => {
    const clave = `${nivel}:${codigo}`;
    if (!nodos.has(clave)) nodos.set(clave, { nivel, codigo, nombre, profundidad, total: 0, ...conteoVacio() });
    return nodos.get(clave);
  };

  for (const e of evidencias) {
    const niveles = [
      nodo('Dimensión', e.dimension || '—', e.dimension_nombre || 'Sin dimensión', 0),
      nodo('Criterio',  e.criterio  || '—', e.criterio_nombre  || 'Sin criterio', 1),
      nodo('Indicador', e.indicador || '—', e.indicador_nombre || 'Sin indicador', 2),
    ];
    for (const n of niveles) { n.total++; n[e.estado]++; }
  }

  // Orden natural por código, y a igual código, el nivel superior primero
  return [...nodos.values()].sort((a, b) =>
    String(a.codigo).localeCompare(String(b.codigo), undefined, { numeric: true }) || a.profundidad - b.profundidad
  );
}

const ENCABEZADO = {
  font: { bold: true, color: { argb: 'FFFFFFFF' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } },
  alignment: { vertical: 'middle', wrapText: true },
};

function hojaConTabla(libro, nombre, columnas, titulo, subtitulo) {
  const hoja = libro.addWorksheet(nombre);
  hoja.columns = columnas.map(c => ({ key: c.key, width: c.width }));

  hoja.addRow([titulo]).font = { bold: true, size: 14 };
  hoja.addRow([subtitulo]).font = { color: { argb: 'FF6B7280' } };
  hoja.addRow([]);

  const fila = hoja.addRow(columnas.map(c => c.header));
  fila.eachCell(celda => Object.assign(celda, ENCABEZADO));
  fila.height = 30;

  hoja.views = [{ state: 'frozen', ySplit: 4 }];
  return hoja;
}

/**
 * @param {object[]} evidencias  resultado de sgcCobertura.obtenerCobertura()
 * @param {object}   opciones    { usuario, filtro } — filtro es un texto como "Dimensión 2"
 * @returns {ExcelJS.Workbook}
 */
function construirLibro(evidencias, { usuario, filtro }) {
  const libro = new ExcelJS.Workbook();
  libro.creator = usuario;
  libro.created = new Date();

  const generado = new Intl.DateTimeFormat('es-SV', {
    timeZone: ZONA, dateStyle: 'long', timeStyle: 'short',
  }).format(new Date());
  const subtitulo = `${filtro ? `${filtro} · ` : ''}Generado el ${generado} por ${usuario}`;

  // ── Resumen ────────────────────────────────────────────────
  const resumen = hojaConTabla(libro, 'Resumen', [
    { key: 'nivel',  header: 'Nivel',   width: 11 },
    { key: 'codigo', header: 'Código',  width: 9 },
    { key: 'nombre', header: 'Nombre',  width: 60 },
    { key: 'total',  header: 'Evidencias', width: 11 },
    ...ORDEN_ESTADOS.map(e => ({ key: e, header: ESTADOS[e], width: 12 })),
    { key: 'cobertura', header: 'Cobertura', width: 11 },
  ], 'Cobertura de evidencias SGC', subtitulo);

  const totales = { nivel: 'Total', codigo: '', nombre: `${evidencias.length} evidencias`, total: evidencias.length, ...conteoVacio() };
  evidencias.forEach(e => { totales[e.estado]++; });

  for (const n of [...filasResumen(evidencias), totales]) {
    const fila = resumen.addRow({
      ...n,
      cobertura: n.total ? n.con_evidencia / n.total : 0,
    });
    fila.getCell('cobertura').numFmt = '0%';
    fila.getCell('nombre').alignment = { wrapText: true, vertical: 'top', indent: n.profundidad || 0 };
    if (n.profundidad) fila.outlineLevel = n.profundidad;
    if (n.nivel === 'Dimensión' || n.nivel === 'Total') {
      fila.font = { bold: true };
      fila.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }; });
    }
  }
  resumen.properties.outlineProperties = { summaryBelow: false };

  // ── Evidencias ─────────────────────────────────────────────
  const hojaEv = hojaConTabla(libro, 'Evidencias', [
    { key: 'codigo',      header: 'Código',       width: 10 },
    { key: 'nombre',      header: 'Evidencia',    width: 55 },
    { key: 'indicador',   header: 'Indicador',    width: 10 },
    { key: 'criterio',    header: 'Criterio',     width: 9 },
    { key: 'dimension',   header: 'Dimensión',    width: 10 },
    { key: 'estado',      header: 'Estado',       width: 14 },
    { key: 'motivo',      header: 'Motivo',       width: 28 },
    { key: 'tareas',      header: 'Tareas',       width: 8 },
    { key: 'archivos',    header: 'Archivos',     width: 9 },
    { key: 'responsables',header: 'Responsables', width: 30 },
    { key: 'vence',       header: 'Próximo vencimiento', width: 14 },
    { key: 'ultimo',      header: 'Último archivo',      width: 16 },
  ], 'Evidencias SGC', subtitulo);

  for (const e of evidencias) {
    const pendientes = e.tasks.filter(t => t.status !== 'completed' && t.due_date).map(t => new Date(t.due_date)).sort((a, b) => a - b);
    const fila = hojaEv.addRow({
      codigo:       e.evidencia,
      nombre:       e.nombre_evidencia,
      indicador:    e.indicador,
      criterio:     e.criterio,
      dimension:    e.dimension,
      estado:       ESTADOS[e.estado],
      motivo:       e.motivo || '',
      tareas:       e.tasks.length,
      archivos:     e.archivos.length,
      responsables: [...new Set(e.tasks.map(t => t.assignee_name).filter(Boolean))].join(', '),
      vence:        pendientes[0] || null,
      ultimo:       fechaLocal(e.archivos[0]?.created_at),
    });
    fila.getCell('nombre').alignment = { wrapText: true, vertical: 'top' };
    fila.getCell('vence').numFmt  = 'dd/mm/yyyy';
    fila.getCell('ultimo').numFmt = 'dd/mm/yyyy hh:mm';
  }
  hojaEv.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 12 } };

  // ── Archivos ───────────────────────────────────────────────
  const hojaAr = hojaConTabla(libro, 'Archivos', [
    { key: 'evidencia', header: 'Evidencia',  width: 10 },
    { key: 'archivo',   header: 'Archivo',    width: 45 },
    { key: 'subido',    header: 'Subido por', width: 25 },
    { key: 'fecha',     header: 'Fecha',      width: 16 },
    { key: 'tarea',     header: 'Tarea',      width: 35 },
    { key: 'proyecto',  header: 'Proyecto',   width: 25 },
    { key: 'enlace',    header: 'Enlace',     width: 14 },
  ], 'Archivos de evidencia', subtitulo);

  for (const e of evidencias) {
    for (const a of e.archivos) {
      const fila = hojaAr.addRow({
        evidencia: e.evidencia,
        archivo:   a.filename,
        subido:    a.uploaded_by || '',
        fecha:     fechaLocal(a.created_at),
        tarea:     a.task_title,
        proyecto:  a.project_name,
        // El enlace abre el archivo en Drive a quien tenga acceso a la unidad
        enlace:    a.storage_provider === 'gdrive' && a.external_id
          ? { text: 'Abrir en Drive', hyperlink: `https://drive.google.com/file/d/${a.external_id}/view` }
          : 'En el servidor',
      });
      fila.getCell('fecha').numFmt = 'dd/mm/yyyy hh:mm';
      if (a.storage_provider === 'gdrive') fila.getCell('enlace').font = { color: { argb: 'FF2563EB' }, underline: true };
    }
  }
  hojaAr.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 7 } };

  return libro;
}

module.exports = { construirLibro };
