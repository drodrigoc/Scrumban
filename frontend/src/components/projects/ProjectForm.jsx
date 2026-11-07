import { useState } from 'react';
import { AlertCircle, Lock, Plus, X } from 'lucide-react';
import { separarObjetivos, unirObjetivos } from '../../utils/objetivos';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#14B8A6'];

// Lo mismo que valida el servidor, para avisar antes de enviar y junto al
// campo que hay que corregir
function validar(form) {
  const errores = {};
  if (!form.name.trim()) errores.name = 'Escribe el nombre del proyecto';
  else if (form.name.trim().length > 255) errores.name = 'El nombre no puede pasar de 255 caracteres';
  if (form.start_date && form.end_date && form.end_date < form.start_date) {
    errores.end_date = 'La fecha de fin no puede ser anterior a la de inicio';
  }
  if (form.es_poa && !form.poa_aprobacion.trim()) {
    errores.poa_aprobacion = 'Escribe la aprobación del POA';
  }
  return errores;
}

function MensajeError({ texto }) {
  if (!texto) return null;
  return (
    <p className="mt-1 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {texto}
    </p>
  );
}

const conError = (hay) => (hay ? 'input border-red-400 dark:border-red-500 focus:ring-red-400' : 'input');

// Un proyecto POA dura el año del plan: del 1 de enero al 31 de diciembre
const fechasDelAnio = (anio) => ({ start_date: `${anio}-01-01`, end_date: `${anio}-12-31` });

/**
 * onSave(datos) puede devolver una promesa. Si el servidor rechaza los datos
 * y la promesa falla con su respuesta, el mensaje se muestra junto al campo
 * que indicó el servidor.
 *
 * soloEstado: la planificación del proyecto POA está bloqueada; solo se
 * puede cambiar el estado (activo, pausado, completado…).
 */
