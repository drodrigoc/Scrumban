import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import BottomNav from './BottomNav';
import NotificacionesPanel from './NotificacionesPanel';
import { NotificacionesProvider } from '../../context/NotificacionesContext';

// Desde `lg` (1024 px) el panel lateral queda fijo; por debajo es un cajón
// que se abre con «Menú» en la barra inferior.
const ESCRITORIO = '(min-width: 1024px)';
const esEscritorio = () => typeof window !== 'undefined' && window.matchMedia(ESCRITORIO).matches;

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(esEscritorio);
  const { pathname } = useLocation();

  // En el móvil el cajón se cierra al cambiar de pantalla
  useEffect(() => {
    if (!esEscritorio()) setSidebarOpen(false);
  }, [pathname]);

  // Al pasar de móvil a escritorio (o al revés) se ajusta el panel
  useEffect(() => {
    const mq = window.matchMedia(ESCRITORIO);
    const alCambiar = (e) => setSidebarOpen(e.matches);
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);

  return (
    <NotificacionesProvider>
      <div className="flex h-[100dvh] overflow-hidden bg-gray-50 dark:bg-gray-950 transition-colors duration-200">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Header onMenuClick={() => setSidebarOpen(v => !v)} />
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 pb-nav lg:pb-6">
            <Outlet />
          </main>
        </div>

        <BottomNav onMenu={() => setSidebarOpen(true)} menuAbierto={sidebarOpen && !esEscritorio()} />
        <NotificacionesPanel />
      </div>
    </NotificacionesProvider>
  );
}
