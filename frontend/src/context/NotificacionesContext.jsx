import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { notificationsAPI } from '../services/api';

/**
 * Estado compartido de las notificaciones: lo usan la campana del encabezado
 * (escritorio) y el botón «Avisos» de la barra inferior (móvil), que abren
 * el mismo panel.
 */
const NotificacionesContext = createContext(null);

export function NotificacionesProvider({ children }) {
  const [notificaciones, setNotificaciones] = useState([]);
  const [sinLeer, setSinLeer]               = useState(0);
  const [abierto, setAbierto]               = useState(false);

  const contar = useCallback(async () => {
    try {
      const { data } = await notificationsAPI.getUnreadCount();
      setSinLeer(data.count);
    } catch (_) {}
  }, []);

  const cargar = useCallback(async () => {
    try {
      const { data } = await notificationsAPI.getAll();
      setNotificaciones(data);
    } catch (_) {}
  }, []);

  useEffect(() => {
    contar();
    const intervalo = setInterval(contar, 30000);
    return () => clearInterval(intervalo);
  }, [contar]);

  const abrir = useCallback(() => { cargar(); setAbierto(true); }, [cargar]);
  const cerrar = useCallback(() => setAbierto(false), []);
  const alternar = useCallback(() => {
    setAbierto(v => {
      if (!v) cargar();
      return !v;
    });
  }, [cargar]);

  const marcarLeida = useCallback(async (id) => {
    await notificationsAPI.markRead(id);
    setNotificaciones(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setSinLeer(prev => Math.max(0, prev - 1));
  }, []);

  const marcarTodas = useCallback(async () => {
    await notificationsAPI.markAllRead();
    setNotificaciones(prev => prev.map(n => ({ ...n, is_read: true })));
    setSinLeer(0);
  }, []);

  return (
    <NotificacionesContext.Provider value={{ notificaciones, sinLeer, abierto, abrir, cerrar, alternar, marcarLeida, marcarTodas }}>
      {children}
    </NotificacionesContext.Provider>
  );
}

export const useNotificaciones = () => useContext(NotificacionesContext);
