// js/ficha.js — Ficha del libro: eliminar ejemplar, edición, subida de portada y modal de ficha
// (El servidor une todos los ficheros de js/ en /main.js según js/orden.json)

// ---------- Escáner: ver scanner.js (window.Scanner) ----------
 
// ---------- Eliminar ejemplar ----------
async function eliminarEjemplar(ejemplarId) {
  if (!token || !usuarioActual) {
    setUserStatusErr('Debes iniciar sesión para eliminar ejemplares.');
    return;
  }
 
  const confirmar = confirm('¿Seguro que quieres eliminar este ejemplar?');
  if (!confirmar) return;
 
  try {
    const res = await fetch(`${API_BASE}/api/ejemplares/${ejemplarId}`, {
      method: 'DELETE',
      headers: getHeaders(false),
    });
 
    const data = await res.json();
    if (!res.ok) {
      setUserStatusErr(data.error || 'Error eliminando ejemplar.');
      return;
    }
 
    setUserStatusOk('Ejemplar eliminado.');
    window.VistaPreviaISBN?.invalidar();
    await cargarEjemplares(usuarioActual.id);
    await refrescarHome();
  } catch (err) {
    console.error(err);
    setUserStatusErr('Error de red al eliminar ejemplar.');
  }
}
 
// ---------- Ficha (cargar + guardar) ----------
async function cargarFormEdicion() {
  const msg = document.getElementById('edit-mensaje');
 
  if (!libroSeleccionadoId || !ejemplarSeleccionadoId) {
    if (msg) msg.textContent = 'Selecciona un ejemplar para ver la ficha.';
    return;
  }
  if (msg) msg.textContent = '';
 
  try {
    const [resLibro, resEjemplar] = await Promise.all([
      fetch(`${API_BASE}/api/libros/${libroSeleccionadoId}`, { headers: getHeaders(false) }),
      fetch(`${API_BASE}/api/ejemplares/${ejemplarSeleccionadoId}`, { headers: getHeaders(false) }),
    ]);
 
    const libro = await resLibro.json();
    const ejemplar = await resEjemplar.json();
 
    if (!resLibro.ok) { if (msg) msg.textContent = libro.error || 'Error cargando libro.'; return; }
    if (!resEjemplar.ok) { if (msg) msg.textContent = ejemplar.error || 'Error cargando ejemplar.'; return; }
 
    // inputs libro
    document.getElementById('edit-libro-titulo').value = libro.titulo || '';
    document.getElementById('edit-libro-autores').value = libro.autores || '';
    document.getElementById('edit-libro-editorial').value = libro.editorial || '';
    document.getElementById('edit-libro-fecha').value = libro.fecha_publicacion || '';
    document.getElementById('edit-libro-paginas').value = libro.numero_paginas || '';
    document.getElementById('edit-libro-descripcion').value = libro.descripcion || '';
 
    // inputs ejemplar
    document.getElementById('edit-ejemplar-estado').value = ejemplar.estado || '';
    document.getElementById('edit-ejemplar-ubicacion').value = ejemplar.ubicacion || '';
    document.getElementById('edit-ejemplar-notas').value = ejemplar.notas || '';
    document.getElementById('edit-ejemplar-tipo').value = ejemplar.tipo || 'libro';
 
    // header modal
    const img = document.getElementById('ficha-portada-img');
 
 
const portada =
  libro.url_portada
  || ejemplar.url_portada
  || (ejemplaresCache || []).find(e => Number(e.libro_id) === Number(libroSeleccionadoId))?.url_portada
  || '';
 
  if (img) {
    const hasPortada = Boolean(portada);
  
    img.classList.toggle('is-placeholder', !hasPortada);
    img.src = hasPortada ? srcPortada(portada) : '';
  
    img.onerror = () => {
      img.src = '';
      img.classList.add('is-placeholder');
    };
  }
    document.getElementById('ficha-titulo').textContent = libro.titulo || 'Sin título';
    document.getElementById('ficha-autores').textContent = libro.autores || 'Autor desconocido';
    document.getElementById('ficha-isbn').textContent = libro.isbn || '—';
 
    const creadoSpan = document.getElementById('ficha-creado-en');
    if (creadoSpan) {
      creadoSpan.textContent = ejemplar.creado_en
        ? new Date(ejemplar.creado_en).toLocaleDateString('es-ES', {day:'numeric', month:'short', year:'numeric'})
        : '—';
    }
  } catch (err) {
    console.error(err);
    if (msg) msg.textContent = 'Error de red al cargar la ficha.';
  }
}
 
