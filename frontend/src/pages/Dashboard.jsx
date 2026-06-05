import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { FolderKanban, CheckSquare, AlertTriangle, Clock, TrendingUp, Users, BarChart3, Activity } from 'lucide-react';

function StatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  );
}

const statusLabels = { pending: 'Pendiente', in_progress: 'En Proceso', in_review: 'En Revisión', completed: 'Completada' };
const statusColors = { pending: 'bg-gray-400', in_progress: 'bg-blue-500', in_review: 'bg-amber-500', completed: 'bg-green-500' };

const historyLabels = {
  created: 'creó', status: 'cambió estado de', priority: 'cambió prioridad de', assignee: 'reasignó',
};

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardAPI.getStats()
      .then(({ data }) => setData(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!data) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          ¡Bienvenido, {user?.name?.split(' ')[0]}! 👋
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Aquí está el resumen de tu trabajo</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={FolderKanban} label="Proyectos Activos" value={data.projects.active} color="bg-primary-500" sub={`${data.projects.total} en total`} />
        <StatCard icon={CheckSquare} label="Tareas Completadas" value={data.tasks.completed} color="bg-green-500" sub={`${data.tasks.total} en total`} />
        <StatCard icon={AlertTriangle} label="Tareas Vencidas" value={data.tasks.overdue} color="bg-red-500" sub="Requieren atención" />
        <StatCard icon={Clock} label="Vencen en 7 días" value={data.tasks.due_soon} color="bg-amber-500" sub="Próximas a vencer" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Progreso de proyectos */}
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary-500" />
              Avance por Proyecto
            </h2>
            <Link to="/projects" className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700">Ver todos →</Link>
          </div>
          <div className="space-y-4">
            {data.projectsProgress.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No hay proyectos activos</p>
            ) : data.projectsProgress.map(p => (
              <div key={p.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                    <Link to={`/projects/${p.id}`} className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400">
                      {p.name}
                    </Link>
                  </div>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{p.progress}%</span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                  <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${p.progress}%`, backgroundColor: p.color }} />
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{p.done_tasks} / {p.total_tasks} tareas completadas</p>
              </div>
            ))}
          </div>
        </div>

        {/* Estado de tareas */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-primary-500" />
            Estado de Tareas
          </h2>
          <div className="space-y-3">
            {Object.entries(statusLabels).map(([key, label]) => {
              const count = data.tasks[key] || 0;
              const total = data.tasks.total || 1;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={key}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">{label}</span>
                    <span className="font-medium text-gray-800 dark:text-gray-200">{count}</span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${statusColors[key]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Carga de trabajo */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-primary-500" />
            Carga de Trabajo
          </h2>
          <div className="space-y-3">
            {data.workload.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Sin datos</p>
            ) : data.workload.map(u => (
              <div key={u.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-700 dark:text-primary-300 font-semibold text-sm flex-shrink-0">
                  {u.name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700 dark:text-gray-300 truncate">{u.name}</span>
                    <span className="text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2">{u.pending} pendientes</span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-primary-500"
                      style={{ width: `${Math.min(100, (u.pending / (data.workload[0]?.pending || 1)) * 100)}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actividad reciente */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-primary-500" />
            Actividad Reciente
          </h2>
          <div className="space-y-3">
            {data.recentActivity.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Sin actividad reciente</p>
            ) : data.recentActivity.slice(0, 6).map(a => (
              <div key={a.id} className="flex gap-3 text-sm">
                <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-400 font-semibold text-xs flex-shrink-0">
                  {a.user_name?.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-700 dark:text-gray-300">
                    <span className="font-medium">{a.user_name}</span>
                    {' '}{historyLabels[a.field_changed] || 'actualizó'}{' '}
                    <span className="text-primary-600 dark:text-primary-400">{a.task_title}</span>
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{a.project_name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
