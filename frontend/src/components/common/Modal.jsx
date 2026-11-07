import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const sizeClass = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export default function Modal({ title, children, onClose, size = 'md' }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // Se dibuja en <body>: así ningún contenedor con transform (p. ej. la
  // animación de entrada de una página) limita la ventana a su caja.
  return createPortal(
    <div
      className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className={`
        bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl dark:shadow-gray-900/80
        border border-transparent dark:border-gray-700
        w-full ${sizeClass[size]} max-h-[92dvh] sm:max-h-[90vh] flex flex-col animate-fade-in
      `}>
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 min-w-0">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-2 sm:p-1.5 -mr-1 rounded-lg flex-shrink-0 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 pb-safe sm:pb-4">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
