import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  ScrollText, Download, Search, X, LogIn, UserX, ShieldAlert, Users as UsersIcon, PencilLine,
  ChevronLeft, ChevronRight, AlertTriangle,
} from 'lucide-react';
import { auditoriaAPI } from '../services/api';
import { guardarBlob, mensajeDeError } from '../components/sgc/comunes';

const FILTROS_VACIOS = { q: '', usuario: '', correo: '', categoria: '', accion: '', resultado: '', desde: '', hasta: '' };

// Color de cada categoría (los fallos siempre en rojo)
const COLOR_CATEGORIA = {
  acceso:        'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300',
  usuarios:      'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  proyectos:     'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  configuracion: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  sgc:           'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
};
const COLOR_FALLO = 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300';

// El día elegido es local; el backend compara instantes en UTC
const inicioDelDia = (dia) => new Date(`${dia}T00:00:00`).toISOString();
const inicioDelDiaSiguiente = (dia) => {
  const d = new Date(`${dia}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
};

const fecha = (v) => new Date(v).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' });
const hora  = (v) => new Date(v).toLocaleTimeString('es-SV', { hour: 'numeric', minute: '2-digit', second: '2-digit' });

// "Chrome · Windows" a partir del user-agent
function navegador(ua) {
  if (!ua) return null;
  const nombre = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : /curl|node|axios|postman|python/i.test(ua) ? 'Programa'
    : 'Otro';
  const sistema = /Windows/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Mac OS/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : null;
  return sistema ? `${nombre} · ${sistema}` : nombre;
}

function Indicador({ icono: Icono, valor, etiqueta, alerta }) {
  return (
    <div className="card px-4 py-3 flex items-center gap-3">
      <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
        alerta ? COLOR_FALLO : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
      }`}>
        <Icono className="w-4 h-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums leading-tight">{valor}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{etiqueta}</p>
      </div>
    </div>
  );
}

