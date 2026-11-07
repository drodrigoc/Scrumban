import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import {
  Target, Plus, Trash2, CheckCircle2, Circle, Link2, ListTodo, RotateCcw, Pencil, ChevronDown, MoreVertical,
} from 'lucide-react';
import { peiAPI, tasksAPI } from '../../services/api';
import SelectorBuscable, { CampoSelector } from '../common/SelectorBuscable';

/*
 * Alineación del proyecto con el Plan Estratégico Institucional.
 *
 * Se eligen las actividades estratégicas a las que responde el proyecto
 * (la acción, el objetivo y la línea salen de ellas) y se controla cada
 * una como cumplida o pendiente, con su evidencia: un enlace o la tarea
 * del proyecto que tiene los archivos.
 */

const fecha = (d) => new Date(d).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' });

// Agrupa los vínculos (ya vienen ordenados) por línea y por acción
function agrupar(vinculos) {
  const lineas = [];
  for (const v of vinculos) {
    let linea = lineas.at(-1);
    if (!linea || linea.id !== v.linea_id) {
      linea = { id: v.linea_id, numero: v.linea_numero, nombre: v.linea_nombre, objetivo: v.linea_objetivo, acciones: [] };
      lineas.push(linea);
    }
    let accion = linea.acciones.at(-1);
    if (!accion || accion.id !== v.accion_id) {
      accion = { id: v.accion_id, numero: v.accion_numero, nombre: v.accion_nombre, vinculos: [] };
      linea.acciones.push(accion);
    }
    accion.vinculos.push(v);
  }
  return lineas;
}

