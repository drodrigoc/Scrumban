import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { phasesAPI } from '../../services/api';
import { Layers, Plus, Sparkles } from 'lucide-react';
import PhasesTimeline, { calcularVentana } from './PhasesTimeline';

const PHASE_COLORS = [
  '#6366F1', '#0EA5E9', '#14B8A6', '#22C55E',
  '#EAB308', '#F97316', '#EC4899', '#8B5CF6',
];

// Plantilla de arranque para proyectos que aún no tienen cronograma
const PLANTILLA = [
  { name: 'Diagnóstico',    color: '#6366F1' },
  { name: 'Diseño',         color: '#0EA5E9' },
  { name: 'Implementación', color: '#22C55E' },
  { name: 'Cierre',         color: '#F97316' },
];

const emptyForm = { name: '', description: '', start_date: '', end_date: '', color: PHASE_COLORS[0] };

// Escalas del cronograma. Las dos dibujan 12 columnas: cambia la unidad.
const ESCALAS = [
  { value: 'mes',       label: 'Anual · 12 meses',        descripcion: '12 meses' },
  { value: 'trimestre', label: '3 años · 12 trimestres',  descripcion: '12 trimestres (3 años)' },
];
const ESCALA_STORAGE_KEY = (projectId) => `phases_scale_${projectId}`;