export default function Auditoria() {
  const [params] = useSearchParams();
  const [filtros, setFiltros]   = useState(() => ({ ...FILTROS_VACIOS, usuario: params.get('usuario') || '' }));
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina]     = useState(1);
  const [datos, setDatos]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [descargando, setDescargando] = useState(false);
  const consulta = useRef(0);

  // Cualquier cambio de filtro vuelve a la primera página (en el mismo
  // render, para no consultar dos veces)
  const filtrar = (cambio) => { setFiltros(cambio); setPagina(1); };

  // Buscar mientras se escribe, sin una petición por tecla
  useEffect(() => {
    const t = setTimeout(() => {
      if (busqueda !== filtros.q) filtrar(f => ({ ...f, q: busqueda }));
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda]); // eslint-disable-line react-hooks/exhaustive-deps

  const parametros = () => ({
    q:         filtros.q || undefined,
    usuario:   filtros.usuario || undefined,
    correo:    filtros.correo || undefined,
    categoria: filtros.categoria || undefined,
    accion:    filtros.accion || undefined,
    resultado: filtros.resultado || undefined,
    desde:     filtros.desde ? inicioDelDia(filtros.desde) : undefined,
    hasta:     filtros.hasta ? inicioDelDiaSiguiente(filtros.hasta) : undefined,
  });

  useEffect(() => {
    const id = ++consulta.current;
    setLoading(true);
    auditoriaAPI.listar({ ...parametros(), pagina })
      .then(({ data }) => { if (id === consulta.current) { setDatos(data); setError(null); } })
      .catch(err => { if (id === consulta.current) setError(err.response?.data?.message || 'Error al cargar la auditoría'); })
      .finally(() => { if (id === consulta.current) setLoading(false); });
  }, [filtros, pagina]); // eslint-disable-line react-hooks/exhaustive-deps

  const cambiar = (campo, valor) => filtrar(f => ({
    ...f, [campo]: valor,
    // Al cambiar de categoría, la acción elegida puede dejar de pertenecerle
    ...(campo === 'categoria' ? { accion: '' } : {}),
  }));
  const hayFiltros = busqueda || Object.entries(filtros).some(([k, v]) => k !== 'q' && v);
  const limpiar = () => { setBusqueda(''); filtrar(FILTROS_VACIOS); };

  const descargar = async () => {
    setDescargando(true);
    try {
      const { data, headers } = await auditoriaAPI.descargarCsv(parametros());
      const hoy = new Date().toLocaleDateString('en-CA');
      guardarBlob(data, `auditoria-${hoy}.csv`);
      if (headers['x-recortado']) toast.info(`Se descargaron los ${headers['x-recortado']} registros más recientes. Usa filtros para acotar.`);
    } catch (err) {
      toast.error(await mensajeDeError(err, 'No se pudo descargar el CSV'));
    } finally {
      setDescargando(false);
    }
  };

  const acciones = (datos?.acciones || []).filter(a => !filtros.categoria || a.categoria === filtros.categoria);
  const paginas  = datos ? Math.max(1, Math.ceil(datos.total / datos.por_pagina)) : 1;
  const r = datos?.resumen;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Auditoría</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Quién entra al sistema, quién falla al intentarlo y qué cambios importantes se hacen. Se conserva un año.
          </p>
        </div>
        <button onClick={descargar} disabled={descargando || !datos?.total} className="btn-primary">
          {descargando
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <Download className="w-4 h-4" />}
          Descargar CSV
        </button>
      </div>

      {r && (
        <section aria-label="Resumen de los últimos 7 días">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Últimos 7 días</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <Indicador icono={LogIn}       valor={r.accesos}  etiqueta="Inicios de sesión" />
            <Indicador icono={UsersIcon}   valor={r.personas} etiqueta="Personas distintas" />
            <Indicador icono={UserX}       valor={r.fallidos} etiqueta="Intentos fallidos" alerta={r.fallidos > 0} />
            <Indicador icono={ShieldAlert} valor={r.bloqueos} etiqueta="Bloqueos por intentos" alerta={r.bloqueos > 0} />
            <Indicador icono={PencilLine}  valor={r.cambios}  etiqueta="Cambios registrados" />
          </div>
        </section>
      )}

      {datos?.alertas?.length > 0 && (
        <section className="card border-amber-200 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-900/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4" /> Varios intentos fallidos en las últimas 24 horas
          </h2>
          <ul className="space-y-1">
            {datos.alertas.map(a => (
              <li key={a.correo} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-gray-700 dark:text-gray-300 min-w-0 truncate">
                  <b className="font-medium">{a.nombre || a.correo}</b>
                  {a.nombre && <span className="text-gray-500 dark:text-gray-400"> · {a.correo}</span>}
                  <span className="text-gray-500 dark:text-gray-400"> · {a.intentos} intentos, el último a las {hora(a.ultimo)}</span>
                </span>
                <button
                  onClick={() => { setBusqueda(''); filtrar({ ...FILTROS_VACIOS, correo: a.correo }); }}
                  className="text-xs font-medium text-amber-800 dark:text-amber-300 hover:underline flex-shrink-0"
                >
                  Ver intentos
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2 items-end">
        <div className="relative w-full sm:w-60">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="input text-sm py-1.5 pl-9" placeholder="Persona, correo, elemento, IP…"
            value={busqueda} onChange={e => setBusqueda(e.target.value)} aria-label="Buscar"
          />
        </div>
        <select className="input text-sm py-1.5 w-full sm:w-48" value={filtros.usuario}
          onChange={e => cambiar('usuario', e.target.value)} aria-label="Persona">
          <option value="">Todas las personas</option>
          {(datos?.usuarios || []).map(u => <option key={u.id} value={u.id}>{u.nombre || u.correo}</option>)}
          {filtros.usuario && datos && !datos.usuarios.some(u => String(u.id) === filtros.usuario) && (
            <option value={filtros.usuario}>Persona sin actividad</option>
          )}
        </select>
        <select className="input text-sm py-1.5 w-full sm:w-40" value={filtros.categoria}
          onChange={e => cambiar('categoria', e.target.value)} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {(datos?.categorias || []).map(c => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
        </select>
        <select className="input text-sm py-1.5 w-full sm:w-56" value={filtros.accion}
          onChange={e => cambiar('accion', e.target.value)} aria-label="Acción">
          <option value="">Todas las acciones</option>
          {acciones.map(a => <option key={a.id} value={a.id}>{a.etiqueta}</option>)}
        </select>
        <select className="input text-sm py-1.5 w-full sm:w-36" value={filtros.resultado}
          onChange={e => cambiar('resultado', e.target.value)} aria-label="Resultado">
          <option value="">Éxitos y fallos</option>
          <option value="exito">Solo éxitos</option>
          <option value="fallo">Solo fallos</option>
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
        {filtros.correo && (
          <span className="badge bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 flex items-center gap-1 py-1">
            Correo: {filtros.correo}
            <button onClick={() => cambiar('correo', '')} aria-label="Quitar el filtro de correo">
              <X className="w-3 h-3" />
            </button>
          </span>
        )}
        {hayFiltros && (
          <button onClick={limpiar} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 px-2 py-2">
            <X className="w-3.5 h-3.5" /> Limpiar
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        {error ? (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            <ScrollText className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{error}</p>
          </div>
        ) : loading && !datos ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !datos.items.length ? (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500">
            <ScrollText className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{hayFiltros ? 'No hay registros con estos filtros.' : 'Todavía no hay registros.'}</p>
          </div>
        ) : (
          <div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-50' : ''}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                  {['Fecha', 'Persona', 'Acción', 'Detalle', 'Origen'].map(t => (
                    <th key={t} className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {datos.items.map(item => (
                  <tr key={item.id} className="align-top hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-gray-800 dark:text-gray-200">{fecha(item.creado_en)}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{hora(item.creado_en)}</p>
                    </td>
                    <td className="px-4 py-3 max-w-[14rem]">
                      {item.usuario_nombre ? (
                        <>
                          <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{item.usuario_nombre}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{item.usuario_correo}</p>
                        </>
                      ) : (
                        <p className="text-gray-600 dark:text-gray-400 break-all">{item.usuario_correo || <i>Desconocido</i>}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge whitespace-nowrap ${item.resultado === 'fallo' ? COLOR_FALLO : COLOR_CATEGORIA[item.categoria]}`}>
                        {item.accion_etiqueta}
                      </span>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{item.categoria_etiqueta}</p>
                    </td>
                    <td className="px-4 py-3 min-w-[16rem]">
                      {item.entidad_nombre && <p className="text-gray-800 dark:text-gray-200 break-words">{item.entidad_nombre}</p>}
                      {item.detalle && <p className="text-xs text-gray-500 dark:text-gray-400 break-words mt-0.5">{item.detalle}</p>}
                      {!item.entidad_nombre && !item.detalle && <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-mono text-xs text-gray-600 dark:text-gray-400">{item.ip || '—'}</p>
                      {item.navegador && (
                        <p className="text-xs text-gray-400 dark:text-gray-500" title={item.navegador}>{navegador(item.navegador)}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {datos?.total > 0 && !error && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
            <span>
              {datos.total} {datos.total === 1 ? 'registro' : 'registros'} · página {pagina} de {paginas}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPagina(p => p - 1)} disabled={pagina <= 1 || loading}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:pointer-events-none"
                aria-label="Página anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPagina(p => p + 1)} disabled={pagina >= paginas || loading}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:pointer-events-none"
                aria-label="Página siguiente"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
