import { CheckCircle2, Loader, CalendarClock, AlertTriangle, CircleDashed } from 'lucide-react';

// Estado de cada evidencia, calculado en el backend (services/sgcCobertura.js).
// El orden es el de la barra de avance: de lo logrado a lo pendiente.
// Los colores se validaron para daltonismo como segmentos contiguos de la
// barra; aun así, nunca van solos: siempre con su ícono y su nombre.
export const ESTADOS = {
  con_evidencia: {
    label: 'Con evidencia', icono: CheckCircle2,
    descripcion: 'Tiene al menos un archivo subido',
    barra: 'bg-[#0ca30c]', texto: 'text-[#0a7d0a] dark:text-[#3fc43f]',
  },
  en_curso: {
    label: 'En curso', icono: Loader,
    descripcion: 'Sin archivos todavía, con alguna tarea que ya avanzó',
    barra: 'bg-[#2563eb] dark:bg-[#3b82f6]', texto: 'text-[#2563eb] dark:text-[#60a5fa]',
  },
  planificada: {
    label: 'Planificada', icono: CalendarClock,
    descripcion: 'Tiene tareas, pero ninguna ha empezado',
    barra: 'bg-[#93c5fd] dark:bg-[#bfdbfe]', texto: 'text-[#3b82f6] dark:text-[#93c5fd]',
  },
  en_riesgo: {
    label: 'En riesgo', icono: AlertTriangle,
    descripcion: 'Sin archivos, con tareas vencidas o con todas sus tareas terminadas',
    barra: 'bg-[#d03b3b]', texto: 'text-[#d03b3b] dark:text-[#f07070]',
  },
  sin_trabajo: {
    label: 'Sin trabajo', icono: CircleDashed,
    descripcion: 'Ni tareas ni archivos',
    barra: 'bg-[#d1d5db] dark:bg-[#6b7280]', texto: 'text-gray-500 dark:text-gray-400',
  },
};

export const ORDEN_ESTADOS = Object.keys(ESTADOS);

export const ordenCodigos = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

const conteoVacio = () => Object.fromEntries(ORDEN_ESTADOS.map(e => [e, 0]));

/** Cuántas evidencias hay en cada estado. */
export function contar(evidencias) {
  const c = { total: evidencias.length, ...conteoVacio() };
  evidencias.forEach(e => { c[e.estado]++; });
  return c;
}

// Campos de cada nivel en las filas de /sgc/with-tasks
export const NIVELES_RESUMEN = {
  dimension: { titulo: 'Dimensión', plural: 'dimensiones', codigo: 'dimension', nombre: 'dimension_nombre', hijo: 'criterio' },
  criterio:  { titulo: 'Criterio',  plural: 'criterios',   codigo: 'criterio',  nombre: 'criterio_nombre',  hijo: 'indicador' },
  indicador: { titulo: 'Indicador', plural: 'indicadores', codigo: 'indicador', nombre: 'indicador_nombre', hijo: null },
};

/** Agrupa las evidencias por dimensión, criterio o indicador, con sus conteos. */
export function resumirPor(evidencias, nivel) {
  const { codigo, nombre } = NIVELES_RESUMEN[nivel];
  const grupos = new Map();
  for (const e of evidencias) {
    const clave = e[codigo] || '—';
    if (!grupos.has(clave)) grupos.set(clave, { codigo: clave, nombre: e[nombre] || 'Sin clasificar', evidencias: [] });
    grupos.get(clave).evidencias.push(e);
  }
  return [...grupos.values()]
    .sort((a, b) => ordenCodigos(a.codigo, b.codigo))
    .map(g => ({ codigo: g.codigo, nombre: g.nombre, ...contar(g.evidencias) }));
}

export const porcentaje = (parte, total) => (total ? Math.round((parte / total) * 100) : 0);
