import { Fragment, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { budgetAPI } from '../../services/api';
import { Wallet, Plus, Pencil, Trash2, ChevronRight, AlertTriangle } from 'lucide-react';

/*
 * Presupuesto del proyecto.
 *
 * - Presupuesto = suma de lo estimado en las partidas (se arma después
 *   del cronograma, no al crear el proyecto).
 * - Ejecutado de una partida fija: se escribe a mano (salarios…).
 * - Ejecutado de una partida variable: suma del costo de sus tareas; la
 *   partida se elige en cada tarea.
 * - Las tareas con costo y sin partida también son gasto del proyecto:
 *   se muestran aparte para asignarlas.
 */

const TIPOS = [
  { value: 'fijo',     label: 'Fijo'     },
  { value: 'variable', label: 'Variable' },
];

const tipoBadge = {
  fijo:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  variable: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

const ESTADO_TAREA = {
  pending: 'Pendiente', in_progress: 'En proceso', in_review: 'En revisión', completed: 'Completada',
};

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);

// Verde hasta 80 %, ámbar hasta 100 %, rojo si se pasó
const tono = (pct) => (pct == null ? 'gris' : pct > 100 ? 'rojo' : pct >= 80 ? 'ambar' : 'verde');
const COLOR = {
  verde: { trazo: 'stroke-green-500', barra: 'bg-green-500', texto: 'text-green-600 dark:text-green-400' },
  ambar: { trazo: 'stroke-amber-500', barra: 'bg-amber-500', texto: 'text-amber-600 dark:text-amber-400' },
  rojo:  { trazo: 'stroke-red-500',   barra: 'bg-red-500',   texto: 'text-red-600 dark:text-red-400'     },
  gris:  { trazo: 'stroke-gray-300',  barra: 'bg-gray-300',  texto: 'text-gray-500 dark:text-gray-400'   },
};

/*
 * Si el backend todavía es la versión anterior (sin el cálculo por tareas),
 * su respuesta no trae ejecutado, disponible ni tareas por partida. Antes
 * eso rompía toda la página; ahora se adapta y se avisa.
 */
function normalizar(data) {
  const items = (data?.items || []).map(it => {
    const estimado  = Number(it.monto_estimado) || 0;
    const ejecutado = it.ejecutado ?? (Number(it.monto_ejecutado) || 0);
    return {
      ...it,
      monto_estimado: estimado,
      ejecutado,
      disponible: it.disponible ?? estimado - ejecutado,
      origen:     it.origen || 'manual',
      tareas:     Array.isArray(it.tareas) ? it.tareas : [],
    };
  });
  const sinPartida = {
    total:  Number(data?.sin_partida?.total) || 0,
    tareas: Array.isArray(data?.sin_partida?.tareas) ? data.sin_partida.tareas : [],
  };

  const suma = (lista) => lista.reduce((s, x) => s + x, 0);
  const de = (tipo, campo) => suma(items.filter(i => i.tipo === tipo).map(i => i[campo]));
  const presupuesto = suma(items.map(i => i.monto_estimado));
  const ejecutado   = suma(items.map(i => i.ejecutado)) + sinPartida.total;
  const calculado = {
    presupuesto,
    ejecutado,
    disponible: presupuesto - ejecutado,
    porcentaje: presupuesto > 0 ? Math.round((ejecutado / presupuesto) * 100) : null,
    estimado_fijo:      de('fijo', 'monto_estimado'),
    ejecutado_fijo:     de('fijo', 'ejecutado'),
    estimado_variable:  de('variable', 'monto_estimado'),
    ejecutado_variable: de('variable', 'ejecutado') + sinPartida.total,
  };

  return {
    items,
    sin_partida: sinPartida,
    summary: { ...calculado, ...(data?.summary?.ejecutado !== undefined ? data.summary : {}) },
    servidorAntiguo: !('sin_partida' in (data || {})),
  };
}

const emptyForm = {
  tipo: 'fijo', categoria: '', descripcion: '',
  monto_estimado: '', monto_ejecutado: '', fecha: '',
};

// canEdit: armar el presupuesto (crear, editar y eliminar partidas).
// soloEjecucion: la planificación del proyecto POA está bloqueada; solo se
// registra el ejecutado de las partidas fijas.
export default function BudgetPanel({ projectId, canEdit, soloEjecucion = false }) {
  const [data, setData]         = useState(null);
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [abiertas, setAbiertas]   = useState(() => new Set()); // filas con sus tareas a la vista

  const load = async () => {
    try {
      const { data } = await budgetAPI.getAll(projectId);
      setData(normalizar(data));
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al cargar el presupuesto');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const alternar = (clave) => setAbiertas(prev => {
    const nuevo = new Set(prev);
    nuevo.has(clave) ? nuevo.delete(clave) : nuevo.add(clave);
    return nuevo;
  });

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
      monto_ejecutado: item.tipo === 'fijo' && item.monto_ejecutado != null ? String(Number(item.monto_ejecutado)) : '',
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
    if (soloEjecucion) {
      setSaving(true);
      try {
        await budgetAPI.update(projectId, editingId, {
          monto_ejecutado: form.monto_ejecutado === '' ? 0 : parseFloat(form.monto_ejecutado),
        });
        toast.success('Ejecutado registrado');
        await load();
        closeForm();
      } catch (err) {
        toast.error(err.response?.data?.message || 'No se pudo registrar el ejecutado');
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!form.categoria.trim()) {
      toast.error('La categoría es requerida');
      return;
    }
    setSaving(true);
    const payload = {
      tipo:           form.tipo,
      categoria:      form.categoria,
      descripcion:    form.descripcion,
      monto_estimado: form.monto_estimado === '' ? 0 : parseFloat(form.monto_estimado),
      fecha:          form.fecha || null,
      // Solo las fijas llevan ejecutado escrito a mano
      ...(form.tipo === 'fijo' && {
        monto_ejecutado: form.monto_ejecutado === '' ? 0 : parseFloat(form.monto_ejecutado),
      }),
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
    const n = item.tareas?.length || 0;
    const aviso = n ? `\n\nSus ${n} tarea${n === 1 ? '' : 's'} quedará${n === 1 ? '' : 'n'} sin partida.` : '';
    if (!confirm(`¿Eliminar la partida "${item.categoria}"?${aviso}`)) return;
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

  const items      = data?.items || [];
  const summary    = data?.summary;
  const sinPartida = data?.sin_partida || { total: 0, tareas: [] };
  const fijos      = items.filter(i => i.tipo === 'fijo');
  const variables  = items.filter(i => i.tipo === 'variable');
  const hayDatos   = items.length > 0 || sinPartida.total > 0;
  const conAcciones = canEdit || soloEjecucion;
  const columnas   = conAcciones ? 6 : 5;

  return (
    <div className="card p-5 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary-500" />
            Presupuesto del proyecto
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Se arma con las partidas. Las variables suman el costo de sus tareas; las fijas se registran a mano.
          </p>
        </div>
        {canEdit && !showForm && (
          <button onClick={openNew} className="btn-secondary text-xs py-1.5 px-3">
            <Plus className="w-3.5 h-3.5" /> Nueva partida
          </button>
        )}
      </div>

      {data?.servidorAntiguo && (
        <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          El servidor todavía tiene la versión anterior del presupuesto: el ejecutado de las partidas
          variables aún no se calcula con las tareas. Hay que actualizar y reiniciar el backend.
        </p>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{error}</p>
      )}

      {/* Resumen */}
      {summary && hayDatos && <Resumen summary={summary} />}

      {soloEjecucion && (
        <p className="text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg px-3 py-2">
          Planificación bloqueada: las partidas ya no se modifican. Puedes registrar el ejecutado de las partidas fijas;
          el de las variables sale del costo de las tareas.
        </p>
      )}

      {/* Registrar el ejecutado de una fija con la planificación bloqueada */}
      {showForm && soloEjecucion && (
        <div className="rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50/40 dark:bg-primary-900/10 p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Registrar ejecutado · {form.categoria}
          </p>
          <div className="max-w-xs">
            <label className="label">Monto ejecutado</label>
            <input
              type="number" min="0" step="0.01" className="input" placeholder="0.00" autoFocus
              value={form.monto_ejecutado}
              onChange={e => setForm({ ...form, monto_ejecutado: e.target.value })}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={closeForm} className="btn-secondary text-sm py-1.5 px-4">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm py-1.5 px-4">
              {saving
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {/* Formulario */}
      {showForm && !soloEjecucion && (
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
            {form.tipo === 'fijo' ? (
              <div>
                <label className="label">Monto ejecutado</label>
                <input
                  type="number" min="0" step="0.01" className="input" placeholder="0.00"
                  value={form.monto_ejecutado}
                  onChange={e => setForm({ ...form, monto_ejecutado: e.target.value })}
                />
              </div>
            ) : (
              <div className="text-xs text-gray-500 dark:text-gray-400 self-end pb-2">
                El ejecutado se calcula con el costo de las tareas asignadas a esta partida.
              </div>
            )}
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
      {!hayDatos ? (
        <p className="text-sm text-center text-gray-400 dark:text-gray-500 py-6">
          Todavía no hay partidas.
          {canEdit ? ' Arma el presupuesto con "Nueva partida" cuando tengas el cronograma.' : ''}
        </p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                <th className="py-2 px-2 font-medium">Tipo</th>
                <th className="py-2 px-2 font-medium">Categoría</th>
                <th className="py-2 px-2 font-medium text-right">Estimado</th>
                <th className="py-2 px-2 font-medium text-right">Ejecutado</th>
                <th className="py-2 px-2 font-medium text-right">Disponible</th>
                {conAcciones && <th className="py-2 px-2" />}
              </tr>
            </thead>
            <tbody>
              {fijos.length > 0 && (
                <Grupo titulo="Costos fijos" rows={fijos} columnas={columnas}
                  canEdit={canEdit} soloEjecucion={soloEjecucion} abiertas={abiertas} alternar={alternar}
                  onEdit={openEdit} onDelete={handleDelete} />
              )}
              {(variables.length > 0 || sinPartida.total > 0) && (
                <Grupo titulo="Costos variables" rows={variables} columnas={columnas}
                  canEdit={canEdit} soloEjecucion={soloEjecucion} abiertas={abiertas} alternar={alternar}
                  onEdit={openEdit} onDelete={handleDelete}
                  sinPartida={sinPartida} />
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Resumen({ summary }) {
  const pct = summary.porcentaje;
  const c = COLOR[tono(pct)];
  const excedido = summary.disponible < 0;

  return (
    <div className="flex flex-col sm:flex-row gap-5 items-center">
      <Dona porcentaje={pct} trazo={c.trazo} />

      <div className="flex-1 w-full space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Cifra etiqueta="Presupuesto" valor={fmt(summary.presupuesto)} />
          <Cifra etiqueta="Ejecutado"   valor={fmt(summary.ejecutado)} />
          <Cifra
            etiqueta={excedido ? 'Excedido' : 'Disponible'}
            valor={fmt(Math.abs(summary.disponible))}
            clase={excedido ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
          <Barra etiqueta="Fijos"     ejecutado={summary.ejecutado_fijo}     estimado={summary.estimado_fijo} />
          <Barra etiqueta="Variables" ejecutado={summary.ejecutado_variable} estimado={summary.estimado_variable} />
        </div>
      </div>
    </div>
  );
}

// Gráfico circular: cuánto del presupuesto ya se ejecutó
function Dona({ porcentaje, trazo }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const lleno = porcentaje == null ? 0 : Math.min(porcentaje, 100) / 100;
  return (
    <div className="relative w-32 h-32 flex-shrink-0" role="img"
      aria-label={porcentaje == null ? 'Sin presupuesto' : `${porcentaje}% del presupuesto ejecutado`}>
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="12" className="stroke-gray-100 dark:stroke-gray-700" />
        <circle
          cx="60" cy="60" r={r} fill="none" strokeWidth="12" strokeLinecap="round"
          className={`${trazo} transition-all duration-500`}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - lleno)}
          style={{ opacity: lleno > 0 ? 1 : 0 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
          {porcentaje == null ? '—' : `${porcentaje}%`}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">ejecutado</span>
      </div>
    </div>
  );
}

function Cifra({ etiqueta, valor, clase = 'text-gray-900 dark:text-gray-100' }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{etiqueta}</p>
      <p className={`text-base sm:text-lg font-bold tabular-nums ${clase}`}>{valor}</p>
    </div>
  );
}

function Barra({ etiqueta, ejecutado, estimado }) {
  const pct = estimado > 0 ? Math.round((ejecutado / estimado) * 100) : (ejecutado > 0 ? 101 : null);
  const c = COLOR[tono(pct)];
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1 gap-2">
        <span>{etiqueta}</span>
        <span className="tabular-nums">{fmt(ejecutado)} de {fmt(estimado)}</span>
      </div>
      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${c.barra}`} style={{ width: `${Math.min(pct || 0, 100)}%` }} />
      </div>
    </div>
  );
}

function Disponible({ valor }) {
  return (
    <span className={`tabular-nums ${valor < 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>
      {valor < 0 ? `−${fmt(-valor)}` : fmt(valor)}
    </span>
  );
}

function ListaTareas({ tareas, columnas }) {
  return (
    <tr>
      <td colSpan={columnas} className="px-2 pb-2">
        <ul className="ml-8 border-l-2 border-gray-100 dark:border-gray-700 pl-3 space-y-1">
          {tareas.map(t => (
            <li key={t.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-gray-600 dark:text-gray-300 truncate">
                {t.title}
                <span className="text-gray-400 dark:text-gray-500">
                  {' · '}{t.archived_at ? 'Archivada' : (ESTADO_TAREA[t.status] || t.status)}
                </span>
              </span>
              <span className="tabular-nums text-gray-600 dark:text-gray-300 flex-shrink-0">{fmt(t.costo)}</span>
            </li>
          ))}
        </ul>
      </td>
    </tr>
  );
}

function BotonTareas({ n, abierta, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-0.5 whitespace-nowrap text-xs text-primary-600 dark:text-primary-400 hover:underline"
    >
      <ChevronRight className={`w-3 h-3 transition-transform ${abierta ? 'rotate-90' : ''}`} />
      {n} tarea{n === 1 ? '' : 's'}
    </button>
  );
}

function Grupo({ titulo, rows, columnas, canEdit, soloEjecucion, abiertas, alternar, onEdit, onDelete, sinPartida }) {
  const conAcciones = canEdit || soloEjecucion;
  const extra = sinPartida?.total || 0;
  const subEst = rows.reduce((s, r) => s + r.monto_estimado, 0);
  const subEje = rows.reduce((s, r) => s + r.ejecutado, 0) + extra;

  return (
    <>
      <tr className="bg-gray-50/70 dark:bg-gray-800/40">
        <td colSpan={columnas} className="py-1.5 px-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {titulo}
        </td>
      </tr>

      {rows.map(item => {
        const abierta = abiertas.has(item.id);
        return (
          <Fragment key={item.id}>
            <tr className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50/60 dark:hover:bg-gray-800/30">
              <td className="py-2 px-2 align-top">
                <span className={`badge ${tipoBadge[item.tipo]}`}>
                  {item.tipo === 'fijo' ? 'Fijo' : 'Variable'}
                </span>
              </td>
              <td className="py-2 px-2 align-top">
                <p className="text-gray-700 dark:text-gray-300 font-medium">{item.categoria}</p>
                {(item.descripcion || item.fecha) && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {[item.descripcion, item.fecha?.split('T')[0]].filter(Boolean).join(' · ')}
                  </p>
                )}
              </td>
              <td className="py-2 px-2 text-right tabular-nums text-gray-700 dark:text-gray-300 align-top">
                {fmt(item.monto_estimado)}
              </td>
              <td className="py-2 px-2 text-right align-top">
                <p className="tabular-nums text-gray-700 dark:text-gray-300">{fmt(item.ejecutado)}</p>
                {item.origen === 'manual' ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">a mano</p>
                ) : item.tareas.length > 0 ? (
                  <BotonTareas n={item.tareas.length} abierta={abierta} onClick={() => alternar(item.id)} />
                ) : (
                  <p className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">sin tareas</p>
                )}
              </td>
              <td className="py-2 px-2 text-right align-top">
                <Disponible valor={item.disponible} />
              </td>
              {conAcciones && (
                <td className="py-2 px-2 align-top">
                  <div className="flex items-center gap-1 justify-end">
                    {(canEdit || item.tipo === 'fijo') && (
                      <button
                        onClick={() => onEdit(item)}
                        title={canEdit ? 'Editar partida' : 'Registrar ejecutado'}
                        className="p-1 text-gray-400 hover:text-primary-500 dark:hover:text-primary-400"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => onDelete(item)}
                        title="Eliminar partida"
                        className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
            {abierta && <ListaTareas tareas={item.tareas} columnas={columnas} />}
          </Fragment>
        );
      })}

      {/* Costos de tareas sin partida: cuentan en el ejecutado del proyecto */}
      {extra > 0 && (
        <>
          <tr className="border-b border-gray-50 dark:border-gray-800 bg-amber-50/60 dark:bg-amber-900/10">
            <td className="py-2 px-2 align-top">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </td>
            <td className="py-2 px-2 align-top">
              <p className="text-amber-800 dark:text-amber-300 font-medium">Tareas sin partida</p>
              <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                Cuentan en el ejecutado del proyecto. Asígnales una partida desde cada tarea.
              </p>
            </td>
            <td className="py-2 px-2 text-right tabular-nums text-gray-400 align-top">—</td>
            <td className="py-2 px-2 text-right align-top">
              <p className="tabular-nums text-gray-700 dark:text-gray-300">{fmt(extra)}</p>
              <BotonTareas
                n={sinPartida.tareas.length}
                abierta={abiertas.has('sin')}
                onClick={() => alternar('sin')}
              />
            </td>
            <td className="py-2 px-2 text-right tabular-nums text-gray-400 align-top">—</td>
            {conAcciones && <td />}
          </tr>
          {abiertas.has('sin') && <ListaTareas tareas={sinPartida.tareas} columnas={columnas} />}
        </>
      )}

      <tr className="border-b border-gray-100 dark:border-gray-700">
        <td />
        <td className="py-1.5 px-2 text-xs text-gray-500 dark:text-gray-400">Subtotal</td>
        <td className="py-1.5 px-2 text-right tabular-nums text-sm font-semibold text-gray-700 dark:text-gray-300">
          {fmt(subEst)}
        </td>
        <td className="py-1.5 px-2 text-right tabular-nums text-sm font-semibold text-gray-700 dark:text-gray-300">
          {fmt(subEje)}
        </td>
        <td className="py-1.5 px-2 text-right text-sm font-semibold">
          <Disponible valor={subEst - subEje} />
        </td>
        {conAcciones && <td />}
      </tr>
    </>
  );
}