async function guardarLibroEditado() {
  const msg = document.getElementById('edit-mensaje');
  if (msg) msg.textContent = '';
 
  if (!token || !usuarioActual) { if (msg) msg.textContent = 'Debes iniciar sesión para editar libros.'; return; }
  if (!libroSeleccionadoId) { if (msg) msg.textContent = 'Selecciona un libro.'; return; }
 
  const titulo = document.getElementById('edit-libro-titulo').value.trim();
  const autores = document.getElementById('edit-libro-autores').value.trim();
  const editorial = document.getElementById('edit-libro-editorial').value.trim();
  const fecha_publicacion = document.getElementById('edit-libro-fecha').value.trim();
  const paginasStr = document.getElementById('edit-libro-paginas').value.trim();
  const descripcion = document.getElementById('edit-libro-descripcion').value.trim();
 
  const numero_paginas = paginasStr ? Number(paginasStr) : null;
 
  const res = await fetch(`${API_BASE}/api/libros/${libroSeleccionadoId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({
      titulo: titulo || null,
      autores: autores || null,
      editorial: editorial || null,
      fecha_publicacion: fecha_publicacion || null,
      numero_paginas: Number.isNaN(numero_paginas) ? null : numero_paginas,
      descripcion: descripcion || null,
    }),
  });
 
  const data = await res.json();
  if (!res.ok) { if (msg) msg.textContent = data.error || 'Error guardando libro.'; return; }
 
  if (msg) msg.textContent = 'Libro guardado ✅';
  if (usuarioActual?.id) await cargarEjemplares(usuarioActual.id);
  await cargarFormEdicion();   // ✅ refresca inputs + header del modal
}
 
async function guardarEjemplarEditado() {
  const msg = document.getElementById('edit-mensaje');
  if (msg) msg.textContent = '';
 
  if (!token || !usuarioActual) {
    if (msg) msg.textContent = 'Debes iniciar sesión para editar ejemplares.';
    return;
  }
  if (!ejemplarSeleccionadoId) {
    if (msg) msg.textContent = 'Selecciona un ejemplar.';
    return;
  }
 
  const estado = document.getElementById('edit-ejemplar-estado').value.trim();
  const ubicacion = document.getElementById('edit-ejemplar-ubicacion').value.trim();
  const notas = document.getElementById('edit-ejemplar-notas').value.trim();
  const tipo = document.getElementById('edit-ejemplar-tipo').value;
 
  try {
    const res = await fetch(`${API_BASE}/api/ejemplares/${ejemplarSeleccionadoId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({
        estado: estado || null,
        ubicacion: ubicacion || null,
        notas: notas || null,
        tipo: tipo || 'libro',      
      }),
    });
 
    const data = await res.json();
    if (!res.ok) {
      if (msg) msg.textContent = data.error || 'Error guardando ejemplar.';
      return;
    }
 
    if (msg) msg.textContent = 'Ejemplar guardado ✅';
    if (usuarioActual?.id) await cargarEjemplares(usuarioActual.id);
    await cargarFormEdicion();   // ✅ para que el tipo/estado/notas y header se actualicen
  } catch (err) {
    console.error(err);
    if (msg) msg.textContent = 'Error de red al guardar ejemplar.';
  }
}
 
// ---------- Subir portada ----------
async function subirPortadaArchivo(file) {
  if (!libroSeleccionadoId || !file) return;
 
  setModalMsg('Subiendo portada...');
 
  const formData = new FormData();
  formData.append('portada', file);
 
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
 
  try {
    const res = await fetch(`${API_BASE}/api/libros/${libroSeleccionadoId}/portada`, {
      method: 'POST',
      headers,
      body: formData,
    });
 
    const contentType = res.headers.get('content-type') || '';
      let data = null;
      let raw = '';
 
      if (contentType.includes('application/json')) {
        data = await res.json().catch(() => null);
      } else {
        raw = await res.text().catch(() => '');
      }
 
      if (!res.ok) {
        const msg = (data && data.error) ? data.error : `Error ${res.status}: ${raw.slice(0, 120)}`;
        setModalMsg(msg);
        return;
      }
    setModalMsg('Portada actualizada ✅');
 
    const img = document.getElementById('ficha-portada-img');
    if (data.url_portada) marcarPortadaCambiada(data.url_portada);
    if (img && data.url_portada) img.src = srcPortada(data.url_portada);
 
    const portadaInput = document.getElementById('edit-libro-portada');
    if (portadaInput && data.url_portada) portadaInput.value = data.url_portada;
 
    if (usuarioActual?.id) await cargarEjemplares(usuarioActual.id);
  } catch (err) {
    console.error(err);
    setModalMsg('Error de red al subir la portada.');
  }
}
 
// ---------- Mostrar ficha (refresca siempre) ----------
let fichaReqId = 0;
 
