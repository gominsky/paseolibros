// js/libros-recibidos.js — Libros que me han prestado
// (El servidor une todos los ficheros de js/ en /main.js según js/orden.json)

// ══════════════════════════════════════════════════════════
// LIBROS RECIBIDOS EN PRÉSTAMO
// ══════════════════════════════════════════════════════════
(function () {
 
  var tabActual = 'pendientes';
  var datos = [];
 
  function apiFetch(path, opts) {
    opts = opts || {};
    var tok = window.token || token;
    return fetch(window.API_BASE + path, {
      method: opts.method || 'GET',
      headers: Object.assign(
        opts.body ? { 'Content-Type': 'application/json' } : {},
        tok ? { 'Authorization': 'Bearer ' + tok, 'X-Access-Token': tok, 'Authorization-Token': tok } : {}
      ),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
  }
 
  function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
 
  function abrir() {
    document.getElementById('lr-overlay').style.display = 'flex';
    document.documentElement.style.overflow = 'hidden';
    cargar();
  }
  function cerrar() {
    document.getElementById('lr-overlay').style.display = 'none';
    document.documentElement.style.overflow = '';
  }
 
  async function cargar() {
    var info = document.getElementById('lr-info');
    if (info) info.textContent = 'Cargando…';
    try {
      var res = await apiFetch('/api/libros-recibidos');
      datos = await res.json();
      if (!res.ok) throw new Error(datos.error);
      renderLista();
    } catch (e) {
      if (info) info.textContent = 'Error: ' + e.message;
    }
  }
 
  function renderLista() {
    var info  = document.getElementById('lr-info');
    var lista = document.getElementById('lr-lista');
    if (!lista) return;
 
    var filtrados = datos.filter(function(d) {
      return tabActual === 'pendientes' ? !d.devuelto : d.devuelto;
    });
 
    if (!filtrados.length) {
      info.textContent = tabActual === 'pendientes'
        ? 'No tienes libros pendientes de devolver.'
        : 'No has devuelto ningún libro aún.';
      lista.innerHTML = '';
      return;
    }
 
    info.textContent = filtrados.length + ' libro' + (filtrados.length !== 1 ? 's' : '');
    lista.innerHTML = filtrados.map(function(d) {
      var vencido = !d.devuelto && d.fecha_devolver && new Date(d.fecha_devolver) < new Date();
      var fechaDev = d.fecha_devolver
        ? new Date(d.fecha_devolver).toLocaleDateString('es-ES', {day:'numeric', month:'short', year:'numeric'})
        : '—';
      var fechaDevuelto = d.fecha_devuelto
        ? new Date(d.fecha_devuelto).toLocaleDateString('es-ES', {day:'numeric', month:'short', year:'numeric'})
        : '';
 
      return '<div class="lr-item' + (vencido ? ' lr-item--vencido' : '') + '" data-id="' + d.id + '">' +
        '<div class="lr-item-info">' +
          '<div class="lr-item-titulo">' + esc(d.titulo) + '</div>' +
          (d.autores ? '<div class="lr-item-autor">' + esc(d.autores) + '</div>' : '') +
          '<div class="lr-item-meta">' +
            '<span class="deseo-pill">De: ' + esc(d.prestador) + '</span>' +
            (d.fecha_devolver ? '<span class="deseo-pill' + (vencido ? ' deseo-pill--warn' : '') + '">Devolver: ' + fechaDev + '</span>' : '') +
            (d.devuelto ? '<span class="deseo-pill deseo-pill--ok">Devuelto ' + fechaDevuelto + '</span>' : '') +
          '</div>' +
          (d.notas ? '<div class="lr-item-notas">' + esc(d.notas) + '</div>' : '') +
        '</div>' +
        '<div class="lr-item-actions">' +
          (!d.devuelto ? '<button class="btn btn-secondary btn-sm lr-btn-devolver" type="button">✓ Devuelto</button>' : '') +
          '<button class="btn btn-ghost btn-sm lr-btn-eliminar" type="button">✕</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }
 
  async function guardar() {
    var titulo    = (document.getElementById('lr-titulo')?.value || '').trim();
    var autores   = (document.getElementById('lr-autores')?.value || '').trim();
    var prestador = (document.getElementById('lr-prestador')?.value || '').trim();
    var fechaDev  = document.getElementById('lr-fecha-devolver')?.value || '';
    var notas     = (document.getElementById('lr-notas')?.value || '').trim();
    var msg       = document.getElementById('lr-msg');
 
    if (!titulo) { if (msg) msg.textContent = 'El título es obligatorio.'; return; }
    if (!prestador) { if (msg) msg.textContent = 'Indica quién te lo prestó.'; return; }
 
    var btn = document.getElementById('lr-btn-guardar');
    if (btn) btn.disabled = true;
    if (msg) msg.textContent = 'Guardando…';
 
    try {
      var res = await apiFetch('/api/libros-recibidos', {
        method: 'POST',
        body: { titulo: titulo, autores: autores, prestador: prestador,
                fecha_devolver: fechaDev || null, notas: notas }
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error);
 
      // Limpiar formulario
      ['lr-titulo','lr-autores','lr-prestador','lr-fecha-devolver','lr-notas']
        .forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
      if (msg) msg.textContent = '✅ Registrado';
      setTimeout(function() { if (msg) msg.textContent = ''; }, 2000);
 
      tabActual = 'pendientes';
      document.querySelectorAll('.lr-tab').forEach(function(t) {
        t.classList.toggle('is-active', t.dataset.lrTab === 'pendientes');
      });
      await cargar();
    } catch (e) {
      if (msg) msg.textContent = '❌ ' + e.message;
    } finally {
      if (btn) btn.disabled = false;
    }
  }
 
  async function marcarDevuelto(id) {
    try {
      var res = await apiFetch('/api/libros-recibidos/' + id + '/devolver', { method: 'POST' });
      if (!res.ok) { var d = await res.json(); throw new Error(d.error); }
      await cargar();
    } catch (e) { alert('Error: ' + e.message); }
  }
 
  async function eliminar(id) {
    if (!confirm('¿Eliminar este registro?')) return;
    try {
      var res = await apiFetch('/api/libros-recibidos/' + id, { method: 'DELETE' });
      if (!res.ok) { var d = await res.json(); throw new Error(d.error); }
      await cargar();
    } catch (e) { alert('Error: ' + e.message); }
  }
 
  document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('btn-open-libros-recibidos')?.addEventListener('click', abrir);
    document.getElementById('lr-cerrar')?.addEventListener('click', cerrar);
    document.getElementById('lr-overlay')?.addEventListener('click', function(e) {
      if (e.target.id === 'lr-overlay') cerrar();
    });
    document.getElementById('lr-btn-guardar')?.addEventListener('click', guardar);
 
    document.querySelectorAll('.lr-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        tabActual = tab.dataset.lrTab;
        document.querySelectorAll('.lr-tab').forEach(function(t) {
          t.classList.toggle('is-active', t === tab);
        });
        renderLista();
      });
    });
 
    document.getElementById('lr-lista')?.addEventListener('click', function(e) {
      var item = e.target.closest('.lr-item');
      if (!item) return;
      var id = item.dataset.id;
      if (e.target.closest('.lr-btn-devolver')) marcarDevuelto(id);
      else if (e.target.closest('.lr-btn-eliminar')) eliminar(id);
    });
 
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && document.getElementById('lr-overlay')?.style.display !== 'none') cerrar();
    });
  });
 
})();
