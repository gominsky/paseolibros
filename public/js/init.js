// js/init.js — Arranque: enlaza botones y eventos al cargar la página; mensajes flash
// (El servidor une todos los ficheros de js/ en /main.js según js/orden.json)

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
    // 1) Aplicar tema guardado
    const savedTheme = localStorage.getItem('paseolibros_theme') || 'rose';
    aplicarTema(savedTheme);
  
    // 2) Botón toggle de tema
    const themeBtn = document.getElementById('btn-toggle-theme');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const current = localStorage.getItem('paseolibros_theme') || 'rose';
        const next = current === 'rose' ? 'dark' : 'rose';
        aplicarTema(next);
      });
    }
  wireDeseosUI();
  wireColaUI();
  restaurarPreferenciasUI();
  actualizarBotonesVistaEjemplares();
  initOrdenacionEjemplares();
  wireSortEjemplaresSelect();
  const prevBtn = document.getElementById('ficha-prev');
  const nextBtn = document.getElementById('ficha-next');
 
  if (prevBtn) {
    prevBtn.addEventListener('click', () => moverFicha(-1));
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => moverFicha(1));
  }
  document.getElementById('ej-vista-lista')?.addEventListener('click', () => {
    vistaEjemplares = 'lista';
    document.body.classList.remove('vista-estanteria');
    guardarVistaEjemplares();
    actualizarBotonesVistaEjemplares();
    aplicarVistaContenedor();
    renderEjemplares();
  });
  document.getElementById('ej-vista-grid')?.addEventListener('click', () => {
    vistaEjemplares = 'grid';
    document.body.classList.remove('vista-estanteria');
    guardarVistaEjemplares();
    actualizarBotonesVistaEjemplares();
    renderEjemplares();
  });
  document.getElementById('ej-vista-estanteria')?.addEventListener('click', () => {
    vistaEjemplares = 'estanteria';
    document.body.classList.add('vista-estanteria');
    guardarVistaEjemplares();
    actualizarBotonesVistaEjemplares();
    aplicarVistaContenedor();
    if (window._ejemplaresCache && window._ejemplaresCache.length) {
      window.renderEstanteria(window._ejemplaresCache);
    }
  });
  
  document.getElementById('btn-escanear')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-escanear');
    if (window.Scanner) await window.Scanner.toggle();
    else setUserStatusErr('El escáner no está disponible.');
  });
  
  // Tarjetas y portadas con teclado (Enter / espacio abre la ficha)
  ['ejemplares-list', 'ejemplares-grid'].forEach((id) => {
    document.getElementById(id)?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target.closest('.ej-card, .ej-grid-item');
      if (!el) return;
      e.preventDefault();
      el.click();
    });
  });
  document.getElementById('ejemplares-grid')?.addEventListener('click', (e) => {
    const item = e.target.closest('.ej-grid-item');
    if (!item) return;
    mostrarFicha(Number(item.dataset.libroId), Number(item.dataset.ejemplarId));
  });
  
  // Restaurar sesión: solo si el token guardado no ha caducado (ver api.js).
  // La app no se muestra hasta que el servidor la confirma; si no la acepta, se pide login.
  const haySesion = restoreSession();
  actualizarUIAutenticacion();
  if (haySesion) verificarSesion();
  document.getElementById('btn-auth-reintentar')?.addEventListener('click', () => verificarSesion());
  document.getElementById('btn-auth-otra-cuenta')?.addEventListener('click', () => {
    hacerLogout();
    const m = document.getElementById('login-mensaje');
    if (m) m.textContent = '';
  });
 
  // Botones básicos
  document.getElementById('btn-crear')?.addEventListener('click', (e) => {
    e.preventDefault();
    crearEjemplar();
  });
  
  // Formulario real: Intro para entrar y el navegador sabe dónde va el usuario guardado
  document.getElementById('form-login')?.addEventListener('submit', (e) => {
    e.preventDefault();
    hacerLogin();
  });
  document.getElementById('btn-logout')?.addEventListener('click', hacerLogout);
  // Stats lecturas: desplegar años (desktop + móvil)
  document.getElementById('tabla-stats-lecturas')?.addEventListener('click', manejarClickStatsToggle);
  document.getElementById('stats-lecturas-mobile')?.addEventListener('click', manejarClickStatsMobileToggle);
  // Lista móvil: acciones y abrir ficha
  document.getElementById('ejemplares-list')?.addEventListener('click', (e) => {
    const card = e.target.closest('.ej-card');
    if (!card) return;
 
    const libroId = Number(card.dataset.libroId);
    const ejemplarId = Number(card.dataset.ejemplarId);
  // Cualquier click en la card abre la ficha
  mostrarFicha(libroId, ejemplarId);
});
 
  const tituloInput = document.getElementById('edit-libro-titulo');
  tituloInput?.addEventListener('input', () => {
    const dups = titulosDuplicadosEnCache(tituloInput.value, libroSeleccionadoId);
 
    if (dups.length > 0) {
      setModalMsg(`Ojo: ya tienes ${dups.length} libro(s) con ese título en tu biblioteca.`);
    } else {
      // no borres otros mensajes importantes si los usas; si quieres, comenta esta línea
      setModalMsg('');
    }
  });
 
  // Modal cerrar
  document.getElementById('modal-ficha-cerrar')?.addEventListener('click', cerrarModalFicha);
  document.getElementById('modal-ficha-backdrop')?.addEventListener('click', cerrarModalFicha);
  //Exportar
  document
  .getElementById('btn-exportar-csv')
  ?.addEventListener('click', exportarEjemplaresCSV);
  //Importar
  document
  .getElementById('input-importar-csv')
  ?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await importarEjemplaresCSV(file);
    e.target.value = '';
  });
  document.getElementById('btn-share-deseos')?.addEventListener('click', () => crearEnlaceCompartir('deseos'));
  document.getElementById('btn-share-ejemplares')?.addEventListener('click', () => crearEnlaceCompartir('ejemplares'));
  //document.getElementById('btn-share-ejemplares')?.addEventListener('click', () => compartirLista('ejemplares'));
  //document.getElementById('btn-share-deseos')?.addEventListener('click', () => compartirLista('deseos'));
 
  document.getElementById('btn-cerrar-share')?.addEventListener('click', cerrarShareOverlay);
  document.getElementById('share-overlay')?.addEventListener('click', (e) => {
    if (e.target?.id === 'share-overlay') cerrarShareOverlay();
  });
 
  document.getElementById('btn-copy-share')?.addEventListener('click', async () => {
    const input = document.getElementById('share-url');
    const status = document.getElementById('share-status');
    const title = document.getElementById('share-title')?.textContent || 'Lista';
    const url = input?.value?.trim();
  
    if (!url) return;
  
    // 1) Intentar compartir nativo (móvil)
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: title,
          url,
        });
        if (status) status.textContent = 'Compartido ✓';
        return;
      } catch (err) {
        // Si el usuario cancela o falla, seguimos con copiar
        if (status) status.textContent = 'Compartir cancelado, intentando copiar…';
      }
    }
  
    // 2) Intentar clipboard moderno
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        if (status) status.textContent = 'Copiado al portapapeles ✓';
        return;
      } catch (e) {
        // seguimos al fallback clásico
      }
    }
  
    // 3) Fallback clásico (para navegadores viejos)
    if (input) {
      input.select();
      document.execCommand?.('copy');
      if (status) status.textContent = 'Copiado (modo compatibilidad) ✓';
    } else {
      // Último recurso: un prompt
      prompt('Copia este enlace:', url);
    }
  });
  
 
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      const modal = document.getElementById('modal-ficha');
      if (modal && modal.classList.contains('is-visible')) cerrarModalFicha();
    }
  });
 
  // FAB alta (si existe)
  const fab = document.getElementById('btn-toggle-alta');
  fab?.addEventListener('click', () => {
    const abierto = document.body.classList.toggle('alta-visible');
    fab.textContent = abierto ? '−' : '+';
    if (abierto) {
      setTimeout(() => document.getElementById('isbn')?.focus(), 50);
    } else {
      try { window.Scanner?.stop(); } catch {}
    }
  });
 
  // Subida portada
  document.getElementById('ficha-portada-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await subirPortadaArchivo(file);
    e.target.value = '';
  });
 
  // Botones modal
  document.getElementById('btn-terminar-lectura')?.addEventListener('click', terminarLecturaActual);
  document.getElementById('btn-marcar-devuelto-global')?.addEventListener('click', marcarPrestamoDevueltoGlobal);
  document.getElementById('btn-guardar-libro')?.addEventListener('click', guardarLibroEditado);
  document.getElementById('btn-guardar-ejemplar')?.addEventListener('click', guardarEjemplarEditado);
  // Versiones móvil (footer fijo externo — IDs distintos para evitar duplicados)
  document.getElementById('btn-guardar-libro-movil')?.addEventListener('click', guardarLibroEditado);
  document.getElementById('btn-guardar-ejemplar-movil')?.addEventListener('click', guardarEjemplarEditado);
 
  // Acciones del modal: leer, prestar, eliminar
  document.getElementById('btn-leer-modal')?.addEventListener('click', () => {
    if (!libroSeleccionadoId || !ejemplarSeleccionadoId) {
      setUserStatusErr('Selecciona un ejemplar primero.');
      return;
    }
    empezarLectura(libroSeleccionadoId, ejemplarSeleccionadoId);
  });
 
  document.getElementById('btn-prestar-modal')?.addEventListener('click', () => {
    if (!libroSeleccionadoId || !ejemplarSeleccionadoId) {
      setUserStatusErr('Selecciona un ejemplar primero.');
      return;
    }
    crearPrestamo(libroSeleccionadoId, ejemplarSeleccionadoId);
  });
 
  // Versión móvil del botón eliminar
  document.getElementById('btn-eliminar-modal-movil')?.addEventListener('click', async () => {
    if (!ejemplarSeleccionadoId) return;
    const confirmar = confirm('¿Eliminar este ejemplar? Esta acción no se puede deshacer.');
    if (!confirmar) return;
    await cerrarModalFicha();
    await eliminarEjemplar(ejemplarSeleccionadoId);
  });
 
  document.getElementById('btn-eliminar-modal')?.addEventListener('click', async () => {
    if (!ejemplarSeleccionadoId) return;
    const confirmar = confirm('¿Eliminar este ejemplar? Esta acción no se puede deshacer.');
    if (!confirmar) return;
    await cerrarModalFicha();
    await eliminarEjemplar(ejemplarSeleccionadoId);
  });
 
  
  // UI préstamo overlay
  crearUIPrestamo();
 
  // Buscador ejemplares (usa render, no "oculta filas")
  const buscador = document.getElementById('buscador-ejemplares');
  if (buscador) {
    let tBusqueda = null;
    buscador.addEventListener('input', () => {
      // El autorrelleno del navegador a veces mete aquí el nombre de usuario guardado:
      // si el texto aparece sin que el usuario esté escribiendo en el buscador, se descarta.
      const nombre = window.usuarioActual?.nombre_usuario || document.getElementById('login-usuario')?.value || '';
      if (document.activeElement !== buscador && nombre && buscador.value.trim() === nombre.trim()) {
        buscador.value = '';
        if (ejemplaresQuery) { ejemplaresQuery = ''; renderEjemplares(); }
        return;
      }
      clearTimeout(tBusqueda);
      tBusqueda = setTimeout(() => {
        ejemplaresQuery = buscador.value || '';
        renderEjemplares();
      }, 180);
    });
  }
  // Al cruzar el punto de corte móvil/escritorio hay que repintar la vista correcta
  window.matchMedia?.('(max-width: 820px)').addEventListener?.('change', () => renderEjemplares());
    // Ordenación compacta (móvil): título / autor / recientes
    const sortSel = document.getElementById('sort-ejemplares');
  // Clicks en tabla ejemplares (acciones vs abrir ficha)
  const tbodyEjemplares = document.querySelector('#tabla-ejemplares tbody');
  tbodyEjemplares?.addEventListener('click', (e) => {
    const fila = e.target.closest('tr');
    if (!fila) return;
 
    libroSeleccionadoId = fila.dataset.libroId ? Number(fila.dataset.libroId) : null;
    ejemplarSeleccionadoId = fila.dataset.ejemplarId ? Number(fila.dataset.ejemplarId) : null;
 
    tbodyEjemplares.querySelectorAll('tr').forEach((tr) => tr.classList.remove('fila-seleccionada'));
    fila.classList.add('fila-seleccionada');
 
    // Cualquier click en la fila abre la ficha
    mostrarFicha(fila.dataset.libroId, fila.dataset.ejemplarId);
  });
  // Cerrar "alta" al tocar fuera (solo móvil)
  document.addEventListener('click', (e) => {
    if (!document.body.classList.contains('alta-visible')) return;
 
    const dentroPanel = e.target.closest('.column-left .card');
    const esFab = e.target.closest('#btn-toggle-alta');
    if (!dentroPanel && !esFab) {
      document.body.classList.remove('alta-visible');
      const fab = document.getElementById('btn-toggle-alta');
      if (fab) fab.textContent = '+';
      try { window.Scanner?.stop(); } catch {}
    }
  });
 
  // Click en lecturas/préstamos home => abrir ficha (resuelve ejemplar si falta)
  document.querySelector('#tabla-lecturas-abiertas tbody')?.addEventListener('click', async (e) => {
    const tr = e.target.closest('tr');
    if (!tr) return;
 
    // Libro que me han prestado: marcapáginas propio + «Lo he terminado»
    if (tr.dataset.recibidoId) {
      const id = Number(tr.dataset.recibidoId);
      abrirUIMarcapagina({
        paginaInicial: tr.dataset.paginaActual ? Number(tr.dataset.paginaActual) : null,
        subtitulo: `${tr.dataset.titulo} · prestado por ${tr.dataset.prestador}`,
        onSave: async (pagina) => {
          const res = await fetch(`${API_BASE}/api/libros-recibidos/${id}/pagina`, {
            method: 'PATCH', headers: getHeaders(true), body: JSON.stringify({ pagina_actual: pagina }),
          });
          if (!res.ok) return setUserStatusErr('No se pudo guardar la página.');
          tr.dataset.paginaActual = String(pagina ?? '');
          const td = tr.querySelector('.cell-pagina');
          if (td) td.textContent = (pagina ?? '—');
        },
        onFinish: async () => {
          const res = await fetch(`${API_BASE}/api/libros-recibidos/${id}/leido`, {
            method: 'POST', headers: getHeaders(true), body: JSON.stringify({ leido: true }),
          });
          if (!res.ok) return setUserStatusErr('No se pudo marcar como leído.');
          setUserStatusOk(`Terminado: ${tr.dataset.titulo}`);
          cargarLecturasAbiertas();
          window.refrescarEstadisticas?.();
        },
      });
      return;
    }
  
    const lecturaId = tr.dataset.lecturaId ? Number(tr.dataset.lecturaId) : null;
    const libroId = Number(tr.dataset.libroId);
    const ejId = tr.dataset.ejemplarId ? Number(tr.dataset.ejemplarId) : resolverEjemplarIdDesdeCache(libroId);
  
    if (!lecturaId) {
      setUserStatusErr('No encuentro el ID de la lectura (lecturaId).');
      return;
    }
    if (!ejId) {
      setUserStatusErr('No encuentro el ejemplar de ese libro en tu lista.');
      return;
    }
  
    const paginaInicial = tr.dataset.paginaActual ? Number(tr.dataset.paginaActual) : null;
  
    abrirUIMarcapagina({
      lecturaId,
      paginaInicial,
      onSave: async (pagina) => {
        await actualizarPaginaLectura(lecturaId, pagina);
 
        // Actualizar UI al instante sin recargar
        tr.dataset.paginaActual = String(pagina ?? '');
        const td = tr.querySelector('.cell-pagina');
        if (td) td.textContent = (pagina ?? '—');
      },
      onSkip: () => {
        // Cerró sin guardar — no hacer nada
      }
    });
  });
  
 