async function mostrarFicha(libroId, ejemplarId) {
  const reqId = ++fichaReqId;
 
  libroSeleccionadoId = Number(libroId);
  ejemplarSeleccionadoId = ejemplarId ? Number(ejemplarId) : null;
 
  // Exponer en window para módulos IIFE
  window.libroSeleccionadoId   = libroSeleccionadoId;
  window.ejemplarSeleccionadoId = ejemplarSeleccionadoId;
 
  // ✅ engancha el panel "Del lector"
  if (window.readerPanelOpen) window.readerPanelOpen(libroSeleccionadoId);
 
  // reset visual
  const t = document.getElementById('ficha-titulo');
  if (t) t.textContent = 'Cargando…';
  const pre = document.getElementById('lecturas-detalle');
  if (pre) pre.textContent = '';
  const preP = document.getElementById('prestamos-detalle');
  if (preP) preP.textContent = '';
 
  await cargarFormEdicion();
  if (reqId !== fichaReqId) return;
 
  await Promise.all([cargarLecturas(libroSeleccionadoId), cargarPrestamos(libroSeleccionadoId)]);
  if (reqId !== fichaReqId) return;
 
  abrirModalFicha();
}
function moverFicha(offset) {
  const tbody = document.querySelector('#tabla-ejemplares tbody');
  if (!tbody) return;
 
  const filas = Array.from(tbody.querySelectorAll('tr'));
  if (!filas.length || ejemplarSeleccionadoId == null) return;
 
  // Buscar índice de la fila actual según el ejemplar seleccionado
  const idxActual = filas.findIndex(
    (tr) => Number(tr.dataset.ejemplarId) === Number(ejemplarSeleccionadoId)
  );
  if (idxActual === -1) return;
 
  let nuevoIdx = idxActual + offset;
 
  // Sin "wrap": si te sales del rango, no hace nada
  if (nuevoIdx < 0 || nuevoIdx >= filas.length) {
    return;
  }
 
  const filaNueva = filas[nuevoIdx];
  const nuevoLibroId = filaNueva.dataset.libroId
    ? Number(filaNueva.dataset.libroId)
    : null;
  const nuevoEjemplarId = filaNueva.dataset.ejemplarId
    ? Number(filaNueva.dataset.ejemplarId)
    : null;
 
  if (!nuevoLibroId || !nuevoEjemplarId) return;
 
  // Actualizamos selección global
  libroSeleccionadoId = nuevoLibroId;
  ejemplarSeleccionadoId = nuevoEjemplarId;
  window.libroSeleccionadoId    = libroSeleccionadoId;
  window.ejemplarSeleccionadoId = ejemplarSeleccionadoId;
 
  // Marcamos visualmente la fila seleccionada en la tabla
  filas.forEach((tr) => tr.classList.remove('fila-seleccionada'));
  filaNueva.classList.add('fila-seleccionada');
 
  // Cargamos de nuevo la ficha
  mostrarFicha(nuevoLibroId, nuevoEjemplarId);
}
 
// compartir deseos
async function compartirLista(tipo) {
  if (!token || !usuarioActual?.id) {
    alert('Debes iniciar sesión para compartir.');
    return;
  }
 
  let res;
  try {
    res = await fetch(`${API_BASE}/api/share`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ tipo })
    });
  } catch (e) {
    console.error(e);
    alert('Error de red (no se pudo conectar con el servidor).');
    return;
  }
 
  const contentType = res.headers.get('content-type') || '';
  let payload = null;
  let raw = '';
 
  if (contentType.includes('application/json')) {
    payload = await res.json().catch(() => null);
  } else {
    raw = await res.text().catch(() => '');
  }
 
  if (!res.ok) {
    const msg = payload?.error || raw?.slice(0, 160) || `HTTP ${res.status}`;
    alert(`No se pudo generar el enlace (${res.status}): ${msg}`);
    return;
  }
 
  const shareToken = payload?.token || payload?.share_token || payload?.id;
  if (!shareToken && !payload?.url) {
    alert('El servidor respondió OK pero no devolvió token/url.');
    return;
  }
 
  const url = payload.url || new URL(`share.html?t=${encodeURIComponent(shareToken)}`, window.location.href).toString();
 
  try {
    await navigator.clipboard.writeText(url);
    alert('Enlace copiado ✅');
  } catch {
    prompt('Copia este enlace:', url);
  }
}
 
 
function abrirShareOverlay() {
  const el = document.getElementById('share-overlay');
  if (!el) return;
  el.style.display = 'flex';
  document.documentElement.style.overflow = 'hidden';
}
 
function cerrarShareOverlay() {
  const el = document.getElementById('share-overlay');
  if (!el) return;
  el.style.display = 'none';
  document.documentElement.style.overflow = '';
}
 
async function crearEnlaceCompartir(tipo) {
  if (!token || !usuarioActual?.id) {
    alert('Debes iniciar sesión para compartir.');
    return;
  }
 
  const title = document.getElementById('share-title');
  const input = document.getElementById('share-url');
  const status = document.getElementById('share-status');
 
  if (title) title.textContent = (tipo === 'deseos') ? 'Compartir deseos' : 'Compartir ejemplares';
  if (input) input.value = '';
  if (status) status.textContent = 'Generando enlace…';
 
  abrirShareOverlay();
 
  const res = await fetch(`${API_BASE}/api/share`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify({ tipo })
  });
 
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (status) status.textContent = data.error || 'Error creando enlace';
    return;
  }
 
  if (input) input.value = data.url || '';
  if (status) status.textContent = 'Enlace listo ✅';
}
