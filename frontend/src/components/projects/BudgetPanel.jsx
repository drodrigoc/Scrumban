import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { budgetAPI } from '../../services/api';
import { Wallet, Plus, Pencil, Trash2 } from 'lucide-react';

const TIPOS = [
  { value: 'fijo',     label: 'Fijo'     },
  { value: 'variable', label: 'Variable' },
];

const tipoBadge = {
  fijo:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  variable: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);

const emptyForm = {
  tipo: 'fijo', categoria: '', descripcion: '',
  monto_estimado: '', monto_ejecutado: '', fecha: '',
};

export default function BudgetPanel({ projectId, canEdit }) {
  const [items, setItems]     = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const load = async () => {
    try {
      const { data } = await budgetAPI.getAll(projectId);
      setItems(data.items);
      setSummary(data.summary);
    } catch {
      toast.error('Error al cargar el presupuesto');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const openNew = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (item) => {
    setForm({
      tipo:            item.tipo,
      categoria:       item.categoria,
      descripcion:     item.descripcion || '',
      monto_estimado:  item.monto_estimado != null ? String(item.monto_estimado) : '',
      monto_ejecutado: item.monto_ejecutado != null ? String(item.monto_ejecutado) : '',
      fecha:           item.fecha ? item.fecha.split('T')[0] : '',
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.categoria.trim()) {
      toast.error('La categoría es requerida');
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      monto_estimado:  form.monto_estimado  === '' ? 0 : parseFloat(form.monto_estimado),
      monto_ejecutado: form.monto_ejecutado === '' ? 0 : parseFloat(form.monto_ejecutado),
      fecha: form.fecha || null,
    };
    try {
      if (editingId) {
        await budgetAPI.update(projectId, editingId, payload);
        toast.success('Partida actualizada');
      } else {
        await budgetAPI.create(projectId, payload);
        toast.success('Partida agregada');
      }
      await load();
      closeForm();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar la partida');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!confirm(`¿Eliminar la partida "${item.categoria}"?`)) return;
    try {
      await budgetAPI.delete(projectId, item.id);
      await load();
      toast.success('Partida eliminada');
    } catch {
      toast.error('Error al eliminar la partida');
    }
  };

  if (loading) return (
    <div className="card p-5 flex justify-center">
      <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const fijos     = items.filter(i => i.tipo === 'fijo');
  const variables = items.filter(i => i.tipo === 'variable');
  const excedido  = summary?.sin_asignar != null && summary.sin_asignar < 0;

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary-500" />
            Presupuesto por partidas
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Desglose de costos fijos y variables, con su ejecución real
          </p>
        </div>
        {canEdit && !showForm && (
          <button onClick={openNew} className="btn-secondary text-xs py-1.5 px-3">
            <Plus className="w-3.5 h-3.5" /> Nueva partida
          </button>
        )}
      </div>

      {/* Resumen */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryTile label="Estimado fijo"     value={fmt(summary.estimado_fijo)} />
          <SummaryTile label="Estimado variable" value={fmt(summary.estimado_variable)} />
          <SummaryTile label="Total estimado"    value={fmt(summary.estimado_total)} strong />
          <SummaryTile label="Total ejecutado"   value={fmt(summary.ejecutado_total)} strong />
        </div>
      )}

      {summary?.presupuesto != null && (
        <div className={`rounded-lg p-3 text-sm flex items-center justify-between flex-wrap gap-2 ${
          excedido
            ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
            : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
        }`}>
          <span>
            Presupuesto autorizado: <b>{fmt(summary.presupuesto)}</b>
          </span>
          <span>
            {excedido
              ? `Excedido en ${fmt(Math.abs(summary.sin_asignar))}`
              : `Sin asignar a partidas: ${fmt(summary.sin_asignar)}`}
          </span>
        </div>
      )}

      {/* Formulario */}
      {showForm && (
        <div className="rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50/40 dark:bg-primary-900/10 p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {editingId ? 'Editar partida' : 'Nueva partida'}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Tipo</label>
              <select
                className="input"
                value={form.tipo}
                onChange={e => setForm({ ...form, tipo: e.target.value })}
              >
                {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Categoría *</label>
              <input
                type="text"
                className="input"
                placeholder="Personal, insumos, licencias…"
                value={form.categoria}
                onChange={e => setForm({ ...form, categoria: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="label">Descripción</label>
            <input
              type="text"
              className="input"
              placeholder="Detalle de la partida (opcional)"
              value={form.descripcion}
              onChange={e => setForm({ ...form, descripcion: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Monto estimado</label>
              <input
                type="number" min="0" step="0.01" className="input" placeholder="0.00"
                value={form.monto_estimado}
                onChange={e => setForm({ ...form, monto_estimado: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Monto ejecutado</label>
              <input
                type="number" min="0" step="0.01" className="input" placeholder="0.00"
                value={form.monto_ejecutado}
                onChange={e => setForm({ ...form, monto_ejecutado: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Fecha</label>
              <input
                type="date" className="input"
                value={form.fecha}
                onChange={e => setForm({ ...form, fecha: e.target.value })}
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={closeForm} className="btn-secondary text-sm py-1.5 px-4">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm py-1.5 px-4">
              {saving
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : (editingId ? 'Guardar cambios' : 'Agregar partida')
              }
            </button>
          </div>
        </div>
      )}

      {/* Tabla */}
      {items.length === 0 ? (
        <p className="text-sm text-center text-gray-400 dark:text-gray-500 py-6">
          Todavía no hay partidas. {canEdit ? 'Agrega la primera con "Nueva partida".' : ''}
        </p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                <th className="py-2 px-2 font-medium">Tipo</th>
                <th className="py-2 px-2 font-medium">Categoría</th>
                <th className="py-2 px-2 font-medium text-right">Estimado</th>
                <th className="py-2 px-2 font-medium text-right">Ejecutado</th>
                <th className="py-2 px-2 font-medium">Fecha</th>
                {canEdit && <th className="py-2 px-2" />}
              </tr>
            </thead>
            <tbody>
              {[
                { titulo: 'Costos fijos',     rows: fijos },
                { titulo: 'Costos variables', rows: variables },
              ].filter(g => g.rows.length > 0).map(group => (
                <BudgetGroup
                  key={group.titulo}
                  titulo={group.titulo}
                  rows={group.rows}
                  canEdit={canEdit}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summary?.total_costo_tareas > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700 pt-3">
          Referencia: las tareas del proyecto tienen {fmt(summary.total_costo_tareas)} en costos registrados.
          Ese monto se lleva aparte de estas partidas, así que no se suma dos veces.
        </p>
      )}
    </div>
  );
}

function BudgetGroup({ titulo, rows, canEdit, onEdit, onDelete }) {
  const subtotalEst = rows.reduce((s, r) => s + (Number(r.monto_estimado)  || 0), 0);
  const subtotalEje = rows.reduce((s, r) => s + (Number(r.monto_ejecutado) || 0), 0);

  return (
    <>
      <tr className="bg-gray-50/70 dark:bg-gray-800/40">
        <td colSpan={canEdit ? 6 : 5} className="py-1.5 px-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {titulo}
        </td>
      </tr>

      {rows.map(item => (
        <tr key={item.id} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50/60 dark:hover:bg-gray-800/30">
          <td className="py-2 px-2">
            <span className={`badge ${tipoBadge[item.tipo]}`}>
              {item.tipo === 'fijo' ? 'Fijo' : 'Variable'}
            </span>
          </td>
          <td className="py-2 px-2">
            <p className="text-gray-700 dark:text-gray-300 font-medium">{item.categoria}</p>
            {item.descripcion && (
              <p className="text-xs text-gray-400 dark:text-gray-500">{item.descripcion}</p>
            )}
          </td>
          <td className="py-2 px-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
            {fmt(item.monto_estimado)}
          </td>
          <td className={`py-2 px-2 text-right tabular-nums ${
            Number(item.monto_ejecutado) > Number(item.monto_estimado)
              ? 'text-red-600 dark:text-red-400 font-medium'
              : 'text-gray-700 dark:text-gray-300'
          }`}>
            {fmt(item.monto_ejecutado)}
          </td>
          <td className="py-2 px-2 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
            {item.fecha ? item.fecha.split('T')[0] : '—'}
          </td>
          {canEdit && (
            <td className="py-2 px-2">
              <div className="flex items-center gap-1 justify-end">
                <button
                  onClick={() => onEdit(item)}
                  title="Editar partida"
                  className="p-1 text-gray-400 hover:text-primary-500 dark:hover:text-primary-400"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDelete(item)}
                  title="Eliminar partida"
                  className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </td>
          )}
        </tr>
      ))}

      <tr className="border-b border-gray-100 dark:border-gray-700">
        <td />
        <td className="py-1.5 px-2 text-xs text-gray-500 dark:text-gray-400">Subtotal</td>
        <td className="py-1.5 px-2 text-right tabular-nums text-sm font-semibold text-gray-700 dark:text-gray-300">
          {fmt(subtotalEst)}
        </td>
        <td className="py-1.5 px-2 text-right tabular-nums text-sm font-semibold text-gray-700 dark:text-gray-300">
          {fmt(subtotalEje)}
        </td>
        <td colSpan={canEdit ? 2 : 1} />
      </tr>
    </>
  );
}

function SummaryTile({ label, value, strong }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className={`tabular-nums ${strong
        ? 'text-lg font-bold text-gray-900 dark:text-gray-100'
        : 'text-base font-semibold text-gray-700 dark:text-gray-300'}`}>
        {value}
      </p>
    </div>
  );
}
