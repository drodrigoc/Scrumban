import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Lock, Unlock, Search, X, CalendarClock } from 'lucide-react';
import { poaAPI } from '../services/api';

/*
 * Administración → Control del POA
 *
 * Bloquear la planificación de un proyecto POA congela sus datos, su
 * alineación estratégica, su cronograma macro y sus partidas de
 * presupuesto. Las tareas, sus costos, las evidencias y el ejecutado de
 * las partidas fijas siguen abiertos. Los administradores pueden editar
 * siempre.
 */

const ESTADO = {
  active:    { label: 'Activo',     clase: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  paused:    { label: 'Pausado',    clase: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  completed: { label: 'Completado', clase: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  cancelled: { label: 'Cancelado',  clase: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

const dinero = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);
const fechaHora = (d) => new Date(d).toLocaleString('es-SV', {
  day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit',
});
const fecha = (d) => new Date(d).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' });
const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function ControlPOA() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState('todos'); // todos | bloqueados | abiertos
  const [ocupado, setOcupado] = useState(null);  // id del proyecto o acción en curso
  const [nuevaFecha, setNuevaFecha] = useState('');

  const cargar = useCallback(async () => {
    try {
      const { data } = await poaAPI.listar();
      setDatos(data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo cargar el control del POA');
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const cambiar = async (p) => {
    setOcupado(p.id);
    try {
      await poaAPI.bloqueo(p.id, !p.bloqueado);
      await cargar();
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo cambiar el bloqueo');
    } finally {
      setOcupado(null);
    }
  };

  const masivo = async (bloquear) => {
    const texto = bloquear
      ? '¿Bloquear la planificación de TODOS los proyectos POA?\n\nSus dueños y coordinadores ya no podrán cambiar datos, alineación, cronograma ni partidas. La ejecución sigue abierta.'
      : '¿Desbloquear TODOS los proyectos POA?\n\nVolverán a poder modificar su planificación.';
    if (!confirm(texto)) return;
    setOcupado(bloquear ? 'bloquear' : 'desbloquear');
    try {
      const { data } = bloquear ? await poaAPI.bloquearTodos() : await poaAPI.desbloquearTodos();
      toast.success(`${data.cambiados} proyecto${data.cambiados === 1 ? '' : 's'} ${bloquear ? 'bloqueado' : 'desbloqueado'}${data.cambiados === 1 ? '' : 's'}`);
      await cargar();
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo completar');
    } finally {
      setOcupado(null);
    }
  };

  const programar = async (valor) => {
    setOcupado('cierre');
    try {
      // El campo da la hora local; el servidor guarda el instante exacto
      await poaAPI.programarCierre(valor ? new Date(valor).toISOString() : null);
      setNuevaFecha('');
      await cargar();
      toast.success(valor ? 'Cierre programado' : 'Cierre programado cancelado');
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo programar el cierre');
    } finally {
      setOcupado(null);
    }
  };

  const visibles = useMemo(() => {
    if (!datos) return [];
    const t = normalizar(q.trim());
    return datos.proyectos.filter(p =>
      (filtro === 'todos' || (filtro === 'bloqueados') === p.bloqueado) &&
      (!t || normalizar(`${p.name} ${p.owner_name} ${p.owner_unit} ${p.poa_aprobacion}`).includes(t)));
  }, [datos, q, filtro]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Lock className="w-6 h-6 text-primary-500" /> Control del POA
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-3xl">
          Bloquear un proyecto POA congela su planificación: datos, alineación estratégica, cronograma macro y
          partidas del presupuesto. Las tareas, sus costos, las evidencias y el ejecutado de las partidas fijas
          siguen abiertos. Los administradores pueden editar siempre.
        </p>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{error}</p>}

      {datos && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="card p-4 space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <Cifra etiqueta="Proyectos POA" valor={datos.resumen.total} />
                <Cifra etiqueta="Bloqueados" valor={datos.resumen.bloqueados} clase="text-indigo-600 dark:text-indigo-400" />
                <Cifra etiqueta="Abiertos" valor={datos.resumen.total - datos.resumen.bloqueados} />
              </div>
            </div>

            <div className="card p-4 space-y-3">
              <p className="font-semibold text-gray-900 dark:text-gray-100">Todos a la vez</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => masivo(true)} disabled={!!ocupado || datos.resumen.total === datos.resumen.bloqueados}
                  className="btn-primary text-sm">
                  <Lock className="w-4 h-4" /> Bloquear todos
                </button>
                <button onClick={() => masivo(false)} disabled={!!ocupado || datos.resumen.bloqueados === 0}
                  className="btn-secondary text-sm">
                  <Unlock className="w-4 h-4" /> Desbloquear todos
                </button>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">No incluye los proyectos archivados.</p>
            </div>

            <div className="card p-4 space-y-3">
              <p className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-primary-500" /> Cierre programado
              </p>
              {datos.cierre ? (
                <>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Todos los proyectos POA se bloquearán el <b>{fechaHora(datos.cierre.fecha)}</b>
                    {datos.cierre.programado_por && <span className="text-gray-500 dark:text-gray-400"> · programado por {datos.cierre.programado_por}</span>}.
                  </p>
                  <button onClick={() => programar(null)} disabled={!!ocupado} className="btn-secondary text-sm">
                    Cancelar cierre
                  </button>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <input type="datetime-local" className="input" value={nuevaFecha}
                      onChange={e => setNuevaFecha(e.target.value)} aria-label="Fecha y hora del cierre" />
                    <button onClick={() => programar(nuevaFecha)} disabled={!nuevaFecha || !!ocupado} className="btn-primary text-sm">
                      <CalendarClock className="w-4 h-4" /> Programar cierre
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Al llegar la fecha se bloquean todos los proyectos POA abiertos (se revisa cada 5 minutos).
                    Después puedes desbloquear cualquiera a mano.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="p-4 flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-gray-700">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input className="input pl-9 pr-8" placeholder="Buscar por proyecto, responsable, unidad o aprobación…"
                  value={q} onChange={e => setQ(e.target.value)} />
                {q && (
                  <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-sm">
                {[['todos', 'Todos'], ['abiertos', 'Abiertos'], ['bloqueados', 'Bloqueados']].map(([id, label]) => (
                  <button key={id} onClick={() => setFiltro(id)}
                    className={`px-3 py-1.5 ${filtro === id
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {datos.proyectos.length === 0 ? (
              <p className="text-sm text-center text-gray-400 dark:text-gray-500 py-10">
                Todavía no hay proyectos marcados como POA.
              </p>
            ) : visibles.length === 0 ? (
              <p className="text-sm text-center text-gray-400 dark:text-gray-500 py-10">Sin resultados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[760px]">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                      <th className="py-2 px-4 font-medium">Proyecto</th>
                      <th className="py-2 px-2 font-medium">Responsable</th>
                      <th className="py-2 px-2 font-medium text-right">Presupuesto</th>
                      <th className="py-2 px-2 font-medium">Estado</th>
                      <th className="py-2 px-4 font-medium">Planificación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map(p => {
                      const st = ESTADO[p.status] || ESTADO.active;
                      return (
                        <tr key={p.id} className="border-b border-gray-50 dark:border-gray-800 align-top">
                          <td className="py-2.5 px-4">
                            <Link to={`/projects/${p.id}`} className="font-medium text-gray-800 dark:text-gray-200 hover:text-primary-600 inline-flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                              {p.name}
                            </Link>
                            {p.poa_aprobacion && (
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-2" title={p.poa_aprobacion}>
                                {p.poa_aprobacion}
                              </p>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-gray-600 dark:text-gray-300">
                            {p.owner_name || '—'}
                            {p.owner_unit && <p className="text-xs text-gray-400 dark:text-gray-500">{p.owner_unit}</p>}
                          </td>
                          <td className="py-2.5 px-2 text-right tabular-nums text-gray-700 dark:text-gray-300">{dinero(p.presupuesto)}</td>
                          <td className="py-2.5 px-2"><span className={`badge ${st.clase}`}>{st.label}</span></td>
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-3">
                              <button
                                type="button" role="switch" aria-checked={p.bloqueado}
                                aria-label={`Bloquear la planificación de ${p.name}`}
                                disabled={ocupado === p.id}
                                onClick={() => cambiar(p)}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                                  p.bloqueado ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                              >
                                <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transform transition-transform ${
                                  p.bloqueado ? 'translate-x-5' : 'translate-x-0.5'}`} />
                              </button>
                              <div className="text-xs">
                                <p className={`font-medium ${p.bloqueado ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-500 dark:text-gray-400'}`}>
                                  {p.bloqueado ? 'Bloqueada' : 'Abierta'}
                                </p>
                                {p.bloqueado && p.bloqueada_at && (
                                  <p className="text-gray-400 dark:text-gray-500">
                                    {fecha(p.bloqueada_at)}{p.bloqueada_por_nombre ? ` · ${p.bloqueada_por_nombre}` : ''}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Cifra({ etiqueta, valor, clase = 'text-gray-900 dark:text-gray-100' }) {
  return (
    <div>
      <p className={`text-2xl font-bold tabular-nums ${clase}`}>{valor}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{etiqueta}</p>
    </div>
  );
}
