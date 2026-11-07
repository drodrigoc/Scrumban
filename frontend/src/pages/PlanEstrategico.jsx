import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Target, Search, X, Plus, Pencil, Trash2, ChevronRight, CheckCircle2, Circle, AlertTriangle,
} from 'lucide-react';
import { peiAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/common/Modal';

/*
 * Plan Estratégico Institucional
 *
 *   Tablero  — cómo se alinean los proyectos con el plan: cobertura de
 *              actividades, cumplimiento de indicadores y presupuesto por
 *              línea (administración y Super Visor).
 *   Catálogo — líneas, objetivos, acciones y actividades con su indicador.
 *              Lo edita el administrador.
 */

const dinero = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n) || 0);
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function PlanEstrategico() {
  const { user } = useAuth();
  // Quien entra a esta página ve el tablero: administrador, Super Visor o
  // quien tenga acceso al Plan estratégico. El catálogo solo lo edita el administrador.
  const verTablero = ['admin', 'superViewer'].includes(user?.role) || !!user?.pei_access;
  const esAdmin = user?.role === 'admin';
  const [pestana, setPestana] = useState(verTablero ? 'tablero' : 'catalogo');
  const [arbol, setArbol] = useState(null);
  const [error, setError] = useState(null);

  const cargarArbol = useCallback(async () => {
    try {
      const { data } = await peiAPI.arbol();
      setArbol(data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo cargar el plan estratégico');
    }
  }, []);

  useEffect(() => { cargarArbol(); }, [cargarArbol]);

  const plan = arbol?.plan;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Target className="w-6 h-6 text-primary-500" />
          {plan?.nombre || 'Plan Estratégico Institucional'}
          {plan?.anio_inicio && (
            <span className="text-lg font-medium text-gray-400 dark:text-gray-500">{plan.anio_inicio}–{plan.anio_fin}</span>
          )}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Líneas, objetivos, acciones y actividades estratégicas, y cómo se alinean los proyectos con ellas.
        </p>
      </div>

      {verTablero && (
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
          {[['tablero', 'Tablero'], ['catalogo', 'Catálogo']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setPestana(id)}
              className={`pb-2 px-3 text-sm font-medium border-b-2 transition-colors ${
                pestana === id
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{error}</p>
      )}

      {pestana === 'tablero' && verTablero && <Tablero plan={plan} />}
      {pestana === 'catalogo' && arbol && <Catalogo arbol={arbol} esAdmin={esAdmin} recargar={cargarArbol} />}
    </div>
  );
}

// ═══ Tablero ════════════════════════════════════════════════════════════════

function Tablero({ plan }) {
  const [anio, setAnio] = useState('');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [abiertas, setAbiertas] = useState(() => new Set());
  const [soloCubiertas, setSoloCubiertas] = useState(true);

  useEffect(() => {
    setDatos(null);
    peiAPI.tablero(anio ? { anio } : {})
      .then(({ data }) => { setDatos(data); setError(null); })
      .catch(err => setError(err.response?.data?.message || 'No se pudo cargar el tablero'));
  }, [anio]);

  const anios = plan ? Array.from({ length: plan.anio_fin - plan.anio_inicio + 1 }, (_, i) => plan.anio_inicio + i) : [];
  const alternar = (id) => setAbiertas(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-sm text-gray-500 dark:text-gray-400">Proyectos de</label>
        <select className="input w-auto py-1.5" value={anio} onChange={e => setAnio(e.target.value)}>
          <option value="">todos los años</option>
          {anios.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          Incluye proyectos archivados. Un proyecto cuenta en el año si sus fechas lo abarcan.
        </span>
      </div>

      {!datos ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Cifra etiqueta="Proyectos alineados" valor={`${datos.resumen.proyectos_alineados} de ${datos.resumen.proyectos}`}
              nota={`${pct(datos.resumen.proyectos_alineados, datos.resumen.proyectos)} %`} />
            <Cifra etiqueta="Actividades del plan con proyectos" valor={`${datos.resumen.actividades_cubiertas} de ${datos.resumen.actividades_plan}`}
              nota={`${pct(datos.resumen.actividades_cubiertas, datos.resumen.actividades_plan)} % de cobertura`} />
            <Cifra etiqueta="Actividades cumplidas" valor={`${datos.resumen.cumplidos} de ${datos.resumen.vinculos}`}
              nota={datos.resumen.vinculos ? `${pct(datos.resumen.cumplidos, datos.resumen.vinculos)} % de cumplimiento` : 'Sin vínculos aún'} />
            <Cifra etiqueta="Presupuesto de proyectos alineados" valor={dinero(datos.resumen.presupuesto_alineado)}
              nota="Suma de sus partidas" />
          </div>

          <div className="card divide-y divide-gray-100 dark:divide-gray-700">
            <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Por línea estratégica</h2>
              <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <input type="checkbox" checked={soloCubiertas} onChange={e => setSoloCubiertas(e.target.checked)} />
                Al abrir una línea, mostrar solo actividades con proyectos
              </label>
            </div>
            {datos.lineas.map(l => (
              <LineaTablero key={l.id} l={l} abierta={abiertas.has(l.id)} onAlternar={() => alternar(l.id)} soloCubiertas={soloCubiertas} />
            ))}
          </div>

          {datos.sin_alinear.length > 0 && (
            <div className="card p-4">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Proyectos sin alinear ({datos.sin_alinear.length})
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                No responden a ninguna actividad del plan. Vincúlalas desde la ficha de cada proyecto.
              </p>
              <div className="flex flex-wrap gap-2">
                {datos.sin_alinear.map(p => (
                  <Link key={p.id} to={`/projects/${p.id}`}
                    className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                    {p.name}{p.archivado ? ' (archivado)' : ''}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Cifra({ etiqueta, valor, nota }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">{etiqueta}</p>
      <p className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums mt-1">{valor}</p>
      {nota && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{nota}</p>}
    </div>
  );
}

function Barra({ etiqueta, a, b, color }) {
  const p = pct(a, b);
  return (
    <div className="min-w-0">
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1 gap-2">
        <span>{etiqueta}</span>
        <span className="tabular-nums">{a}/{b} · {p} %</span>
      </div>
      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

function LineaTablero({ l, abierta, onAlternar, soloCubiertas }) {
  return (
    <div>
      <button type="button" onClick={onAlternar} className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40">
        <div className="flex items-start gap-3">
          <ChevronRight className={`w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0 transition-transform ${abierta ? 'rotate-90' : ''}`} />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-gray-100">Línea {l.numero} · {l.nombre}</p>
                {l.responsable && <p className="text-xs text-gray-400 dark:text-gray-500">{l.responsable}</p>}
              </div>
              <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                <p><b className="text-gray-800 dark:text-gray-200">{l.proyectos}</b> proyecto{l.proyectos === 1 ? '' : 's'}</p>
                <p className="tabular-nums">{dinero(l.presupuesto)}</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
              <Barra etiqueta="Actividades con proyectos" a={l.actividades_cubiertas} b={l.actividades_plan} color="bg-primary-500" />
              <Barra etiqueta="Actividades cumplidas" a={l.cumplidos} b={l.vinculos} color="bg-green-500" />
            </div>
          </div>
        </div>
      </button>

      {abierta && (
        <div className="px-4 pb-4 pl-11 space-y-3">
          {l.acciones.map(a => {
            const actividades = soloCubiertas ? a.actividades.filter(x => x.proyectos.length) : a.actividades;
            if (!actividades.length) return null;
            return (
              <div key={a.id}>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Acción {a.numero} · {a.nombre}</p>
                <ul className="space-y-1.5">
                  {actividades.map(act => (
                    <li key={act.id} className="text-sm">
                      <p className="text-gray-700 dark:text-gray-300">
                        <span className="font-semibold tabular-nums">{act.numero}.</span> {act.nombre}
                        {act.indicador && <span className="text-xs text-gray-400 dark:text-gray-500"> · {act.indicador}</span>}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {act.proyectos.length === 0 && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 italic">Sin proyectos</span>
                        )}
                        {act.proyectos.map(p => (
                          <Link key={p.id} to={`/projects/${p.id}`}
                            title={p.cumplido ? 'Cumplida' : 'Pendiente'}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${p.cumplido
                              ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                              : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
                            {p.cumplido ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                            {p.name}
                          </Link>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {soloCubiertas && l.actividades_cubiertas === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic">Ningún proyecto responde todavía a esta línea.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ═══ Catálogo ═══════════════════════════════════════════════════════════════

const CAMPOS = {
  linea: [
    { campo: 'numero', etiqueta: 'Número', tipo: 'number' },
    { campo: 'nombre', etiqueta: 'Nombre de la línea', requerido: true },
    { campo: 'objetivo', etiqueta: 'Objetivo estratégico', tipo: 'textarea' },
    { campo: 'responsable', etiqueta: 'Responsable de la coordinación' },
  ],
  accion: [
    { campo: 'linea_id', etiqueta: 'Línea estratégica', tipo: 'padre' },
    { campo: 'numero', etiqueta: 'Número', tipo: 'number' },
    { campo: 'nombre', etiqueta: 'Nombre de la acción', requerido: true },
    { campo: 'recursos', etiqueta: 'Recursos', tipo: 'textarea' },
  ],
  actividad: [
    { campo: 'accion_id', etiqueta: 'Acción estratégica', tipo: 'padre' },
    { campo: 'numero', etiqueta: 'Número', tipo: 'number' },
    { campo: 'nombre', etiqueta: 'Nombre de la actividad', requerido: true, tipo: 'textarea' },
    { campo: 'periodo_inicio', etiqueta: 'Desde (año)', tipo: 'number', mitad: true },
    { campo: 'periodo_fin', etiqueta: 'Hasta (año)', tipo: 'number', mitad: true },
    { campo: 'indicador', etiqueta: 'Indicador' },
    { campo: 'fuente_verificacion', etiqueta: 'Fuente de verificación' },
  ],
};
const TITULO = { linea: 'línea', accion: 'acción', actividad: 'actividad' };

function Catalogo({ arbol, esAdmin, recargar }) {
  const [q, setQ] = useState('');
  const [abiertas, setAbiertas] = useState(() => new Set());
  const [form, setForm] = useState(null); // { nivel, id?, valores }
  const [editPlan, setEditPlan] = useState(false);

  const todasAcciones = arbol.lineas.flatMap(l => l.acciones);
  const todasActividades = todasAcciones.flatMap(a => a.actividades);
  const siguiente = (lista) => (lista.reduce((m, x) => Math.max(m, x.numero), 0) + 1);

  // Con búsqueda, solo quedan las ramas que tienen coincidencias y se abren
  const filtradas = useMemo(() => {
    const t = normalizar(q.trim());
    if (!t) return arbol.lineas;
    return arbol.lineas.map(l => ({
      ...l,
      acciones: l.acciones.map(a => ({
        ...a,
        actividades: a.actividades.filter(x =>
          normalizar(`${x.numero} ${x.nombre} ${x.indicador} ${x.fuente_verificacion} ${a.nombre} ${l.nombre}`).includes(t)),
      })).filter(a => a.actividades.length),
    })).filter(l => l.acciones.length);
  }, [arbol, q]);

  const alternar = (id) => setAbiertas(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const abrirNuevo = (nivel, padreId) => {
    const lista = nivel === 'linea' ? arbol.lineas : nivel === 'accion' ? todasAcciones : todasActividades;
    const valores = { numero: siguiente(lista) };
    if (nivel === 'accion') valores.linea_id = padreId;
    if (nivel === 'actividad') {
      valores.accion_id = padreId;
      valores.periodo_inicio = arbol.plan?.anio_inicio || '';
      valores.periodo_fin = arbol.plan?.anio_fin || '';
    }
    setForm({ nivel, valores });
  };

  const eliminar = async (nivel, item) => {
    if (!confirm(`¿Eliminar la ${TITULO[nivel]} ${item.numero} — ${item.nombre}?`)) return;
    try {
      await peiAPI.eliminar(nivel, item.id);
      toast.success('Eliminado');
      recargar();
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo eliminar');
    }
  };

  const plan = arbol.plan;
  const busca = Boolean(q.trim());

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-gray-900 dark:text-gray-100">Misión y visión</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Se muestran en cada proyecto, junto a su alineación estratégica.
            </p>
          </div>
          {esAdmin && (
            <button onClick={() => setEditPlan(true)} className="btn-secondary text-xs py-1.5 px-3">
              <Pencil className="w-3.5 h-3.5" /> Editar
            </button>
          )}
        </div>
        <div className="grid md:grid-cols-2 gap-3 text-sm">
          {[['Misión', plan?.mision], ['Visión', plan?.vision]].map(([t, v]) => (
            <div key={t} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">{t}</p>
              <p className={`whitespace-pre-line ${v ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500 italic'}`}>
                {v || 'Sin registrar'}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="input pl-9 pr-8" placeholder="Buscar actividad por número, nombre o indicador…"
            value={q} onChange={e => setQ(e.target.value)} />
          {q && (
            <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {arbol.lineas.length} líneas · {todasAcciones.length} acciones · {todasActividades.length} actividades
        </span>
        {esAdmin && (
          <button onClick={() => abrirNuevo('linea')} className="btn-secondary text-sm">
            <Plus className="w-4 h-4" /> Nueva línea
          </button>
        )}
      </div>

      {busca && filtradas.length === 0 && (
        <p className="text-sm text-center text-gray-400 dark:text-gray-500 py-6">Sin resultados para "{q}"</p>
      )}

      {filtradas.map(l => {
        const abierta = busca || abiertas.has(l.id);
        return (
          <div key={l.id} className="card overflow-hidden">
            <div className="flex items-start gap-3 p-4">
              <button type="button" onClick={() => alternar(l.id)} className="flex-1 min-w-0 text-left flex items-start gap-3">
                <ChevronRight className={`w-4 h-4 mt-1 text-gray-400 flex-shrink-0 transition-transform ${abierta ? 'rotate-90' : ''}`} />
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">Línea {l.numero} · {l.nombre}</p>
                  {l.objetivo && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      <span className="font-medium">Objetivo estratégico {l.numero}:</span> {l.objetivo}
                    </p>
                  )}
                  {l.responsable && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Coordina: {l.responsable}</p>}
                </div>
              </button>
              {esAdmin && (
                <Acciones
                  onAgregar={() => abrirNuevo('accion', l.id)} agregarTexto="Acción"
                  onEditar={() => setForm({ nivel: 'linea', id: l.id, valores: l })}
                  onEliminar={() => eliminar('linea', l)}
                />
              )}
            </div>

            {abierta && (
              <div className="border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                {l.acciones.length === 0 && (
                  <p className="text-sm text-gray-400 dark:text-gray-500 italic px-4 py-3">Sin acciones.</p>
                )}
                {l.acciones.map(a => (
                  <div key={a.id} className="px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Acción {a.numero} · {a.nombre}</p>
                        {a.recursos && <p className="text-xs text-gray-400 dark:text-gray-500">Recursos: {a.recursos}</p>}
                      </div>
                      {esAdmin && (
                        <Acciones
                          onAgregar={() => abrirNuevo('actividad', a.id)} agregarTexto="Actividad"
                          onEditar={() => setForm({ nivel: 'accion', id: a.id, valores: a })}
                          onEliminar={() => eliminar('accion', a)}
                        />
                      )}
                    </div>
                    {a.actividades.length > 0 && (
                      <div className="overflow-x-auto -mx-1">
                        <table className="w-full text-sm min-w-[640px]">
                          <thead>
                            <tr className="text-left text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                              <th className="py-1.5 px-1 font-medium w-10">N.º</th>
                              <th className="py-1.5 px-1 font-medium">Actividad</th>
                              <th className="py-1.5 px-1 font-medium w-24">Periodo</th>
                              <th className="py-1.5 px-1 font-medium">Indicador</th>
                              <th className="py-1.5 px-1 font-medium">Fuente de verificación</th>
                              {esAdmin && <th className="w-16" />}
                            </tr>
                          </thead>
                          <tbody>
                            {a.actividades.map(x => (
                              <tr key={x.id} className="border-t border-gray-50 dark:border-gray-800 align-top">
                                <td className="py-1.5 px-1 tabular-nums font-semibold text-gray-700 dark:text-gray-300">{x.numero}</td>
                                <td className="py-1.5 px-1 text-gray-700 dark:text-gray-300">{x.nombre}</td>
                                <td className="py-1.5 px-1 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                  {x.periodo_inicio ? `${x.periodo_inicio}–${x.periodo_fin}` : '—'}
                                </td>
                                <td className="py-1.5 px-1 text-gray-600 dark:text-gray-400">{x.indicador || '—'}</td>
                                <td className="py-1.5 px-1 text-gray-500 dark:text-gray-400 text-xs">{x.fuente_verificacion || '—'}</td>
                                {esAdmin && (
                                  <td className="py-1.5 px-1">
                                    <div className="flex gap-1 justify-end">
                                      <button title="Editar" onClick={() => setForm({ nivel: 'actividad', id: x.id, valores: x })}
                                        className="p-1 text-gray-400 hover:text-primary-500"><Pencil className="w-3.5 h-3.5" /></button>
                                      <button title="Eliminar" onClick={() => eliminar('actividad', x)}
                                        className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {form && (
        <FormNivel form={form} arbol={arbol} onCerrar={() => setForm(null)}
          onGuardado={() => { setForm(null); recargar(); }} />
      )}
      {editPlan && (
        <FormPlan plan={plan} onCerrar={() => setEditPlan(false)}
          onGuardado={() => { setEditPlan(false); recargar(); }} />
      )}
    </div>
  );
}

function Acciones({ onAgregar, agregarTexto, onEditar, onEliminar }) {
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      <button onClick={onAgregar} className="text-xs text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-0.5 px-1">
        <Plus className="w-3 h-3" /> {agregarTexto}
      </button>
      <button title="Editar" onClick={onEditar} className="p-1 text-gray-400 hover:text-primary-500"><Pencil className="w-3.5 h-3.5" /></button>
      <button title="Eliminar" onClick={onEliminar} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
    </div>
  );
}

function FormNivel({ form, arbol, onCerrar, onGuardado }) {
  const { nivel, id } = form;
  const [valores, setValores] = useState(() => {
    const v = {};
    for (const c of CAMPOS[nivel]) v[c.campo] = form.valores?.[c.campo] ?? '';
    return v;
  });
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);

  const opcionesPadre = nivel === 'accion'
    ? arbol.lineas.map(l => ({ id: l.id, texto: `Línea ${l.numero} · ${l.nombre}` }))
    : arbol.lineas.flatMap(l => l.acciones.map(a => ({ id: a.id, texto: `Acción ${a.numero} · ${a.nombre}` })));

  const guardar = async (e) => {
    e.preventDefault();
    const faltan = {};
    for (const c of CAMPOS[nivel]) {
      if (c.requerido && !String(valores[c.campo] || '').trim()) faltan[c.campo] = 'Este campo es obligatorio';
    }
    if (Object.keys(faltan).length) { setErrores(faltan); return; }
    setGuardando(true);
    try {
      if (id) await peiAPI.actualizar(nivel, id, valores);
      else await peiAPI.crear(nivel, valores);
      toast.success(id ? 'Cambios guardados' : 'Agregado al plan');
      onGuardado();
    } catch (err) {
      const { message, campo } = err.response?.data || {};
      if (campo) setErrores({ [campo]: message });
      else toast.error(message || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const cambiar = (campo, valor) => {
    setValores(v => ({ ...v, [campo]: valor }));
    if (errores[campo]) setErrores(e => ({ ...e, [campo]: undefined }));
  };

  return (
    <Modal title={`${id ? 'Editar' : 'Nueva'} ${TITULO[nivel]}`} onClose={onCerrar}>
      <form onSubmit={guardar} noValidate className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {CAMPOS[nivel].map(c => (
            <div key={c.campo} className={c.mitad ? '' : 'col-span-2'}>
              <label className="label">{c.etiqueta}{c.requerido ? ' *' : ''}</label>
              {c.tipo === 'textarea' ? (
                <textarea className="input resize-none" rows={3} value={valores[c.campo] ?? ''}
                  onChange={e => cambiar(c.campo, e.target.value)} />
              ) : c.tipo === 'padre' ? (
                <select className="input" value={valores[c.campo] ?? ''} onChange={e => cambiar(c.campo, e.target.value)}>
                  {opcionesPadre.map(o => <option key={o.id} value={o.id}>{o.texto}</option>)}
                </select>
              ) : (
                <input type={c.tipo === 'number' ? 'number' : 'text'} className="input" value={valores[c.campo] ?? ''}
                  onChange={e => cambiar(c.campo, e.target.value)} />
              )}
              {errores[c.campo] && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errores[c.campo]}</p>}
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" className="btn-secondary flex-1" onClick={onCerrar}>Cancelar</button>
          <button type="submit" disabled={guardando} className="btn-primary flex-1">
            {guardando ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FormPlan({ plan, onCerrar, onGuardado }) {
  const [v, setV] = useState({
    nombre: plan?.nombre || 'Plan Estratégico Institucional',
    anio_inicio: plan?.anio_inicio || '', anio_fin: plan?.anio_fin || '',
    mision: plan?.mision || '', vision: plan?.vision || '',
  });
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await peiAPI.guardarPlan(v);
      toast.success('Datos del plan guardados');
      onGuardado();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal title="Datos del plan" onClose={onCerrar} size="lg">
      <form onSubmit={guardar} noValidate className="space-y-3">
        <div>
          <label className="label">Nombre</label>
          <input className="input" value={v.nombre} onChange={e => setV({ ...v, nombre: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Desde (año)</label>
            <input type="number" className="input" value={v.anio_inicio} onChange={e => setV({ ...v, anio_inicio: e.target.value })} />
          </div>
          <div>
            <label className="label">Hasta (año)</label>
            <input type="number" className="input" value={v.anio_fin} onChange={e => setV({ ...v, anio_fin: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">Misión</label>
          <textarea className="input resize-none" rows={4} value={v.mision} onChange={e => setV({ ...v, mision: e.target.value })} />
        </div>
        <div>
          <label className="label">Visión</label>
          <textarea className="input resize-none" rows={4} value={v.vision} onChange={e => setV({ ...v, vision: e.target.value })} />
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex gap-2 pt-2">
          <button type="button" className="btn-secondary flex-1" onClick={onCerrar}>Cancelar</button>
          <button type="submit" disabled={guardando} className="btn-primary flex-1">
            {guardando ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
