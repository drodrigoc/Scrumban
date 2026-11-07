import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Check, ChevronDown } from 'lucide-react';

/*
 * Selector con buscador en una ventana propia.
 *
 * Sustituye a un <select> cuando la lista es larga (responsables,
 * partidas del presupuesto): se escribe para filtrar y se elige con el
 * mouse o con las flechas y Enter.
 *
 * Se abre encima de otro modal (la tarea), así que Escape se atiende
 * aquí primero y no llega al modal de abajo.
 */

const normalizar = (texto) =>
  String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Campo que muestra lo elegido y abre el selector.
 * Dentro de un <fieldset disabled> queda deshabilitado solo.
 */
export function CampoSelector({ icono: Icono, texto, placeholder, onClick, disabled, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="input flex items-center gap-2 text-left min-h-[44px] sm:min-h-0 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {Icono && <Icono className="w-4 h-4 text-gray-400 flex-shrink-0" />}
      <span className={`flex-1 truncate ${texto ? '' : 'text-gray-400 dark:text-gray-500'}`}>
        {texto || placeholder}
      </span>
      <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
    </button>
  );
}

/**
 * opciones: [{ value, label, detalle?, grupo?, extra?, inicial?, buscar? }]
 *   - detalle: segunda línea en gris
 *   - extra:   contenido a la derecha (monto, rol…)
 *   - inicial: letra para el círculo de la izquierda (personas)
 *   - buscar:  texto adicional donde también se busca
 * ninguno: { label } agrega arriba la opción de dejarlo vacío (value null)
 */
export default function SelectorBuscable({
  titulo, placeholder = 'Buscar…', opciones, valor, onElegir, onCerrar,
  ninguno, vacio = 'No hay opciones', pie,
}) {
  const [q, setQ] = useState('');
  const [activo, setActivo] = useState(0);
  const listaRef = useRef(null);

  const filtradas = useMemo(() => {
    const termino = normalizar(q.trim());
    const coinciden = termino
      ? opciones.filter(o => normalizar(`${o.label} ${o.detalle || ''} ${o.buscar || ''}`).includes(termino))
      : opciones;
    // "Ninguno" solo aparece sin búsqueda: no es algo que se busque
    return ninguno && !termino ? [{ value: null, label: ninguno.label, ninguno: true }, ...coinciden] : coinciden;
  }, [q, opciones, ninguno]);

  // Al abrir, el resaltado empieza en lo que ya estaba elegido
  useEffect(() => {
    const i = filtradas.findIndex(o => (o.value ?? null) === (valor ?? null));
    setActivo(i >= 0 ? i : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (q) setActivo(0); }, [q]);

  useEffect(() => {
    listaRef.current?.querySelector(`[data-i="${activo}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activo]);

  // Escape cierra solo este selector, no el modal de la tarea que está
  // debajo: se atrapa en la fase de captura, antes que el del modal
  useEffect(() => {
    const alTeclear = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onCerrar();
    };
    window.addEventListener('keydown', alTeclear, true);
    return () => window.removeEventListener('keydown', alTeclear, true);
  }, [onCerrar]);

  const elegir = (o) => { onElegir(o.value ?? null); onCerrar(); };

  const alTeclearBusqueda = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo(i => Math.min(i + 1, filtradas.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActivo(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter')     { e.preventDefault(); if (filtradas[activo]) elegir(filtradas[activo]); }
  };

  let grupoAnterior;

  // En document.body: así no lo recorta ni lo desplaza el modal de la tarea
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center p-0 sm:p-4 bg-black/30 dark:bg-black/50"
      onMouseDown={e => e.target === e.currentTarget && onCerrar()}
    >
      <div
        role="dialog"
        aria-label={titulo}
        className="w-full max-w-md bg-white dark:bg-gray-900 rounded-b-2xl sm:rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 flex flex-col max-h-[70dvh] sm:max-h-[75vh] animate-fade-in"
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{titulo}</h3>
          <button
            type="button"
            onClick={onCerrar}
            className="p-2.5 sm:p-1.5 -mr-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              type="text"
              className="input pl-9"
              placeholder={placeholder}
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={alTeclearBusqueda}
            />
          </div>
        </div>

        <div ref={listaRef} className="flex-1 overflow-y-auto overscroll-contain px-2 pb-2" role="listbox">
          {filtradas.length === 0 && (
            <p className="text-sm text-center text-gray-400 dark:text-gray-500 py-8 px-4">
              {q ? `Sin resultados para "${q}"` : vacio}
            </p>
          )}
          {filtradas.map((o, i) => {
            const elegido = (o.value ?? null) === (valor ?? null);
            const encabezado = o.grupo && o.grupo !== grupoAnterior ? o.grupo : null;
            grupoAnterior = o.grupo;
            return (
              <div key={o.ninguno ? '__ninguno' : o.value}>
                {encabezado && (
                  <p className="px-2 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {encabezado}
                  </p>
                )}
                <button
                  type="button"
                  data-i={i}
                  role="option"
                  aria-selected={elegido}
                  onMouseEnter={() => setActivo(i)}
                  onClick={() => elegir(o)}
                  className={`w-full flex items-center gap-3 px-2 py-2 min-h-[44px] sm:min-h-0 rounded-lg text-left transition-colors ${
                    i === activo ? 'bg-gray-100 dark:bg-gray-800' : ''
                  }`}
                >
                  {o.inicial !== undefined && (
                    <span className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 font-semibold text-sm flex items-center justify-center flex-shrink-0">
                      {o.inicial}
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm truncate ${
                      o.ninguno ? 'text-gray-500 dark:text-gray-400 italic' : 'text-gray-800 dark:text-gray-200 font-medium'
                    }`}>
                      {o.label}
                    </span>
                    {o.detalle && (
                      <span className="block text-xs text-gray-400 dark:text-gray-500 truncate">{o.detalle}</span>
                    )}
                  </span>
                  {o.extra && <span className="flex-shrink-0 text-xs">{o.extra}</span>}
                  <Check className={`w-4 h-4 flex-shrink-0 text-primary-500 ${elegido ? '' : 'invisible'}`} />
                </button>
              </div>
            );
          })}
        </div>

        {pie && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
            {pie}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
