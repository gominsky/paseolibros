// js/portadas.js — Buscar portada desde la ficha y portada por URL manual
// (Eliminada la búsqueda masiva «Buscar portadas faltantes»: las tapas generadas cubren los libros sin portada)
// (El servidor une todos los ficheros de js/ en /main.js según js/orden.json)

// ══════════════════════════════════════════════════════════
// BÚSQUEDA AUTOMÁTICA DE PORTADAS
// ══════════════════════════════════════════════════════════
(function () {
 
  // ══ Helpers ══════════════════════════════════════════════════════════
  function apiFetch(path, opts = {}) {
    return fetch(`${window.API_BASE}${path}`, {
      ...opts,
      headers: { ...window.getHeaders(opts.body !== undefined), ...(opts.headers || {}) }
    });
  }
 
  // ══ Desde la ficha del libro: botón "Buscar portada" ══
  async function buscarPortadaDesdeModal(e) {
    // Usa el botón realmente pulsado: el de escritorio está oculto por CSS
    // en todos los tamaños de pantalla, el visible siempre es el "-movil".
    // Antes se cogía siempre 'btn-buscar-portada' (el oculto), así que el
    // botón que el usuario veía nunca mostraba el cambio a "Buscando…".
    const btn = e?.currentTarget
      || document.getElementById('btn-buscar-portada-movil')
      || document.getElementById('btn-buscar-portada');
    if (!btn || !window.libroSeleccionadoId) return;
 
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Buscando…';
 
    try {
      const res  = await apiFetch(`/api/libros/${window.libroSeleccionadoId}/buscar-portada`, {
        method: 'POST', body: '{}'
      });
      const data = await res.json();
 
      if (!res.ok) throw new Error(data.error);
 
      if (data.ya_tenia) {
        btn.textContent = 'Ya tiene portada';
      } else {
        btn.textContent = '✓ Portada encontrada';
        // Actualizar la imagen en el modal
        const img = document.getElementById('ficha-portada-img');
        if (img && data.url_portada) {
          window.marcarPortadaCambiada(data.url_portada);
          img.src = window.srcPortada(data.url_portada);
          img.classList.remove('is-placeholder');
        }
        // Refrescar lista
        if (window.usuarioActual?.id && window.cargarEjemplares) {
          window.cargarEjemplares(window.usuarioActual.id);
        }
      }
    } catch (e) {
      btn.textContent = e.message;
    } finally {
      setTimeout(() => { btn.disabled = false; btn.textContent = original; }, 3000);
    }
  }
 
 
  // ══ Wiring ══════════════════════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-buscar-portada')?.addEventListener('click', buscarPortadaDesdeModal);
    document.getElementById('btn-buscar-portada-movil')?.addEventListener('click', buscarPortadaDesdeModal);
    // 'abrirPortadaUrl' vive en la otra IIFE de más abajo (PORTADA POR URL
    // MANUAL) y no es visible aquí directamente — referenciarla tal cual
    // lanzaba un ReferenceError en cuanto se disparaba DOMContentLoaded,
    // lo que además abortaba el resto de este bloque (el listener del
    // input de subida móvil, la delegación de "portadas-lista-sin" y el
    // Escape para cerrar el overlay de búsqueda masiva). Se expone en
    // window desde esa otra IIFE; aquí se llama de forma diferida.
    document.getElementById('btn-portada-manual-movil')?.addEventListener('click', () => window.abrirPortadaUrl?.());
 
    // Input de subir portada alternativo (móvil)
    document.getElementById('ficha-portada-file-movil')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Reusar el input original para disparar el mismo handler
      const dt = new DataTransfer();
      dt.items.add(file);
      const originalInput = document.getElementById('ficha-portada-file');
      if (originalInput) {
        originalInput.files = dt.files;
        originalInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
 
  });
 
})();
 
 
// ══════════════════════════════════════════════════════════
// PORTADA POR URL MANUAL
// ══════════════════════════════════════════════════════════
(function () {
 
  // Usa el apiFetch global de api.js que gestiona el token correctamente
  function apiFetch(path, opts = {}) {
    const isJson = opts.body !== undefined;
    return fetch(`${window.API_BASE}${path}`, {
      ...opts,
      headers: {
        ...(isJson ? { 'Content-Type': 'application/json' } : {}),
        ...(window.token ? {
          'Authorization':       `Bearer ${window.token}`,
          'X-Access-Token':      window.token,
          'Authorization-Token': window.token,
        } : {}),
        ...(opts.headers || {})
      }
    });
  }
 
  function abrirPortadaUrl() {
    const overlay = document.getElementById('portada-url-overlay');
    if (!overlay) return;
 
    // Construir queries de búsqueda con los datos del libro actual
    const titulo  = document.getElementById('ficha-titulo')?.textContent || '';
    const autores = document.getElementById('ficha-autores')?.textContent || '';
    const isbn    = document.getElementById('ficha-isbn')?.textContent || '';
 
    const q = encodeURIComponent([titulo, autores, 'portada libro'].filter(Boolean).join(' '));
    const qIsbn = isbn && isbn !== '—' ? encodeURIComponent(isbn + ' portada libro') : q;
 
    const linkGoogle = document.getElementById('portada-url-google-link');
    const linkBing   = document.getElementById('portada-url-bing-link');
    if (linkGoogle) linkGoogle.href = `https://www.google.com/search?q=${qIsbn}&tbm=isch`;
    if (linkBing)   linkBing.href   = `https://www.bing.com/images/search?q=${qIsbn}`;
 
    // Reset
    const input   = document.getElementById('portada-url-input');
    const preview = document.getElementById('portada-url-preview-wrap');
    const msg     = document.getElementById('portada-url-msg');
    if (input)   input.value = '';
    if (preview) preview.style.display = 'none';
    if (msg)     msg.textContent = '';
 
    overlay.style.display = 'flex';
    document.documentElement.style.overflow = 'hidden';
    setTimeout(() => input?.focus(), 100);
  }
  // Expuesta en window: el wiring del botón "⊕ URL" móvil (en la IIFE de
  // "Buscar portadas", más arriba en este archivo) la llama desde fuera
  // de esta IIFE.
  window.abrirPortadaUrl = abrirPortadaUrl;
 
  function cerrarPortadaUrl() {
    const overlay = document.getElementById('portada-url-overlay');
    if (!overlay) return;
    overlay.style.display = 'none';
    document.documentElement.style.overflow = '';
  }
 
  // Vista previa al escribir la URL
  function actualizarPreview(url) {
    const wrap    = document.getElementById('portada-url-preview-wrap');
    const preview = document.getElementById('portada-url-preview');
    const msg     = document.getElementById('portada-url-msg');
 
    if (!url || !url.startsWith('http')) {
      if (wrap) wrap.style.display = 'none';
      return;
    }
 
    if (preview) {
      preview.src = url;
      preview.onload  = () => { if (wrap) wrap.style.display = 'block'; if (msg) msg.textContent = ''; };
      preview.onerror = () => { if (wrap) wrap.style.display = 'none'; if (msg) msg.textContent = 'No se puede cargar la imagen desde esa URL.'; };
    }
  }
 
  async function guardarPortadaUrl() {
    const input = document.getElementById('portada-url-input');
    const msg   = document.getElementById('portada-url-msg');
    const btn   = document.getElementById('portada-url-guardar');
    const url   = (input?.value || '').trim();
 
    if (!url) { if (msg) msg.textContent = 'Introduce una URL.'; return; }
    if (!window.libroSeleccionadoId) { if (msg) msg.textContent = 'No hay libro seleccionado.'; return; }
 
    if (btn) btn.disabled = true;
    if (msg) msg.textContent = 'Descargando imagen…';
 
    try {
      const res  = await apiFetch(`/api/libros/${window.libroSeleccionadoId}/portada-url`, {
        method: 'POST',
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
 
      // Actualizar portada en el modal
      const img = document.getElementById('ficha-portada-img');
      if (img && data.url_portada) {
        window.marcarPortadaCambiada(data.url_portada);
        img.src = window.srcPortada(data.url_portada);
        img.classList.remove('is-placeholder');
      }
 
      if (msg) msg.textContent = '✓ Portada guardada';
      setTimeout(cerrarPortadaUrl, 1200);
 
      // Refrescar lista
      if (window.usuarioActual?.id && window.cargarEjemplares) {
        window.cargarEjemplares(window.usuarioActual.id);
      }
    } catch (e) {
      if (msg) msg.textContent = e.message;
    } finally {
      if (btn) btn.disabled = false;
    }
  }
 
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-portada-manual')?.addEventListener('click', abrirPortadaUrl);
    document.getElementById('portada-url-cerrar')?.addEventListener('click', cerrarPortadaUrl);
    document.getElementById('portada-url-cancelar')?.addEventListener('click', cerrarPortadaUrl);
    document.getElementById('portada-url-guardar')?.addEventListener('click', guardarPortadaUrl);
 
    document.getElementById('portada-url-overlay')?.addEventListener('click', e => {
      if (e.target.id === 'portada-url-overlay') cerrarPortadaUrl();
    });
 
    // Vista previa al escribir
    let previewTimer = null;
    document.getElementById('portada-url-input')?.addEventListener('input', e => {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(() => actualizarPreview(e.target.value.trim()), 600);
    });
 
    // Enter para guardar
    document.getElementById('portada-url-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') guardarPortadaUrl();
    });
 
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.getElementById('portada-url-overlay')?.style.display !== 'none') {
        cerrarPortadaUrl();
      }
    });
 
    // Eliminar portada
    document.getElementById('btn-eliminar-portada')?.addEventListener('click', async () => {
      if (!window.libroSeleccionadoId) return;
      if (!confirm('¿Eliminar la portada de este libro?')) return;
 
      try {
        const res = await apiFetch(`/api/libros/${window.libroSeleccionadoId}/portada`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
 
        // Limpiar imagen en el modal
        const img = document.getElementById('ficha-portada-img');
        if (img) { img.src = ''; img.classList.add('is-placeholder'); }
 
        // Refrescar lista
        if (window.usuarioActual?.id && window.cargarEjemplares) {
          window.cargarEjemplares(window.usuarioActual.id);
        }
      } catch (e) {
        alert('Error eliminando portada: ' + e.message);
      }
    });
  });
 
})();