document.querySelector('#tabla-prestamos-activos tbody')?.addEventListener('click', (e) => {
  const tr = e.target.closest('tr');
  if (!tr) return;
 
  const libroId = Number(tr.dataset.libroId);
  const ejId = tr.dataset.ejemplarId ? Number(tr.dataset.ejemplarId) : resolverEjemplarIdDesdeCache(libroId);
 
  if (!ejId) {
    setUserStatusErr('No encuentro el ejemplar de ese libro en tu lista (¿tienes algún ejemplar cargado?).');
    return;
  }
  mostrarFicha(libroId, ejId);
});
 
  // --- Dropdown Herramientas ---
const btnTools = document.getElementById('btn-tools');
const toolsDropdown = document.getElementById('tools-dropdown');
 
function cerrarTools() {
  if (!toolsDropdown) return;
  toolsDropdown.classList.remove('is-open');
  toolsDropdown.setAttribute('aria-hidden', 'true');
}
 
function toggleTools() {
  if (!toolsDropdown) return;
  const open = toolsDropdown.classList.toggle('is-open');
  toolsDropdown.setAttribute('aria-hidden', open ? 'false' : 'true');
}
 
btnTools?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleTools();
});
 
document.addEventListener('click', cerrarTools);
 
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cerrarTools();
});
 
  // Evita que un click dentro del dropdown lo cierre (necesario para el selector de ordenar)
  toolsDropdown?.addEventListener('click', (ev) => ev.stopPropagation());
 
  // --- Ordenar: en móvil vive dentro de Herramientas ---
  const mqlMobile = window.matchMedia('(max-width: 820px)');
  const sortSelect = document.getElementById('sort-ejemplares');
  const sortMiniHost = document.querySelector('.sort-mini');
  const originalParent = sortSelect?.parentElement || null;
  const originalNextSibling = sortSelect?.nextSibling || null;
  let toolsSortWrap = null;
 
  function ensureToolsSortWrap() {
    if (!toolsDropdown || !sortSelect) return null;
    if (toolsSortWrap && toolsSortWrap.isConnected) return toolsSortWrap;
 
    toolsSortWrap = document.createElement('div');
    toolsSortWrap.id = 'tools-sort-wrap';
    toolsSortWrap.className = 'tools-item tools-sort-wrap';
    toolsSortWrap.innerHTML = `<div class="tools-sort-label">Ordenar ejemplares</div>`;
 
    // lo ponemos arriba del todo, antes de Exportar/Importar
    toolsDropdown.insertBefore(toolsSortWrap, toolsDropdown.firstChild);
    toolsSortWrap.appendChild(sortSelect);
 
    return toolsSortWrap;
  }
 
  function placeSortControl() {
    if (!sortSelect) return;
 
    if (mqlMobile.matches) {
      ensureToolsSortWrap();
    } else {
      // vuelve a su sitio (header Ejemplares)
      if (sortMiniHost && sortMiniHost.isConnected) {
        sortMiniHost.appendChild(sortSelect);
      } else if (originalParent) {
        originalParent.insertBefore(sortSelect, originalNextSibling);
      }
      if (toolsSortWrap && toolsSortWrap.isConnected) toolsSortWrap.remove();
      toolsSortWrap = null;
    }
  }
 
  placeSortControl();
  if (mqlMobile.addEventListener) mqlMobile.addEventListener('change', placeSortControl);
  else mqlMobile.addListener(placeSortControl);
 
 
  // Delegación: marcar devuelto desde tabla préstamos modal
 
  async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}
