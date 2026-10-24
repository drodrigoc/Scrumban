import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { FileSpreadsheet, Printer, ListChecks, ChevronDown, ChevronRight } from 'lucide-react';
import { sgcAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { ESTADOS, ORDEN_ESTADOS, contar, porcentaje, ordenCodigos } from './estados';
import { guardarBlob, mensajeDeError } from './comunes';

// ---------------------------------------------------------------------------
// Árbol de conteos: dimensión → criterio → indicador
// ---------------------------------------------------------------------------
function arbolDeConteos(evidencias) {
  const dims = new Map();
  for (const e of evidencias) {
    const d = dims.get(e.dimension) || { codigo: e.dimension, nombre: e.dimension_nombre, ev: [], hijos: new Map() };
    dims.set(e.dimension, d);
    const c = d.hijos.get(e.criterio) || { codigo: e.criterio, nombre: e.criterio_nombre, ev: [], hijos: new Map() };
    d.hijos.set(e.criterio, c);
    const i = c.hijos.get(e.indicador) || { codigo: e.indicador, nombre: e.indicador_nombre, ev: [] };
    c.hijos.set(e.indicador, i);
    d.ev.push(e); c.ev.push(e); i.ev.push(e);
  }
  const cerrar = (nodo) => ({
    codigo: nodo.codigo || '—',
    nombre: nodo.nombre || 'Sin clasificar',
    ...contar(nodo.ev),
    hijos: nodo.hijos ? [...nodo.hijos.values()].map(cerrar).sort((a, b) => ordenCodigos(a.codigo, b.codigo)) : [],
  });
  return [...dims.values()].map(cerrar).sort((a, b) => ordenCodigos(a.codigo, b.codigo));
}

// ---------------------------------------------------------------------------
// Versión imprimible
// ---------------------------------------------------------------------------
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Colores de la barra en papel: los mismos que en pantalla (modo claro)
const COLOR_IMPRESION = {
  con_evidencia: '#0ca30c', en_curso: '#2563eb', planificada: '#93c5fd', en_riesgo: '#d03b3b', sin_trabajo: '#d1d5db',
};

function htmlImprimible({ arbol, evidencias, filtro, usuario, conIndicadores, conDetalle }) {
  const total = contar(evidencias);
  const generado = new Date().toLocaleString('es-SV', { dateStyle: 'long', timeStyle: 'short' });

  const celdas = (n) => ORDEN_ESTADOS.map(e => `<td class="num">${n[e] || ''}</td>`).join('') +
    `<td class="num"><b>${porcentaje(n.con_evidencia, n.total)}%</b></td>`;

  const filas = [];
  for (const d of arbol) {
    filas.push(`<tr class="dim"><td>${esc(d.codigo)}</td><td>${esc(d.nombre)}</td><td class="num">${d.total}</td>${celdas(d)}</tr>`);
    for (const c of d.hijos) {
      filas.push(`<tr><td class="cod1">${esc(c.codigo)}</td><td class="nom1">${esc(c.nombre)}</td><td class="num">${c.total}</td>${celdas(c)}</tr>`);
      if (conIndicadores) for (const i of c.hijos) {
        filas.push(`<tr class="ind"><td class="cod2">${esc(i.codigo)}</td><td class="nom2">${esc(i.nombre)}</td><td class="num">${i.total}</td>${celdas(i)}</tr>`);
      }
    }
  }

  const barra = ORDEN_ESTADOS.filter(e => total[e]).map(e =>
    `<span style="width:${(total[e] / total.total) * 100}%;background:${COLOR_IMPRESION[e]}"></span>`).join('');

  const detalle = conDetalle ? `
    <h2>Detalle de evidencias</h2>
    <table>
      <thead><tr><th>Código</th><th>Evidencia</th><th>Estado</th><th class="num">Tareas</th><th class="num">Archivos</th><th>Responsables</th></tr></thead>
      <tbody>${evidencias.map(e => `
        <tr>
          <td class="mono">${esc(e.evidencia)}</td>
          <td>${esc(e.nombre_evidencia)}${e.motivo ? `<div class="motivo">${esc(e.motivo)}</div>` : ''}</td>
          <td class="nowrap"><span class="punto" style="background:${COLOR_IMPRESION[e.estado]}"></span>${esc(ESTADOS[e.estado]?.label)}</td>
          <td class="num">${e.tasks.length}</td>
          <td class="num">${e.archivos.length}</td>
          <td>${esc([...new Set(e.tasks.map(t => t.assignee_name).filter(Boolean))].join(', '))}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : '';

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Cobertura SGC${filtro ? ` — ${esc(filtro)}` : ''}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font: 10px/1.4 Inter, system-ui, sans-serif; color: #111827; margin: 0; }
  h1 { font-size: 17px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 18px 0 6px; page-break-after: avoid; }
  .sub { color: #6b7280; margin-bottom: 12px; }
  .kpis { display: flex; gap: 14px; align-items: flex-end; margin-bottom: 6px; }
  .kpi b { display: block; font-size: 22px; }
  .kpi { color: #374151; }
  .barra { display: flex; gap: 2px; height: 10px; border-radius: 3px; overflow: hidden; margin: 6px 0 4px; }
  .barra span { display: block; height: 100%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .leyenda { display: flex; flex-wrap: wrap; gap: 4px 14px; color: #374151; margin-bottom: 4px; }
  .punto { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 4px; vertical-align: middle; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .estados { margin: 4px 0 0; padding: 0; list-style: none; color: #4b5563; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th { text-align: left; font-weight: 600; background: #f3f4f6; border-bottom: 1px solid #d1d5db; padding: 4px 5px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  td { border-bottom: 1px solid #e5e7eb; padding: 3px 5px; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .nowrap { white-space: nowrap; }
  .mono, td:first-child { font-family: ui-monospace, monospace; white-space: nowrap; }
  tr.dim td { font-weight: 700; background: #eff6ff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .cod1, .nom1 { padding-left: 12px; }
  .cod2, .nom2 { padding-left: 22px; color: #4b5563; }
  tr.total td { font-weight: 700; border-top: 2px solid #9ca3af; }
  .motivo { color: #b91c1c; font-size: 9px; }
</style></head>
<body>
  <h1>Cobertura de evidencias SGC</h1>
  <div class="sub">${filtro ? `${esc(filtro)} · ` : ''}Generado el ${esc(generado)} por ${esc(usuario)}</div>

  <div class="kpis">
    <div class="kpi"><b>${porcentaje(total.con_evidencia, total.total)}%</b>cobertura</div>
    <div class="kpi">${total.con_evidencia} de ${total.total} evidencias con al menos un archivo</div>
  </div>
  <div class="barra">${barra}</div>
  <div class="leyenda">${ORDEN_ESTADOS.map(e =>
    `<span><span class="punto" style="background:${COLOR_IMPRESION[e]}"></span>${esc(ESTADOS[e].label)}: <b>${total[e]}</b></span>`).join('')}
  </div>
  <ul class="estados">${ORDEN_ESTADOS.map(e => `<li><b>${esc(ESTADOS[e].label)}:</b> ${esc(ESTADOS[e].descripcion)}.</li>`).join('')}</ul>

  <h2>Resumen por ${conIndicadores ? 'dimensión, criterio e indicador' : 'dimensión y criterio'}</h2>
  <table>
    <thead><tr>
      <th>Código</th><th>Nombre</th><th class="num">Evidencias</th>
      ${ORDEN_ESTADOS.map(e => `<th class="num">${esc(ESTADOS[e].label)}</th>`).join('')}
      <th class="num">Cobertura</th>
    </tr></thead>
    <tbody>
      ${filas.join('')}
      <tr class="total"><td></td><td>Total</td><td class="num">${total.total}</td>${celdas(total)}</tr>
    </tbody>
  </table>
  ${detalle}
  <script>window.onload = () => { window.focus(); window.print(); };</script>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Tab: Reporte
// ---------------------------------------------------------------------------
function Celdas({ n }) {
  const cobertura = porcentaje(n.con_evidencia, n.total);
  return (
    <>
      <td className="px-2 py-2 text-right tabular-nums">{n.total}</td>
      {ORDEN_ESTADOS.map(e => (
        <td key={e} className={`px-2 py-2 text-right tabular-nums hidden md:table-cell ${n[e] ? '' : 'text-gray-300 dark:text-gray-600'}`}>
          {n[e]}
        </td>
      ))}
      <td className="px-2 py-2">
        <div className="flex items-center gap-2 justify-end">
          <span className="tabular-nums text-xs font-semibold w-9 text-right">{cobertura}%</span>
          <span className="w-16 h-1.5 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden hidden sm:block" aria-hidden="true">
            <span className={`block h-full rounded ${ESTADOS.con_evidencia.barra}`} style={{ width: `${cobertura}%` }} />
          </span>
        </div>
      </td>
    </>
  );
}

export default function ReporteTab() {
  const { user } = useAuth();
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({ dimension: '', criterio: '', indicador: '' });
  const [conIndicadores, setConIndicadores] = useState(false);
  const [conDetalle, setConDetalle]         = useState(true);
  const [abiertos, setAbiertos]             = useState(new Set());
  const [descargando, setDescargando]       = useState(false);

  useEffect(() => {
    sgcAPI.getAllWithTasks()
      .then(({ data }) => setData(data))
      .catch((err) => toast.error(err.response?.data?.message || 'Error al cargar el reporte'))
      .finally(() => setLoading(false));
  }, []);

  const cambiarFiltro = (campo, valor) => setFiltros(f => {
    const n = { ...f, [campo]: valor };
    if (campo === 'dimension') { n.criterio = ''; n.indicador = ''; }
    if (campo === 'criterio')  n.indicador = '';
    return n;
  });

  const opciones = (filas, campo, nombre) => {
    const mapa = new Map();
    filas.forEach(e => { if (e[campo]) mapa.set(e[campo], e[nombre]); });
    return [...mapa.entries()].sort((a, b) => ordenCodigos(a[0], b[0]));
  };
  const dimensiones = opciones(data, 'dimension', 'dimension_nombre');
  const criterios   = opciones(data.filter(e => !filtros.dimension || e.dimension === filtros.dimension), 'criterio', 'criterio_nombre');
  const indicadores = opciones(data.filter(e => (!filtros.dimension || e.dimension === filtros.dimension) && (!filtros.criterio || e.criterio === filtros.criterio)), 'indicador', 'indicador_nombre');

  const evidencias = useMemo(() => data.filter(e =>
    (!filtros.dimension || e.dimension === filtros.dimension) &&
    (!filtros.criterio  || e.criterio  === filtros.criterio)  &&
    (!filtros.indicador || e.indicador === filtros.indicador)
  ), [data, filtros]);

  const arbol = useMemo(() => arbolDeConteos(evidencias), [evidencias]);
  const total = contar(evidencias);

  const filtroTexto = filtros.indicador ? `Indicador ${filtros.indicador}`
    : filtros.criterio ? `Criterio ${filtros.criterio}`
    : filtros.dimension ? `Dimensión ${filtros.dimension}` : null;

  const descargarExcel = async () => {
    setDescargando(true);
    try {
      const params = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v));
      const { data: blob } = await sgcAPI.descargarReporte(params);
      const hoy = new Date().toLocaleDateString('en-CA');
      guardarBlob(blob, `Cobertura SGC${filtroTexto ? ` - ${filtroTexto}` : ''} - ${hoy}.xlsx`);
    } catch (err) {
      toast.error(await mensajeDeError(err, 'No se pudo generar el reporte'));
    } finally {
      setDescargando(false);
    }
  };

  const imprimir = () => {
    const ventana = window.open('', '_blank');
    if (!ventana) {
      toast.error('El navegador bloqueó la ventana del reporte. Permite las ventanas emergentes para este sitio.');
      return;
    }
    ventana.document.write(htmlImprimible({
      arbol, evidencias, filtro: filtroTexto, usuario: user?.name || '', conIndicadores, conDetalle,
    }));
    ventana.document.close();
  };

  const alternar = (clave) => setAbiertos(prev => {
    const n = new Set(prev);
    n.has(clave) ? n.delete(clave) : n.add(clave);
    return n;
  });

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const encabezadoEstado = (e) => {
    const Icono = ESTADOS[e].icono;
    return (
      <th key={e} className="px-2 py-2 text-right font-medium hidden md:table-cell" title={ESTADOS[e].descripcion}>
        <span className="inline-flex items-center gap-1">
          <Icono className={`w-3.5 h-3.5 ${ESTADOS[e].texto}`} aria-hidden="true" />
          {ESTADOS[e].label}
        </span>
      </th>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <select className="input text-sm py-1.5 w-full sm:w-44" value={filtros.dimension} onChange={e => cambiarFiltro('dimension', e.target.value)}>
          <option value="">Todas las dimensiones</option>
          {dimensiones.map(([c, n]) => <option key={c} value={c}>{c} — {n}</option>)}
        </select>
        <select className="input text-sm py-1.5 w-full sm:w-44" value={filtros.criterio} onChange={e => cambiarFiltro('criterio', e.target.value)}>
          <option value="">Todos los criterios</option>
          {criterios.map(([c, n]) => <option key={c} value={c}>{c} — {n}</option>)}
        </select>
        <select className="input text-sm py-1.5 w-full sm:w-44" value={filtros.indicador} onChange={e => cambiarFiltro('indicador', e.target.value)}>
          <option value="">Todos los indicadores</option>
          {indicadores.map(([c, n]) => <option key={c} value={c}>{c} — {n}</option>)}
        </select>
        <div className="flex gap-2 sm:ml-auto">
          <button onClick={descargarExcel} disabled={descargando || !evidencias.length} className="btn-secondary text-sm py-1.5">
            {descargando
              ? <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              : <FileSpreadsheet className="w-4 h-4" />}
            Excel
          </button>
          <button onClick={imprimir} disabled={!evidencias.length} className="btn-primary text-sm py-1.5">
            <Printer className="w-4 h-4" /> Imprimir o PDF
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={conIndicadores} onChange={e => setConIndicadores(e.target.checked)} />
          Mostrar indicadores
        </label>
        <label className="inline-flex items-center gap-2" title="Agrega a la versión imprimible una tabla con cada evidencia">
          <input type="checkbox" checked={conDetalle} onChange={e => setConDetalle(e.target.checked)} />
          Incluir el detalle de evidencias al imprimir
        </label>
      </div>

      {evidencias.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <ListChecks className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No hay evidencias que reportar.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm text-gray-700 dark:text-gray-300">
            <thead className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Código</th>
                <th className="px-2 py-2 text-left font-medium">Nombre</th>
                <th className="px-2 py-2 text-right font-medium">Evidencias</th>
                {ORDEN_ESTADOS.map(encabezadoEstado)}
                <th className="px-2 py-2 text-right font-medium">Cobertura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {arbol.map(d => {
                const kd = `d-${d.codigo}`;
                // Con un filtro de dimensión o más fino, los criterios se ven siempre
                const abierta = abiertos.has(kd) || Boolean(filtros.dimension);
                return [
                  <tr key={kd} className="bg-gray-50/80 dark:bg-gray-800/50 font-semibold text-gray-900 dark:text-gray-100">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button type="button" onClick={() => alternar(kd)} className="inline-flex items-center gap-1 font-mono text-xs"
                        aria-expanded={abierta} aria-label={`${abierta ? 'Contraer' : 'Expandir'} dimensión ${d.codigo}`}>
                        {abierta ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        {d.codigo}
                      </button>
                    </td>
                    <td className="px-2 py-2 min-w-[12rem]">{d.nombre}</td>
                    <Celdas n={d} />
                  </tr>,
                  ...(abierta ? d.hijos.flatMap(c => [
                    <tr key={`c-${c.codigo}`}>
                      <td className="pl-8 pr-2 py-2 font-mono text-xs whitespace-nowrap">{c.codigo}</td>
                      <td className="px-2 py-2"><span className="line-clamp-2" title={c.nombre}>{c.nombre}</span></td>
                      <Celdas n={c} />
                    </tr>,
                    ...(conIndicadores ? c.hijos.map(i => (
                      <tr key={`i-${i.codigo}`} className="text-gray-500 dark:text-gray-400">
                        <td className="pl-12 pr-2 py-2 font-mono text-xs whitespace-nowrap">{i.codigo}</td>
                        <td className="px-2 py-2 text-xs"><span className="line-clamp-2" title={i.nombre}>{i.nombre}</span></td>
                        <Celdas n={i} />
                      </tr>
                    )) : []),
                  ]) : []),
                ];
              })}
              <tr className="border-t-2 border-gray-300 dark:border-gray-600 font-semibold text-gray-900 dark:text-gray-100">
                <td className="px-3 py-2" />
                <td className="px-2 py-2">Total{filtroTexto ? ` · ${filtroTexto}` : ''}</td>
                <Celdas n={total} />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-500">
        Cobertura: evidencias con al menos un archivo, sobre el total. El Excel trae además una hoja con cada evidencia y otra con
        cada archivo y su enlace a Drive.
      </p>
    </div>
  );
}
