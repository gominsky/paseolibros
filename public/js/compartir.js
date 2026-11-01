// js/compartir.js — Bibliotecas compartidas entre usuarios
// (El servidor une todos los ficheros de js/ en /main.js según js/orden.json)

// ══════════════════════════════════════════════════════════
// BIBLIOTECAS COMPARTIDAS
// ══════════════════════════════════════════════════════════
(function () {
 
  // ══ Estado ══════════════════════════════════════════════════════════
  let bcCache = [];          // lista que otros comparten conmigo
  let bcVerCache = [];       // ejemplares de la biblioteca que estoy viendo
  let bcVerPropId = null;
 
  // ══ Helpers ══════════════════════════════════════════════════════════
  function abrirBC()  { document.getElementById('bc-overlay').style.display = 'flex'; document.documentElement.style.overflow = 'hidden'; }
  function cerrarBC() { document.getElementById('bc-overlay').style.display = 'none'; document.documentElement.style.overflow = ''; }
  function abrirBCVer()  { document.getElementById('bc-ver-overlay').style.display = 'flex'; document.documentElement.style.overflow = 'hidden'; }
  function cerrarBCVer() { document.getElementById('bc-ver-overlay').style.display = 'none'; document.documentElement.style.overflow = ''; }
 
  function bcFetch(path, opts = {}) {
    return fetch(`${window.API_BASE}${path}`, {
      ...opts,
      headers: { ...window.getHeaders(opts.body !== undefined), ...(opts.headers || {}) }
    });
  }
 
  function escHtml(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
 
  // ══ Pestañas del modal ══════════════════════════════════════════════════════════
  function initBCTabs() {
    document.querySelectorAll('.bc-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.bc-tab').forEach(t => t.classList.toggle('is-active', t === tab));
        document.querySelectorAll('.bc-panel').forEach(p => {
          p.classList.toggle('is-active', p.id === 'bc-panel-' + tab.dataset.bcTab);
        });
        if (tab.dataset.bcTab === 'conmigo') cargarConmigo();
        else cargarMisCompartidas();
      });
    });
  }
 
  // ══ Cargar bibliotecas que comparten conmigo ══════════════════════════════════════════════════════════
  async function cargarConmigo() {
    const info  = document.getElementById('bc-info-conmigo');
    const lista = document.getElementById('bc-lista-conmigo');
    if (!info || !lista) return;
 
    info.textContent = 'Cargando…';
    lista.innerHTML  = '';
 
    try {
      const res  = await bcFetch('/api/biblioteca-compartida/conmigo');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
 
      bcCache = data;
 
      if (!data.length) { info.textContent = 'Nadie ha compartido su biblioteca contigo aún.'; return; }
 
      info.textContent = `${data.length} biblioteca${data.length > 1 ? 's' : ''} compartida${data.length > 1 ? 's' : ''} contigo`;
      lista.innerHTML = data.map(b => `
        <div class="bc-item">
          <div class="bc-item-info">
            <span class="bc-item-nombre">${escHtml(b.propietario)}</span>
            <span class="bc-item-fecha">${new Date(b.creado_en).toLocaleDateString('es-ES')}</span>
          </div>
          <button class="btn btn-secondary btn-sm bc-btn-ver" data-propietario-id="${b.propietario_id}" data-nombre="${escHtml(b.propietario)}">
            Ver biblioteca
          </button>
        </div>
      `).join('');
    } catch (e) {
      info.textContent = 'Error cargando: ' + e.message;
    }
  }
 
  // ══ Cargar a quién he compartido yo ══════════════════════════════════════════════════════════
  async function cargarMisCompartidas() {
    const info  = document.getElementById('bc-info-miscompartidas');
    const lista = document.getElementById('bc-lista-miscompartidas');
    if (!info || !lista) return;
 
    info.textContent = 'Cargando…';
    lista.innerHTML  = '';
 
    try {
      const res  = await bcFetch('/api/biblioteca-compartida/compartidas');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
 
      if (!data.length) { info.textContent = 'No has compartido tu biblioteca con nadie.'; return; }
 
      info.textContent = `Compartida con ${data.length} usuario${data.length > 1 ? 's' : ''}`;
      lista.innerHTML = data.map(b => `
        <div class="bc-item">
          <div class="bc-item-info">
            <span class="bc-item-nombre">${escHtml(b.invitado)}</span>
            <span class="bc-item-fecha">${new Date(b.creado_en).toLocaleDateString('es-ES')}</span>
          </div>
          <button class="btn btn-ghost btn-sm bc-btn-revocar" data-bc-id="${b.id}" data-nombre="${escHtml(b.invitado)}">
            Revocar
          </button>
        </div>
      `).join('');
    } catch (e) {
      info.textContent = 'Error cargando: ' + e.message;
    }
  }
 
  // ══ Compartir con un usuario ══════════════════════════════════════════════════════════
  async function compartirCon() {
    const input = document.getElementById('bc-input-usuario');
    const msg   = document.getElementById('bc-msg-compartir');
    const nombre = (input?.value || '').trim();
    if (!nombre) return;
 
    msg.textContent = 'Enviando…';
    try {
      const res  = await bcFetch('/api/biblioteca-compartida', {
        method: 'POST',
        body: JSON.stringify({ nombre_usuario: nombre })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
 
      msg.textContent = '✅ ' + data.mensaje;
      input.value = '';
      await cargarMisCompartidas();
      setTimeout(() => { msg.textContent = ''; }, 3000);
    } catch (e) {
      msg.textContent = '⚠️ ' + e.message;
    }
  }
 
  // ══ Revocar acceso ══════════════════════════════════════════════════════════
  async function revocarAcceso(bcId, nombre) {
    if (!confirm(`¿Revocar el acceso de ${nombre} a tu biblioteca?`)) return;
    try {
      const res = await bcFetch(`/api/biblioteca-compartida/${bcId}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      await cargarMisCompartidas();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }
 
  // ══ Ver biblioteca de otro usuario ══════════════════════════════════════════════════════════
  async function verBiblioteca(propietarioId, nombre) {
    bcVerPropId = propietarioId;
    document.getElementById('bc-ver-titulo').textContent = `Biblioteca de ${nombre}`;
    document.getElementById('bc-ver-info').textContent   = 'Cargando…';
    document.getElementById('bc-ver-lista').innerHTML    = '';
    document.getElementById('bc-ver-q').value            = '';
    abrirBCVer();
 
    try {
      const res  = await bcFetch(`/api/biblioteca-compartida/ver/${propietarioId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
 
      bcVerCache = data.ejemplares || [];
      renderBCVer(bcVerCache);
    } catch (e) {
      document.getElementById('bc-ver-info').textContent = 'Error: ' + e.message;
    }
  }
 
  function renderBCVer(lista) {
    const info  = document.getElementById('bc-ver-info');
    const lista_el = document.getElementById('bc-ver-lista');
    const q = (document.getElementById('bc-ver-q')?.value || '').toLowerCase().trim();
 
    const filtrados = !q ? lista : lista.filter(e => {
      return [e.titulo, e.autores, e.isbn, e.ubicacion, e.editorial]
        .filter(Boolean).join(' ').toLowerCase().includes(q);
    });
 
    info.textContent = `${filtrados.length} ejemplar${filtrados.length !== 1 ? 'es' : ''}`;
 
    if (!filtrados.length) {
      lista_el.innerHTML = '<p class="muted" style="padding:12px;">Sin resultados.</p>';
      return;
    }
 
    lista_el.innerHTML = filtrados.map(e => {
      const portada = e.url_portada
        ? `<img class="bc-ver-cover" src="${window.API_BASE}${e.url_portada}" alt="Portada" />`
        : `<div class="bc-ver-cover bc-ver-cover--ph">Pdl</div>`;
      return `
        <div class="bc-ver-item">
          ${portada}
          <div class="bc-ver-info-item">
            <div class="bc-ver-titulo">${escHtml(e.titulo || '—')}</div>
            <div class="bc-ver-autor">${escHtml(e.autores || '—')}</div>
            <div class="bc-ver-meta">
              ${e.isbn ? `<span class="deseo-pill">ISBN: ${escHtml(e.isbn)}</span>` : ''}
              ${e.estado ? `<span class="deseo-pill">${escHtml(e.estado)}</span>` : ''}
              ${e.ubicacion ? `<span class="deseo-pill">${escHtml(e.ubicacion)}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
 
  // ══ Wiring ══════════════════════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', () => {
    initBCTabs();
 
    // Abrir modal
    document.getElementById('btn-open-biblioteca-compartida')?.addEventListener('click', () => {
      abrirBC();
      cargarConmigo();
    });
 
    // Cerrar modales
    document.getElementById('bc-cerrar')?.addEventListener('click', cerrarBC);
    document.getElementById('bc-ver-cerrar')?.addEventListener('click', cerrarBCVer);
    document.getElementById('bc-overlay')?.addEventListener('click', e => { if (e.target.id === 'bc-overlay') cerrarBC(); });
    document.getElementById('bc-ver-overlay')?.addEventListener('click', e => { if (e.target.id === 'bc-ver-overlay') cerrarBCVer(); });
 
    // Compartir
    document.getElementById('bc-btn-compartir')?.addEventListener('click', compartirCon);
    document.getElementById('bc-input-usuario')?.addEventListener('keydown', e => { if (e.key === 'Enter') compartirCon(); });
 
    // Delegación: ver biblioteca / revocar
    document.getElementById('bc-lista-conmigo')?.addEventListener('click', e => {
      const btn = e.target.closest('.bc-btn-ver');
      if (!btn) return;
      verBiblioteca(Number(btn.dataset.propietarioId), btn.dataset.nombre);
    });
 
    document.getElementById('bc-lista-miscompartidas')?.addEventListener('click', e => {
      const btn = e.target.closest('.bc-btn-revocar');
      if (!btn) return;
      revocarAcceso(btn.dataset.bcId, btn.dataset.nombre);
    });
 
    // Buscador en la vista de biblioteca ajena
    let bcVerTimer = null;
    document.getElementById('bc-ver-q')?.addEventListener('input', () => {
      clearTimeout(bcVerTimer);
      bcVerTimer = setTimeout(() => renderBCVer(bcVerCache), 180);
    });
 
    // ESC para cerrar
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      cerrarBCVer();
      cerrarBC();
    });
  });
 
})();
