import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { sgcAPI, tasksAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/common/Modal';
import TaskModal from '../components/tasks/TaskModal';
import {
  Plus, Pencil, Trash2, X, Check, ChevronDown, ChevronRight, ShieldCheck, ListChecks,
  AlertTriangle, Search, ChevronsDownUp, ChevronsUpDown,
} from 'lucide-react';

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

// ---------------------------------------------------------------------------
// Niveles del catálogo
// ---------------------------------------------------------------------------
// dimensión → criterio → indicador → evidencia. Cada nivel sabe cuál es su
// padre, cómo se llama su hijo y qué endpoint usa.
// femenino: para concordar "Nueva dimensión" / "Nuevo criterio"
const NIVELES = {
  dimension: { titulo: 'Dimensión', femenino: true,  api: 'dimensiones', hijo: 'criterio',  ejemplo: '1' },
  criterio:  { titulo: 'Criterio',  femenino: false, api: 'criterios',   hijo: 'indicador', ejemplo: '1.1',     padre: 'dimension', campoPadre: 'dimension_id' },
  indicador: { titulo: 'Indicador', femenino: false, api: 'indicadores', hijo: 'evidencia', ejemplo: '1.1.1',   padre: 'criterio',  campoPadre: 'criterio_id' },
  evidencia: { titulo: 'Evidencia', femenino: true,  api: null,          hijo: null,        ejemplo: '1.1.1.1', padre: 'indicador', campoPadre: 'indicador_id' },
};

// "Nueva dimensión", "Criterio actualizado"…
const concordar = (nivel, femenina, masculina) => (NIVELES[nivel].femenino ? femenina : masculina);

const ordenCodigos = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

// Siguiente código libre bajo un padre: 1.1.1 → 1.1.1.(último + 1)
function siguienteCodigo(codigoPadre, codigosHermanos) {
  const ultimos = codigosHermanos
    .map(c => parseInt(String(c).split('.').pop(), 10))
    .filter(n => !Number.isNaN(n));
  const siguiente = (ultimos.length ? Math.max(...ultimos) : 0) + 1;
  return codigoPadre ? `${codigoPadre}.${siguiente}` : String(siguiente);
}

// Listas planas de cada nivel, para los selectores de "pertenece a"
function aplanar(arbol) {
  const dimensiones = [], criterios = [], indicadores = [];
  for (const d of arbol) {
    dimensiones.push(d);
    for (const c of d.criterios) {
      criterios.push({ ...c, dimension: d });
      for (const i of c.indicadores) indicadores.push({ ...i, criterio: c, dimension: d });
    }
  }
  return { dimensiones, criterios, indicadores };
}

// ---------------------------------------------------------------------------
// Formulario de cualquier nivel
// ---------------------------------------------------------------------------
function NivelForm({ nivel, registro, padreInicial, listas, onSave, onCancel, saving }) {
  const conf = NIVELES[nivel];
  const esEvidencia = nivel === 'evidencia';

  // Opciones de "pertenece a" y cómo se leen sus hijos actuales
  const opcionesPadre = {
    criterio:  listas.dimensiones,
    indicador: listas.criterios,
    evidencia: listas.indicadores,
  }[nivel] || [];

  const hijosDe = (padre) => {
    if (!padre) return listas.dimensiones.map(d => d.codigo);
    if (nivel === 'criterio')  return padre.criterios.map(c => c.codigo);
    if (nivel === 'indicador') return padre.indicadores.map(i => i.codigo).filter(c => !/\.0$/.test(c));
    return padre.evidencias.map(e => e.evidencia);
  };

  const padreDe = (id) => opcionesPadre.find(p => p.id === Number(id)) || null;

  const [padreId, setPadreId] = useState(
    registro ? (registro[conf.campoPadre] ?? '') : (padreInicial ?? '')
  );
  const [form, setForm] = useState(() => {
    if (registro) {
      return {
        codigo:      esEvidencia ? registro.evidencia : registro.codigo,
        nombre:      esEvidencia ? registro.nombre_evidencia : registro.nombre,
        descripcion: registro.descripcion || '',
      };
    }
    const padre = conf.padre ? padreDe(padreInicial) : null;
    return {
      codigo: conf.padre && !padre ? '' : siguienteCodigo(padre?.codigo, hijosDe(padre)),
      nombre: '', descripcion: '',
    };
  });

  // Al cambiar de padre, si el código ya no le corresponde, se sugiere uno nuevo
  const cambiarPadre = (id) => {
    setPadreId(id);
    const padre = padreDe(id);
    if (padre && !form.codigo.startsWith(`${padre.codigo}.`)) {
      setForm(f => ({ ...f, codigo: siguienteCodigo(padre.codigo, hijosDe(padre)) }));
    }
  };

  const etiquetaPadre = (p) => {
    if (nivel === 'evidencia') return `${p.codigo} — ${p.nombre}${/\.0$/.test(p.codigo) ? ' (por clasificar)' : ''}`;
    return `${p.codigo} — ${p.nombre}`;
  };

  const enviar = (e) => {
    e.preventDefault();
    const datos = esEvidencia
      ? { evidencia: form.codigo.trim(), nombre_evidencia: form.nombre.trim(), descripcion: form.descripcion }
      : { codigo: form.codigo.trim(), nombre: form.nombre.trim(), descripcion: form.descripcion };
    if (conf.padre) datos[conf.campoPadre] = padreId ? Number(padreId) : null;
    onSave(datos);
  };

  return (
    <form onSubmit={enviar} className="space-y-4">
      {conf.padre && (
        <div>
          <label className="label">Pertenece a {NIVELES[conf.padre].titulo.toLowerCase()} *</label>
          <select className="input" value={padreId} onChange={e => cambiarPadre(e.target.value)} required>
            <option value="">Selecciona…</option>
            {opcionesPadre.map(p => <option key={p.id} value={p.id}>{etiquetaPadre(p)}</option>)}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="label">Código *</label>
          <input
            className="input font-mono" placeholder={conf.ejemplo} value={form.codigo} required
            onChange={e => setForm({ ...form, codigo: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Nombre *</label>
          {/* Los nombres del modelo de acreditación llegan a 400 caracteres */}
          <textarea
            className="input resize-none" rows={2} value={form.nombre} required maxLength={600}
            onChange={e => setForm({ ...form, nombre: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label className="label">Descripción</label>
        <textarea
          className="input resize-none" rows={3} placeholder="Opcional"
          value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })}
        />
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        El código de {concordar(nivel, 'una', 'un')} {conf.titulo.toLowerCase()} tiene
        {' '}{conf.ejemplo.split('.').length} nivel{conf.ejemplo.includes('.') ? 'es' : ''} (por ejemplo <span className="font-mono">{conf.ejemplo}</span>)
        {conf.padre && ' y empieza con el código de su nivel superior'}.
      </p>

      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary text-sm">Cancelar</button>
        <button type="submit" disabled={saving} className="btn-primary text-sm">
          {saving
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <><Check className="w-3.5 h-3.5" /> Guardar</>}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Fila del árbol
// ---------------------------------------------------------------------------
const SANGRIA = { dimension: 0, criterio: 1, indicador: 2, evidencia: 3 };

function Fila({ nivel, codigo, nombre, descripcion, meta, abierto, onToggle, acciones, provisional }) {
  const conHijos = nivel !== 'evidencia';
  return (
    <div
      className={`group flex items-center gap-2 py-2 pr-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/60 ${
        nivel === 'dimension' ? 'bg-gray-50/70 dark:bg-gray-800/40' : ''
      }`}
      style={{ paddingLeft: `${SANGRIA[nivel] * 1.5 + 0.5}rem` }}
    >
      {conHijos ? (
        <button onClick={onToggle} className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
          aria-label={abierto ? 'Contraer' : 'Expandir'} aria-expanded={abierto}>
          {abierto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      ) : <span className="w-5 flex-shrink-0" />}

      <span className={`font-mono text-xs font-bold flex-shrink-0 ${
        provisional ? 'text-amber-600 dark:text-amber-400' : 'text-primary-600 dark:text-primary-400'
      }`}>
        {codigo}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm truncate ${nivel === 'dimension' ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-800 dark:text-gray-200'}`}>
            {nombre}
          </span>
          {provisional && (
            <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Por clasificar</span>
          )}
          {meta && <span className="text-xs text-gray-400 dark:text-gray-500">{meta}</span>}
        </div>
        {descripcion && nivel === 'evidencia' && (
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{descripcion}</p>
        )}
      </div>

      {acciones && (
        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {acciones}
        </div>
      )}
    </div>
  );
}

const BotonIcono = ({ titulo, onClick, peligro, children }) => (
  <button
    type="button" title={titulo} aria-label={titulo} onClick={onClick}
    className={`p-1 rounded text-gray-400 ${peligro ? 'hover:text-red-500' : 'hover:text-primary-600 dark:hover:text-primary-400'}`}
  >
    {children}
  </button>
);

// ---------------------------------------------------------------------------
// Tab: Gestión del catálogo
// ---------------------------------------------------------------------------
function GestionTab({ esAdmin }) {
  const [arbol, setArbol]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [abiertos, setAbiertos] = useState(new Set());
  const [busqueda, setBusqueda] = useState('');
  const [editor, setEditor]     = useState(null); // { nivel, registro?, padreInicial? }
  const [saving, setSaving]     = useState(false);

  const cargar = async () => {
    try {
      const { data } = await sgcAPI.getArbol();
      setArbol(data);
      // La primera vez se muestran abiertas las dimensiones
      setAbiertos(prev => prev.size ? prev : new Set(data.map(d => `dimension-${d.id}`)));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al cargar el catálogo SGC');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const listas = useMemo(() => aplanar(arbol), [arbol]);

  // Filtra conservando los ancestros de lo que coincide
  const visible = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return arbol;
    const coincide = (...t) => t.some(x => String(x || '').toLowerCase().includes(q));

    return arbol.map(d => {
      const dOk = coincide(d.codigo, d.nombre);
      const criterios = d.criterios.map(c => {
        const cOk = dOk || coincide(c.codigo, c.nombre);
        const indicadores = c.indicadores.map(i => {
          const iOk = cOk || coincide(i.codigo, i.nombre);
          const evidencias = i.evidencias.filter(e => iOk || coincide(e.evidencia, e.nombre_evidencia, e.descripcion));
          return (iOk || evidencias.length) ? { ...i, evidencias } : null;
        }).filter(Boolean);
        return (cOk || indicadores.length) ? { ...c, indicadores } : null;
      }).filter(Boolean);
      return (dOk || criterios.length) ? { ...d, criterios } : null;
    }).filter(Boolean);
  }, [arbol, busqueda]);

  const buscando = busqueda.trim().length > 0;
  const estaAbierto = (clave) => buscando || abiertos.has(clave);
  const alternar = (clave) => setAbiertos(prev => {
    const n = new Set(prev);
    n.has(clave) ? n.delete(clave) : n.add(clave);
    return n;
  });

  const expandirTodo = () => {
    const claves = [];
    for (const d of arbol) {
      claves.push(`dimension-${d.id}`);
      for (const c of d.criterios) {
        claves.push(`criterio-${c.id}`);
        for (const i of c.indicadores) claves.push(`indicador-${i.id}`);
      }
    }
    setAbiertos(new Set(claves));
  };

  // Conteos para el resumen
  const totales = useMemo(() => {
    let criterios = 0, indicadores = 0, evidencias = 0, porClasificar = 0;
    for (const d of arbol) for (const c of d.criterios) {
      criterios++;
      for (const i of c.indicadores) {
        if (!i.provisional) indicadores++;
        evidencias += i.evidencias.length;
        if (i.provisional) porClasificar += i.evidencias.length;
      }
    }
    return { dimensiones: arbol.length, criterios, indicadores, evidencias, porClasificar };
  }, [arbol]);

  const guardar = async (datos) => {
    const { nivel, registro } = editor;
    setSaving(true);
    try {
      let respuesta;
      if (nivel === 'evidencia') {
        respuesta = registro ? await sgcAPI.update(registro.id, datos) : await sgcAPI.create(datos);
      } else {
        const ruta = NIVELES[nivel].api;
        respuesta = registro ? await sgcAPI.updateNivel(ruta, registro.id, datos) : await sgcAPI.createNivel(ruta, datos);
      }
      toast.success(`${NIVELES[nivel].titulo} ${registro
        ? concordar(nivel, 'actualizada', 'actualizado')
        : concordar(nivel, 'creada', 'creado')}`);
      if (respuesta.data?.drive_aviso) toast.warning(respuesta.data.drive_aviso, { autoClose: 9000 });

      // Que lo recién creado quede a la vista
      if (!registro && editor.padreInicial && NIVELES[nivel].padre) {
        setAbiertos(prev => new Set(prev).add(`${NIVELES[nivel].padre}-${editor.padreInicial}`));
      }
      setEditor(null);
      await cargar();
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (nivel, registro) => {
    const codigo = nivel === 'evidencia' ? registro.evidencia : registro.codigo;
    const aviso = nivel === 'evidencia' && (registro.total_archivos || registro.total_tareas)
      ? `\n\nTiene ${registro.total_tareas} tarea(s) vinculada(s) y ${registro.total_archivos} prueba(s). Las pruebas no se borran de Drive, pero quedan sin evidencia asignada.`
      : '';
    if (!confirm(`¿Eliminar ${NIVELES[nivel].titulo.toLowerCase()} ${codigo}?${aviso}`)) return;
    try {
      if (nivel === 'evidencia') await sgcAPI.delete(registro.id);
      else await sgcAPI.deleteNivel(NIVELES[nivel].api, registro.id);
      toast.success('Eliminado');
      await cargar();
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo eliminar');
    }
  };

  const acciones = (nivel, registro) => {
    if (!esAdmin) return null;
    const hijo = NIVELES[nivel].hijo;
    return (
      <>
        {hijo && (
          <BotonIcono titulo={`Agregar ${NIVELES[hijo].titulo.toLowerCase()}`} onClick={() => setEditor({ nivel: hijo, padreInicial: registro.id })}>
            <Plus className="w-3.5 h-3.5" />
          </BotonIcono>
        )}
        <BotonIcono titulo="Editar" onClick={() => setEditor({ nivel, registro })}>
          <Pencil className="w-3.5 h-3.5" />
        </BotonIcono>
        <BotonIcono titulo="Eliminar" peligro onClick={() => eliminar(nivel, registro)}>
          <Trash2 className="w-3.5 h-3.5" />
        </BotonIcono>
      </>
    );
  };

  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-56">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="input text-sm py-1.5 pl-9" placeholder="Buscar por código o nombre en cualquier nivel…"
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
          />
          {busqueda && (
            <button onClick={() => setBusqueda('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label="Limpiar búsqueda">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button onClick={expandirTodo} className="btn-secondary text-xs py-1.5 px-3" title="Expandir todo">
          <ChevronsUpDown className="w-3.5 h-3.5" /> Expandir
        </button>
        <button onClick={() => setAbiertos(new Set())} className="btn-secondary text-xs py-1.5 px-3" title="Contraer todo">
          <ChevronsDownUp className="w-3.5 h-3.5" /> Contraer
        </button>
        {esAdmin && (
          <button onClick={() => setEditor({ nivel: 'dimension' })} className="btn-primary text-sm py-1.5">
            <Plus className="w-4 h-4" /> Nueva dimensión
          </button>
        )}
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        {plural(totales.dimensiones, 'dimensión', 'dimensiones')} · {plural(totales.criterios, 'criterio', 'criterios')} ·{' '}
        {plural(totales.indicadores, 'indicador', 'indicadores')} · {plural(totales.evidencias, 'evidencia', 'evidencias')}
      </p>

      {totales.porClasificar > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-900/20">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {plural(totales.porClasificar, 'evidencia quedó', 'evidencias quedaron')} en un indicador provisional "Por clasificar".
            Crea los indicadores reales y, en cada evidencia, usa <b>Editar</b> para moverla a su indicador y darle su código de cuatro niveles.
            Sus tareas y pruebas se conservan, y su carpeta en Drive se mueve sola.
          </p>
        </div>
      )}

      {/* Árbol */}
      {visible.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <ListChecks className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">
            {buscando ? `Sin resultados para "${busqueda}"` : 'El catálogo está vacío. Empieza creando una dimensión.'}
          </p>
        </div>
      ) : (
        <div className="card p-2 space-y-0.5">
          {visible.map(d => {
            const kd = `dimension-${d.id}`;
            return (
              <div key={kd}>
                <Fila nivel="dimension" codigo={d.codigo} nombre={d.nombre}
                  meta={plural(d.criterios.length, 'criterio', 'criterios')}
                  abierto={estaAbierto(kd)} onToggle={() => alternar(kd)} acciones={acciones('dimension', d)} />

                {estaAbierto(kd) && d.criterios.map(c => {
                  const kc = `criterio-${c.id}`;
                  return (
                    <div key={kc}>
                      <Fila nivel="criterio" codigo={c.codigo} nombre={c.nombre}
                        meta={plural(c.indicadores.filter(i => !i.provisional).length, 'indicador', 'indicadores')}
                        abierto={estaAbierto(kc)} onToggle={() => alternar(kc)} acciones={acciones('criterio', c)} />

                      {estaAbierto(kc) && c.indicadores.map(i => {
                        const ki = `indicador-${i.id}`;
                        return (
                          <div key={ki}>
                            <Fila nivel="indicador" codigo={i.codigo} nombre={i.nombre} provisional={i.provisional}
                              meta={plural(i.evidencias.length, 'evidencia', 'evidencias')}
                              abierto={estaAbierto(ki)} onToggle={() => alternar(ki)} acciones={acciones('indicador', i)} />

                            {estaAbierto(ki) && i.evidencias.map(e => (
                              <Fila key={`evidencia-${e.id}`} nivel="evidencia" codigo={e.evidencia} nombre={e.nombre_evidencia}
                                descripcion={e.descripcion}
                                meta={`${plural(e.total_tareas, 'tarea', 'tareas')} · ${plural(e.total_archivos, 'prueba', 'pruebas')}`}
                                acciones={acciones('evidencia', e)} />
                            ))}

                            {estaAbierto(ki) && i.evidencias.length === 0 && (
                              <p className="text-xs text-gray-400 dark:text-gray-500 italic py-1.5" style={{ paddingLeft: '5.5rem' }}>
                                Sin evidencias.
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {editor && (
        <Modal
          title={`${editor.registro ? 'Editar' : concordar(editor.nivel, 'Nueva', 'Nuevo')} ${NIVELES[editor.nivel].titulo.toLowerCase()}`}
          onClose={() => setEditor(null)}
          size="md"
        >
          <NivelForm
            nivel={editor.nivel}
            registro={editor.registro}
            padreInicial={editor.padreInicial}
            listas={listas}
            saving={saving}
            onSave={guardar}
            onCancel={() => setEditor(null)}
          />
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Visualización
// ---------------------------------------------------------------------------
function VisualizacionTab() {
  const [data, setData]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]             = useState('');
  const [filterDimension, setFilterDim] = useState('');
  const [filterCriterio, setFilterCrit] = useState('');
  const [filterIndicador, setFilterInd] = useState('');
  const [viewTask, setViewTask]         = useState(null);
  const [loadingTask, setLoadingTask]   = useState(false);

  useEffect(() => {
    sgcAPI.getAllWithTasks()
      .then(({ data }) => setData(data))
      .catch((err) => toast.error(err.response?.data?.message || 'Error al cargar visualización'))
      .finally(() => setLoading(false));
  }, []);

  const handleViewTask = async (task) => {
    setLoadingTask(true);
    try {
      const { data } = await tasksAPI.getById(task.project_id, task.id);
      setViewTask({ ...data, project_id: task.project_id });
    } catch {
      toast.error('Error al cargar tarea');
    } finally {
      setLoadingTask(false);
    }
  };

  // Opciones únicas de cada filtro: [código, nombre], en orden natural
  const opciones = (filas, campo, nombre) => {
    const mapa = new Map();
    filas.forEach(e => { if (e[campo]) mapa.set(e[campo], e[nombre]); });
    return [...mapa.entries()].sort((a, b) => ordenCodigos(a[0], b[0]));
  };

  const dimensiones = opciones(data, 'dimension', 'dimension_nombre');
  const criterios   = opciones(data.filter(e => !filterDimension || e.dimension === filterDimension), 'criterio', 'criterio_nombre');
  const indicadores = opciones(data.filter(e =>
    (!filterDimension || e.dimension === filterDimension) && (!filterCriterio || e.criterio === filterCriterio)
  ), 'indicador', 'indicador_nombre');

  const filtered = data.filter(e => {
    if (filterDimension && e.dimension !== filterDimension) return false;
    if (filterCriterio  && e.criterio  !== filterCriterio)  return false;
    if (filterIndicador && e.indicador !== filterIndicador) return false;
    if (search) {
      const q = search.toLowerCase();
      return [e.evidencia, e.nombre_evidencia, e.indicador, e.indicador_nombre, e.criterio_nombre, e.dimension_nombre]
        .some(v => String(v || '').toLowerCase().includes(q));
    }
    return true;
  });

  const limpiarFiltros = () => { setSearch(''); setFilterDim(''); setFilterCrit(''); setFilterInd(''); };

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          className="input text-sm py-1.5 w-48"
          placeholder="Buscar…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="input text-sm py-1.5 w-48"
          value={filterDimension}
          onChange={e => { setFilterDim(e.target.value); setFilterCrit(''); setFilterInd(''); }}
        >
          <option value="">Todas las dimensiones</option>
          {dimensiones.map(([c, n]) => <option key={c} value={c}>{c} — {n}</option>)}
        </select>
        <select
          className="input text-sm py-1.5 w-48"
          value={filterCriterio}
          onChange={e => { setFilterCrit(e.target.value); setFilterInd(''); }}
        >
          <option value="">Todos los criterios</option>
          {criterios.map(([c, n]) => <option key={c} value={c}>{c} — {n}</option>)}
        </select>
        <select
          className="input text-sm py-1.5 w-48"
          value={filterIndicador}
          onChange={e => setFilterInd(e.target.value)}
        >
          <option value="">Todos los indicadores</option>
          {indicadores.map(([c, n]) => <option key={c} value={c}>{c} — {n}</option>)}
        </select>
        {(search || filterDimension || filterCriterio || filterIndicador) && (
          <button
            onClick={limpiarFiltros}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 px-2"
          >
            <X className="w-3.5 h-3.5" /> Limpiar
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        {filtered.length} de {data.length} evidencia{data.length !== 1 ? 's' : ''}
      </p>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <ListChecks className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No hay evidencias que mostrar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(e => (
            <div key={e.id} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              {/* Encabezado de evidencia — siempre visible */}
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800">
                <span className="font-mono font-bold text-primary-600 dark:text-primary-400 text-sm w-20 flex-shrink-0">{e.evidencia}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm truncate">{e.nombre_evidencia}</p>
                  <p
                    className="text-xs text-gray-400 dark:text-gray-500 truncate"
                    title={`${e.dimension} ${e.dimension_nombre} · ${e.criterio} ${e.criterio_nombre} · ${e.indicador} ${e.indicador_nombre}`}
                  >
                    Indicador {e.indicador} — {e.indicador_nombre}
                  </p>
                </div>
                <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full flex-shrink-0">
                  {e.tasks.length} tarea{e.tasks.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Tareas — siempre visibles */}
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {e.tasks.length === 0 ? (
                  <p className="px-6 py-3 text-sm text-gray-400 dark:text-gray-500 italic">
                    Sin tareas vinculadas aún.
                  </p>
                ) : e.tasks.map(t => (
                  <button
                    key={t.id}
                    onClick={() => handleViewTask(t)}
                    disabled={loadingTask}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors text-left cursor-pointer"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{t.title}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {t.project_name}
                        {t.assignee_name ? ` · ${t.assignee_name}` : ''}
                        {t.due_date ? ` · Vence ${new Date(t.due_date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusColors[t.status] || statusColors.pending}`}>
                      {statusLabels[t.status] || t.status}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {viewTask && (
        <Modal
          title={viewTask.title}
          onClose={() => setViewTask(null)}
          size="xl"
        >
          <TaskModal
            task={viewTask}
            projectId={viewTask.project_id}
            members={[]}
            labels={viewTask.labels || []}
            readOnly
            onCancel={() => setViewTask(null)}
          />
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SGCAdmin page
// ---------------------------------------------------------------------------
export default function SGCAdmin() {
  const { user } = useAuth();
  const esAdmin = user?.role === 'admin';
  const [tab, setTab] = useState('gestion');

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">SGC</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Sistema de Gestión de la Calidad · Dimensión → Criterio → Indicador → Evidencia
          </p>
        </div>
      </div>

      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6 gap-1">
        {[{ id: 'gestion', label: 'Catálogo' }, { id: 'visualizacion', label: 'Visualización' }].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'gestion'       && <GestionTab esAdmin={esAdmin} />}
      {tab === 'visualizacion' && <VisualizacionTab />}
    </div>
  );
}
