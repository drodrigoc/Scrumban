import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  DndContext, DragOverlay, closestCenter,
  PointerSensor, useSensor, useSensors,
  useDroppable,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { tasksAPI, projectsAPI, usersAPI } from '../services/api';
import { Plus, Filter } from 'lucide-react';
import TaskCard from '../components/tasks/TaskCard';
import TaskModal from '../components/tasks/TaskModal';
import Modal from '../components/common/Modal';
import ViewNavBar from '../components/common/ViewNavBar';

const COLUMNS = [
  { id: 'pending',     label: 'Pendiente',   color: 'bg-gray-400',   ring: 'ring-gray-400' },
  { id: 'in_progress', label: 'En Proceso',  color: 'bg-blue-500',   ring: 'ring-blue-400' },
  { id: 'in_review',   label: 'En Revisión', color: 'bg-amber-500',  ring: 'ring-amber-400' },
  { id: 'completed',   label: 'Completado',  color: 'bg-green-500',  ring: 'ring-green-400' },
];

function DroppableColumn({ column, tasks, activeId, onAddTask, onTaskClick }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  // Include the actively-dragged task id so SortableContext knows about it
  // when it hovers over this column (prevents layout jump)
  const itemIds = tasks.map(t => t.id);
  if (activeId && !itemIds.includes(activeId)) itemIds.push(activeId);

  return (
    <div className="flex flex-col min-w-72 w-72">
      {/* Column header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${column.color}`} />
          <span className="font-semibold text-sm text-gray-700 dark:text-gray-300">{column.label}</span>
          <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-medium px-1.5 py-0.5 rounded-full">
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => onAddTask(column.id)}
          className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Drop zone */}
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
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
            />
          ))}
          {tasks.length === 0 && (
            <p className="text-xs text-center text-gray-400 dark:text-gray-600 py-4 select-none">
              Arrastra aquí
            </p>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableTaskCard({ task, onClick }) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,       // hide original while ghost is shown
    cursor: isDragging ? 'grabbing' : 'grab',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} onClick={onClick} />
    </div>
  );
}

export default function KanbanBoard() {
  const { id: projectId } = useParams();
  const [tasks, setTasks] = useState([]);
  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [newTaskStatus, setNewTaskStatus] = useState('pending');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  // Ref to always read the latest tasks inside async handlers
  const tasksRef = useRef(tasks);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  // Track original status to detect real moves and enable rollback
  const dragOriginRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

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
      setLabels(l.data);
    }).catch(() => toast.error('Error al cargar tablero'))
      .finally(() => setLoading(false));
  }, [projectId]);

  const getColumnTasks = (status) =>
    tasks
      .filter(t => {
        if (t.status !== status) return false;
        if (filterAssignee && t.assignee_id !== parseInt(filterAssignee)) return false;
        if (filterPriority && t.priority !== filterPriority) return false;
        return true;
      })
      .sort((a, b) => a.position - b.position);

  // --- Drag handlers ---

  const handleDragStart = useCallback(({ active }) => {
    const task = tasksRef.current.find(t => t.id === active.id);
    setActiveTask(task || null);
    dragOriginRef.current = task?.status ?? null;
  }, []);

  const handleDragOver = useCallback(({ active, over }) => {
    if (!over) return;
    const current = tasksRef.current;
    const activeT = current.find(t => t.id === active.id);
    if (!activeT) return;

    // over.id is either a column-id (string) or a task id (number)
    const overTask = current.find(t => t.id === over.id);
    const targetStatus = overTask ? overTask.status : String(over.id);

    if (!COLUMNS.some(c => c.id === targetStatus)) return;
    if (activeT.status === targetStatus) return;

    // Optimistic update – move card to target column immediately
    setTasks(prev =>
      prev.map(t => t.id === active.id ? { ...t, status: targetStatus } : t)
    );
  }, []);

  const handleDragEnd = useCallback(async ({ active }) => {
    const movedTask = tasksRef.current.find(t => t.id === active.id);
    const originalStatus = dragOriginRef.current;
    dragOriginRef.current = null;
    setActiveTask(null);

    if (!movedTask || movedTask.status === originalStatus) return;

    try {
      await tasksAPI.update(projectId, active.id, { status: movedTask.status });
    } catch {
      // Rollback to original status
      setTasks(prev =>
        prev.map(t => t.id === active.id ? { ...t, status: originalStatus } : t)
      );
      toast.error('Error al mover tarea');
    }
  }, [projectId]);

  const handleDragCancel = useCallback(() => {
    const originalStatus = dragOriginRef.current;
    const activeId = activeTask?.id;
    dragOriginRef.current = null;
    setActiveTask(null);
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
        <button onClick={() => handleAddTask('pending')} className="btn-primary text-sm py-1.5">
          <Plus className="w-4 h-4" /> Nueva Tarea
        </button>
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
          <div className="flex gap-4 min-h-full h-full">
            {COLUMNS.map(col => (
              <DroppableColumn
                key={col.id}
                column={col}
                tasks={getColumnTasks(col.id)}
                activeId={activeTask?.id ?? null}
                onAddTask={handleAddTask}
                onTaskClick={handleTaskClick}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
            {activeTask && (
              <div className="rotate-2 scale-105 shadow-2xl ring-2 ring-primary-400 rounded-xl">
                <TaskCard task={activeTask} />
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
            onSave={handleTaskSave}
            onDelete={selectedTask?.id ? () => handleTaskDelete(selectedTask.id) : null}
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
