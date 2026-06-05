import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { tasksAPI, projectsAPI } from '../services/api';
import {
  Plus, Search, Filter, ChevronUp, ChevronDown,
  ChevronsUpDown, Trash2, Edit, CheckSquare, Square,
  Calendar, AlertTriangle, Tag, User, MoreVertical,
} from 'lucide-react';
import ViewNavBar from '../components/common/ViewNavBar';
import TaskModal from '../components/tasks/TaskModal';
import Modal from '../components/common/Modal';
import { format, parseISO, isPast, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';

// ── Configuraciones visuales ─────────────────────────────────────────────
const priorityCfg = {
  low:      { label: 'Baja',    dot: 'bg-gray-400',   badge: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  medium:   { label: 'Media',   dot: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  high:     { label: 'Alta',    dot: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  critical: { label: 'Crítica', dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
};

const statusCfg = {
  pending:     { label: 'Pendiente',  color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  in_progress: { label: 'En Proceso', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  in_review:   { label: 'En Revisión',color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  completed:   { label: 'Completada', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
};

// ── Columnas de la tabla ──────────────────────────────────────────────────
const COLUMNS = [
  { key: 'title',       label: 'Título',       sortable: true,  width: 'min-w-56 flex-1' },
  { key: 'status',      label: 'Estado',       sortable: true,  width: 'w-32' },
  { key: 'priority',    label: 'Prioridad',    sortable: true,  width: 'w-28' },
  { key: 'assignee_name', label: 'Responsable',sortable: true,  width: 'w-36' },
  { key: 'start_date',  label: 'Inicio',       sortable: true,  width: 'w-28' },
  { key: 'due_date',    label: 'Vence',        sortable: true,  width: 'w-28' },
  { key: 'progress',    label: 'Progreso',     sortable: true,  width: 'w-28' },
  { key: 'labels',      label: 'Etiquetas',    sortable: false, width: 'w-36' },
  { key: 'actions',     label: '',             sortable: false, width: 'w-12' },
];

// ── Componente SortIcon ───────────────────────────────────────────────────
function SortIcon({ col, sortKey, sortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 text-gray-300 dark:text-gray-600" />;
  return sortDir === 'asc'
    ? <ChevronUp className="w-3 h-3 text-primary-500" />
    : <ChevronDown className="w-3 h-3 text-primary-500" />;
}

// ── Componente inline-status dropdown ────────────────────────────────────
function StatusSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={e => { e.stopPropagation(); onChange(e.target.value); }}
      onClick={e => e.stopPropagation()}
      className={`text-xs font-medium rounded-full px-2 py-0.5 border-0 outline-none cursor-pointer appearance-none
                  focus:ring-2 focus:ring-primary-400 ${statusCfg[value]?.color}`}
    >
      {Object.entries(statusCfg).map(([k, v]) => (
        <option key={k} value={k}>{v.label}</option>
      ))}
    </select>
  );
}

// ── Componente QuickAddRow ────────────────────────────────────────────────
function QuickAddRow({ onAdd, members, onCancel }) {
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({ title: title.trim(), assignee_id: assignee || null, priority, due_date: dueDate || null });
    setTitle(''); setAssignee(''); setPriority('medium'); setDueDate('');
  };

  return (
    <tr className="bg-primary-50/40 dark:bg-primary-900/10 border-t-2 border-primary-200 dark:border-primary-700">
      <td className="px-4 py-2" colSpan={1}>
        <form id="quick-add" onSubmit={handleSubmit} className="flex items-center gap-2 w-full">
          <Plus className="w-4 h-4 text-primary-500 flex-shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Título de la nueva tarea..."
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400
                       focus:outline-none min-w-0"
          />
        </form>
      </td>
      <td className="px-2 py-2 w-32">
        <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${statusCfg.pending.color}`}>
          Pendiente
        </span>
      </td>
      <td className="px-2 py-2 w-28">
        <select value={priority} onChange={e => setPriority(e.target.value)}
          className="text-xs w-full bg-transparent border border-gray-200 dark:border-gray-600
                     rounded-md px-1 py-0.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400">
          {Object.entries(priorityCfg).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </td>
      <td className="px-2 py-2 w-36">
        <select value={assignee} onChange={e => setAssignee(e.target.value)}
          className="text-xs w-full bg-transparent border border-gray-200 dark:border-gray-600
                     rounded-md px-1 py-0.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400">
          <option value="">Sin asignar</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </td>
      <td className="px-2 py-2 w-28" />
      <td className="px-2 py-2 w-28">
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
          className="text-xs w-full bg-transparent border border-gray-200 dark:border-gray-600
                     rounded-md px-1 py-0.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400" />
      </td>
      <td colSpan={3} className="px-2 py-2">
        <div className="flex items-center gap-2">
          <button type="submit" form="quick-add" className="btn-primary text-xs py-1 px-3">Agregar</button>
          <button type="button" onClick={onCancel} className="btn-secondary text-xs py-1 px-3">Cancelar</button>
        </div>
      </td>
    </tr>
  );
}

// ── Página principal BacklogView ──────────────────────────────────────────
export default function BacklogView() {
  const { id: projectId } = useParams();

  const [tasks, setTasks] = useState([]);
  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');

  const [sortKey, setSortKey] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');

  const [selectedTask, setSelectedTask] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);

  // Selección múltiple
  const [selected, setSelected] = useState(new Set());

  useEffect(() => {
    Promise.all([
      tasksAPI.getByProject(projectId),
      projectsAPI.getById(projectId),
      projectsAPI.getLabels(projectId),
    ]).then(([t, p, l]) => {
      setTasks(t.data);
      setProject(p.data);
      setMembers(p.data.members || []);
      setLabels(l.data);
    }).catch(() => toast.error('Error al cargar backlog'))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Cerrar menú contextual al hacer click fuera
  useEffect(() => {
    const h = () => setOpenMenu(null);
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);

  // ── Ordenación ───────────────────────────────────────────────────────
  const handleSort = (key) => {
    if (!COLUMNS.find(c => c.key === key)?.sortable) return;
    setSortKey(prev => prev === key ? key : key);
    setSortDir(prev => (sortKey === key && prev === 'asc') ? 'desc' : 'asc');
  };

  // ── Filtrado y ordenación ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = tasks.filter(t => {
      const matchSearch = t.title.toLowerCase().includes(search.toLowerCase()) ||
        (t.assignee_name || '').toLowerCase().includes(search.toLowerCase());
      const matchStatus   = filterStatus === 'all' || t.status === filterStatus;
      const matchPriority = filterPriority === 'all' || t.priority === filterPriority;
      const matchAssignee = filterAssignee === 'all' || String(t.assignee_id) === filterAssignee;
      return matchSearch && matchStatus && matchPriority && matchAssignee;
    });

    list.sort((a, b) => {
      let av = a[sortKey] ?? '';
      let bv = b[sortKey] ?? '';
      if (sortKey === 'due_date' || sortKey === 'start_date') {
        av = av ? new Date(av) : new Date('9999');
        bv = bv ? new Date(bv) : new Date('9999');
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [tasks, search, filterStatus, filterPriority, filterAssignee, sortKey, sortDir]);

  // ── Acciones ─────────────────────────────────────────────────────────
  const handleStatusChange = async (taskId, newStatus) => {
    try {
      const { data } = await tasksAPI.update(projectId, taskId, { status: newStatus });
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: data.status } : t));
    } catch { toast.error('Error al actualizar estado'); }
  };

  const handleQuickAdd = async (data) => {
    try {
      const { data: created } = await tasksAPI.create(projectId, { ...data, status: 'pending' });
      setTasks(prev => [created, ...prev]);
      toast.success('Tarea creada');
    } catch (err) { toast.error(err.response?.data?.message || 'Error al crear tarea'); }
  };

  const handleOpenTask = async (task) => {
    try {
      const { data } = await tasksAPI.getById(projectId, task.id);
      setSelectedTask(data);
      setShowModal(true);
    } catch { toast.error('Error al cargar tarea'); }
  };

  const handleSave = async (data) => {
    try {
      if (selectedTask?.id) {
        const { data: updated } = await tasksAPI.update(projectId, selectedTask.id, data);
        setTasks(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
        toast.success('Tarea actualizada');
      } else {
        const { data: created } = await tasksAPI.create(projectId, data);
        setTasks(prev => [created, ...prev]);
        toast.success('Tarea creada');
      }
      setShowModal(false); setSelectedTask(null);
    } catch (err) { toast.error(err.response?.data?.message || 'Error al guardar'); }
  };

  const handleDelete = async (taskId) => {
    if (!confirm('¿Eliminar esta tarea?')) return;
    try {
      await tasksAPI.delete(projectId, taskId);
      setTasks(prev => prev.filter(t => t.id !== taskId));
      setShowModal(false); setSelectedTask(null);
      toast.success('Tarea eliminada');
    } catch { toast.error('Error al eliminar'); }
  };

  const handleDeleteSelected = async () => {
    if (!confirm(`¿Eliminar ${selected.size} tarea(s)?`)) return;
    for (const id of selected) {
      try { await tasksAPI.delete(projectId, id); } catch { /* ignore individual errors */ }
    }
    setTasks(prev => prev.filter(t => !selected.has(t.id)));
    setSelected(new Set());
    toast.success(`${selected.size} tarea(s) eliminadas`);
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(t => t.id)));
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const allSelected = filtered.length > 0 && selected.size === filtered.length;
  const someSelected = selected.size > 0;

  return (
    <div className="flex flex-col min-h-0 animate-fade-in">
      <ViewNavBar projectName={project?.name} projectColor={project?.color} />

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          {/* Search */}
          <div className="relative min-w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text" placeholder="Buscar tareas..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="input pl-8 py-1.5 text-sm"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-1.5 text-gray-400">
            <Filter className="w-3.5 h-3.5" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input py-1.5 w-auto text-sm">
            <option value="all">Todos los estados</option>
            {Object.entries(statusCfg).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="input py-1.5 w-auto text-sm">
            <option value="all">Todas las prioridades</option>
            {Object.entries(priorityCfg).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className="input py-1.5 w-auto text-sm">
            <option value="all">Todos los responsables</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {someSelected && (
            <button onClick={handleDeleteSelected}
              className="btn-danger text-xs py-1.5 px-3 flex items-center gap-1">
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar ({selected.size})
            </button>
          )}
          <span className="text-sm text-gray-400 dark:text-gray-500">
            {filtered.length} tarea{filtered.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => { setShowQuickAdd(v => !v); }}
            className="btn-primary text-sm py-1.5"
          >
            <Plus className="w-4 h-4" /> Nueva Tarea
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden flex-1">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                {/* Checkbox all */}
                <th className="px-4 py-3 w-10">
                  <button onClick={toggleAll} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    {allSelected
                      ? <CheckSquare className="w-4 h-4 text-primary-500" />
                      : <Square className="w-4 h-4" />
                    }
                  </button>
                </th>
                {COLUMNS.map(col => (
                  <th key={col.key}
                    className={`px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400
                                uppercase tracking-wider select-none ${col.width}
                                ${col.sortable ? 'cursor-pointer hover:text-gray-700 dark:hover:text-gray-300' : ''}`}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {col.sortable && <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {/* Quick add row */}
              {showQuickAdd && (
                <QuickAddRow
                  members={members}
                  onAdd={(data) => { handleQuickAdd(data); setShowQuickAdd(false); }}
                  onCancel={() => setShowQuickAdd(false)}
                />
              )}

              {filtered.length === 0 && !showQuickAdd ? (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="text-center py-16">
                    <div className="flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500">
                      <CheckSquare className="w-10 h-10 opacity-30" />
                      <p className="font-medium">No hay tareas</p>
                      <p className="text-xs">Haz clic en "Nueva Tarea" para comenzar</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map(task => {
                const isSelected = selected.has(task.id);
                const isOverdue = task.due_date && task.status !== 'completed' && isPast(parseISO(task.due_date));
                const daysLeft = task.due_date ? differenceInDays(parseISO(task.due_date), new Date()) : null;
                const isDueSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3 && task.status !== 'completed';
                const pri = priorityCfg[task.priority] || priorityCfg.medium;

                return (
                  <tr key={task.id}
                    className={`group transition-colors cursor-pointer
                      ${isSelected ? 'bg-primary-50/60 dark:bg-primary-900/10' : ''}
                      ${isOverdue ? 'bg-red-50/30 dark:bg-red-950/10' : ''}
                      hover:bg-gray-50 dark:hover:bg-gray-800/60`}
                    onClick={() => handleOpenTask(task)}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                      <button onClick={() => toggleSelect(task.id)}
                        className="text-gray-400 hover:text-primary-500">
                        {isSelected
                          ? <CheckSquare className="w-4 h-4 text-primary-500" />
                          : <Square className="w-4 h-4" />
                        }
                      </button>
                    </td>

                    {/* Title */}
                    <td className="px-3 py-2.5 min-w-56">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${pri.dot}`} />
                        <span className={`font-medium truncate max-w-xs ${
                          isOverdue ? 'text-red-700 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'
                        }`}>
                          {task.title}
                        </span>
                        {isOverdue && <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                        {isDueSoon && !isOverdue && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2.5 w-32" onClick={e => e.stopPropagation()}>
                      <StatusSelect value={task.status} onChange={val => handleStatusChange(task.id, val)} />
                    </td>

                    {/* Priority */}
                    <td className="px-3 py-2.5 w-28">
                      <span className={`badge ${pri.badge}`}>{pri.label}</span>
                    </td>

                    {/* Assignee */}
                    <td className="px-3 py-2.5 w-36">
                      {task.assignee_name ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900
                                          flex items-center justify-center text-primary-700 dark:text-primary-300
                                          text-xs font-semibold flex-shrink-0">
                            {task.assignee_name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                            {task.assignee_name.split(' ')[0]}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                      )}
                    </td>

                    {/* Start date */}
                    <td className="px-3 py-2.5 w-28">
                      {task.start_date ? (
                        <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(parseISO(task.start_date), 'dd MMM', { locale: es })}
                        </span>
                      ) : <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
                    </td>

                    {/* Due date */}
                    <td className="px-3 py-2.5 w-28">
                      {task.due_date ? (
                        <span className={`text-xs flex items-center gap-1 font-medium ${
                          isOverdue ? 'text-red-500 dark:text-red-400'
                          : isDueSoon ? 'text-amber-500 dark:text-amber-400'
                          : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          <Calendar className="w-3 h-3" />
                          {format(parseISO(task.due_date), 'dd MMM', { locale: es })}
                          {daysLeft === 0 && ' (hoy)'}
                        </span>
                      ) : <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
                    </td>

                    {/* Progress */}
                    <td className="px-3 py-2.5 w-28">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full bg-primary-500 transition-all"
                            style={{ width: `${task.progress || 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 dark:text-gray-500 w-8 text-right">
                          {task.progress || 0}%
                        </span>
                      </div>
                    </td>

                    {/* Labels */}
                    <td className="px-3 py-2.5 w-36">
                      <div className="flex flex-wrap gap-1">
                        {(task.labels || []).slice(0, 2).map(l => (
                          <span key={l.id} className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: l.color + '25', color: l.color }}>
                            {l.name}
                          </span>
                        ))}
                        {(task.labels || []).length > 2 && (
                          <span className="text-xs text-gray-400">+{task.labels.length - 2}</span>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-2 py-2.5 w-12" onClick={e => e.stopPropagation()}>
                      <div className="relative">
                        <button
                          onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === task.id ? null : task.id); }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
                                     hover:bg-gray-100 dark:hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {openMenu === task.id && (
                          <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-gray-800
                                          border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg
                                          dark:shadow-gray-900/50 z-20">
                            <button
                              onClick={() => { handleOpenTask(task); setOpenMenu(null); }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700
                                         dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                              <Edit className="w-3.5 h-3.5" /> Editar
                            </button>
                            <button
                              onClick={() => { handleDelete(task.id); setOpenMenu(null); }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600
                                         dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Eliminar
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer summary */}
        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700
                        bg-gray-50/50 dark:bg-gray-800/30 flex items-center justify-between">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {filtered.length} de {tasks.length} tareas
            {someSelected && ` · ${selected.size} seleccionadas`}
          </span>
          <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
            {Object.entries(statusCfg).map(([k, v]) => {
              const count = tasks.filter(t => t.status === k).length;
              return count > 0 ? (
                <span key={k}>{v.label}: <strong className="text-gray-600 dark:text-gray-300">{count}</strong></span>
              ) : null;
            })}
          </div>
        </div>
      </div>

      {/* Task modal */}
      {showModal && (
        <Modal
          title={selectedTask?.id ? 'Editar Tarea' : 'Nueva Tarea'}
          onClose={() => { setShowModal(false); setSelectedTask(null); }}
          size="xl"
        >
          <TaskModal
            task={selectedTask}
            projectId={projectId}
            members={members}
            labels={labels}
            onSave={handleSave}
            onDelete={selectedTask?.id ? () => handleDelete(selectedTask.id) : null}
            onCancel={() => { setShowModal(false); setSelectedTask(null); }}
            onCommentAdded={(_, comment) => {
              setSelectedTask(prev => prev ? { ...prev, comments: [...(prev.comments || []), comment] } : prev);
            }}
            onLabelCreated={(newLabel) => {
              setLabels(prev => [...prev, newLabel]);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
