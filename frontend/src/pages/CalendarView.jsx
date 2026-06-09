import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { tasksAPI, projectsAPI } from '../services/api';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import TaskModal from '../components/tasks/TaskModal';
import Modal from '../components/common/Modal';
import ViewNavBar from '../components/common/ViewNavBar';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameDay, isSameMonth,
  addMonths, subMonths, isToday, differenceInDays,
} from 'date-fns';
import { es } from 'date-fns/locale';

// Paleta de colores para columnas (por índice)
const COL_PALETTE = [
  '#6B7280','#3B82F6','#F59E0B','#10B981',
  '#8B5CF6','#EC4899','#14B8A6','#F97316','#06B6D4','#84CC16',
];

const DEFAULT_COLUMNS = [
  { id: 'pending',     label: 'Pendiente'   },
  { id: 'in_progress', label: 'En proceso'  },
  { id: 'in_review',   label: 'En revisión' },
  { id: 'completed',   label: 'Completada'  },
];

// Construye mapa { statusId → color } a partir de las columnas del proyecto
function buildColorMap(columns) {
  return Object.fromEntries(
    columns.map((col, i) => [col.id, COL_PALETTE[i % COL_PALETTE.length]])
  );
}

// Convierte fecha de BD a Date local sin desfase de zona horaria.
// parseISO interpreta YYYY-MM-DD como UTC medianoche, lo que en zonas UTC-N
// retrocede un día. Construimos la fecha directamente en hora local.
const parseDate = (str) => {
  if (!str) return null;
  const [y, m, d] = str.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d); // medianoche local, sin UTC
};

// Calcula tareas de una semana con posición en la cuadrícula y slot (fila)
function computeWeekTasks(week, tasks, colorMap) {
  const wStart = week[0];
  const wEnd   = week[6];

  const relevant = tasks
    .filter(t => {
      const s = parseDate(t.start_date);
      const e = parseDate(t.due_date);
      const tStart = s ?? e;
      const tEnd   = e ?? s;
      if (!tStart) return false;
      return tStart <= wEnd && tEnd >= wStart;
    })
    .map(t => {
      const s = parseDate(t.start_date);
      const e = parseDate(t.due_date);
      const tStart = s ?? e;
      const tEnd   = e ?? s;
      const col1 = Math.max(0, differenceInDays(tStart, wStart));
      const col2 = Math.min(6, differenceInDays(tEnd,   wStart));
      const isOverdue = t.due_date && parseDate(t.due_date) < new Date() && t.status !== 'completed';
      return {
        ...t,
        colStart:  col1 + 1,
        colSpan:   col2 - col1 + 1,
        isStart:   tStart >= wStart,
        isEnd:     tEnd   <= wEnd,
        isOverdue,
        color: isOverdue ? '#EF4444' : (colorMap[t.status] ?? '#6B7280'),
      };
    });

  // Asignar slot (fila) sin solapamiento visual
  const slots = [];
  return relevant.map(task => {
    const tColEnd = task.colStart + task.colSpan - 1;
    let slot = 0;
    while (true) {
      if (!slots[slot]) {
        slots[slot] = [{ s: task.colStart, e: tColEnd }];
        return { ...task, slot };
      }
      const conflict = slots[slot].some(r => task.colStart <= r.e && tColEnd >= r.s);
      if (!conflict) {
        slots[slot].push({ s: task.colStart, e: tColEnd });
        return { ...task, slot };
      }
      slot++;
    }
  });
}

const TASK_H   = 22; // altura px de cada barra de tarea
const TASK_GAP = 2;  // gap entre barras
const DAY_H    = 36; // altura px de la cabecera con el número del día

