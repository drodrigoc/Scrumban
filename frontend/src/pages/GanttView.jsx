import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { tasksAPI, projectsAPI } from '../services/api';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import ViewNavBar from '../components/common/ViewNavBar';
import {
  addWeeks, subWeeks, startOfWeek, eachDayOfInterval, format,
  differenceInDays, parseISO, addDays, isBefore, isAfter
} from 'date-fns';
import { es } from 'date-fns/locale';

const priorityColors = {
  low: '#6B7280', medium: '#3B82F6', high: '#F59E0B', critical: '#EF4444',
};
const statusBgLight = {
  pending: '#E5E7EB', in_progress: '#BFDBFE', in_review: '#FDE68A', completed: '#BBF7D0',
};
const statusBgDark = {
  pending: '#374151', in_progress: '#1E3A5F', in_review: '#4D3800', completed: '#14532D',
};

export default function GanttView() {
  const { id: projectId } = useParams();
  const [tasks, setTasks] = useState([]);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewStart, setViewStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [weeksCount, setWeeksCount] = useState(8);
  const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'));

  // Sync with dark mode changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    Promise.all([tasksAPI.getByProject(projectId), projectsAPI.getById(projectId)])
      .then(([t, p]) => {
        const sorted = t.data
          .filter(task => task.start_date || task.due_date)
          .sort((a, b) => new Date(a.start_date || a.due_date) - new Date(b.start_date || b.due_date));
        setTasks(sorted);
        setProject(p.data);
      }).catch(() => toast.error('Error al cargar cronograma'))
      .finally(() => setLoading(false));
  }, [projectId]);

  const viewEnd = addWeeks(viewStart, weeksCount);
  const totalDays = differenceInDays(viewEnd, viewStart);

  const weeks = useMemo(() => {
    return Array.from({ length: weeksCount }, (_, i) => {
      const start = addWeeks(viewStart, i);
      return { start, label: format(start, 'd MMM', { locale: es }) };
    });
  }, [viewStart, weeksCount]);

  const getBarStyle = (task) => {
    const start = task.start_date ? parseISO(task.start_date) : (task.due_date ? parseISO(task.due_date) : null);
    const end = task.due_date ? parseISO(task.due_date) : start;
    if (!start || !end) return null;

    const clampedStart = isBefore(start, viewStart) ? viewStart : start;
    const clampedEnd = isAfter(end, viewEnd) ? viewEnd : end;
    if (isBefore(clampedEnd, viewStart) || isAfter(clampedStart, viewEnd)) return null;

    const offsetDays = Math.max(0, differenceInDays(clampedStart, viewStart));
    const durationDays = Math.max(1, differenceInDays(clampedEnd, clampedStart) + 1);

    const left = (offsetDays / totalDays) * 100;
    const width = (durationDays / totalDays) * 100;

    const isOverdue = isBefore(end, new Date()) && task.status !== 'completed';
    const statusBg = isDark ? statusBgDark : statusBgLight;
    const bg = isOverdue ? (isDark ? '#4C1A1A' : '#FCA5A5') : statusBg[task.status] || statusBg.pending;
    const border = isOverdue ? '#EF4444' : priorityColors[task.priority];

    return { left: `${left}%`, width: `${Math.max(width, 1)}%`, bg, border };
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const today = new Date();
  const todayOffset = differenceInDays(today, viewStart);
  const todayPercent = (todayOffset / totalDays) * 100;

  return (
    <div className="space-y-5 animate-fade-in">
      <ViewNavBar projectName={project?.name} projectColor={project?.color} />

      <div className="flex items-center justify-end flex-wrap gap-2">
        <button onClick={() => setViewStart(subWeeks(viewStart, 2))} className="btn-secondary p-2">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={() => setViewStart(startOfWeek(new Date(), { weekStartsOn: 1 }))} className="btn-secondary text-sm px-3 py-1.5">Hoy</button>
        <button onClick={() => setViewStart(addWeeks(viewStart, 2))} className="btn-secondary p-2">
          <ChevronRight className="w-4 h-4" />
        </button>
        <select value={weeksCount} onChange={e => setWeeksCount(parseInt(e.target.value))} className="input py-1.5 w-auto text-sm">
          <option value={4}>4 semanas</option>
          <option value={8}>8 semanas</option>
          <option value={12}>12 semanas</option>
        </select>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
        {Object.entries({ pending: 'Pendiente', in_progress: 'En proceso', in_review: 'En revisión', completed: 'Completada' }).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1">
            <div className="w-4 h-3 rounded-sm border dark:border-gray-600"
              style={{ backgroundColor: (isDark ? statusBgDark : statusBgLight)[k] }} /> {v}
          </span>
        ))}
        <span className="flex items-center gap-1 text-red-500"><AlertTriangle className="w-3 h-3" /> Vencida</span>
      </div>

      {tasks.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-gray-400 dark:text-gray-500">No hay tareas con fechas para mostrar en el cronograma.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <div style={{ minWidth: '900px' }}>
              {/* Header */}
              <div className="flex border-b border-gray-200 dark:border-gray-700">
                <div className="w-56 flex-shrink-0 px-3 py-2 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tarea</span>
                </div>
                <div className="flex-1 bg-gray-50 dark:bg-gray-800">
                  <div className="flex">
                    {weeks.map((week, i) => (
                      <div key={i} className="border-r border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-500 dark:text-gray-400 py-2 px-2"
                        style={{ width: `${(7 / totalDays) * 100}%`, minWidth: '60px' }}>
                        {week.label}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="w-12 flex-shrink-0 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 py-2">%</div>
              </div>

              {/* Tasks */}
              <div className="relative">
                {/* Today line */}
                {todayPercent >= 0 && todayPercent <= 100 && (
                  <div className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10 pointer-events-none"
                    style={{ left: `calc(224px + ${todayPercent}% * (100% - 224px) / 100)` }}>
                    <div className="w-2 h-2 bg-red-400 rounded-full -ml-0.5 -mt-1" />
                  </div>
                )}

                {tasks.map((task, i) => {
                  const bar = getBarStyle(task);
                  const isOverdue = task.due_date && isBefore(parseISO(task.due_date), new Date()) && task.status !== 'completed';

                  return (
                    <div key={task.id} className={`flex items-center border-b border-gray-50 dark:border-gray-800 ${
                      i % 2 === 0 ? '' : 'bg-gray-50/30 dark:bg-gray-800/20'
                    } hover:bg-gray-50/50 dark:hover:bg-gray-800/40`}>
                      <div className="w-56 flex-shrink-0 px-3 py-2.5 border-r border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: priorityColors[task.priority] }} />
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate" title={task.title}>{task.title}</span>
                          {isOverdue && <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />}
                        </div>
                        {task.assignee_name && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5 pl-3.5">{task.assignee_name}</p>
                        )}
                      </div>

                      <div className="flex-1 relative h-10 px-1">
                        {/* Grid lines */}
                        <div className="absolute inset-0 flex pointer-events-none">
                          {weeks.map((_, i) => (
                            <div key={i} className="border-r border-gray-100 dark:border-gray-700/50 flex-1" />
                          ))}
                        </div>
                        {/* Bar */}
                        {bar && (
                          <div className="absolute top-1/2 -translate-y-1/2 h-6 rounded-md flex items-center px-2 text-xs font-medium overflow-hidden cursor-pointer hover:opacity-80 transition-opacity border"
                            style={{ left: bar.left, width: bar.width, backgroundColor: bar.bg, borderColor: bar.border, color: isDark ? '#E5E7EB' : '#374151' }}
                            title={task.title}>
                            <span className="truncate">{task.title}</span>
                          </div>
                        )}
                      </div>

                      <div className="w-12 flex-shrink-0 text-center text-xs text-gray-500 dark:text-gray-400 pr-2">
                        {task.progress || 0}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