function mostrarRegistro() {
  const loginBox = document.getElementById('login-box');
  const registerBox = document.getElementById('register-box');
  const msg = document.getElementById('login-mensaje');
  if (msg) msg.textContent = '';
 
  if (loginBox) loginBox.style.display = 'none';
  if (registerBox) registerBox.style.display = 'block';
 
  setUserStatus?.(''); // si existe en tu código
}
 
function mostrarLogin() {
  const loginBox = document.getElementById('login-box');
  const registerBox = document.getElementById('register-box');
  const msg = document.getElementById('login-mensaje');
  if (msg) msg.textContent = '';
 
  if (registerBox) registerBox.style.display = 'none';
  if (loginBox) loginBox.style.display = 'block';
 
  setUserStatus?.('');
}
document.getElementById('link-show-register')?.addEventListener('click', (e) => {
  e.preventDefault();
  mostrarRegistro();
});
 
document.getElementById('link-show-login')?.addEventListener('click', (e) => {
  e.preventDefault();
  mostrarLogin();
});
document.getElementById('link-forgot')?.addEventListener('click', (e) => {
  e.preventDefault();
  // "Zona en obras"
  alert(' Recuperación de contraseña: en obras (pendiente configurar SMTP).');
});
 
function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}
document.getElementById('cola-lista')?.addEventListener('click', async (e) => {
  const card = e.target.closest('.deseo-item');
  if (!card) return;
 
  const id = Number(card.dataset.id);
 
  try {
    if (e.target.closest('.cola-up')) {
      await moverColaSwap(id, -1);
      return;
    }
    if (e.target.closest('.cola-down')) {
      await moverColaSwap(id, +1);
      return;
    }
    if (e.target.closest('.cola-del')) {
      await borrarDeCola(id);
      return;
    }
  } catch (err) {
    console.error(err);
    alert(err.message || 'Error reordenando');
  }
});
 