export default function CalendarView() {
  const { id: projectId } = useParams();
  const [tasks,       setTasks]       = useState([]);
  const [project,     setProject]     = useState(null);
  const [members,     setMembers]     = useState([]);
  const [labels,      setLabels]      = useState([]);
  const [columns,     setColumns]     = useState(DEFAULT_COLUMNS);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTask, setSelectedTask] = useState(null);
  const [showModal,   setShowModal]   = useState(false);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    // Cargar columnas del proyecto desde localStorage
    const saved = localStorage.getItem(`kanban_columns_${projectId}`);
    if (saved) {
      try { setColumns(JSON.parse(saved)); } catch { /* usa DEFAULT_COLUMNS */ }
    }

    Promise.all([
      tasksAPI.getByProject(projectId),
      projectsAPI.getById(projectId),
      projectsAPI.getLabels(projectId),
    ]).then(([t, p, l]) => {
      setTasks(t.data);
      setProject(p.data);
      setMembers(p.data.members || []);
      setLabels(l.data);
    }).catch(() => toast.error('Error al cargar calendario'))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Días del mes visible (completos por semana, lunes→domingo)
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const calStart   = startOfWeek(monthStart,            { weekStartsOn: 1 });
    const calEnd     = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentDate]);

  // Agrupar días en semanas
  const weeks = useMemo(() => {
    const result = [];
    for (let i = 0; i < days.length; i += 7) result.push(days.slice(i, i + 7));
    return result;
  }, [days]);

  // Mapa de color por estado derivado de las columnas del proyecto
  const colorMap = useMemo(() => buildColorMap(columns), [columns]);

  // Tareas por semana pre-calculadas
  const weekTasksMap = useMemo(() =>
    weeks.map(w => computeWeekTasks(w, tasks, colorMap)),
  [weeks, tasks, colorMap]);

  const handleTaskClick = async (task) => {
    try {
      const { data } = await tasksAPI.getById(projectId, task.id);
      setSelectedTask(data);
      setShowModal(true);
    } catch { toast.error('Error al cargar tarea'); }
  };

  const handleTaskSave = async (data) => {
    try {
      const { data: updated } = await tasksAPI.update(projectId, selectedTask.id, data);
      setTasks(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
      setShowModal(false);
      toast.success('Tarea actualizada');
    } catch { toast.error('Error al actualizar'); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      <ViewNavBar projectName={project?.name} projectColor={project?.color} />

      {/* Controles de navegación */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="btn-secondary p-2">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-semibold text-gray-700 dark:text-gray-300 w-40 text-center capitalize">
            {format(currentDate, 'MMMM yyyy', { locale: es })}
          </span>
          <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="btn-secondary p-2">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => setCurrentDate(new Date())} className="btn-secondary text-sm px-3 py-1.5">
            Hoy
          </button>
        </div>

        {/* Leyenda de estados dinámica */}
        <div className="flex gap-4 flex-wrap text-xs text-gray-500 dark:text-gray-400">
          {columns.map((col, i) => (
            <span key={col.id} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COL_PALETTE[i % COL_PALETTE.length] }} />
              {col.label}
            </span>
          ))}
          <span className="flex items-center gap-1 text-red-500">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            Vencida
          </span>
        </div>
      </div>

      {/* Grilla del calendario */}
      <div className="card overflow-hidden">
        {/* Cabecera días de la semana */}
        <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
          {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>

        {/* Semanas */}
        {weeks.map((week, wi) => {
          const weekTasks = weekTasksMap[wi];
          const maxSlot   = weekTasks.length > 0
            ? Math.max(...weekTasks.map(t => t.slot)) + 1
            : 0;
          const tasksAreaH = maxSlot * (TASK_H + TASK_GAP) + 6;

          return (
            <div key={wi} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">

              {/* Fila de números de día */}
              <div className="grid grid-cols-7">
                {week.map((day, di) => {
                  const inMonth = isSameMonth(day, currentDate);
                  const today   = isToday(day);
                  return (
                    <div
                      key={di}
                      className={`border-r border-gray-100 dark:border-gray-800 last:border-r-0 px-2 pt-1.5 pb-0.5 ${
                        !inMonth ? 'bg-gray-50/60 dark:bg-gray-800/30' : ''
                      }`}
                      style={{ height: DAY_H }}
                    >
                      <span className={`text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full ${
                        today
                          ? 'bg-primary-600 text-white'
                          : inMonth
                            ? 'text-gray-700 dark:text-gray-300'
                            : 'text-gray-300 dark:text-gray-600'
                      }`}>
                        {format(day, 'd')}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Barras de tareas */}
              <div
                className="relative grid grid-cols-7"
                style={{ height: tasksAreaH || 8 }}
              >
                {/* Líneas verticales de separación de días */}
                {[1,2,3,4,5,6].map(n => (
                  <div
                    key={n}
                    className="absolute top-0 bottom-0 border-r border-gray-100 dark:border-gray-800 pointer-events-none"
                    style={{ left: `${(n / 7) * 100}%` }}
                  />
                ))}

                {/* Fondo de días fuera del mes */}
                {week.map((day, di) => !isSameMonth(day, currentDate) && (
                  <div
                    key={di}
                    className="absolute top-0 bottom-0 bg-gray-50/60 dark:bg-gray-800/30 pointer-events-none"
                    style={{ left: `${(di / 7) * 100}%`, width: `${(1 / 7) * 100}%` }}
                  />
                ))}

                {/* Barras de tarea */}
                {weekTasks.map(task => {
                  const top   = task.slot * (TASK_H + TASK_GAP) + 3;
                  const left  = `${((task.colStart - 1) / 7) * 100}%`;
                  const width = `${(task.colSpan  / 7) * 100}%`;
                  const color = task.color; // ya calculado en computeWeekTasks (rojo si vencida)

                  // Redondeo según posición en la semana
                  const rLeft  = task.isStart ? '6px' : '0px';
                  const rRight = task.isEnd   ? '6px' : '0px';

                  return (
                    <button
                      key={`${task.id}-${wi}`}
                      onClick={() => handleTaskClick(task)}
                      title={task.title}
                      className="absolute flex items-center hover:opacity-80 transition-opacity overflow-hidden"
                      style={{
                        top,
                        left,
                        width,
                        height: TASK_H,
                        backgroundColor: color + '30',
                        borderTop:    `2px solid ${color}`,
                        borderBottom: `2px solid ${color}`,
                        borderLeft:   task.isStart ? `2px solid ${color}` : 'none',
                        borderRight:  task.isEnd   ? `2px solid ${color}` : 'none',
                        borderRadius: `${rLeft} ${rRight} ${rRight} ${rLeft}`,
                        paddingLeft:  task.isStart ? 6 : 0,
                        paddingRight: task.isEnd   ? 6 : 0,
                        zIndex: 10,
                      }}
                    >
                      {/* Mostrar título solo en el primer segmento visible */}
                      {task.isStart && (
                        <span
                          className="truncate text-xs font-semibold whitespace-nowrap"
                          style={{ color }}
                        >
                          {task.title}
                        </span>
                      )}
                      {/* Si el inicio está fuera de la semana, mostrar título igualmente */}
                      {!task.isStart && (
                        <span
                          className="truncate text-xs font-semibold whitespace-nowrap pl-1"
                          style={{ color }}
                        >
                          {task.title}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

            </div>
          );
        })}
      </div>

      {/* Modal de tarea */}
      {showModal && selectedTask && (
        <Modal
          title="Detalles de Tarea"
          onClose={() => { setShowModal(false); setSelectedTask(null); }}
          size="xl"
        >
          <TaskModal
            task={selectedTask}
            projectId={projectId}
            members={members}
            labels={labels}
            onSave={handleTaskSave}
            onCancel={() => { setShowModal(false); setSelectedTask(null); }}
            onCommentAdded={(_, comment) => {
              setSelectedTask(prev => prev ? { ...prev, comments: [...(prev.comments || []), comment] } : prev);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