export default function PhasesPanel({ projectId, canEdit, projectStart, projectEnd, onChange }) {
  const [phases, setPhases]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  // Preferencia de vista personal, igual que la ventana del Kanban
  const [escala, setEscala] = useState(() => {
    const guardada = localStorage.getItem(ESCALA_STORAGE_KEY(projectId));
    return ESCALAS.some(e => e.value === guardada) ? guardada : 'mes';
  });

  useEffect(() => {
    localStorage.setItem(ESCALA_STORAGE_KEY(projectId), escala);
  }, [escala, projectId]);

  const load = async () => {
    try {
      const { data } = await phasesAPI.getAll(projectId);
      setPhases(data);
      onChange?.(data);
    } catch {
      toast.error('Error al cargar las fases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const openNew = () => {
    setForm({
      ...emptyForm,
      color: PHASE_COLORS[phases.length % PHASE_COLORS.length],
      // Arranca donde termina la fase anterior, o al inicio del proyecto
      start_date: phases.at(-1)?.end_date?.split('T')[0] || projectStart?.split('T')[0] || '',
    });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (phase) => {
    setForm({
      name:        phase.name,
      description: phase.description || '',
      start_date:  phase.start_date ? phase.start_date.split('T')[0] : '',
      end_date:    phase.end_date   ? phase.end_date.split('T')[0]   : '',
      color:       phase.color || PHASE_COLORS[0],
    });
    setEditingId(phase.id);
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(emptyForm); };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('El nombre de la fase es requerido'); return; }
    if (form.start_date && form.end_date && form.start_date > form.end_date) {
      toast.error('La fecha de fin no puede ser anterior a la de inicio');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await phasesAPI.update(projectId, editingId, form);
        toast.success('Fase actualizada');
      } else {
        await phasesAPI.create(projectId, form);
        toast.success('Fase agregada');
      }
      await load();
      closeForm();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar la fase');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (phase) => {
    if (!confirm(`¿Eliminar la fase "${phase.name}"?\n\nLas tareas vinculadas no se borran: quedan sin fase.`)) return;
    try {
      await phasesAPI.delete(projectId, phase.id);
      await load();
      toast.success('Fase eliminada');
    } catch {
      toast.error('Error al eliminar la fase');
    }
  };

  // Crea un cronograma inicial repartiendo las fechas del proyecto en 4 tramos
  const handleUsarPlantilla = async () => {
    if (!confirm('¿Crear un cronograma inicial con las fases Diagnóstico, Diseño, Implementación y Cierre?')) return;
    setSaving(true);
    try {
      const inicio = projectStart ? new Date(projectStart) : null;
      const fin    = projectEnd   ? new Date(projectEnd)   : null;
      const tramo  = inicio && fin && fin > inicio
        ? Math.floor((fin - inicio) / PLANTILLA.length)
        : null;

      for (let i = 0; i < PLANTILLA.length; i++) {
        const fase = PLANTILLA[i];
        let start_date = null, end_date = null;
        if (tramo) {
          start_date = new Date(inicio.getTime() + tramo * i).toISOString().split('T')[0];
          end_date   = new Date(inicio.getTime() + tramo * (i + 1) - 86400000).toISOString().split('T')[0];
        }
        await phasesAPI.create(projectId, { ...fase, start_date, end_date, position: i });
      }
      await load();
      toast.success('Cronograma inicial creado');
    } catch {
      toast.error('Error al crear el cronograma inicial');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="card p-5 flex justify-center">
      <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const escalaActual = ESCALAS.find(e => e.value === escala) ?? ESCALAS[0];
  // El mismo cálculo que dibuja la barra, para anunciar el periodo exacto
  const ventana = calcularVentana(phases, projectStart, 12, escala);

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary-500" />
            Cronograma macro ({phases.length})
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Las actividades grandes del proyecto. El avance se calcula con las tareas de cada fase.
          </p>
          {phases.length > 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {escalaActual.descripcion} desde el inicio del proyecto ·{' '}
              <span className="capitalize">{ventana.etiqueta}</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {phases.length > 0 && (
            <select
              value={escala}
              onChange={e => setEscala(e.target.value)}
              title="Escala del cronograma"
              className="input py-1.5 w-auto text-xs"
            >
              {ESCALAS.map(e => (
                <option key={e.value} value={e.value}>{e.label}</option>
              ))}
            </select>
          )}

          {canEdit && !showForm && (
            <>
              {phases.length === 0 && (
                <button onClick={handleUsarPlantilla} disabled={saving} className="btn-secondary text-xs py-1.5 px-3">
                  <Sparkles className="w-3.5 h-3.5" /> Usar plantilla
                </button>
              )}
              <button onClick={openNew} className="btn-secondary text-xs py-1.5 px-3">
                <Plus className="w-3.5 h-3.5" /> Nueva fase
              </button>
            </>
          )}
        </div>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50/40 dark:bg-primary-900/10 p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {editingId ? 'Editar fase' : 'Nueva fase'}
          </p>

          <div>
            <label className="label">Nombre *</label>
            <input
              type="text" className="input" placeholder="Diagnóstico, Diseño, Implementación…"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div>
            <label className="label">Descripción</label>
            <input
              type="text" className="input" placeholder="Qué abarca esta fase (opcional)"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Inicio</label>
              <input
                type="date" className="input"
                value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Fin</label>
              <input
                type="date" className="input"
                value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="label">Color</label>
            <div className="flex flex-wrap gap-2">
              {PHASE_COLORS.map(c => (
                <button
                  key={c} type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  style={{ backgroundColor: c }}
                  className={`w-6 h-6 rounded-full transition-transform ${
                    form.color === c ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : 'hover:scale-110'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={closeForm} className="btn-secondary text-sm py-1.5 px-4">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm py-1.5 px-4">
              {saving
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : (editingId ? 'Guardar cambios' : 'Agregar fase')
              }
            </button>
          </div>
        </div>
      )}

      {/* Listado */}
      {phases.length === 0 ? (
        <p className="text-sm text-center text-gray-400 dark:text-gray-500 py-6">
          Este proyecto todavía no tiene fases.
          {canEdit && ' Crea el cronograma inicial con "Usar plantilla" o agrega fases una a una.'}
        </p>
      ) : (
        // Misma barra de tiempo que la vista Cronograma, ajustada a las
        // fechas de las fases para que se vea el proyecto completo
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[1020px]">
              <PhasesTimeline
                phases={phases}
                anchorDate={projectStart}
                unitCount={12}
                unit={escala}
                showHeader
                showDates
                canEdit={canEdit}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
