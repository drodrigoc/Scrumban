import { differenceInCalendarDays, parseISO } from 'date-fns';

/*
 * Fechas sin hora: fecha límite, inicio de tarea, fechas de proyecto y fases.
 *
 * Son días del calendario, no instantes. No se les puede aplicar new Date()
 * ni compararlas contra la hora actual:
 *   - new Date('2026-11-04') es medianoche UTC, que en El Salvador todavía
 *     es el 3 de noviembre.
 *   - Una tarea que vence hoy no está vencida, aunque ya pasó la medianoche.
 */

// '2026-11-04' → medianoche local de ese día
export const diaLocal = (fecha) => parseISO(String(fecha).slice(0, 10));

// Días de calendario que faltan: 0 = hoy, negativo = ya pasó
export const diasParaVencer = (fecha) => differenceInCalendarDays(diaLocal(fecha), new Date());

export const estaVencida = (fecha) => Boolean(fecha) && diasParaVencer(fecha) < 0;
