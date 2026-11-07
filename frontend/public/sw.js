/*
 * Service worker mínimo de USO Projects.
 * Solo sirve para que el navegador ofrezca «Instalar app». No guarda datos
 * ni la API en caché: todo va siempre a la red, así cada despliegue se ve
 * al instante. Si no hay conexión, muestra un aviso sencillo.
 */
const PAGINA_SIN_RED = `<!doctype html><html lang="es"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>USO Projects</title>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f9fafb;color:#111827;text-align:center;padding:24px">
<div><h1 style="font-size:20px;margin:0 0 8px">Sin conexión</h1>
<p style="margin:0 0 16px;color:#6b7280">Revisa tu conexión a internet e inténtalo de nuevo.</p>
<button onclick="location.reload()" style="background:#2563eb;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:16px">Reintentar</button></div>`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;   // el resto lo maneja el navegador
  e.respondWith(
    fetch(e.request).catch(() =>
      new Response(PAGINA_SIN_RED, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
  );
});
