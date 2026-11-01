// js/lecturas.js — Lecturas: empezar/terminar, marcapáginas, estadísticas y resumen de la portada
// (El servidor une todos los ficheros de js/ en /main.js según js/orden.json)

// ---------- Lecturas (modal) ----------
async function empezarLectura(libroId, ejemplarId) {
  setUserStatus('');
 
  if (!token || !usuarioActual) {
    setUserStatusErr('Debes iniciar sesión para registrar lecturas.');
    return;
  }
 
  try {
    const res = await fetch(`${API_BASE}/api/lecturas`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        usuario_id: usuarioActual.id,
        libro_id: Number(libroId),
        ejemplar_id: Number(ejemplarId),
        estado: 'leyendo',
        pagina_actual: null,
        notas: null,
      }),
    });
 
    const data = await res.json();
 
    if (!res.ok) {
      setUserStatusErr(data.error || 'Error al empezar la lectura.');
      return;
    }
    // Buscar título desde cache
const libro = (ejemplaresCache || [])
  .find(e => Number(e.libro_id) === Number(libroId));
 
flashOk(
  `Lectura iniciada${libro?.titulo ? ': ' + libro.titulo : ''}`
);
    setUserStatusOk('Lectura iniciada.');
    await cargarLecturas(libroId);
    await refrescarHome();
  } catch (err) {
    console.error(err);
    setUserStatusErr('Error de red al empezar la lectura.');
  }
}
 
