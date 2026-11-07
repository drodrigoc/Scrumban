import { NavLink, useParams } from 'react-router-dom';
import { List, Kanban, CalendarDays, GanttChartSquare, Archive, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const views = [
  { key: 'backlog',   icon: List,             label: 'Backlog',     path: 'backlog' },
  { key: 'kanban',    icon: Kanban,           label: 'Tablero',     path: 'kanban' },
  { key: 'calendar',  icon: CalendarDays,     label: 'Calendario',  path: 'calendar' },
  { key: 'gantt',     icon: GanttChartSquare, label: 'Cronograma',  path: 'gantt' },
  { key: 'archive',   icon: Archive,          label: 'Archivo',     path: 'archive' },
];

export default function ViewNavBar({ projectName, projectColor }) {
  const { id } = useParams();

  const linkClass = ({ isActive }) =>
    `flex flex-1 sm:flex-none items-center justify-center gap-2 px-3 py-2 sm:py-1.5 rounded-lg text-sm font-medium transition-all duration-150 whitespace-nowrap ${
      isActive
        ? 'bg-white dark:bg-gray-700 text-primary-700 dark:text-primary-300 shadow-sm'
        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white/60 dark:hover:bg-gray-700/60'
    }`;

  return (
    <div className="sticky top-0 z-20 -mx-4 px-4 sm:-mx-6 sm:px-6 py-2 sm:py-3 mb-4
                    bg-gray-50/90 dark:bg-gray-950/90 backdrop-blur-md
                    border-b border-gray-200/70 dark:border-gray-700/70">
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        {/* Back link */}
        <Link
          to={`/projects/${id}`}
          aria-label="Volver al proyecto"
          className="flex items-center gap-1.5 p-1.5 -ml-1.5 sm:p-0 sm:ml-0 text-sm text-gray-500 dark:text-gray-400
                     hover:text-gray-800 dark:hover:text-gray-200 flex-shrink-0 sm:mr-1"
        >
          <ArrowLeft className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          <span className="hidden sm:inline">Proyecto</span>
        </Link>

        {/* Project indicator */}
        {projectName && (
          <div className="flex items-center gap-1.5 min-w-0 flex-1 sm:flex-none sm:pr-3
                          sm:border-r border-gray-300 dark:border-gray-600">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: projectColor }} />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 sm:max-w-36 truncate">
              {projectName}
            </span>
          </div>
        )}

        {/* View tabs */}
        <div className="flex items-center gap-1 w-full sm:w-auto bg-gray-200/60 dark:bg-gray-800/60 rounded-xl p-1">
          {views.map(({ key, icon: Icon, label, path }) => (
            <NavLink key={key} to={`/projects/${id}/${path}`} className={linkClass} aria-label={label} title={label}>
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}
