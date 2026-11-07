import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Menu, Bell, Sun, Moon, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useNotificaciones } from '../../context/NotificacionesContext';

export default function Header({ onMenuClick }) {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const { sinLeer, abierto, alternar } = useNotificaciones();
  const navigate = useNavigate();

  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);

  // Cierra el menú de usuario al tocar fuera
  useEffect(() => {
    const handler = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setShowUserMenu(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, []);

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-2.5 lg:py-3 flex items-center gap-3 pt-safe transition-colors duration-200">
      {/* Escritorio: plegar el panel lateral. En el móvil el menú está en la barra inferior. */}
      <button
        onClick={onMenuClick}
        aria-label="Mostrar u ocultar el menú"
        className="hidden lg:inline-flex p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Móvil: nombre de la app */}
      <Link to="/" className="lg:hidden flex items-center gap-2 min-w-0">
        <img src="/icono.svg" alt="" className="w-7 h-7 rounded-lg flex-shrink-0" />
        <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">USO Projects</span>
      </Link>

      <div className="flex items-center gap-1 sm:gap-2 ml-auto">

        {/* ── Modo oscuro ── */}
        <button
          onClick={toggle}
          aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          className={`
            relative inline-flex h-7 items-center rounded-full px-0.5 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900
            ${dark ? 'bg-primary-600' : 'bg-gray-300'}
          `}
          style={{ width: '52px' }}
        >
          <span className="absolute left-1.5 text-[10px]">
            {dark ? <Moon className="w-3 h-3 text-primary-200" /> : null}
          </span>
          <span className="absolute right-1.5 text-[10px]">
            {!dark ? <Sun className="w-3 h-3 text-amber-500" /> : null}
          </span>
          <span className={`
            inline-flex items-center justify-center h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300
            ${dark ? 'translate-x-6' : 'translate-x-0.5'}
          `}>
            {dark
              ? <Moon className="w-2.5 h-2.5 text-primary-600" />
              : <Sun className="w-2.5 h-2.5 text-amber-400" />
            }
          </span>
        </button>

        {/* ── Notificaciones (escritorio; en el móvil están en la barra inferior) ── */}
        <button
          onClick={alternar}
          aria-label="Notificaciones"
          aria-expanded={abierto}
          className="hidden lg:inline-flex relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
        >
          <Bell className="w-5 h-5" />
          {sinLeer > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
              {sinLeer > 9 ? '9+' : sinLeer}
            </span>
          )}
        </button>

        {/* ── Avatar + menú de usuario ── */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(v => !v)}
            aria-label="Menú de usuario"
            className="flex items-center gap-2 p-1.5 sm:px-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="w-8 h-8 sm:w-7 sm:h-7 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-700 dark:text-primary-300 font-semibold text-sm flex-shrink-0">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:block">
              {user?.name?.split(' ')[0]}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 hidden sm:block transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''}`} />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-56 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg dark:shadow-gray-900/50 z-50 animate-fade-in overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{user?.name}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{user?.email}</p>
              </div>
              <div className="py-1">
                <button
                  onClick={() => { setShowUserMenu(false); logout(); navigate('/login'); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Cerrar sesión
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </header>
  );
}
