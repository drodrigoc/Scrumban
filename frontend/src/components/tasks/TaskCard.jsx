import { Calendar, AlertTriangle, MessageCircle } from 'lucide-react';
import { format, isPast, parseISO, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';

const priorityDot = {
  low: 'bg-gray-400', medium: 'bg-blue-500', high: 'bg-amber-500', critical: 'bg-red-500',
};
const priorityLabel = {
  low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica',
};

export default function TaskCard({ task, onClick }) {
  const isOverdue = task.due_date && task.status !== 'completed' && isPast(parseISO(task.due_date));
  const daysLeft = task.due_date ? differenceInDays(parseISO(task.due_date), new Date()) : null;
  const isDueSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3 && task.status !== 'completed';

  return (
    <div
      onClick={onClick}
      className={`
        rounded-xl p-3 cursor-pointer select-none transition-all
        hover:shadow-md hover:-translate-y-0.5
        border
        ${isOverdue
          ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
        }
      `}
    >
      {/* Labels */}
      {task.labels && task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.labels.map(l => (
            <span
              key={l.id}
              className="text-xs px-1.5 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: l.color + '25', color: l.color }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}

      {/* Title */}
      <p className={`text-sm font-medium leading-tight mb-2 ${
        isOverdue ? 'text-red-800 dark:text-red-300' : 'text-gray-800 dark:text-gray-100'
      }`}>
        {task.title}
      </p>

      {/* Priority + overdue badge */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          <div className={`w-1.5 h-1.5 rounded-full ${priorityDot[task.priority]}`} />
          <span className="text-xs text-gray-500 dark:text-gray-400">{priorityLabel[task.priority]}</span>
        </div>
        {isOverdue && (
          <div className="flex items-center gap-1 text-red-500 dark:text-red-400">
            <AlertTriangle className="w-3 h-3" />
            <span className="text-xs font-medium">Vencida</span>
          </div>
        )}
        {isDueSoon && !isOverdue && (
          <div className="flex items-center gap-1 text-amber-500 dark:text-amber-400">
            <AlertTriangle className="w-3 h-3" />
            <span className="text-xs font-medium">{daysLeft === 0 ? 'Hoy' : `${daysLeft}d`}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        {task.assignee_name ? (
          <div
            className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-700 dark:text-primary-300 font-semibold text-xs"
            title={task.assignee_name}
          >
            {task.assignee_name.charAt(0).toUpperCase()}
          </div>
        ) : <div />}

        <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500">
          {task.due_date && (
            <span className={`flex items-center gap-1 text-xs ${
              isOverdue ? 'text-red-500 dark:text-red-400' : isDueSoon ? 'text-amber-500 dark:text-amber-400' : ''
            }`}>
              <Calendar className="w-3 h-3" />
              {format(parseISO(task.due_date), 'dd MMM', { locale: es })}
            </span>
          )}
          {task.comment_count > 0 && (
            <span className="flex items-center gap-0.5 text-xs">
              <MessageCircle className="w-3 h-3" /> {task.comment_count}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