// --- REGISTRO ---
const btnRegister = document.getElementById('btn-register');
const msg = document.getElementById('login-mensaje');
 
btnRegister?.addEventListener('click', async (e) => {
  e.preventDefault();
 
  const nombre_usuario = document.getElementById('reg-usuario')?.value?.trim() || '';
  const correo = document.getElementById('reg-correo')?.value?.trim() || '';
  const contrasena = document.getElementById('reg-pass')?.value || '';
 
  if (msg) msg.textContent = '';
 
  if (!nombre_usuario || !correo || !contrasena) {
    if (msg) msg.textContent = 'Completa usuario, correo y contraseña.';
    return;
  }
 
  // evita doble click
  btnRegister.disabled = true;
 
  try {
    const { ok, data, status } = await apiPost('/api/auth/register', {
      nombre_usuario,
      correo,
      contrasena,
    });
 
    if (!ok) {
      if (msg) msg.textContent = data?.error || `Error al registrar (HTTP ${status}).`;
      return;
    }
 
    if (msg) msg.textContent = 'Cuenta creada ✓ Ya puedes iniciar sesión.';
    // opcional: limpiar campos
    document.getElementById('reg-usuario').value = '';
    document.getElementById('reg-correo').value = '';
    document.getElementById('reg-pass').value = '';
  } catch (err) {
    console.error(err);
    if (msg) msg.textContent = 'No se pudo conectar con el servidor.';
  } finally {
    btnRegister.disabled = false;
  }
});
 
});
// =========================
// Mensajes temporales (auto-hide)
// =========================
window.flashOk = function flashOk(msg, ms = 2500) {
  if (typeof setUserStatusOk === 'function') {
    setUserStatusOk(msg);
  }
 
  clearTimeout(window.__statusTimer);
 
  window.__statusTimer = setTimeout(() => {
    if (typeof setUserStatus === 'function') {
      setUserStatus('');
    }
  }, ms);
};
 
window.flashErr = function flashErr(msg, ms = 3500) {
  if (typeof setUserStatusErr === 'function') {
    setUserStatusErr(msg);
  }
 
  clearTimeout(window.__statusTimer);
 
  window.__statusTimer = setTimeout(() => {
    if (typeof setUserStatus === 'function') {
      setUserStatus('');
    }
  }, ms);
};
