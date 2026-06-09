import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { sgcAPI, tasksAPI } from '../services/api';
import Modal from '../components/common/Modal';
import TaskModal from '../components/tasks/TaskModal';
import { Plus, Pencil, Trash2, X, Check, ChevronDown, ChevronRight, ShieldCheck, ListChecks, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

const EMPTY_FORM = { dimension: '', criterio: '', evidencia: '', nombre_evidencia: '', descripcion: '' };

const statusLabels = {
  pending:     'Pendiente',
  in_progress: 'En Proceso',
  in_review:   'En Revisión',
  completed:   'Completado',
};

const statusColors = {
  pending:     'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  in_review:   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  completed:   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
};

// ---------------------------------------------------------------------------
// EvidenciaForm
// ---------------------------------------------------------------------------
function EvidenciaForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave(form); }}
      className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Dimensión *</label>
          <input
            className="input text-sm"
            placeholder="1"
            value={form.dimension}
            onChange={set('dimension')}
            required
          />
        </div>
        <div>
          <label className="label">Criterio *</label>
          <input
            className="input text-sm"
            placeholder="1.1"
            value={form.criterio}
            onChange={set('criterio')}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="label">Evidencia *</label>
          <input
            className="input text-sm font-mono"
            placeholder="1.1.1"
            value={form.evidencia}
            onChange={set('evidencia')}
            required
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Nombre Evidencia *</label>
          <input
            className="input text-sm"
            placeholder="Actividades de investigación"
            value={form.nombre_evidencia}
            onChange={set('nombre_evidencia')}
            required
          />
        </div>
      </div>

      <div>
        <label className="label">Descripción</label>
        <textarea
          className="input text-sm resize-none"
          rows={2}
          placeholder="Descripción opcional…"
          value={form.descripcion}
          onChange={set('descripcion')}
        />
      </div>

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary text-sm py-1.5">
          Cancelar
        </button>
        <button type="submit" disabled={saving} className="btn-primary text-sm py-1.5">
          {saving
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <><Check className="w-3.5 h-3.5" /> Guardar</>
          }
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Tab: Gestión (CRUD)
// ---------------------------------------------------------------------------
function GestionTab({ evidencias, setEvidencias }) {
  const [showForm, setShowForm]         = useState(false);
  const [editingId, setEditingId]       = useState(null);
  const [saving, setSaving]             = useState(false);
  const [search, setSearch]             = useState('');
  const [filterDimension, setFilterDim] = useState('');
  const [filterCriterio, setFilterCrit] = useState('');
  const [sortField, setSortField]       = useState('evidencia');
  const [sortDir, setSortDir]           = useState('asc');

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const dimensiones = [...new Set(evidencias.map(e => e.dimension))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  const criterios = [...new Set(
    evidencias
      .filter(e => !filterDimension || e.dimension === filterDimension)
      .map(e => e.criterio)
  )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const visible = evidencias.filter(e => {
    if (filterDimension && e.dimension !== filterDimension) return false;
    if (filterCriterio  && e.criterio  !== filterCriterio)  return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.evidencia.toLowerCase().includes(q) ||
        e.nombre_evidencia.toLowerCase().includes(q) ||
        e.dimension.toLowerCase().includes(q) ||
        e.criterio.toLowerCase().includes(q)
      );
    }
    return true;
  }).sort((a, b) => {
    const cmp = a[sortField].localeCompare(b[sortField], undefined, { numeric: true });
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const handleCreate = async (form) => {
    setSaving(true);
    try {
      const { data } = await sgcAPI.create(form);
      setEvidencias(prev =>
        [...prev, data].sort((a, b) => a.evidencia.localeCompare(b.evidencia, undefined, { numeric: true }))
      );
      setShowForm(false);
      toast.success('Evidencia creada');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al crear');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (form) => {
    setSaving(true);
    try {
      const { data } = await sgcAPI.update(editingId, form);
      setEvidencias(prev =>
        prev.map(e => e.id === editingId ? data : e)
            .sort((a, b) => a.evidencia.localeCompare(b.evidencia, undefined, { numeric: true }))
      );
      setEditingId(null);
      toast.success('Evidencia actualizada');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al actualizar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, evidencia) => {
    if (!confirm(`¿Eliminar la evidencia "${evidencia}"? Las tareas vinculadas perderán esta referencia.`)) return;
    try {
      await sgcAPI.delete(id);
      setEvidencias(prev => prev.filter(e => e.id !== id));
      toast.success('Evidencia eliminada');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap gap-2 flex-1">
          <input
            className="input text-sm py-1.5 w-48"
            placeholder="Buscar…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="input text-sm py-1.5 w-36"
            value={filterDimension}
            onChange={e => { setFilterDim(e.target.value); setFilterCrit(''); }}
          >
            <option value="">Todas las dimensiones</option>
            {dimensiones.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select
            className="input text-sm py-1.5 w-36"
            value={filterCriterio}
            onChange={e => setFilterCrit(e.target.value)}
          >
            <option value="">Todos los criterios</option>
            {criterios.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {(search || filterDimension || filterCriterio) && (
            <button
              onClick={() => { setSearch(''); setFilterDim(''); setFilterCrit(''); }}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 px-2"
            >
              <X className="w-3.5 h-3.5" /> Limpiar
            </button>
          )}
        </div>
        {!showForm && (
          <button onClick={() => { setShowForm(true); setEditingId(null); }} className="btn-primary text-sm py-1.5">
            <Plus className="w-4 h-4" /> Nueva evidencia
          </button>
        )}
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        {visible.length} de {evidencias.length} evidencia{evidencias.length !== 1 ? 's' : ''}
      </p>

      {showForm && (
        <EvidenciaForm onSave={handleCreate} onCancel={() => setShowForm(false)} saving={saving} />
      )}

      {evidencias.length === 0 && !showForm ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <ShieldCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No hay evidencias registradas.<br />Haz clic en "Nueva evidencia" para comenzar.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">
          Sin resultados para los filtros aplicados.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 text-left select-none">
                {[
                  { field: 'evidencia',        label: 'Evidencia',        cls: 'w-24' },
                  { field: 'nombre_evidencia', label: 'Nombre Evidencia', cls: '' },
                  { field: 'dimension',        label: 'Dimensión',        cls: 'hidden lg:table-cell' },
                  { field: 'criterio',         label: 'Criterio',         cls: 'hidden lg:table-cell' },
                ].map(({ field, label, cls }) => (
                  <th key={field} className={`px-4 py-3 ${cls}`}>
                    <button
                      onClick={() => toggleSort(field)}
                      className="flex items-center gap-1 font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                    >
                      {label}
                      {sortField === field
                        ? sortDir === 'asc'
                          ? <ArrowUp className="w-3.5 h-3.5 text-primary-500" />
                          : <ArrowDown className="w-3.5 h-3.5 text-primary-500" />
                        : <ArrowUpDown className="w-3.5 h-3.5 opacity-30" />
                      }
                    </button>
                  </th>
                ))}
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {visible.map(e => (
                editingId === e.id ? (
                  <tr key={e.id}>
                    <td colSpan={5} className="p-3">
                      <EvidenciaForm
                        initial={{
                          dimension:       e.dimension,
                          criterio:        e.criterio,
                          evidencia:       e.evidencia,
                          nombre_evidencia: e.nombre_evidencia,
                          descripcion:     e.descripcion || '',
                        }}
                        onSave={handleUpdate}
                        onCancel={() => setEditingId(null)}
                        saving={saving}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 group">
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-primary-600 dark:text-primary-400">{e.evidencia}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-800 dark:text-gray-200">{e.nombre_evidencia}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden lg:table-cell">{e.dimension}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden lg:table-cell max-w-xs truncate">{e.criterio}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditingId(e.id); setShowForm(false); }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(e.id, e.evidencia)}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Visualización
// ---------------------------------------------------------------------------
function VisualizacionTab() {
  const [data, setData]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState({});
  const [search, setSearch]             = useState('');
  const [filterDimension, setFilterDim] = useState('');
  const [filterCriterio, setFilterCrit] = useState('');
  const [viewTask, setViewTask]         = useState(null);
  const [loadingTask, setLoadingTask]   = useState(false);

  useEffect(() => {
    sgcAPI.getAllWithTasks()
      .then(({ data }) => setData(data))
      .catch(() => toast.error('Error al cargar visualización'))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const handleViewTask = async (task) => {
    setLoadingTask(true);
    try {
      const { data } = await tasksAPI.getById(task.project_id, task.id);
      setViewTask({ ...data, project_id: task.project_id });
    } catch {
      toast.error('Error al cargar tarea');
    } finally {
      setLoadingTask(false);
    }
  };

  const dimensiones = [...new Set(data.map(e => e.dimension))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  const criterios = [...new Set(
    data
      .filter(e => !filterDimension || e.dimension === filterDimension)
      .map(e => e.criterio)
  )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const filtered = data.filter(e => {
    if (filterDimension && e.dimension !== filterDimension) return false;
    if (filterCriterio  && e.criterio  !== filterCriterio)  return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.evidencia.toLowerCase().includes(q) ||
        e.nombre_evidencia.toLowerCase().includes(q) ||
        e.dimension.toLowerCase().includes(q) ||
        e.criterio.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          className="input text-sm py-1.5 w-48"
          placeholder="Buscar…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="input text-sm py-1.5 w-36"
          value={filterDimension}
          onChange={e => { setFilterDim(e.target.value); setFilterCrit(''); }}
        >
          <option value="">Todas las dimensiones</option>
          {dimensiones.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          className="input text-sm py-1.5 w-36"
          value={filterCriterio}
          onChange={e => setFilterCrit(e.target.value)}
        >
          <option value="">Todos los criterios</option>
          {criterios.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {(search || filterDimension || filterCriterio) && (
          <button
            onClick={() => { setSearch(''); setFilterDim(''); setFilterCrit(''); }}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 px-2"
          >
            <X className="w-3.5 h-3.5" /> Limpiar
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        {filtered.length} de {data.length} evidencia{data.length !== 1 ? 's' : ''}
      </p>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <ListChecks className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No hay evidencias que mostrar.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(e => (
            <div key={e.id} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <button
                onClick={() => toggle(e.id)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 text-left transition-colors"
              >
                {expanded[e.id]
                  ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                }
                <span className="font-mono font-bold text-primary-600 dark:text-primary-400 text-sm w-14 flex-shrink-0">{e.evidencia}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm truncate">{e.nombre_evidencia}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{e.dimension} · {e.criterio}</p>
                </div>
                <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full flex-shrink-0">
                  {e.tasks.length} tarea{e.tasks.length !== 1 ? 's' : ''}
                </span>
              </button>

              {expanded[e.id] && (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {e.tasks.length === 0 ? (
                    <p className="px-6 py-4 text-sm text-gray-400 dark:text-gray-500 italic">
                      Sin tareas vinculadas aún.
                    </p>
                  ) : e.tasks.map(t => (
                    <button key={t.id} onClick={() => handleViewTask(t)} disabled={loadingTask} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors text-left cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{t.title}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {t.project_name}
                          {t.assignee_name ? ` · ${t.assignee_name}` : ''}
                          {t.due_date ? ` · Vence ${new Date(t.due_date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusColors[t.status] || statusColors.pending}`}>
                        {statusLabels[t.status] || t.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {viewTask && (
        <Modal
          title={viewTask.title}
          onClose={() => setViewTask(null)}
          size="xl"
        >
          <TaskModal
            task={viewTask}
            projectId={viewTask.project_id}
            members={[]}
            labels={viewTask.labels || []}
            readOnly
            onCancel={() => setViewTask(null)}
          />
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SGCAdmin page
// ---------------------------------------------------------------------------
export default function SGCAdmin() {
  const [tab, setTab]               = useState('gestion');
  const [evidencias, setEvidencias] = useState([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    sgcAPI.getAll()
      .then(({ data }) => setEvidencias(data))
      .catch(() => toast.error('Error al cargar evidencias'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">SGC</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Sistema de Gestión de la Calidad</p>
        </div>
      </div>

      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6 gap-1">
        {[{ id: 'gestion', label: 'Gestión de Evidencias' }, { id: 'visualizacion', label: 'Visualización' }].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'gestion'       && <GestionTab evidencias={evidencias} setEvidencias={setEvidencias} />}
      {tab === 'visualizacion' && <VisualizacionTab />}
    </div>
  );
}
