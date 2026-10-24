import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { ListChecks, X, Paperclip, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { sgcAPI } from '../../services/api';
import { ESTADOS, ORDEN_ESTADOS, NIVELES_RESUMEN, contar, resumirPor, porcentaje, ordenCodigos } from './estados';
import { BarraEstados, BotonDescarga, EstadoBadge, Leyenda, useVerTarea } from './comunes';

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

const POR_PAGINA = 25;

const fechaCorta = (valor) =>
  new Date(valor).toLocaleDateString('es-SV', { day: '2-digit', month: 'short', year: 'numeric' });

// Las fechas límite son DATE: se leen como día, sin convertir de zona
const diaLimite = (valor) =>
  new Date(`${String(valor).slice(0, 10)}T12:00:00`).toLocaleDateString('es-SV', { day: '2-digit', month: 'short', year: 'numeric' });

const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

// ---------------------------------------------------------------------------
// Resumen: cobertura, conteo por estado y avance por nivel
// ---------------------------------------------------------------------------
function Resumen({ base, filtros, onEstado, onBajarNivel }) {
  const conteo = contar(base);
  const cobertura = porcentaje(conteo.con_evidencia, conteo.total);

  // El desglose baja un nivel por debajo del filtro actual
  const nivelHijo = filtros.indicador ? null : filtros.criterio ? 'indicador' : filtros.dimension ? 'criterio' : 'dimension';
  const filas = nivelHijo ? resumirPor(base, nivelHijo) : [];

  return (
    <div className="space-y-3">
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Cobertura</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 tabular-nums leading-tight">{cobertura}%</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {conteo.con_evidencia} de {plural(conteo.total, 'evidencia', 'evidencias')} con archivo
            </p>
          </div>

          {/* Cada estado filtra la lista al hacer clic */}
          <div className="flex flex-wrap gap-2 flex-1">
            {ORDEN_ESTADOS.map(e => {
              const Icono = ESTADOS[e].icono;
              const activo = filtros.estado === e;
              return (
                <button
                  key={e} type="button" onClick={() => onEstado(activo ? '' : e)}
                  title={ESTADOS[e].descripcion} aria-pressed={activo}
                  className={`flex-1 min-w-[7.5rem] text-left px-3 py-2 rounded-lg border transition-colors ${
                    activo
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 dark:border-primary-400'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <Icono className={`w-3.5 h-3.5 ${ESTADOS[e].texto}`} aria-hidden="true" />
                    {ESTADOS[e].label}
                  </span>
                  <span className="block text-lg font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{conteo[e]}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-3">
          <BarraEstados conteo={conteo} alto="h-3" />
        </div>
      </div>

      {nivelHijo && filas.length > 0 && (
        <div className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              Avance por {NIVELES_RESUMEN[nivelHijo].titulo.toLowerCase()}
            </h3>
            <Leyenda />
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {filas.map(f => (
              <button
                key={f.codigo} type="button" onClick={() => onBajarNivel(nivelHijo, f.codigo)}
                className="w-full grid grid-cols-[3.5rem_minmax(0,1fr)] sm:grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,14rem)_5.5rem] items-center gap-x-3 gap-y-1 py-2 px-1 text-left rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/60"
                title={`Ver ${NIVELES_RESUMEN[nivelHijo].titulo.toLowerCase()} ${f.codigo}`}
              >
                <span className="font-mono text-xs font-bold text-primary-600 dark:text-primary-400">{f.codigo}</span>
                <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{f.nombre}</span>
                <span className="col-start-2 sm:col-start-auto"><BarraEstados conteo={f} /></span>
                <span className="col-start-2 sm:col-start-auto text-xs text-gray-500 dark:text-gray-400 tabular-nums sm:text-right">
                  {f.con_evidencia}/{f.total} · {porcentaje(f.con_evidencia, f.total)}%
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta de una evidencia
// ---------------------------------------------------------------------------
function TarjetaEvidencia({ e, onVerTarea, cargandoTarea }) {
  const [verArchivos, setVerArchivos] = useState(false);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 px-4 py-3 bg-gray-50 dark:bg-gray-800">
        <span className="font-mono font-bold text-primary-600 dark:text-primary-400 text-sm w-20 flex-shrink-0">{e.evidencia}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm line-clamp-2" title={e.nombre_evidencia}>{e.nombre_evidencia}</p>
          <p
            className="text-xs text-gray-400 dark:text-gray-500 truncate"
            title={`${e.dimension} ${e.dimension_nombre} · ${e.criterio} ${e.criterio_nombre} · ${e.indicador} ${e.indicador_nombre}`}
          >
            Indicador {e.indicador} — {e.indicador_nombre}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <EstadoBadge estado={e.estado} motivo={e.motivo} />
          <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
            {plural(e.tasks.length, 'tarea', 'tareas')}
          </span>
          <button
            type="button" onClick={() => setVerArchivos(v => !v)} disabled={!e.archivos.length}
            aria-expanded={verArchivos}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 enabled:hover:bg-gray-300 dark:enabled:hover:bg-gray-600 disabled:opacity-60"
          >
            <Paperclip className="w-3 h-3" />
            {plural(e.archivos.length, 'archivo', 'archivos')}
            {e.archivos.length > 0 && (verArchivos ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)}
          </button>
        </div>
      </div>

      {verArchivos && e.archivos.length > 0 && (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700">
          {e.archivos.map(a => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-2">
              <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{a.filename}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                  {a.uploaded_by || 'Sin autor'} · {fechaCorta(a.created_at)} · {a.task_title}
                </p>
              </div>
              <BotonDescarga archivo={a} projectId={a.project_id} taskId={a.task_id} />
            </li>
          ))}
        </ul>
      )}

      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {e.tasks.length === 0 ? (
          <p className="px-6 py-3 text-sm text-gray-400 dark:text-gray-500 italic">Sin tareas vinculadas aún.</p>
        ) : e.tasks.map(t => (
          <button
            key={t.id}
            onClick={() => onVerTarea(t.project_id, t.id)}
            disabled={cargandoTarea}
            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors text-left cursor-pointer"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{t.title}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {t.project_name}
                {t.assignee_name ? ` · ${t.assignee_name}` : ''}
                {t.due_date ? ` · Vence ${diaLimite(t.due_date)}` : ''}
              </p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusColors[t.status] || statusColors.pending}`}>
              {statusLabels[t.status] || t.status}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Visualización
// ---------------------------------------------------------------------------
export default function VisualizacionTab() {
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filtros, setFiltros] = useState({ dimension: '', criterio: '', indicador: '', estado: '' });
  const [mostrar, setMostrar] = useState(POR_PAGINA);
  const verTarea = useVerTarea();

  useEffect(() => {
    sgcAPI.getAllWithTasks()
      .then(({ data }) => setData(data))
      .catch((err) => toast.error(err.response?.data?.message || 'Error al cargar visualización'))
      .finally(() => setLoading(false));
  }, []);

  // Al cambiar un nivel se limpian los de abajo
  const cambiarFiltro = (campo, valor) => {
    setMostrar(POR_PAGINA);
    setFiltros(f => {
      const n = { ...f, [campo]: valor };
      if (campo === 'dimension') { n.criterio = ''; n.indicador = ''; }
      if (campo === 'criterio')  n.indicador = '';
      return n;
    });
  };

  // Clic en una fila del avance: un criterio o indicador fija también sus superiores
  const bajarNivel = (nivel, codigo) => {
    const partes = codigo.split('.');
    setMostrar(POR_PAGINA);
    setFiltros(f => ({
      ...f,
      dimension: partes[0],
      criterio:  nivel === 'dimension' ? '' : partes.slice(0, 2).join('.'),
      indicador: nivel === 'indicador' ? codigo : '',
    }));
  };

  // Opciones únicas de cada filtro: [código, nombre], en orden natural
  const opciones = (filas, campo, nombre) => {
    const mapa = new Map();
    filas.forEach(e => { if (e[campo]) mapa.set(e[campo], e[nombre]); });
    return [...mapa.entries()].sort((a, b) => ordenCodigos(a[0], b[0]));
  };

  const dimensiones = useMemo(() => opciones(data, 'dimension', 'dimension_nombre'), [data]);
  const criterios   = useMemo(() => opciones(data.filter(e => !filtros.dimension || e.dimension === filtros.dimension), 'criterio', 'criterio_nombre'), [data, filtros.dimension]);
  const indicadores = useMemo(() => opciones(data.filter(e =>
    (!filtros.dimension || e.dimension === filtros.dimension) && (!filtros.criterio || e.criterio === filtros.criterio)
  ), 'indicador', 'indicador_nombre'), [data, filtros.dimension, filtros.criterio]);

  // El resumen usa todos los filtros menos el de estado: si no, al elegir
  // "En riesgo" la cobertura saldría siempre 0 %
  const base = useMemo(() => data.filter(e => {
    if (filtros.dimension && e.dimension !== filtros.dimension) return false;
    if (filtros.criterio  && e.criterio  !== filtros.criterio)  return false;
    if (filtros.indicador && e.indicador !== filtros.indicador) return false;
    if (search) {
      const q = search.toLowerCase();
      return [e.evidencia, e.nombre_evidencia, e.indicador, e.indicador_nombre, e.criterio_nombre, e.dimension_nombre,
        ...e.tasks.map(t => t.title), ...e.archivos.map(a => a.filename)]
        .some(v => String(v || '').toLowerCase().includes(q));
    }
    return true;
  }), [data, filtros.dimension, filtros.criterio, filtros.indicador, search]);

  const filtered = filtros.estado ? base.filter(e => e.estado === filtros.estado) : base;

  const hayFiltros = search || Object.values(filtros).some(Boolean);
  const limpiarFiltros = () => {
    setSearch('');
    setFiltros({ dimension: '', criterio: '', indicador: '', estado: '' });
    setMostrar(POR_PAGINA);
  };

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative w-full sm:w-56">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="input text-sm py-1.5 pl-9"
            placeholder="Evidencia, tarea o archivo…"
            value={search}
            onChange={e => { setSearch(e.target.value); setMostrar(POR_PAGINA); }}
          />
        </div>
        <select className="input text-sm py-1.5 w-full sm:w-44" value={filtros.dimension}
          onChange={e => cambiarFiltro('dimension', e.target.value)}>
          <option value="">Todas las dimensiones</option>
          {dimensiones.map(([c, n]) => <option key={c} value={c}>{c} — {n}</option>)}
        </select>
        <select className="input text-sm py-1.5 w-full sm:w-44" value={filtros.criterio}
          onChange={e => cambiarFiltro('criterio', e.target.value)}>
          <option value="">Todos los criterios</option>
          {criterios.map(([c, n]) => <option key={c} value={c}>{c} — {n}</option>)}
        </select>
        <select className="input text-sm py-1.5 w-full sm:w-44" value={filtros.indicador}
          onChange={e => cambiarFiltro('indicador', e.target.value)}>
          <option value="">Todos los indicadores</option>
          {indicadores.map(([c, n]) => <option key={c} value={c}>{c} — {n}</option>)}
        </select>
        <select className="input text-sm py-1.5 w-full sm:w-40" value={filtros.estado}
          onChange={e => cambiarFiltro('estado', e.target.value)}>
          <option value="">Todos los estados</option>
          {ORDEN_ESTADOS.map(e => <option key={e} value={e}>{ESTADOS[e].label}</option>)}
        </select>
        {hayFiltros && (
          <button
            onClick={limpiarFiltros}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 px-2"
          >
            <X className="w-3.5 h-3.5" /> Limpiar
          </button>
        )}
      </div>

      <Resumen
        base={base} filtros={filtros}
        onEstado={(e) => cambiarFiltro('estado', e)}
        onBajarNivel={bajarNivel}
      />

      <p className="text-xs text-gray-400 dark:text-gray-500">
        {filtered.length} de {plural(data.length, 'evidencia', 'evidencias')}
        {filtros.estado && ` · ${ESTADOS[filtros.estado].label}`}
      </p>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <ListChecks className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No hay evidencias que mostrar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.slice(0, mostrar).map(e => (
            <TarjetaEvidencia key={e.id} e={e} onVerTarea={verTarea.abrir} cargandoTarea={verTarea.cargando} />
          ))}
          {filtered.length > mostrar && (
            <div className="text-center pt-1">
              <button onClick={() => setMostrar(m => m + POR_PAGINA)} className="btn-secondary text-sm">
                Mostrar {Math.min(POR_PAGINA, filtered.length - mostrar)} más · quedan {filtered.length - mostrar}
              </button>
            </div>
          )}
        </div>
      )}

      {verTarea.modal}
    </div>
  );
}
