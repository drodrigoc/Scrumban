import { useState } from 'react';
import { AlertCircle, Lock } from 'lucide-react';

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

/**
 * onSave(datos) puede devolver una promesa. Si el servidor rechaza los datos
 * y la promesa falla con su respuesta, el mensaje se muestra junto al campo
 * que indicó el servidor.
 *
 * soloEstado: la planificación del proyecto POA está bloqueada; solo se
 * puede cambiar el estado (activo, pausado, completado…).
 */
export default function ProjectForm({ project, onSave, onCancel, soloEstado = false }) {
  const [form, setForm] = useState({
    name:        project?.name        || '',
    description: project?.description || '',
    objectives:  project?.objectives  || '',
    start_date:  project?.start_date  ? project.start_date.split('T')[0] : '',
    end_date:    project?.end_date    ? project.end_date.split('T')[0]   : '',
    status:      project?.status      || 'active',
    color:       project?.color       || '#3B82F6',
    es_poa:         Boolean(project?.es_poa),
    poa_aprobacion: project?.poa_aprobacion || '',
  });
  const [errores, setErrores]   = useState({});
  const [guardando, setGuardando] = useState(false);

  // Al corregir un campo, su mensaje de error desaparece
  const cambiar = (campo, valor) => {
    setForm(prev => ({ ...prev, [campo]: valor }));
    if (errores[campo] || (campo === 'start_date' && errores.end_date)) {
      setErrores(prev => ({ ...prev, [campo]: undefined, ...(campo === 'start_date' && { end_date: undefined }) }));
    }
  };

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
      await onSave({
        ...form,
        name: form.name.trim(),
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
        <div className="flex gap-2 pt-2">
          <button type="button" className="btn-secondary flex-1" onClick={onCancel}>Cancelar</button>
          <button type="submit" disabled={guardando} className="btn-primary flex-1">
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

      <div>
        <label className="label">Descripción</label>
        <textarea className="input resize-none" value={form.description} onChange={e => cambiar('description', e.target.value)} rows={2} />
      </div>

      <div>
        <label className="label">Objetivos</label>
        <textarea className="input resize-none" value={form.objectives} onChange={e => cambiar('objectives', e.target.value)} rows={2} />
      </div>

      <div>
        <div className="grid grid-cols-2 gap-3">
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
          Opcionales. La fecha de inicio sirve de punto de partida al cronograma macro.
        </p>
      </div>

      {/* POA: si el proyecto viene del Plan Operativo Anual, se registra su aprobación */}
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
            onClick={() => cambiar('es_poa', !form.es_poa)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
              form.es_poa ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
          >
            <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transform transition-transform ${
              form.es_poa ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </label>

        {form.es_poa && (
          <div>
            <label className="label">Aprobación del POA *</label>
            <textarea
              className={`${conError(errores.poa_aprobacion)} resize-none`}
              rows={2}
              maxLength={1000}
              autoFocus
              placeholder="Ej.: Aprobado por el Consejo Superior Universitario, acta n.º 12-2026, del 15 de octubre de 2026"
              value={form.poa_aprobacion}
              onChange={e => cambiar('poa_aprobacion', e.target.value)}
            />
            <MensajeError texto={errores.poa_aprobacion} />
          </div>
        )}
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

      <div>
        <label className="label">Color del proyecto</label>
        <div className="flex gap-2 flex-wrap mt-1">
          {COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => cambiar('color', c)}
              className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${
                form.color === c ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-900 scale-110' : ''
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel}>Cancelar</button>
        <button type="submit" disabled={guardando} className="btn-primary flex-1">
          {guardando
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
            : (project ? 'Actualizar' : 'Crear Proyecto')}
        </button>
      </div>
    </form>
  );
}
