import { useEffect } from 'react';
import { CheckCheck, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNotificaciones } from '../../context/NotificacionesContext';

const ICONO_TIPO = {
  task_assigned: '📋', status_changed: '🔄', comment_added: '💬',
  task_due_soon: '⏰', task_overdue: '🚨', project_update: '📁',
};

/**
 * Panel de notificaciones. En escritorio se despliega bajo la campana del
 * encabezado; en el móvil sube desde abajo, sobre la barra de navegación.
 */
export default function NotificacionesPanel() {
  const { notificaciones, sinLeer, abierto, cerrar, marcarLeida, marcarTodas } = useNotificaciones();

  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e) => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [abierto, cerrar]);

  if (!abierto) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 lg:bg-transparent" onClick={cerrar} />
      <div
        role="dialog"
        aria-label="Notificaciones"
        className="fixed z-50 inset-x-0 bottom-0 max-h-[75dvh] rounded-t-2xl
                   lg:inset-x-auto lg:bottom-auto lg:top-14 lg:right-4 lg:w-80 lg:max-h-[70vh] lg:rounded-xl
                   flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                   shadow-lg dark:shadow-gray-900/50 animate-fade-in pb-safe lg:pb-0"
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Notificaciones</h3>
          <div className="flex items-center gap-1">
            {sinLeer > 0 && (
              <button onClick={marcarTodas} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20">
                <CheckCheck className="w-3.5 h-3.5" />
                Marcar todas
              </button>
            )}
            <button onClick={cerrar} aria-label="Cerrar" className="lg:hidden p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-gray-50 dark:divide-gray-700">
          {notificaciones.length === 0 ? (
            <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">Sin notificaciones</p>
          ) : notificaciones.map(n => (
            <div
              key={n.id}
              onClick={() => !n.is_read && marcarLeida(n.id)}
              className={`flex gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                !n.is_read ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
              }`}
            >
              <span className="text-lg flex-shrink-0">{ICONO_TIPO[n.type] || '🔔'}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${!n.is_read ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>
                  {n.title}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{n.message}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {formatDistanceToNow(new Date(n.created_at), { locale: es, addSuffix: true })}
                </p>
              </div>
              {!n.is_read && <div className="w-2 h-2 bg-primary-500 rounded-full mt-1.5 flex-shrink-0" />}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