// canEdit: marcar cumplidas y registrar evidencia (ejecución).
// canPlanificar: vincular y quitar actividades (planificación; se cierra si
// la administración bloqueó el proyecto POA).
export default function AlineacionPanel({ projectId, canEdit, canPlanificar = canEdit }) {
  const [datos, setDatos]     = useState(null);
  const [error, setError]     = useState(null);
  const [arbol, setArbol]     = useState(null);   // catálogo, al abrir el selector
  const [tareas, setTareas]   = useState(null);   // tareas del proyecto, para la evidencia
  const [selector, setSelector] = useState(null); // 'actividad' | 'tarea'
  const [editando, setEditando] = useState(null); // { id, evidencia_url, evidencia_task_id, nota, marcar }
  const [erroresForm, setErroresForm] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [verMision, setVerMision] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const { data } = await peiAPI.deProyecto(projectId);
      setDatos(data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo cargar la alineación estratégica');
    }
  }, [projectId]);

  useEffect(() => { cargar(); }, [cargar]);

  const cerrarSelector = useCallback(() => setSelector(null), []);

  const abrirVincular = async () => {
    if (!arbol) {
      try {
        const { data } = await peiAPI.arbol();
        setArbol(data);
      } catch (err) {
        toast.error(err.response?.data?.message || 'No se pudo cargar el plan estratégico');
        return;
      }
    }
    setSelector('actividad');
  };

  const vincular = async (actividadId) => {
    if (!actividadId) return;
    try {
      await peiAPI.vincular(projectId, actividadId);
      await cargar();
      toast.success('Actividad vinculada');
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo vincular la actividad');
    }
  };

  const desvincular = async (v) => {
    const aviso = v.cumplido ? '\n\nEstá marcada como cumplida: se perderá ese registro.' : '';
    if (!confirm(`¿Quitar la actividad ${v.actividad_numero} de este proyecto?${aviso}`)) return;
    try {
      await peiAPI.desvincular(projectId, v.id);
      await cargar();
      toast.success('Actividad quitada');
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo quitar la actividad');
    }
  };

  const reabrir = async (v) => {
    try {
      await peiAPI.actualizarVinculo(projectId, v.id, { cumplido: false });
      await cargar();
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo reabrir la actividad');
    }
  };

  const abrirForm = async (v, marcar) => {
    setErroresForm({});
    setEditando({
      id: v.id, marcar,
      evidencia_url: v.evidencia_url || '',
      evidencia_task_id: v.evidencia_task_id || null,
      evidencia_task_titulo: v.evidencia_task_titulo || null,
      nota: v.nota || '',
    });
    if (!tareas) {
      try {
        const { data } = await tasksAPI.getByProject(projectId, { archived: 'all' });
        setTareas(data);
      } catch { setTareas([]); }
    }
  };

  const guardarForm = async (v) => {
    const url = editando.evidencia_url.trim();
    if (url && !/^https?:\/\/\S+$/i.test(url)) {
      setErroresForm({ evidencia_url: 'El enlace debe empezar con http:// o https://' });
      return;
    }
    if ((editando.marcar || v.cumplido) && !url && !editando.evidencia_task_id) {
      setErroresForm({ evidencia: 'Agrega la evidencia: un enlace o la tarea que la contiene' });
      return;
    }
    setGuardando(true);
    try {
      await peiAPI.actualizarVinculo(projectId, v.id, {
        evidencia_url: url || null,
        evidencia_task_id: editando.evidencia_task_id || null,
        nota: editando.nota,
        ...(editando.marcar && { cumplido: true }),
      });
      setEditando(null);
      await cargar();
      if (editando.marcar) toast.success('Actividad marcada como cumplida');
    } catch (err) {
      const { message, campo } = err.response?.data || {};
      if (campo) setErroresForm({ [campo]: message });
      else toast.error(message || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  // Opciones del selector: todas las actividades del plan que aún no están
  // vinculadas, agrupadas por línea
  const opcionesActividad = useMemo(() => {
    if (!arbol) return [];
    const yaVinculadas = new Set((datos?.vinculos || []).map(v => v.actividad_id));
    return arbol.lineas.flatMap(l => l.acciones.flatMap(a => a.actividades
      .filter(act => !yaVinculadas.has(act.id))
      .map(act => ({
        value:   act.id,
        label:   act.nombre,
        inicial: act.numero,
        grupo:   `Línea ${l.numero} · ${l.nombre}`,
        detalle: `Acción ${a.numero} · Indicador: ${act.indicador || '—'}`,
        buscar:  `${act.numero} ${a.nombre} ${act.fuente_verificacion || ''}`,
      }))));
  }, [arbol, datos]);

  const opcionesTarea = useMemo(() => (tareas || []).map(t => ({
    value: t.id,
    label: t.title,
    detalle: [t.phase_name, t.archived_at ? 'Archivada' : null].filter(Boolean).join(' · ') || undefined,
  })), [tareas]);

  if (error) {
    return (
      <div className="card p-5">
        <Encabezado />
        <p className="mt-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{error}</p>
      </div>
    );
  }
  if (!datos) {
    return (
      <div className="card p-5 flex justify-center">
        <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const { plan, vinculos } = datos;
  const cumplidas = vinculos.filter(v => v.cumplido).length;
  const grupos = agrupar(vinculos);

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <Encabezado plan={plan} />
        <div className="flex items-center gap-2 flex-wrap">
          {vinculos.length > 0 && (
            <span className={`badge ${cumplidas === vinculos.length
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>
              {cumplidas} de {vinculos.length} cumplida{vinculos.length === 1 ? '' : 's'}
            </span>
          )}
          {canPlanificar && (
            <button onClick={abrirVincular} className="btn-secondary text-xs py-2.5 sm:py-1.5 px-3">
              <Plus className="w-3.5 h-3.5" /> Vincular actividad
            </button>
          )}
        </div>
      </div>

      {(plan?.mision || plan?.vision) && (
        <div>
          <button
            type="button"
            onClick={() => setVerMision(v => !v)}
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-1"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${verMision ? 'rotate-180' : ''}`} />
            {verMision ? 'Ocultar misión y visión' : 'Ver misión y visión institucional'}
          </button>
          {verMision && (
            <div className="mt-2 grid sm:grid-cols-2 gap-3 text-sm">
              {plan.mision && <Bloque titulo="Misión" texto={plan.mision} />}
              {plan.vision && <Bloque titulo="Visión" texto={plan.vision} />}
            </div>
          )}
        </div>
      )}

      {vinculos.length === 0 ? (
        <p className="text-sm text-center text-gray-400 dark:text-gray-500 py-4">
          Este proyecto todavía no está alineado con el plan estratégico.
          {canPlanificar && ' Vincula las actividades estratégicas a las que responde con "Vincular actividad".'}
        </p>
      ) : (
        <div className="space-y-4">
          {grupos.map(linea => (
            <div key={linea.id} className="border-l-4 border-primary-400 dark:border-primary-600 pl-3 space-y-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-400">
                  Línea {linea.numero} · {linea.nombre}
                </p>
                {linea.objetivo && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2" title={linea.objetivo}>
                    <span className="font-medium">Objetivo estratégico {linea.numero}:</span> {linea.objetivo}
                  </p>
                )}
              </div>

              {linea.acciones.map(accion => (
                <div key={accion.id} className="space-y-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Acción {accion.numero} · {accion.nombre}
                  </p>
                  {accion.vinculos.map(v => (
                    <Actividad
                      key={v.id}
                      v={v}
                      canEdit={canEdit}
                      canPlanificar={canPlanificar}
                      editando={editando?.id === v.id ? editando : null}
                      setEditando={setEditando}
                      erroresForm={erroresForm}
                      setErroresForm={setErroresForm}
                      guardando={guardando}
                      onMarcar={() => abrirForm(v, true)}
                      onEditar={() => abrirForm(v, false)}
                      onGuardar={() => guardarForm(v)}
                      onReabrir={() => reabrir(v)}
                      onQuitar={() => desvincular(v)}
                      onElegirTarea={() => setSelector('tarea')}
                    />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {selector === 'actividad' && (
        <SelectorBuscable
          titulo="Vincular actividad estratégica"
          placeholder="Buscar por número, actividad, acción o indicador…"
          opciones={opcionesActividad}
          valor={null}
          vacio="Todas las actividades del plan ya están vinculadas."
          pie="Elige la actividad del plan a la que responde el proyecto. La acción, el objetivo y la línea se toman de ella."
          onElegir={vincular}
          onCerrar={cerrarSelector}
        />
      )}

      {selector === 'tarea' && editando && (
        <SelectorBuscable
          titulo="Tarea con la evidencia"
          placeholder="Buscar tarea…"
          opciones={opcionesTarea}
          valor={editando.evidencia_task_id}
          ninguno={{ label: 'Ninguna tarea' }}
          vacio="El proyecto no tiene tareas."
          pie="Elige la tarea donde están los archivos de la evidencia (por ejemplo, el informe)."
          onElegir={(id) => {
            setEditando(e => ({
              ...e,
              evidencia_task_id: id,
              evidencia_task_titulo: (tareas || []).find(t => t.id === id)?.title || null,
            }));
            setErroresForm({});
          }}
          onCerrar={cerrarSelector}
        />
      )}
    </div>
  );
}

function Encabezado({ plan }) {
  return (
    <div>
      <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
        <Target className="w-4 h-4 text-primary-500" />
        Alineación estratégica
      </h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
        Actividades del {plan?.nombre || 'Plan Estratégico Institucional'}
        {plan?.anio_inicio ? ` ${plan.anio_inicio}–${plan.anio_fin}` : ''} a las que responde este proyecto
      </p>
    </div>
  );
}

function MenuActividad({ cumplido, onEditar, onReabrir, onQuitar }) {
  const [abierto, setAbierto] = useState(false);
  const elegir = (accion) => () => { setAbierto(false); accion(); };
  const opcion = 'w-full flex items-center gap-3 sm:gap-2 px-4 sm:px-3 py-3 sm:py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        title="Más acciones"
        aria-haspopup="menu"
        aria-expanded={abierto}
        className="p-2.5 sm:p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-700"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {abierto && (
        <>
          {/* Clic fuera: cierra el menú */}
          <div className="fixed inset-0 z-40 bg-black/30 sm:bg-transparent sm:z-10" onClick={() => setAbierto(false)} />
          {/* Móvil: hoja inferior a todo el ancho; escritorio: menú junto al botón */}
          <div role="menu"
            className="fixed inset-x-0 bottom-0 z-50 pb-safe rounded-t-2xl
                       sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-1 sm:z-20 sm:w-52 sm:pb-0 sm:rounded-lg
                       bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg py-2 sm:py-1">
            <button role="menuitem" onClick={elegir(onEditar)} className={`${opcion} text-gray-700 dark:text-gray-200`}>
              <Pencil className="w-3.5 h-3.5" /> {cumplido ? 'Editar evidencia' : 'Agregar evidencia'}
            </button>
            {cumplido && (
              <button role="menuitem" onClick={elegir(onReabrir)} className={`${opcion} text-gray-700 dark:text-gray-200`}>
                <RotateCcw className="w-3.5 h-3.5" /> Reabrir (pendiente)
              </button>
            )}
            {onQuitar && (
              <>
                <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                <button role="menuitem" onClick={elegir(onQuitar)} className={`${opcion} text-red-600 dark:text-red-400`}>
                  <Trash2 className="w-3.5 h-3.5" /> Quitar del proyecto
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Bloque({ titulo, texto }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">{titulo}</p>
      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">{texto}</p>
    </div>
  );
}

function Actividad({
  v, canEdit, canPlanificar, editando, setEditando, erroresForm, setErroresForm, guardando,
  onMarcar, onEditar, onGuardar, onReabrir, onQuitar, onElegirTarea,
}) {
  return (
    <div className={`rounded-lg border p-3 ${v.cumplido
      ? 'border-green-200 dark:border-green-800/60 bg-green-50/50 dark:bg-green-900/10'
      : 'border-gray-200 dark:border-gray-700'}`}>
      <div className="flex flex-wrap sm:flex-nowrap items-start gap-3">
        {v.cumplido
          ? <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          : <Circle className="w-5 h-5 text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5" />}

        <div className="grow basis-[calc(100%-2rem)] sm:basis-0 min-w-0 space-y-1">
          <p className="text-sm text-gray-800 dark:text-gray-200 break-words">
            <span className="font-semibold tabular-nums">{v.actividad_numero}.</span> {v.actividad_nombre}
          </p>
          <dl className="text-xs text-gray-500 dark:text-gray-400 grid sm:grid-cols-2 gap-x-4 gap-y-0.5">
            <div><dt className="inline font-medium">Indicador: </dt><dd className="inline">{v.indicador || '—'}</dd></div>
            <div><dt className="inline font-medium">Verificación: </dt><dd className="inline">{v.fuente_verificacion || '—'}</dd></div>
          </dl>

          {!editando && (v.evidencia_url || v.evidencia_task_titulo || v.nota || v.cumplido) && (
            <div className="text-xs space-y-0.5 pt-1">
              {v.evidencia_url && (
                <a href={v.evidencia_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:underline mr-3 break-all">
                  <Link2 className="w-3.5 h-3.5 flex-shrink-0" /> Enlace de evidencia
                </a>
              )}
              {v.evidencia_task_titulo && (
                <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-300">
                  <ListTodo className="w-3.5 h-3.5 flex-shrink-0" /> Tarea: {v.evidencia_task_titulo}
                </span>
              )}
              {v.nota && <p className="text-gray-500 dark:text-gray-400 italic">{v.nota}</p>}
              {v.cumplido && v.cumplido_at && (
                <p className="text-green-700 dark:text-green-400">
                  Cumplida el {fecha(v.cumplido_at)}{v.cumplido_por_nombre ? ` · ${v.cumplido_por_nombre}` : ''}
                </p>
              )}
            </div>
          )}

          {editando && (
            <div className="pt-2 space-y-2">
              <div className="grid sm:grid-cols-2 gap-2">
                <div>
                  <label className="label text-xs">Enlace de evidencia</label>
                  <input
                    type="url" className={`input text-sm ${erroresForm.evidencia_url ? 'border-red-400' : ''}`}
                    placeholder="https://drive.google.com/…"
                    value={editando.evidencia_url}
                    onChange={e => { setEditando(x => ({ ...x, evidencia_url: e.target.value })); setErroresForm({}); }}
                  />
                </div>
                <div>
                  <label className="label text-xs">o tarea con los archivos</label>
                  <CampoSelector
                    icono={ListTodo}
                    texto={editando.evidencia_task_titulo}
                    placeholder="Elegir tarea"
                    onClick={onElegirTarea}
                  />
                </div>
              </div>
              <input
                type="text" className="input text-sm" maxLength={1000}
                placeholder="Nota (opcional): qué se logró, fecha del informe…"
                value={editando.nota}
                onChange={e => setEditando(x => ({ ...x, nota: e.target.value }))}
              />
              {Object.values(erroresForm).filter(Boolean).map(m => (
                <p key={m} className="text-xs text-red-600 dark:text-red-400">{m}</p>
              ))}
              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                <button type="button" onClick={() => setEditando(null)} className="btn-secondary text-xs py-2.5 sm:py-1.5 px-3 w-full sm:w-auto justify-center">
                  Cancelar
                </button>
                <button type="button" onClick={onGuardar} disabled={guardando} className="btn-primary text-xs py-2.5 sm:py-1.5 px-3 w-full sm:w-auto justify-center">
                  {guardando
                    ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : (editando.marcar ? 'Marcar cumplida' : 'Guardar')}
                </button>
              </div>
            </div>
          )}
        </div>

        {canEdit && !editando && (
          <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-end pl-8 sm:pl-0">
            {!v.cumplido && (
              <button onClick={onMarcar}
                className="text-xs font-medium text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md px-3 sm:px-2 py-2 sm:py-1">
                Marcar cumplida
              </button>
            )}
            {/* Las demás acciones van en un menú aparte: "Quitar" no queda
                junto a "Marcar cumplida", donde era fácil tocarlo por error */}
            <MenuActividad
              cumplido={v.cumplido}
              onEditar={onEditar}
              onReabrir={onReabrir}
              onQuitar={canPlanificar ? onQuitar : null}
            />
          </div>
        )}
      </div>
    </div>
  );
}