export default function ProjectForm({ project, onSave, onCancel, soloEstado = false }) {
  const anioActual = new Date().getFullYear();
  const inicioGuardado = project?.start_date ? project.start_date.split('T')[0] : '';

  const [form, setForm] = useState({
    name:        project?.name        || '',
    start_date:  inicioGuardado,
    end_date:    project?.end_date    ? project.end_date.split('T')[0]   : '',
    status:      project?.status      || 'active',
    color:       project?.color       || '#3B82F6',
    es_poa:         Boolean(project?.es_poa),
    poa_aprobacion: project?.poa_aprobacion || '',
    // Año del POA: el de su fecha de inicio, o el año que viene
    anio_poa: project?.es_poa && inicioGuardado ? Number(inicioGuardado.slice(0, 4)) : anioActual + 1,
  });
  const [objetivos, setObjetivos] = useState(() => {
    const lista = separarObjetivos(project?.objectives);
    return lista.length ? lista : [''];
  });
  const [errores, setErrores]   = useState({});
  const [guardando, setGuardando] = useState(false);

  const aniosPoa = [...new Set([anioActual, anioActual + 1, anioActual + 2, form.anio_poa])].sort();

  // Al corregir un campo, su mensaje de error desaparece
  const cambiar = (campo, valor) => {
    setForm(prev => ({ ...prev, [campo]: valor }));
    if (errores[campo] || (campo === 'start_date' && errores.end_date)) {
      setErrores(prev => ({ ...prev, [campo]: undefined, ...(campo === 'start_date' && { end_date: undefined }) }));
    }
  };

  // Al marcar que viene del POA, las fechas pasan a ser las del año del plan
  // (se pueden ajustar después)
  const cambiarPoa = (esPoa) => {
    setForm(prev => ({ ...prev, es_poa: esPoa, ...(esPoa && fechasDelAnio(prev.anio_poa)) }));
    setErrores(prev => ({ ...prev, start_date: undefined, end_date: undefined, poa_aprobacion: undefined }));
  };
  const cambiarAnioPoa = (anio) => {
    setForm(prev => ({ ...prev, anio_poa: anio, ...fechasDelAnio(anio) }));
    setErrores(prev => ({ ...prev, start_date: undefined, end_date: undefined }));
  };

  const cuantos = objetivos.filter(o => o.trim()).length;
  const cambiarObjetivo = (i, valor) => setObjetivos(lista => lista.map((o, j) => (j === i ? valor : o)));
  const agregarObjetivo = () => setObjetivos(lista => [...lista, '']);
  const quitarObjetivo = (i) => setObjetivos(lista => (lista.length > 1 ? lista.filter((_, j) => j !== i) : ['']));

  // El presupuesto no se pide aquí: se arma con las partidas, en la ficha
  // del proyecto, después de tener el cronograma
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (soloEstado) {
      setGuardando(true);
      try { await onSave({ status: form.status }); } catch { /* el aviso lo da quien llama */ }
      finally { setGuardando(false); }
      return;
    }
    const encontrados = validar(form);
    setErrores(encontrados);
    if (Object.keys(encontrados).length) return;

    setGuardando(true);
    try {
      const { anio_poa, ...datos } = form;
      await onSave({
        ...datos,
        name: form.name.trim(),
        objectives: unirObjetivos(objetivos),
        // Si no viene del POA, la aprobación no se guarda
        poa_aprobacion: form.es_poa ? form.poa_aprobacion.trim() : null,
      });
    } catch (err) {
      const { message, campo } = err?.response?.data || {};
      if (campo && message) setErrores({ [campo]: message });
    } finally {
      setGuardando(false);
    }
  };

  if (soloEstado) {
    return (
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="flex items-start gap-2 p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-sm text-indigo-800 dark:text-indigo-200">
          <Lock className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>
            La planificación de este proyecto POA está bloqueada por la administración.
            Solo puedes cambiar su estado.
          </p>
        </div>
        <div>
          <label className="label">Estado</label>
          <select className="input" value={form.status} onChange={e => cambiar('status', e.target.value)}>
            <option value="active">Activo</option>
            <option value="paused">Pausado</option>
            <option value="completed">Completado</option>
            <option value="cancelled">Cancelado</option>
          </select>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
          <button type="button" className="btn-secondary w-full sm:w-auto sm:flex-1" onClick={onCancel}>Cancelar</button>
          <button type="submit" disabled={guardando} className="btn-primary w-full sm:w-auto sm:flex-1">
            {guardando
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
              : 'Guardar estado'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {/* POA primero: si el proyecto viene del Plan Operativo Anual, define
          sus fechas (el año del plan) y pide su aprobación */}
      <div className={`rounded-lg border p-3 space-y-3 ${form.es_poa
        ? 'border-primary-200 dark:border-primary-800 bg-primary-50/40 dark:bg-primary-900/10'
        : 'border-gray-200 dark:border-gray-700'}`}>
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span>
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">Viene del POA</span>
            <span className="block text-xs text-gray-400 dark:text-gray-500">
              Márcalo si el proyecto forma parte del Plan Operativo Anual aprobado.
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={form.es_poa}
            onClick={() => cambiarPoa(!form.es_poa)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
              form.es_poa ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
          >
            <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transform transition-transform ${
              form.es_poa ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </label>

        {form.es_poa && (
          <div className="grid sm:grid-cols-[8rem_1fr] gap-3">
            <div>
              <label className="label">Año del POA</label>
              <select className="input" value={form.anio_poa} onChange={e => cambiarAnioPoa(Number(e.target.value))}>
                {aniosPoa.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Aprobación del POA *</label>
              <textarea
                className={`${conError(errores.poa_aprobacion)} resize-y min-h-[2.75rem]`}
                rows={2}
                maxLength={1000}
                placeholder="Ej.: Aprobado por el Consejo Superior Universitario, acta n.º 12-2026, del 15 de octubre de 2026"
                value={form.poa_aprobacion}
                onChange={e => cambiar('poa_aprobacion', e.target.value)}
              />
              <MensajeError texto={errores.poa_aprobacion} />
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="label">Nombre del proyecto *</label>
        <input
          type="text" autoFocus maxLength={255}
          className={conError(errores.name)}
          value={form.name}
          onChange={e => cambiar('name', e.target.value)}
        />
        <MensajeError texto={errores.name} />
      </div>

      {/* Objetivos: uno por campo, cada uno redimensionable */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="label mb-0">Objetivos</label>
          {cuantos > 1 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">{cuantos} objetivos</span>
          )}
        </div>
        <ol className="space-y-2">
          {objetivos.map((o, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="w-6 h-6 mt-2 flex-shrink-0 rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 text-xs font-semibold flex items-center justify-center">
                {i + 1}
              </span>
              <textarea
                className="input resize-y min-h-[5.5rem] flex-1"
                rows={4}
                placeholder={i === 0 ? 'Ej.: Garantizar la disponibilidad y el licenciamiento de Google Workspace y Microsoft 365…' : 'Otro objetivo del proyecto'}
                value={o}
                onChange={e => cambiarObjetivo(i, e.target.value)}
              />
              {(objetivos.length > 1 || o) && (
                <button
                  type="button"
                  onClick={() => quitarObjetivo(i)}
                  title="Quitar este objetivo"
                  aria-label="Quitar este objetivo"
                  className="p-2.5 sm:p-1.5 mt-0 sm:mt-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={agregarObjetivo}
          className="mt-2 ml-8 py-2 sm:py-0 text-sm text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Agregar objetivo
        </button>
      </div>

      <div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Fecha inicio</label>
            <input
              type="date" className={conError(errores.start_date)}
              value={form.start_date}
              onChange={e => cambiar('start_date', e.target.value)}
            />
            <MensajeError texto={errores.start_date} />
          </div>
          <div>
            <label className="label">Fecha fin</label>
            <input
              type="date" className={conError(errores.end_date)}
              min={form.start_date || undefined}
              value={form.end_date}
              onChange={e => cambiar('end_date', e.target.value)}
            />
            <MensajeError texto={errores.end_date} />
          </div>
        </div>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          {form.es_poa
            ? `Se llenan con el año del POA (${form.anio_poa}). Puedes ajustarlas si el proyecto dura menos.`
            : 'Opcionales. La fecha de inicio sirve de punto de partida al cronograma macro.'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Estado</label>
          <select className="input" value={form.status} onChange={e => cambiar('status', e.target.value)}>
            <option value="active">Activo</option>
            <option value="paused">Pausado</option>
            <option value="completed">Completado</option>
            <option value="cancelled">Cancelado</option>
          </select>
        </div>
        <div>
          <label className="label">Color del proyecto</label>
          <div className="flex gap-2 flex-wrap mt-2">
            {COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => cambiar('color', c)}
                title="Color del proyecto"
                className={`w-8 h-8 sm:w-6 sm:h-6 rounded-full transition-transform hover:scale-110 ${
                  form.color === c ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-900 scale-110' : ''
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
        <button type="button" className="btn-secondary w-full sm:w-auto sm:flex-1" onClick={onCancel}>Cancelar</button>
        <button type="submit" disabled={guardando} className="btn-primary w-full sm:w-auto sm:flex-1">
          {guardando
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
            : (project ? 'Actualizar' : 'Crear Proyecto')}
        </button>
      </div>
    </form>
  );
}
