// js/estadisticas.js — Estadísticas visuales (Chart.js) y detalle por año
// (El servidor une todos los ficheros de js/ en /main.js según js/orden.json)

// ══════════════════════════════════════════════════════════
// ESTADÍSTICAS VISUALES — Chart.js + detalle de títulos
// ══════════════════════════════════════════════════════════
(function () {
 
  let chartAnos = null;
  let statsCache = [];   // [{ anio, empezadas, terminadas }]
  let detalleCache = {}; // { anio: { empezadas:[], terminadas:[] } }
 
  // ══ helpers ══════════════════════════════════════════════════════════
  function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
 
  function fmt(n) { return Number(n).toLocaleString('es-ES'); }
 
  function apiFetch(path) {
    return fetch(`${window.API_BASE}${path}`, {
      headers: window.token ? {
        'Authorization': `Bearer ${window.token}`,
        'X-Access-Token': window.token,
      } : {}
    });
  }
 
  // ══ Métricas resumen ══════════════════════════════════════════════════════════
  function renderMetricas(stats) {
    const el = document.getElementById('stats-metricas');
    if (!el) return;
 
    const totalTerminadas = stats.reduce((s, r) => s + Number(r.terminadas || 0), 0);
    const anioActual = new Date().getFullYear();
    const rowActual  = stats.find(r => Number(r.anio) === anioActual);
    const terminadasAnio = Number(rowActual?.terminadas || 0);
    const rowAnterior = stats.find(r => Number(r.anio) === anioActual - 1);
    const terminadasAnterior = Number(rowAnterior?.terminadas || 0);
    const diff = terminadasAnio - terminadasAnterior;
    const diffStr = diff > 0 ? `+${diff} vs ${anioActual-1}` : diff < 0 ? `${diff} vs ${anioActual-1}` : `igual que ${anioActual-1}`;
 
    // Racha: años consecutivos con al menos 1 lectura terminada desde hoy hacia atrás
    let racha = 0;
    for (let y = anioActual; y >= anioActual - 20; y--) {
      const r = stats.find(r => Number(r.anio) === y);
      if (r && Number(r.terminadas) > 0) racha++;
      else break;
    }
 
    el.innerHTML = `
      <div class="stats-metric">
        <div class="stats-metric-label">Total leídos</div>
        <div class="stats-metric-value">${fmt(totalTerminadas)}</div>
        <div class="stats-metric-sub">libros terminados</div>
      </div>
      <div class="stats-metric">
        <div class="stats-metric-label">Este año</div>
        <div class="stats-metric-value">${terminadasAnio}</div>
        <div class="stats-metric-sub">${diffStr}</div>
      </div>
      <div class="stats-metric">
        <div class="stats-metric-label">Años activos</div>
        <div class="stats-metric-value">${stats.length}</div>
        <div class="stats-metric-sub">con lecturas</div>
      </div>
      <div class="stats-metric">
        <div class="stats-metric-label">Racha</div>
        <div class="stats-metric-value">${racha}</div>
        <div class="stats-metric-sub">año${racha !== 1 ? 's' : ''} consecutivo${racha !== 1 ? 's' : ''}</div>
      </div>
    `;
  }
 
  // ══ Gráfico de barras por año ══════════════════════════════════════════════════════════
  function renderChartAnos(stats) {
    const wrap = document.getElementById('stats-chart-anos-wrap');
    const canvas = document.getElementById('stats-chart-anos');
    if (!wrap || !canvas || !window.Chart) return;
 
    wrap.style.display = 'block';
 
    const isDark = matchMedia('(prefers-color-scheme: dark)').matches;
    const textColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.38)';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
 
    const labels = [...stats].reverse().map(r => r.anio);
    const data   = [...stats].reverse().map(r => Number(r.terminadas || 0));
 
    // Usar el acento de la app — leer la variable CSS en tiempo real
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent').trim() || '#2f5d50';
    // Versión semitransparente para hover
    const accentAlpha = accent + 'cc';
 
    if (chartAnos) chartAnos.destroy();
    chartAnos = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Terminados',
          data,
          backgroundColor: accent,
          hoverBackgroundColor: accentAlpha,
          borderRadius: 5,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: {
          callbacks: { label: ctx => ` ${ctx.parsed.y} libro${ctx.parsed.y !== 1 ? 's' : ''}` }
        }},
        scales: {
          x: { ticks: { color: textColor, font: { size: 11 } }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { stepSize: 1, color: textColor, font: { size: 11 } }, grid: { color: gridColor } }
        },
        onClick: (_, elements) => {
          if (!elements.length) return;
          const anio = labels[elements[0].index];
          const sel = document.getElementById('stats-anio-select');
          if (sel) { sel.value = anio; sel.dispatchEvent(new Event('change')); }
        }
      }
    });
  }
 
  // ══ Autores más leídos ══════════════════════════════════════════════════════════
  async function renderAutores(usuarioId) {
    const lista = document.getElementById('stats-autores-lista');
    if (!lista) return;
 
    // Cargar todos los detalles que no tengamos ya
    const anios = statsCache.map(r => r.anio);
    for (const anio of anios) {
      if (!detalleCache[anio]) await cargarDetalle(usuarioId, anio);
    }
 
    // Contar por autor
    const conteo = {};
    for (const d of Object.values(detalleCache)) {
      for (const l of (d.terminadas || [])) {
        const autores = (l.autores || '').split(/[,;&\/]/).map(a => a.trim()).filter(a => {
          if (!a) return false;
          // Descartar fragmentos que parezcan fechas (1898-1936), años solos (1936)
          // o números puros
          if (/^\d{4}(-\d{4})?$/.test(a)) return false;
          if (/^\d+$/.test(a)) return false;
          // Descartar fragmentos muy cortos (iniciales sueltas, puntos)
          if (a.length < 2) return false;
          return true;
        });
        for (const a of autores) {
          conteo[a] = (conteo[a] || 0) + 1;
        }
      }
    }
 
    const top = Object.entries(conteo).sort((a,b) => b[1]-a[1]).slice(0, 6);
    if (!top.length) { lista.innerHTML = '<p class="muted">Sin datos todavía.</p>'; return; }
 
    const max = top[0][1];
    lista.innerHTML = top.map(([autor, n]) => `
      <div class="stats-autor-row">
        <div class="stats-autor-nombre">${esc(autor)}</div>
        <div class="stats-autor-bar-wrap">
          <div class="stats-autor-bar" style="width:${Math.round(n/max*100)}%"></div>
        </div>
        <div class="stats-autor-n">${n}</div>
      </div>
    `).join('');
  }
 
  // ══ Cargar detalle de un año ══════════════════════════════════════════════════════════
  async function cargarDetalle(usuarioId, anio) {
    if (detalleCache[anio]) return detalleCache[anio];
    try {
      const res  = await apiFetch(`/api/usuarios/${usuarioId}/lecturas/estadisticas/${anio}`);
      const data = await res.json();
      detalleCache[anio] = data;
      return data;
    } catch { return { empezadas: [], terminadas: [] }; }
  }
 
  // ══ Detalle de títulos por año ══════════════════════════════════════════════════════════
  async function renderDetalle(usuarioId, anio) {
    const contenido = document.getElementById('stats-detalle-contenido');
    if (!contenido) return;
    contenido.innerHTML = '<p class="muted" style="padding:8px 0;">Cargando…</p>';
 
    const data = await cargarDetalle(usuarioId, anio);
    const { empezadas = [], terminadas = [] } = data;
 
    const listaHtml = (items, campo, etiqueta) => {
      if (!items.length) return `<p class="muted stats-detalle-empty">Sin ${etiqueta.toLowerCase()} este año.</p>`;
      return items.map(l => {
        const fecha = l[campo] ? new Date(l[campo]).toLocaleDateString('es-ES', { day:'numeric', month:'short' }) : '—';
        return `<div class="stats-detalle-item">
          <span class="stats-detalle-titulo">${esc(l.titulo || 'Sin título')}</span>
          <span class="stats-detalle-autor">${esc(l.autores || '')}</span>
          <span class="stats-detalle-fecha">${fecha}</span>
        </div>`;
      }).join('');
    };
 
    contenido.innerHTML = `
      <div class="stats-detalle-cols">
        <div class="stats-detalle-col">
          <div class="stats-detalle-label">Empezados (${empezadas.length})</div>
          ${listaHtml(empezadas, 'inicio', 'Empezados')}
        </div>
        <div class="stats-detalle-col">
          <div class="stats-detalle-label">Terminados (${terminadas.length})</div>
          ${listaHtml(terminadas, 'fin', 'Terminados')}
        </div>
      </div>
    `;
  }
 
  // ══ Rellenar selector de años ══════════════════════════════════════════════════════════
  function fillAnioSelect(stats) {
    const sel = document.getElementById('stats-anio-select');
    if (!sel) return;
    sel.innerHTML = stats.map(r => `<option value="${r.anio}">${r.anio}</option>`).join('');
  }
 
  // ══ Entrada principal: sobreescribe cargarEstadisticasLecturas ═
  const _orig = window.cargarEstadisticasLecturas;
 
  window.cargarEstadisticasLecturas = async function () {
    const info = document.getElementById('stats-lecturas-info');
    const panel = document.getElementById('stats-panel-inferior');
 
    if (!window.usuarioActual?.id || !window.token) {
      if (info) info.textContent = 'Inicia sesión para ver tus estadísticas.';
      return;
    }
 
    if (info) info.textContent = 'Cargando…';
 
    // Cargar Chart.js si no está
    // (si no carga —sin conexión, CDN caída— se muestran las cifras sin el gráfico)
    if (!window.Chart) {
      await new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
        s.onload = resolve;
        s.onerror = () => { s.remove(); console.warn('[stats] Chart.js no disponible'); resolve(); };
        document.head.appendChild(s);
      });
    }
 
    try {
      const res = await apiFetch(`/api/usuarios/${window.usuarioActual.id}/lecturas/estadisticas`);
      if (!res.ok) throw new Error();
      statsCache = await res.json();
 
      if (!Array.isArray(statsCache) || !statsCache.length) {
        if (info) info.textContent = 'Sin datos de lectura todavía.';
        return;
      }
 
      const total = statsCache.reduce((s,r) => s + Number(r.terminadas||0), 0);
      if (info) info.textContent = `${total} libro${total!==1?'s':''} terminado${total!==1?'s':''}`;
 
      renderMetricas(statsCache);
      renderChartAnos(statsCache);
      fillAnioSelect(statsCache);
 
      if (panel) panel.style.display = 'grid';
 
      // Renderizar detalle del año más reciente por defecto
      const anioDefault = statsCache[0]?.anio;
      if (anioDefault) await renderDetalle(window.usuarioActual.id, anioDefault);
 
      // Autores en background
      renderAutores(window.usuarioActual.id);
 
    } catch (e) {
      if (info) info.textContent = 'Error al cargar estadísticas.';
    }
  };
 
  // ══ Listener del selector de año ══════════════════════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('stats-anio-select')?.addEventListener('change', async e => {
      if (!window.usuarioActual?.id) return;
      await renderDetalle(window.usuarioActual.id, Number(e.target.value));
    });
  });
 
})();
