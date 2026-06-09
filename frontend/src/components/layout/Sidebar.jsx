import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LayoutDashboard, FolderKanban, Users, LogOut, X, UsersRound, Building2, Landmark, ShieldCheck, CheckSquare } from 'lucide-react';
import logo from '../../assets/logousocompleto.png';

const navItems = [
  { to: '/',        icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/projects', icon: FolderKanban,  label: 'Proyectos' },
  { to: '/my-tasks', icon: CheckSquare,  label: 'Mis Tareas' },
];

const roleLabels = {
  admin:       'Administrador',
  coordinator: 'Coordinador',
  member:      'Miembro',

  superViewer: 'Super Visor',
};

export default function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  const isTeamVisible  = ['admin', 'coordinator', 'superViewer'].includes(user?.role);
  const isAdminVisible = user?.role === 'admin';
  const isSuperViewer  = user?.role === 'superViewer';
  const hasSGCAccess   = !!user?.sgc_access && !isAdminVisible && !isSuperViewer;

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-primary-600 text-white dark:bg-primary-500'
        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
    }`;

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/30 z-20 lg:hidden" onClick={onClose} />
      )}

      <aside className={`
        fixed lg:relative z-30 flex flex-col h-full w-64
        bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700
        transition-transform duration-200 ease-in-out
        ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden'}
      `}>
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <img src={logo} alt="USO Projects" className="w-full h-auto object-contain dark:brightness-90 max-h-16" />
          <button onClick={onClose} className="lg:hidden p-1 ml-2 flex-shrink-0 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-3 mb-2">
            Principal
          </p>
          {navItems.map(({ to, icon: Icon, label, exact }) => (
            <NavLink key={to} to={to} end={exact} className={linkClass}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}

          {isTeamVisible && (
            <>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-3 mb-2 mt-4">
                Gestión
              </p>
              <NavLink to="/team" className={linkClass}>
                <UsersRound className="w-4 h-4 flex-shrink-0" />
                Seguimiento de Equipo
              </NavLink>
            </>
          )}

          {isAdminVisible && (
            <>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-3 mb-2 mt-4">
                Administración
              </p>
              <NavLink to="/units" className={linkClass}>
                <Landmark className="w-4 h-4 flex-shrink-0" />
                Unidades
              </NavLink>
              <NavLink to="/users" className={linkClass}>
                <Users className="w-4 h-4 flex-shrink-0" />
                Control de Accesos
              </NavLink>
              <NavLink to="/sgc" className={linkClass}>
                <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                SGC
              </NavLink>
            </>
          )}

          {(isSuperViewer || hasSGCAccess) && (
            <>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-3 mb-2 mt-4">
                Supervisión
              </p>
              <NavLink to="/sgc" className={linkClass}>
                <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                SGC
              </NavLink>
            </>
          )}
        </nav>

        {/* User info */}
        <div className="px-3 py-4 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-700 dark:text-primary-300 font-semibold text-sm flex-shrink-0">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user?.name}</p>
              <div className="flex items-center gap-1">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {roleLabels[user?.role] || user?.role}
                </p>
                {user?.unit && (
                  <>
                    <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-0.5 truncate">
                      <Building2 className="w-2.5 h-2.5 flex-shrink-0" />{user.unit}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
