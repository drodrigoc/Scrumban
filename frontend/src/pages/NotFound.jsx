import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="text-center">
        <h1 className="text-8xl font-bold text-gray-200 dark:text-gray-700">404</h1>
        <p className="text-xl font-semibold text-gray-700 dark:text-gray-300 mt-4">Página no encontrada</p>
        <p className="text-gray-400 dark:text-gray-500 mt-2">La página que buscas no existe.</p>
        <Link to="/" className="btn-primary mt-6 inline-flex">Ir al inicio</Link>
      </div>
    </div>
  );
}
