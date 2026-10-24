import { useState } from 'react';
import { toast } from 'react-toastify';
import { Download } from 'lucide-react';
import { tasksAPI } from '../../services/api';
import Modal from '../common/Modal';
import TaskModal from '../tasks/TaskModal';
import { ESTADOS, ORDEN_ESTADOS, porcentaje } from './estados';

// ---------------------------------------------------------------------------
// Descargas
// ---------------------------------------------------------------------------
export function guardarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

// Con responseType 'blob' el mensaje de error también llega como blob
export async function mensajeDeError(err, porDefecto) {
  const data = err.response?.data;
  if (data instanceof Blob) {
    try { return JSON.parse(await data.text()).message || porDefecto; } catch { return porDefecto; }
  }
  return data?.message || porDefecto;
}

// Los archivos de Drive pasan por el backend con la sesión, así que puede
// tardar un momento: el botón muestra que está trabajando.
export function BotonDescarga({ archivo, projectId, taskId, className = '' }) {
  const [descargando, setDescargando] = useState(false);

  const descargar = async () => {
    setDescargando(true);
    try {
      const { data } = await tasksAPI.downloadAttachment(projectId, taskId, archivo.id);
      guardarBlob(data, archivo.filename);
    } catch (err) {
      toast.error(await mensajeDeError(err, 'Error al descargar el archivo'));
    } finally {
      setDescargando(false);
    }
  };

  return (
    <button
      type="button" onClick={descargar} disabled={descargando}
      title={`Descargar ${archivo.filename}`} aria-label={`Descargar ${archivo.filename}`}
      className={`p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-primary-400 disabled:opacity-60 ${className}`}
    >
      {descargando
        ? <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        : <Download className="w-4 h-4" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Ver una tarea en solo lectura
// ---------------------------------------------------------------------------
export function useVerTarea() {
  const [tarea, setTarea] = useState(null);
  const [cargando, setCargando] = useState(false);

  const abrir = async (projectId, taskId) => {
    setCargando(true);
    try {
      const { data } = await tasksAPI.getById(projectId, taskId);
      setTarea({ ...data, project_id: projectId });
    } catch {
      toast.error('Error al cargar tarea');
    } finally {
      setCargando(false);
    }
  };

  const modal = tarea && (
    <Modal title={tarea.title} onClose={() => setTarea(null)} size="xl">
      <TaskModal
        task={tarea}
        projectId={tarea.project_id}
        members={[]}
        labels={tarea.labels || []}
        readOnly
        onCancel={() => setTarea(null)}
      />
    </Modal>
  );

  return { abrir, cargando, modal };
}

// ---------------------------------------------------------------------------
// Estado de una evidencia
// ---------------------------------------------------------------------------
export function EstadoBadge({ estado, motivo }) {
  const conf = ESTADOS[estado];
  if (!conf) return null;
  const Icono = conf.icono;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700/70 text-gray-700 dark:text-gray-200 flex-shrink-0"
      title={motivo || conf.descripcion}
    >
      <Icono className={`w-3.5 h-3.5 ${conf.texto}`} aria-hidden="true" />
      {conf.label}
    </span>
  );
}

export function Leyenda({ className = '' }) {
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1 ${className}`}>
      {ORDEN_ESTADOS.map(e => (
        <span key={e} className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400" title={ESTADOS[e].descripcion}>
          <span className={`w-2.5 h-2.5 rounded-sm ${ESTADOS[e].barra}`} aria-hidden="true" />
          {ESTADOS[e].label}
        </span>
      ))}
    </div>
  );
}

/**
 * Barra apilada con un segmento por estado. Cada segmento muestra al pasar
 * el cursor su estado, cuántas evidencias tiene y qué parte del total es.
 */
export function BarraEstados({ conteo, alto = 'h-2.5' }) {
  const [activo, setActivo] = useState(null);
  const segmentos = ORDEN_ESTADOS.filter(e => conteo[e] > 0);

  if (!conteo.total) return <div className={`${alto} rounded bg-gray-100 dark:bg-gray-800`} />;

  return (
    <div className="relative py-1" onMouseLeave={() => setActivo(null)}>
      {/* El hueco de 2px entre segmentos deja ver el fondo y los separa */}
      <div className={`flex gap-0.5 ${alto} rounded overflow-hidden`} role="img"
        aria-label={segmentos.map(e => `${ESTADOS[e].label}: ${conteo[e]}`).join(', ')}>
        {segmentos.map(e => (
          <div
            key={e}
            className={`${ESTADOS[e].barra} h-full transition-opacity ${activo && activo !== e ? 'opacity-50' : ''}`}
            style={{ width: `${(conteo[e] / conteo.total) * 100}%`, minWidth: '3px' }}
            onMouseEnter={() => setActivo(e)}
          />
        ))}
      </div>
      {activo && (
        <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-1 px-2.5 py-1.5 rounded-lg shadow-lg bg-gray-900 dark:bg-gray-700 text-white text-xs whitespace-nowrap pointer-events-none">
          <span className={`inline-block w-2 h-2 rounded-sm mr-1.5 ${ESTADOS[activo].barra}`} />
          {ESTADOS[activo].label}: <b>{conteo[activo]}</b> de {conteo.total} ({porcentaje(conteo[activo], conteo.total)}%)
        </div>
      )}
    </div>
  );
}
