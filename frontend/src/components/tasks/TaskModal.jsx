import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { tasksAPI, projectsAPI, sgcAPI } from '../../services/api';
import {
  Trash2, Send, Paperclip, Clock, Tag, User, Calendar,
  AlertTriangle, CheckSquare, Plus, X, Check, ShieldCheck,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const priorityOptions = [
  { value: 'low',      label: 'Baja' },
  { value: 'medium',   label: 'Media' },
  { value: 'high',     label: 'Alta' },
  { value: 'critical', label: 'Crítica' },
];

const DEFAULT_STATUS_OPTIONS = [
  { value: 'pending',     label: 'Pendiente' },
  { value: 'in_progress', label: 'En Proceso' },
  { value: 'in_review',   label: 'En Revisión' },
  { value: 'completed',   label: 'Completada' },
];

const historyFieldLabels = {
  status: 'estado', priority: 'prioridad', assignee: 'responsable',
  title: 'título', created: 'creó la tarea',
};

// Colores predefinidos para nuevas etiquetas
const PRESET_COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#EF4444',
  '#F97316', '#EAB308', '#22C55E', '#14B8A6',
  '#3B82F6', '#0EA5E9', '#64748B', '#78716C',
];

function AttachmentsTab({ task, projectId, readOnly }) {
  const [attachments, setAttachments] = useState(task?.attachments || []);

  return (
    <div className="space-y-3">
      {attachments.length === 0 && (
        <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">Sin archivos adjuntos</p>
      )}
      {attachments.map(a => (
        <div key={a.id} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{a.filename}</p>
            <p className="text-xs text-gray-400">Por {a.uploaded_by_name}</p>
          </div>
          <a
            href={`/uploads/tasks/${a.filepath}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex-shrink-0"
          >
            Descargar
          </a>
          {!readOnly && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await tasksAPI.deleteAttachment(projectId, task.id, a.id);
                  setAttachments(prev => prev.filter(x => x.id !== a.id));
                  toast.success('Archivo eliminado');
                } catch {
                  toast.error('Error al eliminar archivo');
                }
              }}
              className="p-0.5 text-gray-400 hover:text-red-500 flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <label className="flex items-center gap-2 p-3 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:border-primary-300 dark:hover:border-primary-600 hover:bg-primary-50/30 dark:hover:bg-primary-900/10 transition-colors">
          <Paperclip className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-500 dark:text-gray-400">Adjuntar archivo</span>
          <input
            type="file"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files[0];
              if (!file) return;
              const formData = new FormData();
              formData.append('file', file);
              try {
                const { data } = await tasksAPI.uploadAttachment(projectId, task.id, formData);
                setAttachments(prev => [...prev, { ...data, uploaded_by_name: 'Tú' }]);
                toast.success('Archivo adjuntado');
              } catch {
                toast.error('Error al adjuntar archivo');
              }
              e.target.value = '';
            }}
          />
        </label>
      )}
    </div>
  );
}

export default function TaskModal({ task, projectId, members, labels: initialLabels, columnOptions, onSave, onDelete, onCancel, onCommentAdded, onLabelCreated, readOnly = false }) {
  const statusOptions = columnOptions?.length ? columnOptions : DEFAULT_STATUS_OPTIONS;
  const [form, setForm] = useState({
    title:       task?.title || '',
    description: task?.description || '',
    assignee_id: task?.assignee_id || '',
    start_date:  task?.start_date ? task.start_date.split('T')[0] : '',
    due_date:    task?.due_date   ? task.due_date.split('T')[0]   : '',
    priority:    task?.priority   || 'medium',
    status:      task?.status     || 'pending',
    progress:    task?.progress   || 0,
    label_ids:   task?.labels?.map(l => l.id) || [],
    sgc_ids:     task?.sgc_evidencias?.map(e => e.id) || [],
    costo:       task?.costo != null ? String(task.costo) : '',
  });

  // SGC state
  const [sgcEvidencias, setSgcEvidencias] = useState([]);
  const [sgcLinkedIds, setSgcLinkedIds]   = useState(task?.sgc_evidencias?.map(e => e.id) || []);
  const [sgcSearch, setSgcSearch]         = useState('');
  const [sgcOpen, setSgcOpen]             = useState(false);
  const [sgcSaving, setSgcSaving]         = useState(false);
  const [sgcAttachments, setSgcAttachments] = useState(task?.sgc_attachments || []);
  const sgcSearchRef = useRef(null);

  // Local copy of labels — grows when user creates a new one inline
  const [localLabels, setLocalLabels] = useState(initialLabels || []);

  // Inline label creation state
  const [showLabelForm, setShowLabelForm]   = useState(false);
  const [newLabelName, setNewLabelName]     = useState('');
  const [newLabelColor, setNewLabelColor]   = useState(PRESET_COLORS[0]);
  const [savingLabel, setSavingLabel]       = useState(false);
  const labelNameRef = useRef(null);
  const [comment, setComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [saving, setSaving] = useState(false);

  // Checklist state
  const [checklist, setChecklist] = useState(null);   // null = not loaded
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const [addingItem, setAddingItem] = useState(false);

  // Load SGC evidencias on mount
  useEffect(() => {
    sgcAPI.getAll()
      .then(({ data }) => setSgcEvidencias(data))
      .catch(() => {}); // silently fail — SGC is optional
  }, []);

  // Load checklist lazily when tab is first opened
  useEffect(() => {
    if (activeTab === 'checklist' && task?.id && checklist === null) {
      setLoadingChecklist(true);
      tasksAPI.getChecklist(projectId, task.id)
        .then(({ data }) => setChecklist(data))
        .catch(() => { toast.error('Error al cargar checklist'); setChecklist([]); })
        .finally(() => setLoadingChecklist(false));
    }
  }, [activeTab, task?.id, projectId, checklist]);

  const checklistDone  = checklist?.filter(i => i.is_completed).length ?? 0;
  const checklistTotal = checklist?.length ?? 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('El título es requerido'); return; }
    setSaving(true);
    try {
      await onSave({
        ...form,
        assignee_id: form.assignee_id || null,
        start_date:  form.start_date  || null,
        due_date:    form.due_date    || null,
        costo:       form.costo !== '' ? parseFloat(form.costo) : null,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleComment = async () => {
    if (!comment.trim()) return;
    setSubmittingComment(true);
    try {
      const { data } = await tasksAPI.addComment(projectId, task.id, comment.trim());
      onCommentAdded?.(task.id, data);
      setComment('');
    } catch {
      toast.error('Error al agregar comentario');
    } finally {
      setSubmittingComment(false);
    }
  };

  const toggleSgc = async (evidenciaId) => {
    const newIds = sgcLinkedIds.includes(evidenciaId)
      ? sgcLinkedIds.filter(id => id !== evidenciaId)
      : [...sgcLinkedIds, evidenciaId];
    setSgcLinkedIds(newIds);
    setSgcSaving(true);
    try {
      await tasksAPI.update(projectId, task.id, { sgc_ids: newIds });
    } catch {
      setSgcLinkedIds(sgcLinkedIds); // rollback
      toast.error('Error al actualizar SGC');
    } finally {
      setSgcSaving(false);
    }
  };

  const sgcFiltered = sgcEvidencias.filter(e =>
    e.evidencia.toLowerCase().includes(sgcSearch.toLowerCase()) ||
    e.nombre_evidencia.toLowerCase().includes(sgcSearch.toLowerCase()) ||
    e.dimension.toLowerCase().includes(sgcSearch.toLowerCase()) ||
    e.criterio.toLowerCase().includes(sgcSearch.toLowerCase())
  );

  const toggleLabel = (labelId) => {
    setForm(prev => ({
      ...prev,
      label_ids: prev.label_ids.includes(labelId)
        ? prev.label_ids.filter(id => id !== labelId)
        : [...prev.label_ids, labelId],
    }));
  };

  const handleCreateLabel = async () => {
    if (!newLabelName.trim()) return;
    setSavingLabel(true);
    try {
      const { data: created } = await projectsAPI.createLabel(projectId, {
        name:  newLabelName.trim(),
        color: newLabelColor,
      });
      setLocalLabels(prev => [...prev, created]);
      // Auto-select the new label
      setForm(prev => ({ ...prev, label_ids: [...prev.label_ids, created.id] }));
      onLabelCreated?.(created);
      setNewLabelName('');
      setNewLabelColor(PRESET_COLORS[0]);
      setShowLabelForm(false);
    } catch {
      toast.error('Error al crear etiqueta');
    } finally {
      setSavingLabel(false);
    }
  };

  // Checklist handlers
  const handleAddItem = async () => {
    if (!newItemText.trim()) return;
    setAddingItem(true);
    try {
      const { data } = await tasksAPI.addChecklistItem(projectId, task.id, newItemText.trim());
      setChecklist(prev => [...(prev || []), data]);
      setNewItemText('');
    } catch {
      toast.error('Error al agregar ítem');
    } finally {
      setAddingItem(false);
    }
  };

  const handleToggleItem = async (item) => {
    const optimistic = checklist.map(i =>
      i.id === item.id ? { ...i, is_completed: !i.is_completed } : i
    );
    setChecklist(optimistic);
    try {
      await tasksAPI.updateChecklistItem(projectId, task.id, item.id, { is_completed: !item.is_completed });
    } catch {
      setChecklist(checklist);
      toast.error('Error al actualizar ítem');
    }
  };

  const handleDeleteItem = async (itemId) => {
    setChecklist(prev => prev.filter(i => i.id !== itemId));
    try {
      await tasksAPI.deleteChecklistItem(projectId, task.id, itemId);
    } catch {
      toast.error('Error al eliminar ítem');
    }
  };

  const tabs = [
    { id: 'details',  label: 'Detalles' },
    ...(task?.id ? [
      {
        id: 'checklist',
        label: checklistTotal > 0
          ? `Checklist (${checklistDone}/${checklistTotal})`
          : 'Checklist',
      },
      { id: 'sgc',         label: `SGC${sgcLinkedIds.length ? ` (${sgcLinkedIds.length})` : ''}` },
      { id: 'comments',    label: `Comentarios${task.comments?.length ? ` (${task.comments.length})` : ''}` },
      { id: 'history',     label: 'Historial' },
      { id: 'attachments', label: 'Archivos' },
    ] : []),
  ];

  return (
    <div className="flex flex-col gap-0 min-h-[520px]">
      {/* Tabs */}
      {task?.id && (
        <div className="flex border-b border-gray-100 dark:border-gray-700 -mx-5 px-5 mb-4 gap-1 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`pb-2 px-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === t.id
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── DETAILS ── */}
      {activeTab === 'details' && (
        <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset disabled={readOnly} className="contents">

          <div>
            <label className="label">Título *</label>
            <input type="text" className="input" value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })} required />
          </div>

          <div>
            <label className="label">Descripción</label>
            <textarea className="input min-h-20 resize-none" value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })} rows={3} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label flex items-center gap-1"><User className="w-3.5 h-3.5" /> Responsable</label>
              <select className="input" value={form.assignee_id}
                onChange={e => setForm({ ...form, assignee_id: e.target.value })}>
                <option value="">Sin asignar</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Prioridad</label>
              <select className="input" value={form.priority}
                onChange={e => setForm({ ...form, priority: e.target.value })}>
                {priorityOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Fecha inicio</label>
              <input type="date" className="input" value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <label className="label flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Fecha límite</label>
              <input type="date" className="input" value={form.due_date}
                onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Estado</label>
              <select className="input" value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value })}>
                {statusOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Progreso: {form.progress}%</label>
              <input
                type="range" min="0" max="100" step="5" value={form.progress}
                onChange={e => setForm({ ...form, progress: parseInt(e.target.value) })}
                className="w-full mt-2 accent-primary-600"
              />
            </div>
          </div>

          <div>
            <label className="label flex items-center gap-1">
              <span className="text-gray-400 text-sm font-medium">$</span> Costo (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium select-none">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input pl-7"
                placeholder="0.00"
                value={form.costo}
                onChange={e => setForm({ ...form, costo: e.target.value })}
              />
            </div>
          </div>

          {/* ── Etiquetas ── */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label flex items-center gap-1 mb-0">
                <Tag className="w-3.5 h-3.5" /> Etiquetas
              </label>
              <button
                type="button"
                onClick={() => { setShowLabelForm(v => !v); setTimeout(() => labelNameRef.current?.focus(), 50); }}
                className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
              >
                <Plus className="w-3 h-3" /> Nueva
              </button>
            </div>

            {/* Inline label creator */}
            {showLabelForm && (
              <div className="mb-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
                <input
                  ref={labelNameRef}
                  type="text"
                  className="input text-sm py-1.5"
                  placeholder="Nombre de la etiqueta…"
                  value={newLabelName}
                  onChange={e => setNewLabelName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleCreateLabel()}
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">Color:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c} type="button"
                        onClick={() => setNewLabelColor(c)}
                        className={`w-5 h-5 rounded-full transition-transform ${newLabelColor === c ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : 'hover:scale-110'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary text-xs py-1 flex-1"
                    onClick={() => { setShowLabelForm(false); setNewLabelName(''); }}>
                    Cancelar
                  </button>
                  <button type="button" className="btn-primary text-xs py-1 flex-1"
                    disabled={savingLabel || !newLabelName.trim()}
                    onClick={handleCreateLabel}>
                    {savingLabel
                      ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                      : 'Crear'
                    }
                  </button>
                </div>
              </div>
            )}

            {/* Label pills */}
            {localLabels.length === 0 && !showLabelForm ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                No hay etiquetas. Haz clic en <span className="font-medium">Nueva</span> para crear una.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 mt-1">
                {localLabels.map(l => (
                  <button
                    key={l.id} type="button" onClick={() => toggleLabel(l.id)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all font-medium ${
                      form.label_ids.includes(l.id)
                        ? 'border-transparent'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                    }`}
                    style={form.label_ids.includes(l.id) ? {
                      backgroundColor: l.color + '30', color: l.color, borderColor: l.color,
                    } : {}}
                  >
                    {form.label_ids.includes(l.id) && <Check className="inline w-2.5 h-2.5 mr-1" />}
                    {l.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          </fieldset>

          <div className="flex gap-2 pt-2">
            {readOnly ? (
              <button type="button" className="btn-secondary flex-1" onClick={onCancel}>Cerrar</button>
            ) : (
              <>
                <button type="button" className="btn-secondary flex-1" onClick={onCancel}>Cancelar</button>
                {onDelete && (
                  <button type="button" className="btn-danger px-3" onClick={onDelete}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : 'Guardar'
                  }
                </button>
              </>
            )}
          </div>
        </form>
      )}

      {/* ── CHECKLIST ── */}
      {/* ── SGC ── */}
      {activeTab === 'sgc' && task?.id && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary-500 dark:text-primary-400" />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Sistema de Gestión de la Calidad</span>
            </div>
            {sgcSaving && (
              <div className="w-3.5 h-3.5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            )}
          </div>

          {/* Chips de evidencias vinculadas */}
          {sgcLinkedIds.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {sgcEvidencias
                .filter(e => sgcLinkedIds.includes(e.id))
                .map(e => (
                  <span
                    key={e.id}
                    className="inline-flex items-center gap-1.5 text-xs bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800 px-2.5 py-1.5 rounded-full font-medium"
                  >
                    <span className="font-mono font-bold">{e.evidencia}</span>
                    <span className="text-primary-400 dark:text-primary-500">·</span>
                    <span className="max-w-[150px] truncate">{e.nombre_evidencia}</span>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => toggleSgc(e.id)}
                        className="ml-0.5 hover:text-primary-900 dark:hover:text-primary-100 flex-shrink-0"
                        title="Desvincular"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))
              }
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-2">
              {readOnly ? 'Sin evidencias vinculadas.' : 'Sin evidencias vinculadas. Usa el buscador para agregar.'}
            </p>
          )}

          {/* Buscador — solo en modo edición */}
          {!readOnly && <div className="relative pt-1 border-t border-gray-100 dark:border-gray-700">
            <input
              ref={sgcSearchRef}
              type="text"
              className="input text-sm py-1.5 pr-8 mt-2"
              placeholder="Buscar evidencia por código, nombre, dimensión o criterio…"
              value={sgcSearch}
              onChange={e => { setSgcSearch(e.target.value); setSgcOpen(true); }}
              onFocus={() => setSgcOpen(true)}
              onBlur={() => setTimeout(() => setSgcOpen(false), 150)}
            />
            {sgcSearch && (
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => setSgcSearch('')}
                className="absolute right-2 top-1/2 translate-y-0.5 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {sgcOpen && sgcFiltered.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                {sgcFiltered.map(e => {
                  const linked = sgcLinkedIds.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onMouseDown={ev => ev.preventDefault()}
                      onClick={() => { toggleSgc(e.id); setSgcSearch(''); }}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${linked ? 'bg-primary-50 dark:bg-primary-900/30' : ''}`}
                    >
                      <span className="font-mono text-xs font-bold text-primary-600 dark:text-primary-400 w-14 flex-shrink-0">{e.evidencia}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{e.nombre_evidencia}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">{e.dimension} · {e.criterio}</p>
                      </div>
                      {linked && <Check className="w-3.5 h-3.5 text-primary-500 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
            {sgcOpen && sgcSearch && sgcFiltered.length === 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg px-3 py-3 text-sm text-gray-400 dark:text-gray-500">
                Sin resultados para "{sgcSearch}"
              </div>
            )}
          </div>}

          {!readOnly && sgcEvidencias.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              No hay evidencias SGC registradas. El administrador debe crearlas primero.
            </p>
          )}

          {/* Archivos SGC */}
          <div className="pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Archivos de evidencia SGC
            </p>
            {sgcAttachments.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500">Sin archivos adjuntos</p>
            )}
            {sgcAttachments.map(a => (
              <div key={a.id} className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-900/40">
                <Paperclip className="w-4 h-4 text-green-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{a.filename}</p>
                  <p className="text-xs text-gray-400">Por {a.uploaded_by_name}</p>
                </div>
                <a
                  href={`/uploads/sgc/${a.filepath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-green-600 dark:text-green-400 hover:underline flex-shrink-0"
                >
                  Descargar
                </a>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await tasksAPI.deleteSGCAttachment(projectId, task.id, a.id);
                        setSgcAttachments(prev => prev.filter(x => x.id !== a.id));
                        toast.success('Archivo eliminado');
                      } catch {
                        toast.error('Error al eliminar archivo');
                      }
                    }}
                    className="p-0.5 text-gray-400 hover:text-red-500 flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {!readOnly && (
              <label className="flex items-center gap-2 p-2.5 border-2 border-dashed border-green-200 dark:border-green-800 rounded-lg cursor-pointer hover:border-green-400 dark:hover:border-green-600 hover:bg-green-50/50 dark:hover:bg-green-900/10 transition-colors">
                <Paperclip className="w-4 h-4 text-green-400" />
                <span className="text-sm text-gray-500 dark:text-gray-400">Adjuntar archivo de evidencia</span>
                <input
                  type="file"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const formData = new FormData();
                    formData.append('file', file);
                    try {
                      const { data } = await tasksAPI.uploadSGCAttachment(projectId, task.id, formData);
                      setSgcAttachments(prev => [...prev, { ...data, uploaded_by_name: 'Tú' }]);
                      toast.success('Archivo adjuntado');
                    } catch {
                      toast.error('Error al adjuntar archivo');
                    }
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>
        </div>
      )}

      {activeTab === 'checklist' && task?.id && (
        <div className="space-y-3">
          {/* Progress bar */}
          {checklistTotal > 0 && (
            <div>
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                <span className="flex items-center gap-1">
                  <CheckSquare className="w-3.5 h-3.5" /> Checklist
                </span>
                <span>{checklistDone}/{checklistTotal} completados</span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full bg-green-500 transition-all duration-300"
                  style={{ width: `${checklistTotal > 0 ? (checklistDone / checklistTotal) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Items */}
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {loadingChecklist ? (
              <div className="flex justify-center py-6">
                <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : checklist?.length === 0 ? (
              <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">
                Sin ítems aún. Agrega el primero abajo.
              </p>
            ) : checklist?.map(item => (
              <div key={item.id} className="flex items-center gap-2 group py-1 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                <button
                  onClick={() => handleToggleItem(item)}
                  className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    item.is_completed
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
                  }`}
                >
                  {item.is_completed && <Check className="w-3 h-3" />}
                </button>
                <span className={`flex-1 text-sm ${
                  item.is_completed
                    ? 'line-through text-gray-400 dark:text-gray-500'
                    : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {item.text}
                </span>
                <button
                  onClick={() => handleDeleteItem(item.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Add item */}
          {!readOnly && <div className="flex gap-2 pt-1 border-t border-gray-100 dark:border-gray-700">
            <input
              type="text"
              className="input flex-1 text-sm"
              placeholder="Agregar ítem al checklist…"
              value={newItemText}
              onChange={e => setNewItemText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAddItem()}
            />
            <button
              onClick={handleAddItem}
              disabled={addingItem || !newItemText.trim()}
              className="btn-primary px-3"
            >
              {addingItem
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Plus className="w-4 h-4" />
              }
            </button>
          </div>}
        </div>
      )}

      {/* ── COMMENTS ── */}
      {activeTab === 'comments' && task?.id && (
        <div className="space-y-4">
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {!task.comments?.length ? (
              <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">Sin comentarios aún</p>
            ) : task.comments.map(c => (
              <div key={c.id} className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-700 dark:text-primary-300 font-semibold text-xs flex-shrink-0">
                  {c.user_name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{c.user_name}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">{c.content}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {format(new Date(c.created_at), 'dd MMM yyyy, HH:mm', { locale: es })}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {!readOnly && (
            <div className="flex gap-2">
              <input
                type="text" className="input flex-1"
                placeholder="Escribir comentario..."
                value={comment} onChange={e => setComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleComment()}
              />
              <button onClick={handleComment} disabled={submittingComment || !comment.trim()} className="btn-primary px-3">
                <Send className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── HISTORY ── */}
      {activeTab === 'history' && task?.id && (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {!task.history?.length ? (
            <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">Sin historial</p>
          ) : task.history.map(h => (
            <div key={h.id} className="flex gap-3 py-2 border-b border-gray-50 dark:border-gray-800">
              <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-400 font-semibold text-xs flex-shrink-0 mt-0.5">
                {h.user_name?.charAt(0)}
              </div>
              <div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium">{h.user_name}</span>
                  {' '}{h.field_changed === 'created' ? 'creó la tarea' : `cambió ${historyFieldLabels[h.field_changed] || h.field_changed}`}
                  {h.old_value && h.field_changed !== 'created' && (
                    <> de <span className="line-through text-gray-400">{h.old_value}</span> a <span className="font-medium">{h.new_value}</span></>
                  )}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {format(new Date(h.created_at), 'dd MMM yyyy, HH:mm', { locale: es })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── ATTACHMENTS ── */}
      {activeTab === 'attachments' && task?.id && (
        <AttachmentsTab
          task={task}
          projectId={projectId}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}
