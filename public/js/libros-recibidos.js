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
      // Leído: pastilla con la fecha (editable) y cuenta en las estadísticas
      var fechaLeidoISO = d.fecha_leido ? String(d.fecha_leido).slice(0, 10) : '';
      var leidoHtml = d.leyendo
        ? '<span class="deseo-pill deseo-pill--leido">' + icono('libro-abierto') + ' Leyendo' + (d.pagina_actual ? ' · pág. ' + d.pagina_actual : '') + '</span>'
        : d.leido
        ? '<label class="deseo-pill deseo-pill--leido" title="Cambiar la fecha en que lo terminaste">' + icono('check') + ' Leído ' +
            '<input type="date" class="lr-fecha-leido" value="' + fechaLeidoISO + '" max="' + new Date().toISOString().slice(0, 10) + '" aria-label="Fecha en que lo terminaste">' +
          '</label>'
        : '';
 
      return '<div class="lr-item' + (vencido ? ' lr-item--vencido' : '') + '" data-id="' + d.id + '">' +
        '<div class="lr-item-info">' +
          '<div class="lr-item-titulo">' + esc(d.titulo) + '</div>' +
          (d.autores ? '<div class="lr-item-autor">' + esc(d.autores) + '</div>' : '') +
          '<div class="lr-item-meta">' +
            '<span class="deseo-pill">De: ' + esc(d.prestador) + '</span>' +
            (d.fecha_devolver ? '<span class="deseo-pill' + (vencido ? ' deseo-pill--warn' : '') + '">Devolver: ' + fechaDev + '</span>' : '') +
            (d.devuelto ? '<span class="deseo-pill deseo-pill--ok">Devuelto ' + fechaDevuelto + '</span>' : '') +
            leidoHtml +
          '</div>' +
          (d.notas ? '<div class="lr-item-notas">' + esc(d.notas) + '</div>' : '') +
        '</div>' +
        '<div class="lr-item-actions">' +
          (d.leido
            ? '<button class="btn btn-ghost btn-sm lr-btn-leido" data-leido="0" type="button" title="Quitar de las estadísticas">No leído</button>'
            : (d.leyendo
                ? '<button class="btn btn-secondary btn-sm lr-btn-leido" data-leido="1" type="button" title="Lo he terminado: cuenta en tus estadísticas">' + icono('check') + ' Terminado</button>' +
                  '<button class="btn btn-ghost btn-sm lr-btn-lectura" data-accion="dejar" type="button" title="Sacarlo de Leyendo sin terminarlo">Dejar</button>'
                : '<button class="btn btn-secondary btn-sm lr-btn-lectura" data-accion="empezar" type="button" title="Aparecerá en Leyendo, con marcapáginas">' + icono('libro-abierto') + ' Empezar a leer</button>' +
                  '<button class="btn btn-ghost btn-sm lr-btn-leido" data-leido="1" type="button" title="Ya lo leí: cuenta en tus estadísticas">' + icono('check') + ' Ya leído</button>')) +
          (!d.devuelto ? '<button class="btn btn-secondary btn-sm lr-btn-devolver" type="button">' + icono('check') + ' Devuelto</button>' : '') +
          '<button class="btn btn-ghost btn-sm lr-btn-eliminar" type="button" aria-label="Eliminar">' + icono('cerrar') + '</button>' +
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
      if (msg) msg.textContent = '✓ Registrado';
      setTimeout(function() { if (msg) msg.textContent = ''; }, 2000);
 
      tabActual = 'pendientes';
      document.querySelectorAll('.lr-tab').forEach(function(t) {
        t.classList.toggle('is-active', t.dataset.lrTab === 'pendientes');
      });
      await cargar();
    } catch (e) {
      if (msg) msg.textContent = e.message;
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
 
  // Empezar a leer / dejar (aparece o desaparece de «Leyendo»)
  async function cambiarLectura(id, accion) {
    try {
      var res = await apiFetch('/api/libros-recibidos/' + id + '/lectura', { method: 'POST', body: { accion: accion } });
      var d = await res.json();
      if (!res.ok) throw new Error(d.error);
      await cargar();
      if (window.cargarLecturasAbiertas) window.cargarLecturasAbiertas();
      if (window.refrescarEstadisticas) window.refrescarEstadisticas();
      if (accion === 'empezar' && window.setUserStatusOk) window.setUserStatusOk('Lo tienes en Leyendo: tócalo allí para apuntar la página.');
    } catch (e) { alert('Error: ' + e.message); }
  }
 
  // Marcar / desmarcar como leído (y refrescar las estadísticas de lectura)
  async function marcarLeido(id, leido, fecha) {
    try {
      var res = await apiFetch('/api/libros-recibidos/' + id + '/leido', {
        method: 'POST',
        body: { leido: leido, fecha_leido: fecha || null }
      });
      var d = await res.json();
      if (!res.ok) throw new Error(d.error);
      await cargar();
      if (window.refrescarEstadisticas) window.refrescarEstadisticas();
      if (window.cargarLecturasAbiertas) window.cargarLecturasAbiertas();
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
      var btnLeido = e.target.closest('.lr-btn-leido');
      var btnLect = e.target.closest('.lr-btn-lectura');
      if (btnLect) cambiarLectura(id, btnLect.dataset.accion);
      else if (btnLeido) marcarLeido(id, btnLeido.dataset.leido === '1');
      else if (e.target.closest('.lr-btn-devolver')) marcarDevuelto(id);
      else if (e.target.closest('.lr-btn-eliminar')) eliminar(id);
    });
 
    // Cambiar la fecha de lectura desde la pastilla «Leído»
    document.getElementById('lr-lista')?.addEventListener('change', function(e) {
      var input = e.target.closest('.lr-fecha-leido');
      if (!input || !input.value) return;
      marcarLeido(input.closest('.lr-item').dataset.id, true, input.value);
    });
 
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && document.getElementById('lr-overlay')?.style.display !== 'none') cerrar();
    });
  });
 
})();
