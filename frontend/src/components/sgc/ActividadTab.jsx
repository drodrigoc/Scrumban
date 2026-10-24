import { useEffect, useRef, useState } from 'react';
import { History, Upload, ArrowRightLeft, Trash2, Search, X, ExternalLink } from 'lucide-react';
import { sgcAPI } from '../../services/api';
import { BotonDescarga, useVerTarea } from './comunes';

const ACCIONES = {
  subida:       { label: 'Subidas',        icono: Upload,         color: 'text-[#0a7d0a] dark:text-[#3fc43f] bg-green-50 dark:bg-green-900/20' },
  reasignacion: { label: 'Reasignaciones', icono: ArrowRightLeft, color: 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20' },
  eliminacion:  { label: 'Eliminaciones',  icono: Trash2,         color: 'text-[#d03b3b] dark:text-[#f07070] bg-red-50 dark:bg-red-900/20' },
};

const FILTROS_VACIOS = { q: '', usuario: '', accion: '', desde: '', hasta: '' };

// El día elegido es local; el backend compara instantes en UTC
const inicioDelDia = (dia) => new Date(`${dia}T00:00:00`).toISOString();
const inicioDelDiaSiguiente = (dia) => {
  const d = new Date(`${dia}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
};

const claveDia = (fecha) => {
  const d = new Date(fecha);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

function tituloDia(fecha) {
  const d = new Date(fecha);
  const hoy = new Date();
  const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
  if (claveDia(d) === claveDia(hoy))  return 'Hoy';
  if (claveDia(d) === claveDia(ayer)) return 'Ayer';
  const texto = d.toLocaleDateString('es-SV', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const hora = (fecha) => new Date(fecha).toLocaleTimeString('es-SV', { hour: 'numeric', minute: '2-digit' });

const Codigo = ({ children }) => (
  <span className="font-mono text-xs font-bold text-primary-600 dark:text-primary-400">{children}</span>
);

function Frase({ item }) {
  const quien = <b className="font-semibold text-gray-900 dark:text-gray-100">{item.usuario || 'Usuario eliminado'}</b>;
  const archivo = <b className="font-medium text-gray-900 dark:text-gray-100 break-all">{item.filename}</b>;
  const evidencia = item.evidencia_codigo ? <Codigo>{item.evidencia_codigo}</Codigo> : <i>una evidencia eliminada</i>;

  if (item.accion === 'subida')       return <>{quien} subió {archivo} a {evidencia}</>;
  if (item.accion === 'eliminacion')  return <>{quien} eliminó {archivo} de {evidencia}</>;
  return (
    <>{quien} movió {archivo} de {item.evidencia_anterior ? <Codigo>{item.evidencia_anterior}</Codigo> : 'otra evidencia'} a {evidencia}</>
  );
}

export default function ActividadTab() {
  const [filtros, setFiltros]   = useState(FILTROS_VACIOS);
  const [busqueda, setBusqueda] = useState(''); // lo que se escribe; filtros.q se actualiza con pausa
  const [items, setItems]       = useState([]);
  const [total, setTotal]       = useState(0);
  const [pagina, setPagina]     = useState(1);
  const [porPagina, setPorPagina] = useState(50);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError]       = useState(null);
  const verTarea = useVerTarea();
  const consulta = useRef(0);

  // Buscar mientras se escribe, sin una petición por tecla
  useEffect(() => {
    const t = setTimeout(() => setFiltros(f => (f.q === busqueda ? f : { ...f, q: busqueda })), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const parametros = (pag) => ({
    pagina: pag,
    q:       filtros.q || undefined,
    usuario: filtros.usuario || undefined,
    accion:  filtros.accion || undefined,
    desde:   filtros.desde ? inicioDelDia(filtros.desde) : undefined,
    hasta:   filtros.hasta ? inicioDelDiaSiguiente(filtros.hasta) : undefined,
  });

  useEffect(() => {
    const id = ++consulta.current;
    setLoading(true);
    sgcAPI.getActividad(parametros(1))
      .then(({ data }) => {
        if (id !== consulta.current) return; // llegó tarde: ya hay otra consulta
        setItems(data.items);
        setTotal(data.total);
        setPagina(1);
        setPorPagina(data.por_pagina);
        setUsuarios(data.usuarios);
        setError(null);
      })
      .catch(err => { if (id === consulta.current) setError(err.response?.data?.message || 'Error al cargar la actividad'); })
      .finally(() => { if (id === consulta.current) setLoading(false); });
  }, [filtros]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargarMas = async () => {
    setCargandoMas(true);
    try {
      const { data } = await sgcAPI.getActividad(parametros(pagina + 1));
      setItems(prev => [...prev, ...data.items]);
      setPagina(pagina + 1);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al cargar la actividad');
    } finally {
      setCargandoMas(false);
    }
  };

  const cambiar = (campo, valor) => setFiltros(f => ({ ...f, [campo]: valor }));
  const hayFiltros = busqueda || Object.entries(filtros).some(([k, v]) => k !== 'q' && v);
  const limpiar = () => { setBusqueda(''); setFiltros(FILTROS_VACIOS); };

  // Agrupar por día, conservando el orden
  const dias = [];
  for (const item of items) {
    const clave = claveDia(item.created_at);
    if (!dias.length || dias[dias.length - 1].clave !== clave) dias.push({ clave, fecha: item.created_at, items: [] });
    dias[dias.length - 1].items.push(item);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="relative w-full sm:w-56">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="input text-sm py-1.5 pl-9" placeholder="Archivo, evidencia o tarea…"
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
          />
        </div>
        <select className="input text-sm py-1.5 w-full sm:w-44" value={filtros.usuario} onChange={e => cambiar('usuario', e.target.value)}>
          <option value="">Todas las personas</option>
          {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select className="input text-sm py-1.5 w-full sm:w-40" value={filtros.accion} onChange={e => cambiar('accion', e.target.value)}>
          <option value="">Todas las acciones</option>
          {Object.entries(ACCIONES).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          Desde
          <input type="date" className="input text-sm py-1 w-36" value={filtros.desde}
            max={filtros.hasta || undefined} onChange={e => cambiar('desde', e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          Hasta
          <input type="date" className="input text-sm py-1 w-36" value={filtros.hasta}
            min={filtros.desde || undefined} onChange={e => cambiar('hasta', e.target.value)} />
        </label>
        {hayFiltros && (
          <button onClick={limpiar} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 px-2 py-2">
            <X className="w-3.5 h-3.5" /> Limpiar
          </button>
        )}
      </div>

      {error ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{error}</p>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">
            {hayFiltros ? 'No hay actividad con estos filtros.' : 'Todavía no se ha subido ningún archivo de evidencia.'}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {total} {total === 1 ? 'movimiento' : 'movimientos'}{items.length < total ? ` · mostrando ${items.length}` : ''}
          </p>

          <div className="space-y-5">
            {dias.map(dia => (
              <section key={dia.clave}>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">{tituloDia(dia.fecha)}</h3>
                <ol className="card divide-y divide-gray-100 dark:divide-gray-800">
                  {dia.items.map(item => {
                    const conf = ACCIONES[item.accion] || ACCIONES.subida;
                    const Icono = conf.icono;
                    return (
                      <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${conf.color}`}>
                          <Icono className="w-4 h-4" aria-hidden="true" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 dark:text-gray-300"><Frase item={item} /></p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                            {hora(item.created_at)}
                            {item.task_titulo && ` · ${item.task_titulo}`}
                            {item.project_name && ` · ${item.project_name}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {item.task_id && item.project_id && (
                            <button
                              type="button" onClick={() => verTarea.abrir(item.project_id, item.task_id)} disabled={verTarea.cargando}
                              title="Ver la tarea" aria-label="Ver la tarea"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-primary-400"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                          )}
                          {item.archivo_existe && item.accion !== 'eliminacion' && item.task_id && (
                            <BotonDescarga
                              archivo={{ id: item.attachment_id, filename: item.filename }}
                              projectId={item.project_id} taskId={item.task_id}
                            />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>

          {items.length < total && (
            <div className="text-center">
              <button onClick={cargarMas} disabled={cargandoMas} className="btn-secondary text-sm">
                {cargandoMas
                  ? <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  : `Cargar ${Math.min(porPagina, total - items.length)} más`}
              </button>
            </div>
          )}
        </>
      )}

      {verTarea.modal}
    </div>
  );
}
