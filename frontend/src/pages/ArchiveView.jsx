import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { tasksAPI, projectsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Archive, ArchiveRestore, Search, ChevronDown, ChevronRight, Calendar, User,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import ViewNavBar from '../components/common/ViewNavBar';

const priorityDot = {
  low: 'bg-gray-400', medium: 'bg-blue-500', high: 'bg-amber-500', critical: 'bg-red-500',
};
const priorityLabel = {
  low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica',
};

// Fecha por la que se agrupa: cierre real de la tarea, o archivado si no hay
const closingDate = (task) => task.completed_at || task.archived_at;

export default function ArchiveView() {
  const { id: projectId } = useParams();
  const { user } = useAuth();

  const [tasks, setTasks]       = useState([]);
  const [project, setProject]   = useState(null);
  const [members, setMembers]   = useState([]);
  const [miAcceso, setMiAcceso] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [restoringId, setRestoringId] = useState(null);

  useEffect(() => {
    Promise.all([
      tasksAPI.getArchived(projectId),
      projectsAPI.getById(projectId),
    ]).then(([t, p]) => {
      setTasks(t.data);
      setProject(p.data);
      setMembers(p.data.members || []);
      setMiAcceso(p.data.mi_acceso || null);
    }).catch(() => toast.error('Error al cargar el archivo'))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Lo decide el servidor (mi_acceso): antes, quien no era miembro del
  // proyecto veía los botones de edición
  const canEdit = Boolean(miAcceso?.escritura);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(t =>
      t.title?.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q) ||
      t.assignee_name?.toLowerCase().includes(q)
    );
  }, [tasks, search]);

  // Agrupado por mes de cierre, del más reciente al más antiguo
  const groups = useMemo(() => {
    const map = new Map();
    for (const task of filtered) {
      const raw = closingDate(task);
      const key = raw ? format(parseISO(raw), 'yyyy-MM') : 'sin-fecha';
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: raw
            ? format(parseISO(raw), 'MMMM yyyy', { locale: es })
            : 'Sin fecha de cierre',
          tasks: [],
        });
      }
      map.get(key).tasks.push(task);
    }
    return [...map.values()].sort((a, b) => {
      if (a.key === 'sin-fecha') return 1;
      if (b.key === 'sin-fecha') return -1;
      return b.key.localeCompare(a.key);
    });
  }, [filtered]);

  const handleRestore = async (task) => {
    setRestoringId(task.id);
    try {
      await tasksAPI.unarchive(projectId, task.id);
      setTasks(prev => prev.filter(t => t.id !== task.id));
      toast.success('Tarea restaurada al tablero');
    } catch {
      toast.error('Error al restaurar la tarea');
    } finally {
      setRestoringId(null);
    }
  };

  const toggleGroup = (key) =>
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      <ViewNavBar projectName={project?.name} projectColor={project?.color} />

      {/* Encabezado */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Archive className="w-5 h-5 text-gray-400" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Archivo</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {tasks.length} tarea{tasks.length === 1 ? '' : 's'} archivada{tasks.length === 1 ? '' : 's'} · agrupadas por mes de cierre
            </p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por título o responsable…"
            className="input pl-9 py-1.5 text-sm w-full sm:w-72"
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="card p-12 text-center">
          <Archive className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 dark:text-gray-500">
            {search
              ? `Sin resultados para "${search}"`
              : 'Todavía no hay tareas archivadas en este proyecto.'}
          </p>
          {!search && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              Archiva tarjetas completadas desde el tablero para mantener la columna despejada.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => {
            const isCollapsed = collapsed[group.key];
            return (
              <div key={group.key} className="card overflow-hidden">
                {/* Cabecera del mes */}
                <button
                  onClick={() => toggleGroup(group.key)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/60
                             hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed
                      ? <ChevronRight className="w-4 h-4 text-gray-400" />
                      : <ChevronDown className="w-4 h-4 text-gray-400" />
                    }
                    <span className="font-semibold text-sm text-gray-700 dark:text-gray-300 capitalize">
                      {group.label}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-200/70 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                    {group.tasks.length}
                  </span>
                </button>

                {/* Tareas del mes */}
                {!isCollapsed && (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {group.tasks.map(task => {
                      const closed = closingDate(task);
                      return (
                        <div
                          key={task.id}
                          className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-gray-50/60 dark:hover:bg-gray-800/40"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${priorityDot[task.priority]}`} />
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {task.title}
                              </span>
                              {task.phase_name && (
                                <span
                                  className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                                  style={{
                                    backgroundColor: (task.phase_color || '#6366F1') + '25',
                                    color: task.phase_color || '#6366F1',
                                  }}
                                >
                                  {task.phase_name}
                                </span>
                              )}
                              {task.labels?.map(l => (
                                <span
                                  key={l.id}
                                  className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                                  style={{ backgroundColor: l.color + '25', color: l.color }}
                                >
                                  {l.name}
                                </span>
                              ))}
                            </div>

                            <div className="flex items-center gap-3 mt-1 pl-3.5 text-xs text-gray-400 dark:text-gray-500 flex-wrap">
                              <span>{priorityLabel[task.priority]}</span>
                              {task.assignee_name && (
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3" /> {task.assignee_name}
                                </span>
                              )}
                              {closed && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  Cerrada el {format(parseISO(closed), "d 'de' MMMM yyyy", { locale: es })}
                                </span>
                              )}
                            </div>
                          </div>

                          {canEdit && (
                            <button
                              onClick={() => handleRestore(task)}
                              disabled={restoringId === task.id}
                              title="Devolver la tarea al tablero"
                              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg flex-shrink-0
                                         border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400
                                         hover:border-primary-300 hover:text-primary-600 dark:hover:text-primary-400
                                         disabled:opacity-50 transition-colors"
                            >
                              {restoringId === task.id
                                ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                : <ArchiveRestore className="w-3.5 h-3.5" />
                              }
                              <span className="hidden sm:inline">Restaurar</span>
                            </button>
                          )}
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
    </div>
  );
}
