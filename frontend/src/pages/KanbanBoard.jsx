import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import {
  DndContext, DragOverlay, closestCenter,
  PointerSensor, useSensor, useSensors,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy,
  horizontalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { tasksAPI, projectsAPI, usersAPI } from '../services/api';
import { Plus, Filter, Pencil, Trash2, Check, X, GripVertical, Lock, Archive } from 'lucide-react';
import TaskCard from '../components/tasks/TaskCard';
import TaskModal from '../components/tasks/TaskModal';
import Modal from '../components/common/Modal';
import ViewNavBar from '../components/common/ViewNavBar';

const DEFAULT_COLUMNS = [
  { id: 'pending',     label: 'Pendiente',   color: 'bg-gray-400',   ring: 'ring-gray-400' },
  { id: 'in_progress', label: 'En Proceso',  color: 'bg-blue-500',   ring: 'ring-blue-400' },
  { id: 'in_review',   label: 'En Revisión', color: 'bg-amber-500',  ring: 'ring-amber-400' },
  { id: 'completed',   label: 'Completado',  color: 'bg-green-500',  ring: 'ring-green-400' },
];

const COLOR_OPTIONS = [
  { color: 'bg-gray-400',   ring: 'ring-gray-400',   label: 'Gris' },
  { color: 'bg-blue-500',   ring: 'ring-blue-400',   label: 'Azul' },
  { color: 'bg-amber-500',  ring: 'ring-amber-400',  label: 'Ámbar' },
  { color: 'bg-green-500',  ring: 'ring-green-400',  label: 'Verde' },
  { color: 'bg-purple-500', ring: 'ring-purple-400', label: 'Morado' },
  { color: 'bg-red-500',    ring: 'ring-red-400',    label: 'Rojo' },
  { color: 'bg-pink-500',   ring: 'ring-pink-400',   label: 'Rosa' },
  { color: 'bg-teal-500',   ring: 'ring-teal-400',   label: 'Teal' },
  { color: 'bg-orange-500', ring: 'ring-orange-400', label: 'Naranja' },
  { color: 'bg-indigo-500', ring: 'ring-indigo-400', label: 'Índigo' },
];

// Configuración de columnas heredada del navegador (pre-migración a BD)
const LEGACY_STORAGE_KEY = (projectId) => `kanban_columns_${projectId}`;
const COMPLETED_ID = 'completed';

// Cuánto historial de "Completado" se muestra en el tablero.
// Es una preferencia de vista personal, por eso vive en localStorage.
const WINDOW_STORAGE_KEY = (projectId) => `kanban_completed_window_${projectId}`;
const WINDOW_OPTIONS = [
  { value: 7,  label: 'Últimos 7 días'  },
  { value: 30, label: 'Últimos 30 días' },
  { value: 90, label: 'Últimos 90 días' },
  { value: 0,  label: 'Todas'           },
];
const DEFAULT_WINDOW = 30;

// La BD guarda column_key; el tablero trabaja con id
const fromApiColumns = (cols) =>
  cols.map(c => ({ id: c.column_key, label: c.label, color: c.color, ring: c.ring }));

const toApiColumns = (cols) =>
  cols.map((c, i) => ({ column_key: c.id, label: c.label, color: c.color, ring: c.ring, position: i }));

// ---------------------------------------------------------------------------
// DroppableColumn
// ---------------------------------------------------------------------------
function DroppableColumn({ column, tasks, activeId, onAddTask, onTaskClick, onRename, onDelete, onArchiveTask, footer }) {
  const isLocked = column.id === COMPLETED_ID;

  // Sortable handle for column reordering
  const {
    attributes: colAttrs,
    listeners: colListeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging: isColDragging,
  } = useSortable({
    id: `col_${column.id}`,
    data: { type: 'column', columnId: column.id },
    disabled: isLocked,
  });

  // Droppable zone for tasks
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: column.id });

  const colStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isColDragging ? 0.4 : 1,
  };

  const [editing, setEditing] = useState(false);
  const [labelDraft, setLabelDraft] = useState(column.label);
  const inputRef = useRef(null);

  const itemIds = tasks.map(t => t.id);
  if (activeId && !itemIds.includes(activeId)) itemIds.push(activeId);

  const startEdit = () => {
    setLabelDraft(column.label);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const confirmEdit = () => {
    const trimmed = labelDraft.trim();
    if (trimmed && trimmed !== column.label) onRename(column.id, trimmed);
    setEditing(false);
  };

  const cancelEdit = () => {
    setLabelDraft(column.label);
    setEditing(false);
  };

  return (
    <div ref={setSortableRef} style={colStyle} className="flex flex-col min-w-72 w-72 group/col">
      {/* Column header */}
      <div className="flex items-center justify-between mb-3 min-h-8">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {/* Drag handle or lock icon */}
          {isLocked ? (
            <Lock className="w-3 h-3 text-green-500 flex-shrink-0" title="Columna bloqueada" />
          ) : (
            <div
              {...colAttrs}
              {...colListeners}
              className="cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 flex-shrink-0 p-0.5 -ml-0.5"
              title="Mover columna"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </div>
          )}

          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${column.color}`} />

          {editing ? (
            <div className="flex items-center gap-1 flex-1">
              <input
                ref={inputRef}
                value={labelDraft}
                onChange={e => setLabelDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') confirmEdit();
                  if (e.key === 'Escape') cancelEdit();
                }}
                className="input py-0.5 px-1.5 text-sm font-semibold flex-1 min-w-0"
              />
              <button onClick={confirmEdit} className="p-0.5 text-green-500 hover:text-green-600">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={cancelEdit} className="p-0.5 text-red-400 hover:text-red-500">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <>
              <span className="font-semibold text-sm text-gray-700 dark:text-gray-300 truncate">
                {column.label}
              </span>
              <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0">
                {tasks.length}
              </span>
            </>
          )}
        </div>

        {!editing && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover/col:opacity-100 transition-opacity flex-shrink-0">
            {!isLocked && (
              <>
                <button
                  onClick={startEdit}
                  title="Renombrar columna"
                  className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDelete(column.id)}
                  title="Eliminar columna"
                  className="p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            {onAddTask && (
              <button
                onClick={() => onAddTask(column.id)}
                title="Agregar tarea"
                className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Drop zone */}
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setDropRef}
          className={`flex-1 space-y-2 min-h-20 rounded-xl p-2 transition-all duration-150 ${
            isOver
              ? `bg-primary-50 dark:bg-primary-950/40 ring-2 ${column.ring} ring-inset ring-opacity-60`
              : 'bg-gray-100/60 dark:bg-gray-800/50'
          }`}
        >
          {tasks.map(task => (
            <SortableTaskCard
              key={task.id}
              task={task}
              onClick={() => onTaskClick(task)}
              onArchive={onArchiveTask}
            />
          ))}
          {tasks.length === 0 && (
            <p className="text-xs text-center text-gray-400 dark:text-gray-600 py-4 select-none">
              Arrastra aquí
            </p>
          )}
        </div>
      </SortableContext>

      {footer}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddColumnPanel
// ---------------------------------------------------------------------------
function AddColumnPanel({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[4]);
  const inputRef = useRef(null);

  const handleOpen = () => {
    setLabel('');
    setSelectedColor(COLOR_OPTIONS[4]);
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleAdd = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    onAdd({ label: trimmed, color: selectedColor.color, ring: selectedColor.ring });
    setOpen(false);
  };

  if (!open) {
    return (
      <div className="flex flex-col min-w-56 w-56 pt-0.5">
        <button
          onClick={handleOpen}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-primary-400 hover:text-primary-500 dark:hover:border-primary-500 dark:hover:text-primary-400 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Agregar columna
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-w-72 w-72">
      <div className="rounded-xl border-2 border-primary-400 bg-white dark:bg-gray-800 p-3 space-y-3 shadow-lg">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Nueva columna</p>
        <input
          ref={inputRef}
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleAdd();
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Nombre de la columna…"
          className="input py-1.5 text-sm w-full"
        />
        <div className="flex flex-wrap gap-2">
          {COLOR_OPTIONS.map(opt => (
            <button
              key={opt.color}
              title={opt.label}
              onClick={() => setSelectedColor(opt)}
              className={`w-5 h-5 rounded-full ${opt.color} transition-transform ${
                selectedColor.color === opt.color
                  ? 'scale-125 ring-2 ring-offset-1 ring-gray-500 dark:ring-gray-300'
                  : 'hover:scale-110'
              }`}
            />
          ))}
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button onClick={() => setOpen(false)} className="btn-secondary text-xs py-1 px-3">
            Cancelar
          </button>
          <button
            onClick={handleAdd}
            disabled={!label.trim()}
            className="btn-primary text-xs py-1 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Agregar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SortableTaskCard
// ---------------------------------------------------------------------------
function SortableTaskCard({ task, onClick, onArchive }) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: task.id, data: { type: 'task' } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard
        task={task}
        onClick={onClick}
        onArchive={onArchive ? () => onArchive(task) : null}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CompletedFooter — evita que la columna "Completado" se sature
// ---------------------------------------------------------------------------
function CompletedFooter({
  projectId, completedWindow, onWindowChange,
  hiddenCount, completedTotal, archivedCount, archiving, onArchiveOld,
}) {
  const archivableCount = completedWindow > 0 ? hiddenCount : completedTotal;

  return (
    <div className="mt-2 space-y-1.5">
      <select
        value={completedWindow}
        onChange={e => onWindowChange(parseInt(e.target.value, 10))}
        title="Cuánto historial mostrar en esta columna"
        className="input py-1 text-xs w-full"
      >
        {WINDOW_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {hiddenCount > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 px-0.5">
          {hiddenCount} completada{hiddenCount === 1 ? '' : 's'} anterior{hiddenCount === 1 ? '' : 'es'} sin mostrar
        </p>
      )}

      {onArchiveOld && archivableCount > 0 && (
        <button
          onClick={onArchiveOld}
          disabled={archiving}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded-lg
                     border border-dashed border-gray-300 dark:border-gray-600
                     text-gray-500 dark:text-gray-400
                     hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {archiving
            ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            : <Archive className="w-3.5 h-3.5" />
          }
          Archivar {archivableCount}
        </button>
      )}

      {archivedCount > 0 && (
        <Link
          to={`/projects/${projectId}/archive`}
          className="block text-center text-xs text-primary-600 dark:text-primary-400 hover:underline py-0.5"
        >
          Ver archivo ({archivedCount})
        </Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KanbanBoard
// ---------------------------------------------------------------------------
export default function KanbanBoard() {
  const { id: projectId } = useParams();
  const { user } = useAuth();
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [tasks, setTasks] = useState([]);
  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [miAcceso, setMiAcceso] = useState(null);
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState(null);
  const [activeColumnId, setActiveColumnId] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [newTaskStatus, setNewTaskStatus] = useState('pending');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [archivedCount, setArchivedCount] = useState(0);
  const [archiving, setArchiving] = useState(false);
  const [completedWindow, setCompletedWindow] = useState(() => {
    const saved = parseInt(localStorage.getItem(WINDOW_STORAGE_KEY(projectId)), 10);
    return WINDOW_OPTIONS.some(o => o.value === saved) ? saved : DEFAULT_WINDOW;
  });

  const tasksRef = useRef(tasks);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  const columnsRef = useRef(columns);
  useEffect(() => { columnsRef.current = columns; }, [columns]);

  const dragOriginRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Columnas: ahora vienen de la BD y son las mismas para todo el equipo.
  // Si este navegador todavía tiene la configuración vieja en localStorage
  // y el servidor no tiene ninguna, se migra una sola vez y se borra.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data } = await projectsAPI.getColumns(projectId);
        if (cancelled) return;

        const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY(projectId));
        if (data.is_default && legacyRaw) {
          try {
            const legacy = JSON.parse(legacyRaw);
            if (Array.isArray(legacy) && legacy.length) {
              const { data: saved } = await projectsAPI.saveColumns(projectId, toApiColumns(legacy));
              localStorage.removeItem(LEGACY_STORAGE_KEY(projectId));
              if (!cancelled) setColumns(fromApiColumns(saved.columns));
              return;
            }
          } catch { /* configuración local corrupta: se ignora */ }
        }

        // El servidor manda: la copia local ya no se usa
        if (legacyRaw) localStorage.removeItem(LEGACY_STORAGE_KEY(projectId));
        setColumns(fromApiColumns(data.columns));
      } catch {
        /* sin conexión con el servidor: se mantienen las columnas por defecto */
      }
    })();

    return () => { cancelled = true; };
  }, [projectId]);

  // Preferencia personal de cuánto historial mostrar en "Completado"
  useEffect(() => {
    localStorage.setItem(WINDOW_STORAGE_KEY(projectId), String(completedWindow));
  }, [completedWindow, projectId]);

  useEffect(() => {
    Promise.all([
      tasksAPI.getByProject(projectId),
      projectsAPI.getById(projectId),
      usersAPI.getAll(),
      projectsAPI.getLabels(projectId),
    ]).then(([t, p, _u, l]) => {
      setTasks(t.data);
      setProject(p.data);
      setMembers(p.data.members || []);
      setMiAcceso(p.data.mi_acceso || null);
      setLabels(l.data);
    }).catch(() => toast.error('Error al cargar tablero'))
      .finally(() => setLoading(false));

    tasksAPI.getArchivedCount(projectId)
      .then(({ data }) => setArchivedCount(data.count))
      .catch(() => { /* el contador es informativo, no bloquea el tablero */ });
  }, [projectId]);

  // Guarda la configuración de columnas para todo el equipo
  const persistColumns = useCallback(async (next) => {
    try {
      await projectsAPI.saveColumns(projectId, toApiColumns(next));
    } catch {
      toast.error('No se pudieron guardar las columnas');
    }
  }, [projectId]);

  // Lo decide el servidor (mi_acceso): antes, quien no era miembro del
  // proyecto veía los botones de edición
  const canEdit = Boolean(miAcceso?.escritura);

  const windowCutoff = useMemo(
    () => (completedWindow > 0 ? new Date(Date.now() - completedWindow * 24 * 60 * 60 * 1000) : null),
    [completedWindow]
  );

  const matchesFilters = useCallback((t) => {
    if (filterAssignee && t.assignee_id !== parseInt(filterAssignee)) return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    return true;
  }, [filterAssignee, filterPriority]);

  // Una tarjeta completada deja de mostrarse cuando su cierre cae fuera de
  // la ventana elegida. No se borra ni se archiva sola: solo se oculta.
  const isRecentlyCompleted = useCallback((t) => {
    if (!windowCutoff) return true;
    const closed = t.completed_at || t.updated_at;
    if (!closed) return true;
    return new Date(closed) >= windowCutoff;
  }, [windowCutoff]);

  const getColumnTasks = (status) =>
    tasks
      .filter(t => {
        if (t.status !== status) return false;
        if (!matchesFilters(t)) return false;
        if (status === COMPLETED_ID && !isRecentlyCompleted(t)) return false;
        return true;
      })
      .sort((a, b) => a.position - b.position);

  // Completadas fuera de la ventana → candidatas a archivar en bloque
  const hiddenCompleted = useMemo(
    () => tasks.filter(t =>
      t.status === COMPLETED_ID && matchesFilters(t) && !isRecentlyCompleted(t)
    ).length,
    [tasks, matchesFilters, isRecentlyCompleted]
  );
  const completedTotal = useMemo(
    () => tasks.filter(t => t.status === COMPLETED_ID).length,
    [tasks]
  );

  // --- Archivado ---

  const handleArchiveTask = useCallback(async (task) => {
    try {
      await tasksAPI.archive(projectId, task.id);
      setTasks(prev => prev.filter(t => t.id !== task.id));
      setArchivedCount(c => c + 1);
      toast.success('Tarea archivada');
    } catch {
      toast.error('Error al archivar la tarea');
    }
  }, [projectId]);

  const handleArchiveOld = async () => {
    const days = completedWindow;
    const pregunta = days > 0
      ? `¿Archivar las tareas completadas hace más de ${days} días?`
      : '¿Archivar todas las tareas completadas?';
    if (!confirm(`${pregunta}\n\nNo se elimina nada: podrás verlas y restaurarlas desde la vista de Archivo.`)) return;

    setArchiving(true);
    try {
      const { data } = await tasksAPI.archiveCompleted(projectId, days);
      if (data.archived > 0) {
        const { data: fresh } = await tasksAPI.getByProject(projectId);
        setTasks(fresh);
        setArchivedCount(c => c + data.archived);
        toast.success(`${data.archived} tarea(s) archivada(s)`);
      } else {
        toast.info('No hay tareas para archivar');
      }
    } catch {
      toast.error('Error al archivar las tareas');
    } finally {
      setArchiving(false);
    }
  };

  // --- Column management ---
  // Cada cambio se guarda en la BD: el tablero es el mismo para todo el equipo.

  const handleRenameColumn = useCallback((colId, newLabel) => {
    const next = columnsRef.current.map(c => c.id === colId ? { ...c, label: newLabel } : c);
    setColumns(next);
    persistColumns(next);
  }, [persistColumns]);

  const handleDeleteColumn = useCallback((colId) => {
    if (colId === COMPLETED_ID) return;
    const tasksInCol = tasksRef.current.filter(t => t.status === colId);
    if (tasksInCol.length > 0) {
      toast.warning(
        `Mueve o elimina las ${tasksInCol.length} tarea(s) de esta columna antes de eliminarla`
      );
      return;
    }
    if (!confirm('¿Eliminar esta columna?')) return;
    const next = columnsRef.current.filter(c => c.id !== colId);
    setColumns(next);
    persistColumns(next);
  }, [persistColumns]);

  const handleAddColumn = useCallback(({ label, color, ring }) => {
    const id = `col_${Date.now()}`;
    const newCol = { id, label, color, ring };
    // Insert before the 'completed' column so it stays last
    const prev = columnsRef.current;
    const completedIdx = prev.findIndex(c => c.id === COMPLETED_ID);
    const next = [...prev];
    if (completedIdx === -1) next.push(newCol);
    else next.splice(completedIdx, 0, newCol);

    setColumns(next);
    persistColumns(next);
  }, [persistColumns]);

  // --- Drag handlers ---

  const handleDragStart = useCallback(({ active }) => {
    const type = active.data.current?.type;
    if (type === 'column') {
      setActiveColumnId(active.data.current.columnId);
      setActiveTask(null);
    } else {
      const task = tasksRef.current.find(t => t.id === active.id);
      setActiveTask(task || null);
      setActiveColumnId(null);
      dragOriginRef.current = task?.status ?? null;
    }
  }, []);

  const handleDragOver = useCallback(({ active, over }) => {
    if (active.data.current?.type === 'column') return;
    if (!over) return;

    const current = tasksRef.current;
    const activeT = current.find(t => t.id === active.id);
    if (!activeT) return;

    const overTask = current.find(t => t.id === over.id);
    const targetStatus = overTask ? overTask.status : String(over.id);

    if (!columnsRef.current.some(c => c.id === targetStatus)) return;
    if (activeT.status === targetStatus) return;

    setTasks(prev =>
      prev.map(t => t.id === active.id ? { ...t, status: targetStatus } : t)
    );
  }, []);

  const handleDragEnd = useCallback(async ({ active, over }) => {
    const type = active.data.current?.type;

    // --- Column reorder ---
    if (type === 'column') {
      setActiveColumnId(null);
      if (!over) return;
      const activeColId = active.data.current.columnId;
      const overColId = over.data.current?.columnId
        ?? (String(over.id).startsWith('col_') ? String(over.id).replace('col_', '') : null);
      if (!overColId || activeColId === overColId) return;

      const prev = columnsRef.current;
      const oldIdx = prev.findIndex(c => c.id === activeColId);
      const newIdx = prev.findIndex(c => c.id === overColId);
      if (oldIdx === -1 || newIdx === -1) return;

      const next = arrayMove(prev, oldIdx, newIdx);
      setColumns(next);
      persistColumns(next);
      return;
    }

    // --- Task move ---
    const movedTask = tasksRef.current.find(t => t.id === active.id);
    const originalStatus = dragOriginRef.current;
    dragOriginRef.current = null;
    setActiveTask(null);

    if (!movedTask || movedTask.status === originalStatus) return;

    const movingToCompleted = movedTask.status === COMPLETED_ID;
    const updatePayload = {
      status: movedTask.status,
      ...(movingToCompleted ? { progress: 100 } : {}),
    };

    try {
      await tasksAPI.update(projectId, active.id, updatePayload);
      // Reflejar la fecha de cierre que acaba de sellar el servidor, para que
      // la tarjeta no desaparezca de la columna por la ventana de tiempo.
      setTasks(prev =>
        prev.map(t => t.id === active.id
          ? {
              ...t,
              ...(movingToCompleted
                ? { progress: 100, completed_at: new Date().toISOString() }
                : { completed_at: null }),
            }
          : t)
      );
    } catch {
      setTasks(prev =>
        prev.map(t => t.id === active.id ? { ...t, status: originalStatus } : t)
      );
      toast.error('Error al mover tarea');
    }
  }, [projectId, persistColumns]);

  const handleDragCancel = useCallback(() => {
    const originalStatus = dragOriginRef.current;
    const activeId = activeTask?.id;
    dragOriginRef.current = null;
    setActiveTask(null);
    setActiveColumnId(null);
    if (activeId && originalStatus) {
      setTasks(prev =>
        prev.map(t => t.id === activeId ? { ...t, status: originalStatus } : t)
      );
    }
  }, [activeTask]);

  // --- Task CRUD ---

  const handleAddTask = (status) => {
    setNewTaskStatus(status);
    setSelectedTask(null);
    setShowTaskModal(true);
  };

  const handleTaskClick = async (task) => {
    try {
      const { data } = await tasksAPI.getById(projectId, task.id);
      setSelectedTask(data);
      setShowTaskModal(true);
    } catch { toast.error('Error al cargar tarea'); }
  };

  // Los enlaces de los correos llegan con ?tarea=ID: se abre esa tarea
  // en cuanto termina de cargar el tablero, y se limpia la URL
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const tareaId = parseInt(searchParams.get('tarea'), 10);
    if (loading || !tareaId) return;
    handleTaskClick({ id: tareaId });
    setSearchParams({}, { replace: true });
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTaskSave = async (data) => {
    try {
      if (selectedTask?.id) {
        const { data: updated } = await tasksAPI.update(projectId, selectedTask.id, data);
        setTasks(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
        toast.success('Tarea actualizada');
      } else {
        const { data: created } = await tasksAPI.create(projectId, { ...data, status: newTaskStatus });
        setTasks(prev => [...prev, created]);
        toast.success('Tarea creada');
      }
      setShowTaskModal(false);
      setSelectedTask(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar');
    }
  };

  const handleTaskDelete = async (taskId) => {
    if (!confirm('¿Eliminar esta tarea?')) return;
    try {
      await tasksAPI.delete(projectId, taskId);
      setTasks(prev => prev.filter(t => t.id !== taskId));
      setShowTaskModal(false);
      toast.success('Tarea eliminada');
    } catch { toast.error('Error al eliminar'); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const columnSortIds = columns.map(c => `col_${c.id}`);
  const activeColumn = activeColumnId ? columns.find(c => c.id === activeColumnId) : null;

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <ViewNavBar projectName={project?.name} projectColor={project?.color} />

      {/* Filters */}
      <div className="flex items-center justify-end mb-5 flex-wrap gap-2">
        <Filter className="w-4 h-4 text-gray-400" />
        <select
          value={filterAssignee}
          onChange={e => setFilterAssignee(e.target.value)}
          className="input py-1.5 w-auto text-sm"
        >
          <option value="">Todos los responsables</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value)}
          className="input py-1.5 w-auto text-sm"
        >
          <option value="">Todas las prioridades</option>
          <option value="low">Baja</option>
          <option value="medium">Media</option>
          <option value="high">Alta</option>
          <option value="critical">Crítica</option>
        </select>
        {canEdit && (
          <button onClick={() => handleAddTask('pending')} className="btn-primary text-sm py-1.5">
            <Plus className="w-4 h-4" /> Nueva Tarea
          </button>
        )}
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto pb-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext items={columnSortIds} strategy={horizontalListSortingStrategy}>
            <div className="flex gap-4 min-h-full h-full items-start">
              {columns.map(col => (
                <DroppableColumn
                  key={col.id}
                  column={col}
                  tasks={getColumnTasks(col.id)}
                  activeId={activeTask?.id ?? null}
                  onAddTask={canEdit ? handleAddTask : null}
                  onTaskClick={handleTaskClick}
                  onRename={handleRenameColumn}
                  onDelete={handleDeleteColumn}
                  onArchiveTask={canEdit && col.id === COMPLETED_ID ? handleArchiveTask : null}
                  footer={col.id === COMPLETED_ID ? (
                    <CompletedFooter
                      projectId={projectId}
                      completedWindow={completedWindow}
                      onWindowChange={setCompletedWindow}
                      hiddenCount={hiddenCompleted}
                      completedTotal={completedTotal}
                      archivedCount={archivedCount}
                      archiving={archiving}
                      onArchiveOld={canEdit ? handleArchiveOld : null}
                    />
                  ) : null}
                />
              ))}
              <AddColumnPanel onAdd={handleAddColumn} />
            </div>
          </SortableContext>

          <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
            {activeTask && (
              <div className="rotate-2 scale-105 shadow-2xl ring-2 ring-primary-400 rounded-xl">
                <TaskCard task={activeTask} />
              </div>
            )}
            {activeColumn && (
              <div className="flex flex-col min-w-72 w-72 opacity-90 shadow-2xl ring-2 ring-primary-400 rounded-xl bg-white dark:bg-gray-900 p-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${activeColumn.color}`} />
                  <span className="font-semibold text-sm text-gray-700 dark:text-gray-300">
                    {activeColumn.label}
                  </span>
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {showTaskModal && (
        <Modal
          title={selectedTask?.id ? 'Editar Tarea' : 'Nueva Tarea'}
          onClose={() => { setShowTaskModal(false); setSelectedTask(null); }}
          size="xl"
        >
          <TaskModal
            task={selectedTask}
            projectId={projectId}
            members={members}
            labels={labels}
            columnOptions={columns.map(c => ({ value: c.id, label: c.label }))}
            readOnly={!canEdit}
            onSave={canEdit ? handleTaskSave : undefined}
            onDelete={canEdit && selectedTask?.id ? () => handleTaskDelete(selectedTask.id) : null}
            onCancel={() => { setShowTaskModal(false); setSelectedTask(null); }}
            onCommentAdded={(_, comment) => {
              setSelectedTask(prev =>
                prev ? { ...prev, comments: [...(prev.comments || []), comment] } : prev
              );
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
