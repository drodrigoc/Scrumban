import { useMemo } from 'react';
import {
  parseISO, differenceInDays, isBefore, isAfter,
  startOfMonth, endOfMonth, eachMonthOfInterval, addMonths, format,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { Pencil, Trash2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const hexWithAlpha = (hex, alpha) =>
  hex + Math.round(alpha * 255).toString(16).padStart(2, '0');

// El backend manda las fechas como DATE en UTC ("2026-07-01T00:00:00.000Z").
// Nos quedamos solo con la parte de calendario para que en zonas horarias
// negativas no se corran un día hacia atrás.
const parseFecha = (valor) => {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  return parseISO(String(valor).split('T')[0]);
};

const fmtCorto = (d) => (d ? format(parseFecha(d), 'd MMM', { locale: es }) : '—');
const fmtLargo = (d) => (d ? format(parseFecha(d), "d 'de' MMMM yyyy", { locale: es }) : 'sin fecha');

/**
 * Ventana de tiempo que se dibuja cuando el componente calcula su propia
 * escala: `monthsCount` meses corridos a partir del mes de inicio del
 * proyecto. Se exporta para que quien la muestre (la ficha del proyecto)
 * anuncie exactamente el mismo periodo que se está dibujando.
 */
export function calcularVentana(phases = [], anchorDate = null, monthsCount = 12) {
  const fechas = phases
    .flatMap(p => [p.start_date || null, p.end_date || null])
    .filter(Boolean)
    .map(parseFecha);

  const ancla = parseFecha(anchorDate)
    ?? (fechas.length ? new Date(Math.min(...fechas)) : new Date());

  const start = startOfMonth(ancla);
  const end   = endOfMonth(addMonths(start, monthsCount - 1));

  return {
    start,
    end,
    etiqueta: `${format(start, 'MMM yyyy', { locale: es })} → ${format(end, 'MMM yyyy', { locale: es })}`,
  };
}

/**
 * Barra de tiempo de las fases de un proyecto.
 *
 * Se usa en dos lugares con la misma pinta:
 *  - Cronograma: el padre manda su escala (rangeStart/rangeEnd/gridCount)
 *    para que las barras queden alineadas con las semanas de las tareas.
 *  - Ficha del proyecto: sin escala, dibuja 12 meses corridos a partir del
 *    mes en que arranca el proyecto (anchorDate).
 */
export default function PhasesTimeline({
  phases,
  rangeStart  = null,
  rangeEnd    = null,
  gridCount   = null,
  anchorDate  = null,
  monthsCount = 12,
  showHeader  = false,
  showDates   = false,
  canEdit     = false,
  onEdit,
  onDelete,
}) {
  const { dark: isDark } = useTheme();

  const { start, end, ticks } = useMemo(() => {
    // Escala impuesta por el padre (vista Cronograma)
    if (rangeStart && rangeEnd) return { start: rangeStart, end: rangeEnd, ticks: [] };

    // La ventana arranca en el mes de inicio del proyecto. Sin esa fecha,
    // en el mes de la fase más temprana; y sin fases, en el mes actual.
    const { start: desde, end: hasta } = calcularVentana(phases, anchorDate, monthsCount);

    return {
      start: desde,
      end:   hasta,
      // El año solo se escribe en el primer mes y cada vez que cambia
      ticks: eachMonthOfInterval({ start: desde, end: hasta }).map((m, i) =>
        (i === 0 || m.getMonth() === 0)
          ? format(m, 'MMM yy', { locale: es })
          : format(m, 'MMM',    { locale: es })
      ),
    };
  }, [phases, rangeStart, rangeEnd, anchorDate, monthsCount]);

  const totalDays = start && end ? Math.max(1, differenceInDays(end, start)) : 0;
  const columnas  = Math.max(gridCount ?? ticks.length, 1);

  // Posición y ancho de una barra dentro de la escala visible
  const getRange = (startRaw, endRaw) => {
    if (!start || !end) return null;

    const s = parseFecha(startRaw) ?? parseFecha(endRaw);
    const e = parseFecha(endRaw)   ?? s;
    if (!s || !e) return null;

    const desde = isBefore(s, start) ? start : s;
    const hasta = isAfter(e, end)    ? end   : e;
    if (isBefore(hasta, start) || isAfter(desde, end)) return null;

    const offsetDays = Math.max(0, differenceInDays(desde, start));
    const duracion   = Math.max(1, differenceInDays(hasta, desde) + 1);

    return {
      left:  `${(offsetDays / totalDays) * 100}%`,
      width: `${Math.max((duracion / totalDays) * 100, 1)}%`,
    };
  };

  return (
    <div>
      {/* Cabecera de meses — solo cuando el componente manda su propia escala */}
      {showHeader && ticks.length > 0 && (
        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="w-56 flex-shrink-0 px-3 py-2 border-r border-gray-200 dark:border-gray-700">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Fase
            </span>
          </div>
          <div className="flex-1 flex">
            {ticks.map((label, i) => (
              <div
                key={i}
                className="flex-1 border-r border-gray-200 dark:border-gray-700 px-2 py-2
                           text-xs font-medium text-gray-500 dark:text-gray-400 capitalize"
                style={{ minWidth: '60px' }}
              >
                {label}
              </div>
            ))}
          </div>
          <div className="w-12 flex-shrink-0 text-center py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
            %
          </div>
        </div>
      )}

      {phases.map((phase, i) => {
        const color = phase.color || '#6366F1';
        const bar   = getRange(phase.start_date, phase.end_date);
        const sinFechas = !phase.start_date && !phase.end_date;

        return (
          <div
            key={phase.id}
            className="flex items-center border-b border-gray-100 dark:border-gray-800
                       hover:bg-gray-50/60 dark:hover:bg-gray-800/40 group/fase"
          >
            {/* Etiqueta */}
            <div className="w-56 flex-shrink-0 px-3 py-2.5 border-r border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono text-gray-400 dark:text-gray-500 flex-shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                <span
                  className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate"
                  title={phase.description || phase.name}
                >
                  {phase.name}
                </span>

                {canEdit && (
                  <div className="ml-auto flex items-center gap-0.5 flex-shrink-0
                                  opacity-0 group-hover/fase:opacity-100 transition-opacity">
                    <button
                      onClick={() => onEdit?.(phase)}
                      title="Editar fase"
                      className="p-0.5 text-gray-400 hover:text-primary-500 dark:hover:text-primary-400"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDelete?.(phase)}
                      title="Eliminar fase"
                      className="p-0.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 pl-8 truncate">
                {[
                  showDates && !sinFechas
                    ? `${fmtCorto(phase.start_date)} → ${fmtCorto(phase.end_date)}`
                    : null,
                  phase.total_tasks > 0
                    ? `${phase.completed_tasks}/${phase.total_tasks} tareas`
                    : 'sin tareas',
                ].filter(Boolean).join(' · ')}
              </p>
            </div>

            {/* Línea de tiempo */}
            <div className="flex-1 relative h-11 px-1">
              <div className="absolute inset-0 flex pointer-events-none">
                {Array.from({ length: columnas }, (_, c) => (
                  <div key={c} className="border-r border-gray-100 dark:border-gray-700/50 flex-1" />
                ))}
              </div>

              {bar ? (
                <div
                  className="absolute top-1/2 -translate-y-1/2 h-7 rounded-md overflow-hidden border-2 flex items-center"
                  style={{
                    left: bar.left,
                    width: bar.width,
                    backgroundColor: hexWithAlpha(color, isDark ? 0.22 : 0.15),
                    borderColor: color,
                  }}
                  title={`${phase.name} — ${fmtLargo(phase.start_date)} a ${fmtLargo(phase.end_date)} · ${phase.progress || 0}% de avance`}
                >
                  {/* Relleno de avance dentro de la barra */}
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{
                      width: `${phase.progress || 0}%`,
                      backgroundColor: hexWithAlpha(color, isDark ? 0.45 : 0.35),
                    }}
                  />
                  <span
                    className="relative truncate px-2 text-xs font-semibold"
                    style={{ color: isDark ? '#E5E7EB' : '#374151' }}
                  >
                    {phase.name}
                  </span>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center pl-2">
                  <span className="text-xs text-gray-400 dark:text-gray-600">
                    {sinFechas ? 'Sin fechas definidas' : 'Fuera del periodo visible'}
                  </span>
                </div>
              )}
            </div>

            {/* Avance */}
            <div className="w-12 flex-shrink-0 text-center text-xs font-semibold text-gray-600 dark:text-gray-300 pr-2 tabular-nums">
              {phase.progress || 0}%
            </div>
          </div>
        );
      })}
    </div>
  );
}
