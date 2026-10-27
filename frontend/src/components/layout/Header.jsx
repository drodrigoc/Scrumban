import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Bell, CheckCheck, Sun, Moon, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { notificationsAPI } from '../../services/api';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Header({ onMenuClick }) {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [showNotif, setShowNotif]         = useState(false);

  const [showUserMenu, setShowUserMenu]   = useState(false);

  const notifRef    = useRef(null);
  const userMenuRef = useRef(null);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current    && !notifRef.current.contains(e.target))    setShowNotif(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setShowUserMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchUnreadCount = async () => {
    try {
      const { data } = await notificationsAPI.getUnreadCount();
      setUnreadCount(data.count);
    } catch (_) {}
  };

  const fetchNotifications = async () => {
    try {
      const { data } = await notificationsAPI.getAll();
      setNotifications(data);
    } catch (_) {}
  };

  const toggleNotifications = () => {
    if (!showNotif) fetchNotifications();
    setShowNotif(!showNotif);
  };

  const markRead = async (id) => {
    await notificationsAPI.markRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    await notificationsAPI.markAllRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const typeIcon = {
    task_assigned: '📋', status_changed: '🔄', comment_added: '💬',
    task_due_soon: '⏰', task_overdue: '🚨', project_update: '📁',
  };

  return (
    <>
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-4 transition-colors duration-200">
        <button
          onClick={onMenuClick}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 ml-auto">

          {/* ── Dark mode switch ── */}
          <button
            onClick={toggle}
            aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            className={`
              relative inline-flex h-7 w-13 items-center rounded-full px-0.5 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900
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

          {/* ── Notificaciones ── */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={toggleNotifications}
              className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotif && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg dark:shadow-gray-900/50 z-50 animate-fade-in">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Notificaciones</h3>
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700">
                      <CheckCheck className="w-3.5 h-3.5" />
                      Marcar todas
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-700">
                  {notifications.length === 0 ? (
                    <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">Sin notificaciones</p>
                  ) : notifications.map(n => (
                    <div
                      key={n.id}
                      onClick={() => !n.is_read && markRead(n.id)}
                      className={`flex gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                        !n.is_read ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                      }`}
                    >
                      <span className="text-lg flex-shrink-0">{typeIcon[n.type] || '🔔'}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${!n.is_read ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>
                          {n.title}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{n.message}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {formatDistanceToNow(new Date(n.created_at), { locale: es, addSuffix: true })}
                        </p>
                      </div>
                      {!n.is_read && <div className="w-2 h-2 bg-primary-500 rounded-full mt-1.5 flex-shrink-0" />}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Avatar + menú de usuario ── */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(v => !v)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-700 dark:text-primary-300 font-semibold text-sm flex-shrink-0">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:block">
                {user?.name?.split(' ')[0]}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-gray-400 hidden sm:block transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''}`} />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg dark:shadow-gray-900/50 z-50 animate-fade-in overflow-hidden">
                {/* Info del usuario */}
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{user?.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{user?.email}</p>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => { setShowUserMenu(false); logout(); navigate('/login'); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
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
    </>
  );
}
