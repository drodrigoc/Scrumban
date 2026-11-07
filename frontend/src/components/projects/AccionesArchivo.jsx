import { useState } from 'react';
import { toast } from 'react-toastify';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { projectsAPI } from '../../services/api';
import Modal from '../common/Modal';

/*
 * Archivar, restaurar y eliminar un proyecto, con sus confirmaciones.
 * Lo usan la lista de proyectos y el detalle de un proyecto.
 *
 * Quién puede hacer qué lo decide el servidor (puede_archivar,
 * puede_eliminar o mi_acceso); aquí solo se piden las confirmaciones.
 */
export function useArchivoProyecto({ onArchivado, onRestaurado, onEliminado } = {}) {
  const [aEliminar, setAEliminar] = useState(null);

  const archivar = async (proyecto) => {
    if (!confirm(`¿Archivar «${proyecto.name}»?\n\nSaldrá de la lista de proyectos y quedará de solo lectura. Se conserva todo y se puede restaurar.`)) return;
    try {
      await projectsAPI.archive(proyecto.id);
      toast.success('Proyecto archivado');
      onArchivado?.(proyecto);
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo archivar el proyecto');
    }
  };

  const restaurar = async (proyecto) => {
    try {
      await projectsAPI.unarchive(proyecto.id);
      toast.success('Proyecto restaurado');
      onRestaurado?.(proyecto);
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo restaurar el proyecto');
    }
  };

  const modal = aEliminar && (
    <Modal title="Eliminar proyecto" onClose={() => setAEliminar(null)} size="sm">
      <ConfirmarEliminar
        proyecto={aEliminar}
        onCancel={() => setAEliminar(null)}
        onEliminado={(p) => { setAEliminar(null); onEliminado?.(p); }}
      />
    </Modal>
  );

  return { archivar, restaurar, eliminar: setAEliminar, modal };
}

// Como en GitHub: para eliminar hay que escribir el nombre del proyecto
function ConfirmarEliminar({ proyecto, onCancel, onEliminado }) {
  const [texto, setTexto] = useState('');
  const [eliminando, setEliminando] = useState(false);
  const coincide = texto.trim() === proyecto.name.trim();

  const eliminar = async (e) => {
    e.preventDefault();
    if (!coincide) return;
    setEliminando(true);
    try {
      const { data } = await projectsAPI.delete(proyecto.id, texto.trim());
      toast.success(data.archivos
        ? `Proyecto eliminado. ${data.archivos} archivo(s) enviados a la papelera.`
        : 'Proyecto eliminado');
      onEliminado(proyecto);
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo eliminar el proyecto');
      setEliminando(false);
    }
  };

  return (
    <form onSubmit={eliminar} className="space-y-4">
      <div className="flex gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-red-700 dark:text-red-300 space-y-1">
          <p><b>No se puede deshacer.</b> Se borran sus tareas, comentarios, historial, presupuesto y fases.</p>
          <p>Sus archivos van a la papelera de Drive, recuperables por 30 días. Si tiene pruebas SGC, no se podrá eliminar.</p>
        </div>
      </div>

      <div>
        <label className="label">
          Para confirmar, escribe el nombre del proyecto: <b className="text-gray-900 dark:text-gray-100">{proyecto.name}</b>
        </label>
        <input className="input" value={texto} onChange={e => setTexto(e.target.value)} autoFocus autoComplete="off" />
      </div>

      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary text-sm w-full sm:w-auto justify-center">Cancelar</button>
        <button type="submit" disabled={!coincide || eliminando} className="btn-danger text-sm disabled:opacity-50 w-full sm:w-auto justify-center">
          {eliminando
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <><Trash2 className="w-4 h-4" /> Eliminar</>}
        </button>
      </div>
    </form>
  );
}
