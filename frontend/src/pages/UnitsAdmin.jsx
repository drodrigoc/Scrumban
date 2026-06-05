import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { unitsAPI } from '../services/api';
import {
  Building2, Plus, Edit2, Trash2, Check, X, Users, Info,
} from 'lucide-react';
import Modal from '../components/common/Modal';

export default function UnitsAdmin() {
  const [units, setUnits]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [editing, setEditing]       = useState(null);   // unit being edited in modal
  const [deleting, setDeleting]     = useState(null);   // unit pending delete confirm

  useEffect(() => {
    load();
  }, []);

  const load = () => {
    setLoading(true);
    unitsAPI.getAll()
      .then(({ data }) => setUnits(data))
      .catch(() => toast.error('Error al cargar unidades'))
      .finally(() => setLoading(false));
  };

  const handleSave = async (data) => {
    try {
      if (editing?.id) {
        const { data: updated } = await unitsAPI.update(editing.id, data);
        setUnits(prev => prev.map(u => u.id === editing.id ? { ...u, ...updated } : u));
        toast.success('Unidad actualizada');
      } else {
        const { data: created } = await unitsAPI.create(data);
        setUnits(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        toast.success('Unidad creada');
      }
      setShowModal(false);
      setEditing(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar');
    }
  };

  const handleDelete = async (unit) => {
    try {
      await unitsAPI.delete(unit.id);
      setUnits(prev => prev.filter(u => u.id !== unit.id));
      toast.success('Unidad eliminada');
      setDeleting(null);
    } catch {
      toast.error('Error al eliminar unidad');
    }
  };

  const openCreate = () => { setEditing(null); setShowModal(true); };
  const openEdit   = (unit) => { setEditing(unit); setShowModal(true); };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Unidades Organizacionales</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {units.length} unidad{units.length !== 1 ? 'es' : ''} registrada{units.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" /> Nueva Unidad
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800/40 rounded-xl">
        <Info className="w-4 h-4 text-primary-600 dark:text-primary-400 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-primary-700 dark:text-primary-300">
          Las unidades son los departamentos o áreas de tu organización (ej: TI, Investigación, Recursos Humanos).
          Al asignar una unidad a un usuario, el sistema puede filtrar vistas por área de trabajo.
        </p>
      </div>

      {/* Units list */}
      {units.length === 0 ? (
        <div className="card p-12 text-center">
          <Building2 className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">No hay unidades creadas</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 mb-5">
            Crea la primera unidad para organizar a tus usuarios
          </p>
          <button onClick={openCreate} className="btn-primary mx-auto">
            <Plus className="w-4 h-4" /> Crear primera unidad
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {units.map(unit => (
            <UnitCard
              key={unit.id}
              unit={unit}
              onEdit={() => openEdit(unit)}
              onDelete={() => setDeleting(unit)}
            />
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {showModal && (
        <Modal
          title={editing ? 'Editar Unidad' : 'Nueva Unidad'}
          onClose={() => { setShowModal(false); setEditing(null); }}
          size="sm"
        >
          <UnitForm
            unit={editing}
            onSave={handleSave}
            onCancel={() => { setShowModal(false); setEditing(null); }}
          />
        </Modal>
      )}

      {/* Delete confirmation modal */}
      {deleting && (
        <Modal title="Eliminar Unidad" onClose={() => setDeleting(null)} size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              ¿Estás seguro de que deseas eliminar la unidad{' '}
              <strong className="text-gray-800 dark:text-gray-200">{deleting.name}</strong>?
            </p>
            {deleting.user_count > 0 && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg">
                <Users className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  {deleting.user_count} usuario{deleting.user_count > 1 ? 's' : ''} pertenece
                  {deleting.user_count > 1 ? 'n' : ''} a esta unidad. Quedará{deleting.user_count > 1 ? 'n' : ''} sin unidad asignada.
                </p>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button className="btn-secondary flex-1" onClick={() => setDeleting(null)}>Cancelar</button>
              <button className="btn-danger flex-1" onClick={() => handleDelete(deleting)}>Eliminar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function UnitCard({ unit, onEdit, onDelete }) {
  return (
    <div className="card p-5 flex flex-col gap-4 hover:shadow-md dark:hover:shadow-gray-900/50 transition-shadow">

      {/* Icono + nombre + acciones */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Building2 className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        </div>

        {/* Texto: crece y hace wrap */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 leading-snug break-words">
            {unit.name}
          </h3>
          {unit.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-3 break-words">
              {unit.description}
            </p>
          )}
        </div>

        {/* Botones siempre visibles en la esquina */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            title="Editar"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            title="Eliminar"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Pie: conteo de usuarios */}
      <div className="pt-3 border-t border-gray-100 dark:border-gray-700/50">
        <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <Users className="w-3.5 h-3.5" />
          {unit.user_count} usuario{unit.user_count !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

function UnitForm({ unit, onSave, onCancel }) {
  const [form, setForm] = useState({
    name:        unit?.name        || '',
    description: unit?.description || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ name: form.name.trim(), description: form.description.trim() || null });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Nombre de la unidad *</label>
        <input
          type="text"
          className="input"
          placeholder="Ej: Tecnología, Investigación, RRHH…"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
          required
          autoFocus
        />
      </div>
      <div>
        <label className="label">Descripción <span className="text-gray-400 font-normal">(opcional)</span></label>
        <textarea
          className="input resize-none"
          rows={3}
          placeholder="Breve descripción del área o departamento…"
          value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })}
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel}>Cancelar</button>
        <button type="submit" disabled={saving || !form.name.trim()} className="btn-primary flex-1">
          {saving
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : unit ? 'Actualizar' : 'Crear Unidad'
          }
        </button>
      </div>
    </form>
  );
}
