import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { myTasksAPI, tasksAPI, projectsAPI } from '../services/api';
import { CheckSquare, Circle, Clock, AlertTriangle, Filter, ExternalLink, CalendarDays, ChevronDown, ChevronRight } from 'lucide-react';
import Modal from '../components/common/Modal';
import TaskModal from '../components/tasks/TaskModal';

const STATUS_CONFIG = {
  pending:     { label: 'Pendiente',   color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  in_progress: { label: 'En Proceso',  color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  in_review:   { label: 'En Revisión', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  completed:   { label: 'Completado',  color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
};

const PRIORITY_CONFIG = {
  critical: { label: 'Crítica',  color: 'text-red-600 dark:text-red-400',    icon: AlertTriangle },
  high:     { label: 'Alta',     color: 'text-orange-500 dark:text-orange-400', icon: AlertTriangle },
  medium:   { label: 'Media',    color: 'text-amber-500 dark:text-amber-400',  icon: Clock },
  low:      { label: 'Baja',     color: 'text-gray-400 dark:text-gray-500',   icon: Circle },
};

const GROUP_BY_STATUS = ['pending', 'in_progress', 'in_review', 'completed'];

function isOverdue(due_date, status) {
  if (!due_date || status === 'completed') return false;
  return new Date(due_date) < new Date();
}

function formatDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function MyTasks() {
  const [tasks, setTasks]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filterStatus, setFStatus]  = useState('');
  const [filterPriority, setFPrio]  = useState('');
  const [filterProject, setFProj]   = useState('');
  const [collapsed, setCollapsed]   = useState({});
  const [selectedTask, setSelected]   = useState(null);
  const [taskDetail, setDetail]       = useState(null);
  const [taskMembers, setTaskMembers] = useState([]);
  const [taskLabels, setTaskLabels]   = useState([]);
  const [loadingDetail, setLDetail]   = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await myTasksAPI.getAll();
      setTasks(data);
    } catch { toast.error('Error al cargar tareas'); }
    finally { setLoading(false); }
  };

  // Lista única de proyectos para el filtro
  const projectOptions = useMemo(() => {
    const map = {};
    tasks.forEach(t => { map[t.project_id] = t.project_name; });
    return Object.entries(map).map(([id, name]) => ({ id, name }));
  }, [tasks]);

  const filtered = useMemo(() => tasks.filter(t => {
    if (filterStatus  && t.status   !== filterStatus)           return false;
    if (filterPriority && t.priority !== filterPriority)        return false;
    if (filterProject  && String(t.project_id) !== filterProject) return false;
    return true;
  }), [tasks, filterStatus, filterPriority, filterProject]);

  const grouped = useMemo(() => {
    const map = {};
    GROUP_BY_STATUS.forEach(s => { map[s] = []; });
    filtered.forEach(t => {
      if (map[t.status]) map[t.status].push(t);
      else map[t.status] = [t];
    });
    return map;
  }, [filtered]);

  const toggleGroup = (s) => setCollapsed(c => ({ ...c, [s]: !c[s] }));

  const openTask = async (task) => {
    setSelected(task);
    setDetail(null);
    setTaskMembers([]);
    setTaskLabels([]);
    setLDetail(true);
    try {
      const [{ data: detail }, { data: project }, { data: labels }] = await Promise.all([
        tasksAPI.getById(task.project_id, task.id),
        projectsAPI.getById(task.project_id),
        projectsAPI.getLabels(task.project_id),
      ]);
      setDetail(detail);
      setTaskMembers(project.members || []);
      setTaskLabels(labels || []);
    } catch { toast.error('Error al cargar tarea'); }
    finally { setLDetail(false); }
  };

  const closeModal = () => { setSelected(null); setDetail(null); };

  const handleTaskSaved = async (data) => {
    closeModal();
    await load();
  };

  const handleTaskDeleted = () => {
    closeModal();
    load();
  };

  const totalPending    = tasks.filter(t => t.status === 'pending').length;
  const totalInProgress = tasks.filter(t => t.status === 'in_progress').length;
  const totalOverdue    = tasks.filter(t => isOverdue(t.due_date, t.status)).length;
  const totalDone       = tasks.filter(t => t.status === 'completed').length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <CheckSquare className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          Mis Tareas
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Todas las actividades asignadas a ti en todos los proyectos
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Pendientes',   value: totalPending,    color: 'text-gray-700 dark:text-gray-300' },
          { label: 'En Proceso',   value: totalInProgress, color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Vencidas',     value: totalOverdue,    color: 'text-red-600 dark:text-red-400' },
          { label: 'Completadas',  value: totalDone,       color: 'text-green-600 dark:text-green-400' },
        ].map(s => (
          <div key={s.label} className="card p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <Filter className="w-4 h-4 text-gray-400 self-center" />

        <div className="flex flex-col gap-1 min-w-[140px]">
          <label className="text-xs text-gray-500 dark:text-gray-400">Estado</label>
          <select className="input py-1.5 text-sm" value={filterStatus} onChange={e => setFStatus(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(STATUS_CONFIG).map(([v, c]) => (
              <option key={v} value={v}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 min-w-[130px]">
          <label className="text-xs text-gray-500 dark:text-gray-400">Prioridad</label>
          <select className="input py-1.5 text-sm" value={filterPriority} onChange={e => setFPrio(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(PRIORITY_CONFIG).map(([v, c]) => (
              <option key={v} value={v}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 min-w-[160px]">
          <label className="text-xs text-gray-500 dark:text-gray-400">Proyecto</label>
          <select className="input py-1.5 text-sm" value={filterProject} onChange={e => setFProj(e.target.value)}>
            <option value="">Todos</option>
            {projectOptions.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {(filterStatus || filterPriority || filterProject) && (
          <button
            className="btn-secondary text-xs py-1.5 px-3 self-end"
            onClick={() => { setFStatus(''); setFPrio(''); setFProj(''); }}
          >
            Limpiar
          </button>
        )}

        <span className="ml-auto self-end text-sm text-gray-400 dark:text-gray-500">
          {filtered.length} tarea{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Task groups */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <CheckSquare className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">No tienes tareas asignadas</p>
        </div>
      ) : (
        <div className="space-y-4">
          {GROUP_BY_STATUS.map(status => {
            const group = grouped[status] || [];
            if (group.length === 0) return null;
            const sc = STATUS_CONFIG[status] || { label: status, color: '' };
            const open = !collapsed[status];
            return (
              <div key={status} className="card overflow-hidden">
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(status)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    <span className={`badge text-xs ${sc.color}`}>{sc.label}</span>
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{group.length} tarea{group.length !== 1 ? 's' : ''}</span>
                  </div>
                </button>

                {/* Rows */}
                {open && (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {group.map(task => {
                      const pc = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
                      const PIcon = pc.icon;
                      const overdue = isOverdue(task.due_date, task.status);
                      return (
                        <div
                          key={task.id}
                          onClick={() => openTask(task)}
                          className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer group transition-colors"
                        >
                          {/* Priority icon */}
                          <PIcon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${pc.color}`} />

                          {/* Main info */}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${task.status === 'completed' ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
                              {task.title}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {/* Project badge */}
                              <span
                                className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"
                              >
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: task.project_color }} />
                                {task.project_name}
                              </span>
                              {/* Due date */}
                              {task.due_date && (
                                <span className={`inline-flex items-center gap-1 text-xs ${overdue ? 'text-red-500 dark:text-red-400 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
                                  <CalendarDays className="w-3 h-3" />
                                  {overdue ? 'Vencida · ' : ''}{formatDate(task.due_date)}
                                </span>
                              )}
                              {/* Progress */}
                              {task.progress > 0 && (
                                <span className="text-xs text-gray-400 dark:text-gray-500">{task.progress}%</span>
                              )}
                            </div>
                          </div>

                          {/* Go to project link */}
                          <Link
                            to={`/projects/${task.project_id}`}
                            onClick={e => e.stopPropagation()}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-opacity"
                            title="Ver proyecto"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Task detail modal */}
      {selectedTask && (
        <Modal
          title={loadingDetail ? 'Cargando...' : (taskDetail?.title || selectedTask.title)}
          onClose={closeModal}
          size="xl"
        >
          {loadingDetail ? (
            <div className="flex justify-center py-12">
              <div className="w-7 h-7 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : taskDetail ? (
            <TaskModal
              task={taskDetail}
              projectId={selectedTask.project_id}
              members={taskMembers}
              labels={taskLabels}
              onSave={handleTaskSaved}
              onDelete={handleTaskDeleted}
              onCancel={closeModal}
            />
          ) : null}
        </Modal>
      )}
    </div>
  );
}
