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
        else { cargarMisCompartidas(); cargarUsuariosVisibles(); }
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
 
  // ══ Lista de usuarios que quieren aparecer + mi visibilidad ══════════════════
  let usuariosVisibles = [];
 
  async function cargarUsuariosVisibles() {
    const lista = document.getElementById('bc-lista-usuarios');
    if (lista) lista.innerHTML = '<p class="muted bc-info">Cargando…</p>';
    try {
      const res = await bcFetch('/api/biblioteca-compartida/usuarios');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      usuariosVisibles = data.usuarios || [];
      const chk = document.getElementById('bc-visible');
      if (chk) chk.checked = Boolean(data.visible);
      renderUsuariosVisibles();
    } catch (e) {
      if (lista) lista.innerHTML = `<p class="muted bc-info">Error: ${escHtml(e.message)}</p>`;
    }
  }
 
  function renderUsuariosVisibles() {
    const lista = document.getElementById('bc-lista-usuarios');
    if (!lista) return;
    const q = (document.getElementById('bc-filtro-usuarios')?.value || '').toLowerCase().trim();
    const filtrados = usuariosVisibles.filter(u => !q || u.nombre_usuario.toLowerCase().includes(q));
    if (!usuariosVisibles.length) {
      lista.innerHTML = '<p class="muted bc-info">Todavía nadie ha elegido aparecer en la lista.</p>';
      return;
    }
    if (!filtrados.length) {
      lista.innerHTML = '<p class="muted bc-info">Ningún usuario coincide.</p>';
      return;
    }
    lista.innerHTML = filtrados.map(u => `
      <div class="bc-item bc-item-usuario">
        <span class="bc-avatar" aria-hidden="true">${escHtml(u.nombre_usuario.charAt(0).toUpperCase())}</span>
        <div class="bc-item-info"><span class="bc-item-nombre">${escHtml(u.nombre_usuario)}</span></div>
        ${u.ya_compartido
          ? '<span class="deseo-pill deseo-pill--ok">Compartida ✓</span>'
          : `<button class="btn btn-primary btn-sm bc-btn-compartir-con" type="button" data-usuario-id="${u.id}" data-nombre="${escHtml(u.nombre_usuario)}">Compartir</button>`}
      </div>`).join('');
  }
 
  async function guardarVisibilidad(visible) {
    const msg = document.getElementById('bc-info-conmigo');
    try {
      const res = await bcFetch('/api/biblioteca-compartida/visibilidad', {
        method: 'PUT',
        body: JSON.stringify({ visible })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      if (typeof setUserStatusOk === 'function') {
        setUserStatusOk(visible ? 'Ahora apareces en la lista de usuarios.' : 'Ya no apareces en la lista de usuarios.');
      }
    } catch (e) {
      const chk = document.getElementById('bc-visible');
      if (chk) chk.checked = !visible;
      if (msg) msg.textContent = e.message;
    }
  }
 
  // ══ Compartir con un usuario (de la lista o escribiendo su nombre) ═══════════
  async function compartirCon(destino) {
    const input = document.getElementById('bc-input-usuario');
    const msg   = document.getElementById('bc-msg-compartir');
    const desdeLista = destino && destino.usuario_id;
    const nombre = desdeLista ? destino.nombre : (input?.value || '').trim();
    if (!nombre) return;
    if (desdeLista && !confirm(`¿Compartir tu biblioteca con ${nombre}? Podrá verla (solo lectura).`)) return;
 
    msg.textContent = 'Enviando…';
    try {
      const res  = await bcFetch('/api/biblioteca-compartida', {
        method: 'POST',
        body: JSON.stringify(desdeLista ? { usuario_id: destino.usuario_id } : { nombre_usuario: nombre })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
 
      msg.textContent = '✓ ' + data.mensaje;
      if (!desdeLista && input) input.value = '';
      await Promise.all([cargarMisCompartidas(), cargarUsuariosVisibles()]);
      setTimeout(() => { msg.textContent = ''; }, 3000);
    } catch (e) {
      msg.textContent = e.message;
    }
  }
 
  // ══ Revocar acceso ══════════════════════════════════════════════════════════
  async function revocarAcceso(bcId, nombre) {
    if (!confirm(`¿Revocar el acceso de ${nombre} a tu biblioteca?`)) return;
    try {
      const res = await bcFetch(`/api/biblioteca-compartida/${bcId}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      await Promise.all([cargarMisCompartidas(), cargarUsuariosVisibles()]);
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
      const portada = imgPortada(e.url_portada, e.titulo, e.autores, 'bc-ver-cover', 'mini');
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
      cargarUsuariosVisibles(); // también trae mi preferencia de visibilidad
    });
 
    // Aparecer / no aparecer en la lista
    document.getElementById('bc-visible')?.addEventListener('change', e => guardarVisibilidad(e.target.checked));
 
    // Lista de usuarios: filtrar y compartir
    document.getElementById('bc-filtro-usuarios')?.addEventListener('input', renderUsuariosVisibles);
    document.getElementById('bc-lista-usuarios')?.addEventListener('click', e => {
      const btn = e.target.closest('.bc-btn-compartir-con');
      if (!btn) return;
      compartirCon({ usuario_id: Number(btn.dataset.usuarioId), nombre: btn.dataset.nombre });
    });
 
    // Cerrar modales
    document.getElementById('bc-cerrar')?.addEventListener('click', cerrarBC);
    document.getElementById('bc-ver-cerrar')?.addEventListener('click', cerrarBCVer);
    document.getElementById('bc-overlay')?.addEventListener('click', e => { if (e.target.id === 'bc-overlay') cerrarBC(); });
    document.getElementById('bc-ver-overlay')?.addEventListener('click', e => { if (e.target.id === 'bc-ver-overlay') cerrarBCVer(); });
 
    // Compartir
    document.getElementById('bc-btn-compartir')?.addEventListener('click', () => compartirCon());
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
