const db = require('../config/database');

/*
 * Cobertura del catálogo SGC: cada evidencia con sus tareas, sus archivos
 * y un estado calculado. Lo usan la pestaña Visualización y el reporte
 * para auditoría, así que el estado se decide en un solo lugar.
 *
 *   con_evidencia  al menos un archivo subido
 *   en_riesgo      sin archivos, y con una tarea vencida o con todas sus
 *                  tareas terminadas (el trabajo se hizo y no quedó prueba)
 *   en_curso       sin archivos, con alguna tarea que ya avanzó
 *   planificada    sin archivos, con tareas que todavía no empiezan
 *   sin_trabajo    ni tareas ni archivos
 */

const ESTADOS = {
  con_evidencia: 'Con evidencia',
  en_curso:      'En curso',
  planificada:   'Planificada',
  en_riesgo:     'En riesgo',
  sin_trabajo:   'Sin trabajo',
};

// "Hoy" en la zona de la institución: el servidor corre en UTC, y a las
// 7 p. m. de El Salvador ya sería mañana.
const ZONA = process.env.APP_TIMEZONE || 'America/El_Salvador';
const hoyLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());

// Las columnas DATE llegan como Date a medianoche UTC (pool en '+00:00')
const dia = (valor) => {
  if (!valor) return null;
  return valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor).slice(0, 10);
};

function estadoEvidencia(tareas, archivos, hoy = hoyLocal()) {
  if (archivos.length) return { estado: 'con_evidencia', motivo: null };
  if (!tareas.length)  return { estado: 'sin_trabajo',   motivo: null };

  const vencidas = tareas.filter(t => t.status !== 'completed' && t.due_date && dia(t.due_date) < hoy);
  if (vencidas.length) {
    return { estado: 'en_riesgo', motivo: `${vencidas.length} tarea${vencidas.length > 1 ? 's' : ''} vencida${vencidas.length > 1 ? 's' : ''} sin archivo` };
  }
  if (tareas.every(t => t.status === 'completed')) {
    return { estado: 'en_riesgo', motivo: 'Tareas terminadas sin archivo' };
  }
  if (tareas.some(t => t.status !== 'pending')) return { estado: 'en_curso', motivo: null };
  return { estado: 'planificada', motivo: null };
}

const ordenCodigos = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

const agruparPor = (filas, campo) => filas.reduce((acc, fila) => {
  (acc[fila[campo]] ||= []).push(fila);
  return acc;
}, {});

/** Todas las evidencias con su árbol, tareas, archivos y estado. */
async function obtenerCobertura() {
  const [[evidencias], [tareas], [archivos]] = await Promise.all([
    db.query(`
      SELECT e.id, e.evidencia, e.nombre_evidencia, e.descripcion, e.indicador_id,
             i.codigo AS indicador, i.nombre AS indicador_nombre,
             c.id AS criterio_id, c.codigo AS criterio, c.nombre AS criterio_nombre,
             d.id AS dimension_id, d.codigo AS dimension, d.nombre AS dimension_nombre
        FROM sgc_evidencias e
        LEFT JOIN sgc_indicadores i ON i.id = e.indicador_id
        LEFT JOIN sgc_criterios   c ON c.id = i.criterio_id
        LEFT JOIN sgc_dimensiones d ON d.id = c.dimension_id`),
    db.query(`
      SELECT ts.evidencia_id,
             t.id, t.title, t.status, t.priority, t.due_date,
             u.name AS assignee_name,
             p.name AS project_name,
             p.id   AS project_id
        FROM task_sgc ts
        JOIN tasks    t ON t.id = ts.task_id
        LEFT JOIN users u ON u.id = t.assignee_id
        JOIN projects p   ON p.id = t.project_id
       ORDER BY ts.evidencia_id, t.created_at DESC`),
    db.query(`
      SELECT ta.id, ta.evidencia_id, ta.filename, ta.filesize, ta.mimetype,
             ta.storage_provider, ta.external_id, ta.created_at,
             ta.task_id, t.title AS task_title, t.project_id, p.name AS project_name,
             u.name AS uploaded_by
        FROM task_attachments ta
        JOIN tasks t    ON t.id = ta.task_id
        JOIN projects p ON p.id = t.project_id
        LEFT JOIN users u ON u.id = ta.user_id
       WHERE ta.category = 'sgc' AND ta.evidencia_id IS NOT NULL
       ORDER BY ta.created_at DESC`),
  ]);

  const tareasPor   = agruparPor(tareas, 'evidencia_id');
  const archivosPor = agruparPor(archivos, 'evidencia_id');
  const hoy = hoyLocal();

  return evidencias
    .sort((a, b) => ordenCodigos(a.evidencia, b.evidencia))
    .map(e => {
      const susTareas = (tareasPor[e.id] || []).map(({ evidencia_id, ...t }) => t);
      const susArchivos = (archivosPor[e.id] || []).map(({ evidencia_id, ...a }) => a);
      return { ...e, tasks: susTareas, archivos: susArchivos, ...estadoEvidencia(susTareas, susArchivos, hoy) };
    });
}

module.exports = { obtenerCobertura, estadoEvidencia, ESTADOS, ZONA, ordenCodigos, hoyLocal };
