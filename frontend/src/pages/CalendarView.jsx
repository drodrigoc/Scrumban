import { useEffect, useState } from 'react';
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
  addMonths, subMonths, isToday, parseISO, isWithinInterval
} from 'date-fns';
import { es } from 'date-fns/locale';

const statusColors = {
  pending: '#6B7280', in_progress: '#3B82F6', in_review: '#F59E0B', completed: '#10B981',
};

function getTaskPosition(task, day) {
  const start = task.start_date ? parseISO(task.start_date) : null;
  const due   = task.due_date   ? parseISO(task.due_date)   : null;
  if (!start || !due || isSameDay(start, due)) return 'single';
  if (isSameDay(day, start)) return 'start';
  if (isSameDay(day, due))   return 'end';
  return 'middle';
}

export default function CalendarView() {
  const { id: projectId } = useParams();
  const [tasks, setTasks] = useState([]);
  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [labels, setLabels] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTask, setSelectedTask] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([tasksAPI.getByProject(projectId), projectsAPI.getById(projectId), projectsAPI.getLabels(projectId)])
      .then(([t, p, l]) => {
        setTasks(t.data); setProject(p.data); setMembers(p.data.members || []); setLabels(l.data);
      }).catch(() => toast.error('Error al cargar calendario'))
      .finally(() => setLoading(false));
  }, [projectId]);

  const monthStart = startOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const getTasksForDay = (day) =>
    tasks.filter(t => {
      const start = t.start_date ? parseISO(t.start_date) : null;
      const due   = t.due_date   ? parseISO(t.due_date)   : null;
      if (start && due) return isWithinInterval(day, { start, end: due });
      return (due && isSameDay(due, day)) || (start && isSameDay(start, day));
    });

  const handleTaskClick = async (task) => {
    try {
      const { data } = await tasksAPI.getById(projectId, task.id);
      setSelectedTask(data); setShowModal(true);
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

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="btn-secondary p-2">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-semibold text-gray-700 dark:text-gray-300 w-36 text-center capitalize">
            {format(currentDate, 'MMMM yyyy', { locale: es })}
          </span>
          <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="btn-secondary p-2">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => setCurrentDate(new Date())} className="btn-secondary text-sm px-3 py-1.5">Hoy</button>
        </div>

        {/* Legend */}
        <div className="flex gap-4 flex-wrap text-xs text-gray-500 dark:text-gray-400">
          {Object.entries({ pending: 'Pendiente', in_progress: 'En proceso', in_review: 'En revisión', completed: 'Completada' }).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors[k] }} /> {v}
            </span>
          ))}
        </div>
      </div>

      {/* Calendar */}
      <div className="card overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-700">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const dayTasks = getTasksForDay(day);
            const isCurrentMonth = isSameMonth(day, currentDate);
            const today = isToday(day);

            return (
              <div key={i} className={`min-h-24 p-1.5 border-r border-b dark:border-gray-700/50 border-gray-100 last:border-r-0 overflow-hidden ${
                !isCurrentMonth ? 'bg-gray-50/50 dark:bg-gray-800/30' : 'bg-white dark:bg-gray-900'
              }`}>
                <div className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mb-1 relative z-10 ${
                  today
                    ? 'bg-primary-600 text-white'
                    : isCurrentMonth
                      ? 'text-gray-700 dark:text-gray-300'
                      : 'text-gray-300 dark:text-gray-600'
                }`}>
                  {format(day, 'd')}
                </div>

                <div className="space-y-0.5">
                  {dayTasks.slice(0, 3).map(task => {
                    const pos = getTaskPosition(task, day);
                    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';
                    const color = isOverdue ? '#EF4444' : statusColors[task.status];

                    const posClass = {
                      single: 'rounded-full px-1.5',
                      start:  'rounded-l-full rounded-r-none px-1.5 -mr-1.5',
                      middle: 'rounded-none px-0 -mx-1.5',
                      end:    'rounded-l-none rounded-r-full px-1.5 -ml-1.5',
                    }[pos];

                    return (
                      <button
                        key={task.id}
                        onClick={() => handleTaskClick(task)}
                        className={`w-full text-left text-xs py-0.5 font-medium transition-opacity hover:opacity-80 block ${posClass}`}
                        style={{
                          backgroundColor: color + (isOverdue ? '40' : '28'),
                          color,
                          minHeight: '1.25rem',
                        }}
                        title={task.title}
                      >
                        {(pos === 'single' || pos === 'start') ? (
                          <span className="truncate block">{task.title}</span>
                        ) : (
                          <span>&nbsp;</span>
                        )}
                      </button>
                    );
                  })}
                  {dayTasks.length > 3 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 pl-1">+{dayTasks.length - 3} más</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showModal && selectedTask && (
        <Modal title="Detalles de Tarea" onClose={() => { setShowModal(false); setSelectedTask(null); }} size="xl">
          <TaskModal
            task={selectedTask} projectId={projectId} members={members} labels={labels}
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
