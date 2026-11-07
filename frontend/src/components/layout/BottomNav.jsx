import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, CheckSquare, Bell, Menu } from 'lucide-react';
import { useNotificaciones } from '../../context/NotificacionesContext';

/**
 * Barra de navegación inferior para el móvil (se oculta desde `lg`).
 * «Menú» abre el panel lateral con el resto de opciones
 * (Gestión, Administración, Supervisión, cerrar sesión).
 */
const base = 'flex-1 flex flex-col items-center justify-center gap-0.5 h-16 text-[11px] font-medium transition-colors select-none';
const color = (activo) => activo
  ? 'text-primary-600 dark:text-primary-400'
  : 'text-gray-500 dark:text-gray-400 active:text-gray-900 dark:active:text-gray-100';

export default function BottomNav({ onMenu, menuAbierto }) {
  const { sinLeer, abierto, alternar, cerrar } = useNotificaciones();

  const enlaces = [
    { to: '/',         icon: LayoutDashboard, label: 'Inicio',     end: true },
    { to: '/projects', icon: FolderKanban,    label: 'Proyectos' },
    { to: '/my-tasks', icon: CheckSquare,     label: 'Mis tareas' },
  ];

  return (
    <nav
      aria-label="Navegación principal"
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 flex items-stretch pb-safe
                 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md
                 border-t border-gray-200 dark:border-gray-700"
    >
      {enlaces.map(({ to, icon: Icon, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={cerrar}
          className={({ isActive }) => `${base} ${color(isActive && !abierto && !menuAbierto)}`}
        >
          <Icon className="w-5 h-5" />
          {label}
        </NavLink>
      ))}

      <button type="button" onClick={alternar} className={`${base} ${color(abierto)}`}>
        <span className="relative">
          <Bell className="w-5 h-5" />
          {sinLeer > 0 && (
            <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 bg-red-500 text-white text-[10px] leading-4 rounded-full text-center font-semibold">
              {sinLeer > 9 ? '9+' : sinLeer}
            </span>
          )}
        </span>
        Avisos
      </button>

      <button type="button" onClick={() => { cerrar(); onMenu(); }} className={`${base} ${color(menuAbierto)}`}>
        <Menu className="w-5 h-5" />
        Menú
      </button>
    </nav>
  );
}
