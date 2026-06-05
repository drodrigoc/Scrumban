import { useEffect, useState, useMemo } from 'react';
import { toast } from 'react-toastify';
import { usersAPI } from '../services/api';
import {
  Users, Building2, CheckCircle2, Clock, AlertTriangle,
  ChevronDown, ChevronRight, Search, ListFilter,
} from 'lucide-react';
import { format, parseISO, isPast, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { roleConfig } from './Users';

const statusConfig = {
  pending:     { label: 'Pendiente',   color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  in_progress: { label: 'En Proceso',  color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  in_review:   { label: 'En Revisión', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  completed:   { label: 'Completada',  color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
};

const priorityConfig = {
  low:      { label: 'Baja',     color: 'text-gray-400' },
  medium:   { label: 'Media',    color: 'text-blue-500' },
  high:     { label: 'Alta',     color: 'text-amber-500' },
  critical: { label: 'Crítica',  color: 'text-red-500' },
};

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  );
}

function TaskRow({ task }) {
  const due = task.due_date ? parseISO(task.due_date) : null;
  const overdue = due && isPast(due) && task.status !== 'completed';
  const dueToday = due && isToday(due) && task.status !== 'completed';
  const st = statusConfig[task.status] || statusConfig.pending;
  const pr = priorityConfig[task.priority] || priorityConfig.medium;

  return (
    <tr className={`text-sm border-b border-gray-50 dark:border-gray-800 last:border-0 ${
      overdue ? 'bg-red-50/40 dark:bg-red-950/20' : ''
    }`}>
      <td className="py-2 pr-3 pl-2">
        <span className="text-gray-700 dark:text-gray-300 font-medium line-clamp-1">{task.title}</span>
      </td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: task.project_color }} />
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-32">{task.project_name}</span>
        </div>
      </td>
      <td className="py-2 pr-3">
        <span className={`badge text-xs ${st.color}`}>{st.label}</span>
      </td>
      <td className="py-2 pr-3">
        <span className={`text-xs font-medium ${pr.color}`}>{pr.label}</span>
      </td>
      <td className="py-2 pr-2 text-right">
        {due ? (
          <span className={`text-xs ${
            overdue  ? 'text-red-600 dark:text-red-400 font-semibold' :
            dueToday ? 'text-amber-600 dark:text-amber-400 font-semibold' :
                       'text-gray-500 dark:text-gray-400'
          }`}>
            {overdue && <AlertTriangle className="inline w-3 h-3 mr-0.5" />}
            {format(due, 'd MMM', { locale: es })}
          </span>
        ) : (
          <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
        )}
      </td>
    </tr>
  );
}

function MemberRow({ member }) {
  const [expanded, setExpanded] = useState(false);
  const totalT     = Number(member.total_tasks)       || 0;
  const completedT = Number(member.completed_tasks)   || 0;
  const progress   = totalT > 0 ? Math.round((completedT / totalT) * 100) : 0;
  const roleInfo = roleConfig[member.role] || roleConfig.member;
  const activeTasks = member.tasks.filter(t => t.status !== 'completed');
  const overdueTasks = member.tasks.filter(t => {
    const due = t.due_date ? parseISO(t.due_date) : null;
    return due && isPast(due) && t.status !== 'completed';
  });

  return (
    <>
      <tr
        className="hover:bg-gray-50/60 dark:hover:bg-gray-800/60 cursor-pointer transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Member */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <button className="text-gray-400 flex-shrink-0">
              {expanded
                ? <ChevronDown className="w-4 h-4" />
                : <ChevronRight className="w-4 h-4" />
              }
            </button>
            <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-700 dark:text-primary-300 font-semibold text-sm flex-shrink-0">
              {member.name?.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{member.name}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{member.email}</p>
            </div>
          </div>
        </td>

        {/* Unit */}
        <td className="px-4 py-3">
          {member.unit
            ? <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />{member.unit}
              </span>
            : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
          }
        </td>

        {/* Role */}
        <td className="px-4 py-3">
          <span className={`badge ${roleInfo.color}`}>{roleInfo.label}</span>
        </td>

        {/* Tasks summary */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5 text-xs">
              <span className="text-gray-500 dark:text-gray-400">{totalT} total</span>
              {overdueTasks.length > 0 && (
                <span className="text-red-600 dark:text-red-400 font-semibold">
                  · {overdueTasks.length} vencida{overdueTasks.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-1 mt-1">
            {[
              { v: Number(member.pending_tasks)     || 0, c: 'bg-gray-300 dark:bg-gray-600', title: 'Pendiente' },
              { v: Number(member.in_progress_tasks) || 0, c: 'bg-blue-400',                  title: 'En Proceso' },
              { v: Number(member.in_review_tasks)   || 0, c: 'bg-amber-400',                 title: 'En Revisión' },
              { v: Number(member.completed_tasks)   || 0, c: 'bg-green-400',                 title: 'Completada' },
            ].map(({ v, c, title }) => v > 0 && (
              <span key={title} title={`${title}: ${v}`}
                className={`inline-flex items-center justify-center min-w-5 h-5 rounded-full px-1.5 text-xs font-medium text-white ${c}`}>
                {v}
              </span>
            ))}
          </div>
        </td>

        {/* Progress */}
        <td className="px-4 py-3 w-36">
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
              <div className="h-1.5 rounded-full bg-primary-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right">{progress}%</span>
          </div>
        </td>
      </tr>

      {/* Expanded task list */}
      {expanded && (
        <tr>
          <td colSpan={5} className="px-4 pb-4 pt-0 bg-gray-50/40 dark:bg-gray-800/20">
            {member.tasks.length === 0 ? (
              <p className="text-sm text-center text-gray-400 dark:text-gray-500 py-3">Sin tareas asignadas</p>
            ) : (
              <div className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">
                      <th className="text-left py-2 pr-3 pl-2">Tarea</th>
                      <th className="text-left py-2 pr-3">Proyecto</th>
                      <th className="text-left py-2 pr-3">Estado</th>
                      <th className="text-left py-2 pr-3">Prioridad</th>
                      <th className="text-right py-2 pr-2">Vence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {member.tasks.map(task => <TaskRow key={task.id} task={task} />)}
                  </tbody>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function TeamView() {
  const [members, setMembers]       = useState([]);
  const [restricted, setRestricted] = useState(false);
  const [viewingUnit, setViewingUnit] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filterUnit, setFilterUnit] = useState('all');
  const [filterRole, setFilterRole] = useState('all');

  useEffect(() => {
    usersAPI.getTeamOverview()
      .then(({ data }) => {
        setMembers(data.members);
        setRestricted(data.restricted);
        setViewingUnit(data.unit);
      })
      .catch(() => toast.error('Error al cargar datos del equipo'))
      .finally(() => setLoading(false));
  }, []);

  const units = useMemo(() =>
    [...new Set(members.map(m => m.unit).filter(Boolean))].sort(),
    [members]
  );

  const filtered = useMemo(() =>
    members.filter(m => {
      const matchSearch = m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.email.toLowerCase().includes(search.toLowerCase());
      const matchUnit = filterUnit === 'all' || m.unit === filterUnit;
      const matchRole = filterRole === 'all' || m.role === filterRole;
      return matchSearch && matchUnit && matchRole;
    }),
    [members, search, filterUnit, filterRole]
  );

  const totalTasks     = members.reduce((s, m) => s + (Number(m.total_tasks)       || 0), 0);
  const activeTasks    = members.reduce((s, m) => s + (Number(m.in_progress_tasks) || 0) + (Number(m.in_review_tasks) || 0), 0);
  const overdueTasks   = members.reduce((s, m) => s + (Number(m.overdue_tasks)     || 0), 0);
  const completedTasks = members.reduce((s, m) => s + (Number(m.completed_tasks)   || 0), 0);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // Coordinator without a unit assigned
  if (restricted && !viewingUnit) return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Seguimiento de Equipo</h1>
      </div>
      <div className="card p-12 text-center">
        <Building2 className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-500 dark:text-gray-400 font-medium">Sin unidad asignada</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          Tu cuenta no tiene una unidad asociada. Contacta a un administrador para que te asigne una.
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Seguimiento de Equipo</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{members.length} miembro{members.length !== 1 ? 's' : ''} activo{members.length !== 1 ? 's' : ''}</p>
        </div>
        {restricted && viewingUnit && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800/40 rounded-lg">
            <Building2 className="w-4 h-4 text-primary-600 dark:text-primary-400 flex-shrink-0" />
            <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
              Unidad: {viewingUnit}
            </span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users}        label="Miembros"      value={members.length} color="bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400" />
        <StatCard icon={Clock}        label="En Progreso"   value={activeTasks}    color="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" />
        <StatCard icon={CheckCircle2} label="Completadas"   value={completedTasks} color="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400" />
        <StatCard icon={AlertTriangle}label="Vencidas"      value={overdueTasks}   color={overdueTasks > 0 ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'bg-gray-50 dark:bg-gray-800 text-gray-400'} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" placeholder="Buscar miembro..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>
        {!restricted && (
          <select value={filterUnit} onChange={e => setFilterUnit(e.target.value)} className="input w-auto">
            <option value="all">Todas las unidades</option>
            {units.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        )}
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="input w-auto">
          <option value="all">Todos los roles</option>
          <option value="coordinator">Coordinador</option>
          <option value="member">Miembro</option>
          <option value="viewer">Visor</option>
        </select>
      </div>

      {/* Members table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Miembro</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Unidad</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Rol</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Tareas</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3 w-36">Avance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-gray-400 dark:text-gray-500 py-10">
                    <ListFilter className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No hay miembros que coincidan
                  </td>
                </tr>
              ) : filtered.map(m => <MemberRow key={m.id} member={m} />)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