async function cargarLecturas(libroId) {
  const info = document.getElementById('info-lecturas');
  const pre = document.getElementById('lecturas-detalle');
 
  if (info) info.textContent = 'Cargando lecturas...';
  if (pre) pre.textContent = '';
 
  try {
    const res = await fetch(`${API_BASE}/api/libros/${libroId}/lecturas`, {
      headers: getHeaders(false),
    });
    const lecturas = await res.json();
 
    if (!res.ok) {
      if (info) info.textContent = lecturas.error || 'Error al cargar lecturas.';
      return;
    }
 
    if (!Array.isArray(lecturas) || lecturas.length === 0) {
      if (info) info.textContent = 'Este libro no tiene lecturas registradas.';
      return;
    }
 
    if (info) info.textContent = `Lecturas: ${lecturas.length}`;
 
    // Formato "fila" dentro del <pre> (compacto + resalta activas)
    const lineas = lecturas.map((l) => {
      const esActiva = l.estado !== 'terminado';
      const mia = esActiva && usuarioActual && l.usuario_id === usuarioActual.id;
 
      const inicio = l.inicio ? new Date(l.inicio).toLocaleDateString('es-ES') : '—';
      const fin = l.fin ? new Date(l.fin).toLocaleDateString('es-ES') : '—';
      const pag = (l.pagina_actual ?? '—');
 
      const badge = mia ? '📖' : (esActiva ? '📚' : '↩');
      const user = l.nombre_usuario || `Usuario ${l.usuario_id}`;
      return `${badge} ${user} · ${l.estado || '—'} · pág ${pag} · ${inicio} → ${fin}`;
    });
 
    if (pre) pre.textContent = lineas.join('\n');
  } catch (err) {
    console.error(err);
    if (info) info.textContent = 'Error al cargar lecturas.';
  }
}
async function actualizarPaginaLectura(lecturaId, pagina_actual) {
  if (!token) throw new Error('Sin sesión');
 
  const res = await fetch(`${API_BASE}/api/lecturas/${lecturaId}/pagina`, {
    method: 'PATCH',
    headers: getHeaders(true),
    body: JSON.stringify({ pagina_actual }),
  });
 
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Error guardando página (HTTP ${res.status})`);
  }
 
  setUserStatusOk('Página guardada');
  return data;
}
 
async function terminarLecturaActual() {
  if (!token || !usuarioActual) {
    setUserStatusErr('Debes iniciar sesión para terminar una lectura.');
    return;
  }
  if (!libroSeleccionadoId) {
    setUserStatusErr('Selecciona un ejemplar/libro primero.');
    return;
  }
 
  try {
    const res = await fetch(`${API_BASE}/api/libros/${libroSeleccionadoId}/lecturas`, {
      headers: getHeaders(false),
    });
    const lecturas = await res.json();
 
    if (!res.ok) {
      setUserStatusErr(lecturas.error || 'Error cargando lecturas.');
      return;
    }
 
    const lecturaActiva = Array.isArray(lecturas)
      ? lecturas.find((l) => l.usuario_id === usuarioActual.id && l.estado !== 'terminado')
      : null;
 
    if (!lecturaActiva) {
      setUserStatusErr('No tienes ninguna lectura activa para este libro.');
      return;
    }
 
    const paginaStr = prompt('Áltima página leída (opcional):');
    const valoracionStr = prompt('Valoración (1-5, opcional):');
    const notas = prompt('Notas sobre la lectura (opcional):') || null;
 
    let pagina_actual = paginaStr ? Number(paginaStr) : null;
    if (Number.isNaN(pagina_actual)) pagina_actual = null;
 
    let valoracion = valoracionStr ? Number(valoracionStr) : null;
    if (Number.isNaN(valoracion)) valoracion = null;
 
    const resFin = await fetch(`${API_BASE}/api/lecturas/${lecturaActiva.id}/finalizar`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ pagina_actual, valoracion, notas }),
    });
 
    const dataFin = await resFin.json();
    if (!resFin.ok) {
      setUserStatusErr(dataFin.error || 'Error al finalizar lectura.');
      return;
    }
 
    setUserStatusOk('Lectura terminada.');
    await cargarLecturas(libroSeleccionadoId);
    await refrescarHome();
  } catch (err) {
    console.error(err);
    setUserStatusErr('Error de red al terminar la lectura.');
  }
}
async function cargarEstadisticasLecturas() {
  const info = document.getElementById('stats-lecturas-info');
  const tbody = document.getElementById('tabla-stats-lecturas');
  const mobileList = document.getElementById('stats-lecturas-mobile');
  if (!info || !tbody) return;
 
  if (!usuarioActual || !usuarioActual.id || !token) {
    info.textContent = 'Inicia sesión para ver tus estadísticas.';
    tbody.innerHTML = '';
    if (mobileList) mobileList.innerHTML = '';
    return;
  }
 
  info.textContent = 'Cargando estadísticas...';
  tbody.innerHTML = '';
  if (mobileList) mobileList.innerHTML = '';
 
  try {
    const res = await fetch(
      `${API_BASE}/api/usuarios/${usuarioActual.id}/lecturas/estadisticas`,
      { headers: getHeaders(false) }
    );
 
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Error al obtener estadísticas.');
    }
 
    const stats = await res.json(); // [{ anio, empezadas, terminadas }, ...]
 
    if (!Array.isArray(stats) || stats.length === 0) {
      info.textContent = 'Sin datos de lectura todavía.';
      tbody.innerHTML = '';
      if (mobileList) mobileList.innerHTML = '';
      return;
    }
 
    info.textContent = `Histórico de lecturas (${stats.length} año${stats.length !== 1 ? 's' : ''})`;
    tbody.innerHTML = '';
    if (mobileList) mobileList.innerHTML = '';
 
    for (const row of stats) {
      const anio = row.anio;
      const empezadas = Number(row.empezadas ?? 0);
      const terminadas = Number(row.terminadas ?? 0);
 
      // ====== ESCRITORIO (tabla con botón +) ======
      const tr = document.createElement('tr');
      tr.classList.add('stats-row');
      tr.dataset.anio = anio;
 
      tr.innerHTML = `
        <td class="stats-year-cell">
          <button
            type="button"
            class="stats-toggle"
            data-anio="${anio}"
            aria-expanded="false"
          >
            +
          </button>
          <span class="stats-year-label">${anio}</span>
        </td>
        <td>${empezadas}</td>
        <td>${terminadas}</td>
      `;
 
      const detailTr = document.createElement('tr');
      detailTr.classList.add('stats-detail-row');
      detailTr.dataset.anio = anio;
      detailTr.style.display = 'none';
      detailTr.innerHTML = `
        <td colspan="3">
          <div class="stats-detail-content">
            <div class="stats-detail-col">
              <strong>Empezados</strong>
              <ul class="stats-list stats-list-empezadas"></ul>
            </div>
            <div class="stats-detail-col">
              <strong>Terminados</strong>
              <ul class="stats-list stats-list-terminadas"></ul>
            </div>
          </div>
        </td>
      `;
 
      tbody.appendChild(tr);
      tbody.appendChild(detailTr);
 
      // ====== MÓVIL (tarjetita con botón + y detalle) ======
      if (mobileList) {
        const item = document.createElement('article');
        item.className = 'stats-mobile-item';
        item.dataset.anio = anio;
 
        item.innerHTML = `
          <header class="stats-mobile-header">
            <span class="stats-mobile-year">${anio}</span>
            <div class="stats-mobile-counters">
              <span class="stats-pill">Emp: ${empezadas}</span>
              <span class="stats-pill">Fin: ${terminadas}</span>
              <button
                type="button"
                class="stats-mobile-toggle"
                data-anio="${anio}"
                aria-expanded="false"
              >
                +
              </button>
            </div>
          </header>
          <div class="stats-mobile-detail" data-anio="${anio}" hidden>
            <div class="stats-detail-content">
              <div class="stats-detail-col">
                <strong>Empezados</strong>
                <ul class="stats-list stats-mobile-list-empezadas"></ul>
              </div>
              <div class="stats-detail-col">
                <strong>Terminados</strong>
                <ul class="stats-list stats-mobile-list-terminadas"></ul>
              </div>
            </div>
          </div>
        `;
 
        mobileList.appendChild(item);
      }
    }
  } catch (err) {
    console.error(err);
    info.textContent = 'Error al cargar estadísticas.';
    tbody.innerHTML = '';
    if (mobileList) mobileList.innerHTML = '';
  }
}
async function manejarClickStatsMobileToggle(e) {
  const btn = e.target.closest('.stats-mobile-toggle');
  if (!btn) return;
 
  const anio = btn.dataset.anio;
  if (!anio || !usuarioActual || !usuarioActual.id) return;
 
  const detail = document.querySelector(`.stats-mobile-detail[data-anio="${anio}"]`);
  if (!detail) return;
 
  const estaAbierto = !detail.hasAttribute('hidden');
 
  if (estaAbierto) {
    detail.setAttribute('hidden', '');
    btn.textContent = '+';
    btn.setAttribute('aria-expanded', 'false');
    return;
  }
 
  // Abro
  detail.removeAttribute('hidden');
  btn.textContent = '−';
  btn.setAttribute('aria-expanded', 'true');
 
  // ¿Ya estaba cargado?
  if (detail.dataset.loaded) return;
 
  const ulEmpezadas = detail.querySelector('.stats-mobile-list-empezadas');
  const ulTerminadas = detail.querySelector('.stats-mobile-list-terminadas');
 
  if (ulEmpezadas) ulEmpezadas.innerHTML = '<li class="muted">Cargando…</li>';
  if (ulTerminadas) ulTerminadas.innerHTML = '';
 
  try {
    const res = await fetch(
      `${API_BASE}/api/usuarios/${usuarioActual.id}/lecturas/estadisticas/${anio}`,
      { headers: getHeaders(false) }
    );
 
    if (!res.ok) {
      throw new Error('Error al obtener detalle.');
    }
 
    const data = await res.json();
    const { empezadas = [], terminadas = [] } = data || {};
 
    if (ulEmpezadas) {
      if (!empezadas.length) {
        ulEmpezadas.innerHTML = '<li class="muted">Sin lecturas empezadas este año.</li>';
      } else {
        ulEmpezadas.innerHTML = empezadas.map(l => {
          const fecha = l.inicio ? new Date(l.inicio).toLocaleDateString('es-ES') : '—';
          const autor = l.autores ? ` · ${escapeHtml(l.autores)}` : '';
          return `<li>${escapeHtml(l.titulo || 'Sin título')}${autor} <span class="muted">(${fecha})</span></li>`;
        }).join('');
      }
    }
 
    if (ulTerminadas) {
      if (!terminadas.length) {
        ulTerminadas.innerHTML = '<li class="muted">Sin lecturas terminadas este año.</li>';
      } else {
        ulTerminadas.innerHTML = terminadas.map(l => {
          const fecha = l.fin ? new Date(l.fin).toLocaleDateString('es-ES') : '—';
          const autor = l.autores ? ` · ${escapeHtml(l.autores)}` : '';
          return `<li>${escapeHtml(l.titulo || 'Sin título')}${autor} <span class="muted">(${fecha})</span></li>`;
        }).join('');
      }
    }
 
    detail.dataset.loaded = '1';
  } catch (err) {
    console.error(err);
    if (ulEmpezadas) ulEmpezadas.innerHTML = '<li class="muted">Error al cargar.</li>';
    if (ulTerminadas) ulTerminadas.innerHTML = '';
  }
}
 
 
async function manejarClickStatsToggle(e) {
  const btn = e.target.closest('.stats-toggle');
  if (!btn) return;
 
  const anio = btn.dataset.anio;
  if (!anio || !usuarioActual || !usuarioActual.id) return;
 
  const tbody = document.getElementById('tabla-stats-lecturas');
  if (!tbody) return;
 
  const detailRow = tbody.querySelector(`.stats-detail-row[data-anio="${anio}"]`);
  if (!detailRow) return;
 
  const estaAbierto = detailRow.style.display !== 'none';
 
  if (estaAbierto) {
    detailRow.style.display = 'none';
    btn.textContent = '+';
    btn.setAttribute('aria-expanded', 'false');
    return;
  }
 
  // Primero despliego, luego relleno si hace falta
  detailRow.style.display = '';
  btn.textContent = '−';
  btn.setAttribute('aria-expanded', 'true');
 
  if (detailRow.dataset.loaded) return;
 
  const ulEmpezadas = detailRow.querySelector('.stats-list-empezadas');
  const ulTerminadas = detailRow.querySelector('.stats-list-terminadas');
 
  if (ulEmpezadas) ulEmpezadas.innerHTML = '<li class="muted">Cargando…</li>';
  if (ulTerminadas) ulTerminadas.innerHTML = '';
 
  try {
    const res = await fetch(
      `${API_BASE}/api/usuarios/${usuarioActual.id}/lecturas/estadisticas/${anio}`,
      { headers: getHeaders(false) }
    );
 
    if (!res.ok) {
      throw new Error('Error al obtener detalle.');
    }
 
    const data = await res.json();
    const { empezadas = [], terminadas = [] } = data || {};
 
    if (ulEmpezadas) {
      if (!empezadas.length) {
        ulEmpezadas.innerHTML = '<li class="muted">Sin lecturas empezadas este año.</li>';
      } else {
        ulEmpezadas.innerHTML = empezadas.map(l => {
          const fecha = l.inicio ? new Date(l.inicio).toLocaleDateString('es-ES') : '—';
          const autor = l.autores ? ` · ${escapeHtml(l.autores)}` : '';
          return `<li>${escapeHtml(l.titulo || 'Sin título')}${autor} <span class="muted">(${fecha})</span></li>`;
        }).join('');
      }
    }
 
    if (ulTerminadas) {
      if (!terminadas.length) {
        ulTerminadas.innerHTML = '<li class="muted">Sin lecturas terminadas este año.</li>';
      } else {
        ulTerminadas.innerHTML = terminadas.map(l => {
          const fecha = l.fin ? new Date(l.fin).toLocaleDateString('es-ES') : '—';
          const autor = l.autores ? ` · ${escapeHtml(l.autores)}` : '';
          return `<li>${escapeHtml(l.titulo || 'Sin título')}${autor} <span class="muted">(${fecha})</span></li>`;
        }).join('');
      }
    }
 
    detailRow.dataset.loaded = '1';
  } catch (err) {
    console.error(err);
    if (ulEmpezadas) ulEmpezadas.innerHTML = '<li class="muted">Error al cargar.</li>';
    if (ulTerminadas) ulTerminadas.innerHTML = '';
  }
}
 
// ---------- Resumen global lecturas / préstamos ----------
async function cargarLecturasAbiertas() {
  const info = document.getElementById('info-lecturas-abiertas');
  const tbody = document.querySelector('#tabla-lecturas-abiertas tbody');
  if (!info || !tbody) return;
 
  if (!usuarioActual) {
    info.textContent = 'Inicia sesión para ver tus lecturas en curso.';
    tbody.innerHTML = '';
    return;
  }
 
  info.textContent = 'Cargando lecturas en curso...';
  tbody.innerHTML = '';
 
  try {
    const res = await fetch(`${API_BASE}/api/usuarios/${usuarioActual.id}/lecturas-abiertas`, {
      headers: getHeaders(false),
    });
    const lecturas = await res.json();
 
    if (!Array.isArray(lecturas) || lecturas.length === 0) {
      info.textContent = 'No tienes lecturas en curso.';
      return;
    }
 
    info.textContent = `Lecturas en curso: ${lecturas.length}`;
    for (const l of lecturas) {
      const tr = document.createElement('tr');
      tr.classList.add('row-link');
      tr.dataset.libroId = l.libro_id;
      if (l.ejemplar_id) tr.dataset.ejemplarId = l.ejemplar_id;
      tr.dataset.lecturaId = l.id;                      //  ID de la lectura
      tr.dataset.paginaActual = (l.pagina_actual ?? ''); //  para prellenar modal
      const fecha = l.inicio ? new Date(l.inicio).toLocaleDateString('es-ES') : '—';
      tr.innerHTML = `
  <td>${l.titulo || 'Sin título'}</td>
  <td class="cell-pagina">${l.pagina_actual ?? '—'}</td>
  <td>${fecha}</td>
`;
      tbody.appendChild(tr);
    }
  } catch (err) {
    console.error(err);
    info.textContent = 'Error al cargar las lecturas en curso.';
  }
}
 
async function cargarPrestamosActivos() {
  const info = document.getElementById('info-prestamos-activos');
  const tbody = document.querySelector('#tabla-prestamos-activos tbody');
  if (!info || !tbody) return;
 
  if (!usuarioActual) {
    info.textContent = 'Inicia sesión para ver tus préstamos activos.';
    tbody.innerHTML = '';
    return;
  }
 
  info.textContent = 'Cargando préstamos activos...';
  tbody.innerHTML = '';
 
  try {
    const res = await fetch(`${API_BASE}/api/usuarios/${usuarioActual.id}/prestamos-activos`, {
      headers: getHeaders(false),
    });
    const prestamos = await res.json();
 
    if (!Array.isArray(prestamos) || prestamos.length === 0) {
      info.textContent = 'No tienes préstamos activos.';
      return;
    }
    info.textContent = `Préstamos: ${prestamos.length}`;
    for (const p of prestamos) {
      const tr = document.createElement('tr');
      tr.classList.add('row-link');
      tr.dataset.libroId = p.libro_id;
      if (p.ejemplar_id) tr.dataset.ejemplarId = p.ejemplar_id;
 
      const nombreReceptor = p.nombre_receptor_usuario || p.nombre_receptor || '—';
      const fechaLimite = p.fecha_limite ? new Date(p.fecha_limite).toLocaleDateString('es-ES') : '—';
 
      tr.innerHTML = `
        <td>${p.titulo || 'Sin título'}</td>
        <td>${nombreReceptor}</td>
        <td>${fechaLimite}</td>
      `;
      tbody.appendChild(tr);
    }
  } catch (err) {
    console.error(err);
    info.textContent = 'Error al cargar los préstamos activos.';
  }
}
function crearUIMarcapagina() {
  if (document.getElementById('mp-overlay')) return;
 
  const div = document.createElement('div');
  div.id = 'mp-overlay';
  div.className = 'mp-overlay';
  div.style.display = 'none';
 
  div.innerHTML = `
    <div class="mp-backdrop" data-close="1"></div>
    <div class="mp-dialog" role="dialog" aria-modal="true" aria-label="Marcapáginas">
      <div class="mp-header">
        <h3>Marcapáginas</h3>
        <button class="icon-btn" type="button" id="mp-close" title="Cerrar" aria-label="Cerrar">
          <span class="icon-circle">✕</span>
        </button>
      </div>
 
      <div class="mp-body">
        <label for="mp-num">Página actual</label>
 
        <div class="mp-row">
          <button class="btn btn-ghost mp-step" type="button" data-step="-5">-5</button>
          <button class="btn btn-ghost mp-step" type="button" data-step="-1">-1</button>
 
          <input id="mp-num" type="number" min="0" step="1" inputmode="numeric" />
 
          <button class="btn btn-ghost mp-step" type="button" data-step="1">+1</button>
          <button class="btn btn-ghost mp-step" type="button" data-step="5">+5</button>
        </div>
 
        <input id="mp-range" class="mp-range" type="range" min="0" max="600" step="1" />
 
        <p class="helper-text mp-help">Puedes escribir el número o ajustarlo con la rueda.</p>
      </div>
 
      <div class="mp-actions">
        <button class="btn btn-ghost" type="button" id="mp-skip">Omitir</button>
        <button class="btn btn-secondary" type="button" id="mp-save">Guardar</button>
      </div>
    </div>
  `;
 
  document.body.appendChild(div);
 
  // cerrar: X / backdrop / ESC
  div.addEventListener('click', (e) => {
    if (e.target?.dataset?.close === '1') cerrarUIMarcapagina('skip');
  });
  document.getElementById('mp-close')?.addEventListener('click', () => cerrarUIMarcapagina('skip'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarUIMarcapagina('skip'); });
  document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  if (!token || !usuarioActual?.id) return;
 
  // Re-pedir lista (si el backend ahora trae url_portada, aparecerán)
  try {
    await cargarEjemplares(usuarioActual.id);
  } catch {}
});
  // pasos +/- y sincronía input <-> range
  div.addEventListener('click', (e) => {
    const btn = e.target.closest('.mp-step');
    if (!btn) return;
    const step = Number(btn.dataset.step || 0);
 
    const num = document.getElementById('mp-num');
    const range = document.getElementById('mp-range');
    const v = Math.max(0, Number(num.value || 0) + step);
    num.value = String(v);
    range.value = String(v);
  });
 
  document.getElementById('mp-num')?.addEventListener('input', (e) => {
    const range = document.getElementById('mp-range');
    const v = Math.max(0, Number(e.target.value || 0));
  
    // ✅ si el usuario pone 1200, el slider se adapta
    if (v > Number(range.max)) range.max = String(Math.ceil(v / 50) * 50);
  
    range.value = String(v);
  });
  
 
  document.getElementById('mp-range')?.addEventListener('input', (e) => {
    const num = document.getElementById('mp-num');
    num.value = String(e.target.value || 0);
  });
}
 
let mpCtx = null;
 
function abrirUIMarcapagina(ctx) {
  crearUIMarcapagina();
  mpCtx = ctx;
 
  const overlay = document.getElementById('mp-overlay');
  const num = document.getElementById('mp-num');
  const range = document.getElementById('mp-range');
 
  const inicial = (ctx?.paginaInicial ?? 0);
  num.value = String(inicial);
  range.value = String(inicial);
 
  // bind botones (cada apertura)
  document.getElementById('mp-save').onclick = async () => {
    const v = num.value === '' ? null : Math.max(0, Number(num.value));
    cerrarUIMarcapagina('save', v);
  };
  document.getElementById('mp-skip').onclick = () => cerrarUIMarcapagina('skip');
 
  overlay.style.display = 'flex';
  document.documentElement.style.overflow = 'hidden';
  num.focus();
  num.select?.();
}
 
function cerrarUIMarcapagina(action, value) {
  const overlay = document.getElementById('mp-overlay');
  if (!overlay) return;
 
  overlay.style.display = 'none';
  document.documentElement.style.overflow = '';
 
  const ctx = mpCtx;
  mpCtx = null;
 
  if (!ctx) return;
 
  if (action === 'save' && typeof ctx.onSave === 'function') ctx.onSave(value);
  if (action !== 'save' && typeof ctx.onSkip === 'function') ctx.onSkip();
}
