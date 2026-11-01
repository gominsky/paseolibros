// js/prestamos.js — Préstamos: diálogo de préstamo, histórico y devolución
// (El servidor une todos los ficheros de js/ en /main.js según js/orden.json)

// ---------- Préstamos UI ----------
let prestamoKeyHandler = null;
 
function crearUIPrestamo() {
  if (document.getElementById('prestamo-overlay')) return;
 
  const overlay = document.createElement('div');
  overlay.id = 'prestamo-overlay';
  overlay.className = 'prestamo-overlay';
  overlay.style.display = 'none';
 
  overlay.innerHTML = `
    <div class="prestamo-dialog" role="dialog" aria-modal="true" aria-label="Nuevo préstamo">
      <h3>Nuevo préstamo</h3>
 
      <div class="form-group">
        <label for="prestamo-receptor-select">Receptor (usuario de la app)</label>
        <select id="prestamo-receptor-select">
          <option value="">— Persona externa —</option>
        </select>
        <p class="helper-text">
          Elige un usuario de la app o deja "Persona externa" para escribir un nombre.
        </p>
      </div>
 
      <div class="form-group">
        <label for="prestamo-receptor-nombre">Nombre receptor (si es externo)</label>
        <input id="prestamo-receptor-nombre" type="text" placeholder="Ej: Mi madre, Carlos..." />
      </div>
 
      <div class="form-group">
        <label for="prestamo-fecha-limite">Fecha límite de devolución</label>
        <input id="prestamo-fecha-limite" type="date" />
      </div>
 
      <div class="form-group">
        <label for="prestamo-notas">Notas</label>
        <input id="prestamo-notas" type="text" placeholder="Opcional" />
      </div>
 
      <div class="prestamo-dialog-buttons">
        <button id="prestamo-cancelar" class="btn btn-ghost btn-sm" type="button">Cancelar</button>
        <button id="prestamo-confirmar" class="btn btn-secondary btn-sm" type="button">Crear préstamo</button>
      </div>
    </div>
  `;
 
  document.body.appendChild(overlay);
 
  // Cerrar con botón cancelar
  document.getElementById('prestamo-cancelar')?.addEventListener('click', cerrarUIPrestamo);
  document.getElementById('prestamo-confirmar')?.addEventListener('click', confirmarPrestamoDesdeUI);
 
  // ✅ Cerrar al click fuera (solo si pinchas el overlay, no el diálogo)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cerrarUIPrestamo();
  });
}
 
function abrirUIPrestamo() {
  const overlay = document.getElementById('prestamo-overlay');
  if (!overlay) return;
 
  overlay.style.display = 'flex';
  document.documentElement.style.overflow = 'hidden'; // ✅ bloquea scroll fondo
 
  // Reset campos
  document.getElementById('prestamo-receptor-select').value = '';
  document.getElementById('prestamo-receptor-nombre').value = '';
  document.getElementById('prestamo-fecha-limite').value = '';
  document.getElementById('prestamo-notas').value = '';
 
  // ✅ ESC para cerrar
  prestamoKeyHandler = (e) => {
    if (e.key === 'Escape') cerrarUIPrestamo();
  };
  document.addEventListener('keydown', prestamoKeyHandler);
 
  // Foco al primer control
  setTimeout(() => {
    document.getElementById('prestamo-receptor-select')?.focus();
  }, 0);
}
 
function cerrarUIPrestamo() {
  const overlay = document.getElementById('prestamo-overlay');
  if (!overlay) return;
 
  overlay.style.display = 'none';
  document.documentElement.style.overflow = ''; // ✅ recupera scroll
 
  if (prestamoKeyHandler) {
    document.removeEventListener('keydown', prestamoKeyHandler);
    prestamoKeyHandler = null;
  }
 
  prestamoContexto = null;
}
 
async function cargarUsuariosParaPrestamo() {
  if (usuariosPrestamo.length > 0) {
    rellenarSelectPrestamo();
    return;
  }
 
  try {
    const res = await fetch(`${API_BASE}/api/usuarios`, { headers: getHeaders(false) });
    const data = await res.json();
    usuariosPrestamo = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Error cargando usuarios para préstamo', err);
    usuariosPrestamo = [];
  }
 
  rellenarSelectPrestamo();
}
 
function rellenarSelectPrestamo() {
  const select = document.getElementById('prestamo-receptor-select');
  if (!select) return;
  select.innerHTML = '<option value="">— Persona externa —</option>';
 
  for (const u of usuariosPrestamo) {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.nombre_usuario;
    select.appendChild(opt);
  }
}
 
async function crearPrestamo(libroId, ejemplarId) {
  if (!token || !usuarioActual) {
    setUserStatusErr('Debes iniciar sesión para prestar libros.');
    return;
  }
 
  prestamoContexto = { libroId: Number(libroId), ejemplarId: Number(ejemplarId) };
  crearUIPrestamo();
  await cargarUsuariosParaPrestamo();
  abrirUIPrestamo();
}
 
async function confirmarPrestamoDesdeUI() {
  if (!prestamoContexto || !usuarioActual || !token) {
    cerrarUIPrestamo();
    setUserStatusErr('No hay contexto de préstamo válido.');
    return;
  }
 
  // ✅ Guardar contexto ANTES de cerrar (porque cerrarUIPrestamo lo borra)
  const libroId = Number(prestamoContexto.libroId);
  const ejemplarId = Number(prestamoContexto.ejemplarId);
 
  const select = document.getElementById('prestamo-receptor-select');
  const inputNombre = document.getElementById('prestamo-receptor-nombre');
  const inputFecha = document.getElementById('prestamo-fecha-limite');
  const inputNotas = document.getElementById('prestamo-notas');
 
  let usuarioReceptorId = select.value ? Number(select.value) : null;
  let nombreReceptor = inputNombre.value.trim() || null;
 
  if (usuarioReceptorId) nombreReceptor = null;
  else if (!nombreReceptor) {
    alert('Introduce un nombre para la persona externa.');
    return;
  }
 
  try {
    const res = await fetch(`${API_BASE}/api/prestamos`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        ejemplar_id: ejemplarId,
        usuario_prestador_id: usuarioActual.id,
        usuario_receptor_id: usuarioReceptorId || null,
        nombre_receptor: nombreReceptor || null,
        fecha_limite: inputFecha.value || null,
        notas: inputNotas.value.trim() || null
      })
    });
 
    const data = await res.json();
    if (!res.ok) {
      setUserStatusErr(data.error || 'Error al crear el préstamo.');
      return;
    }
 
    cerrarUIPrestamo();
    setUserStatusOk('Préstamo creado.');
 
    // ✅ refrescar "principal" (widgets) + detalle de préstamos del libro
    await cargarPrestamos(libroId);
    await refrescarHome();
 
    // (opcional, por si el backend cambia estado del ejemplar al prestar)
    // await cargarEjemplares(usuarioActual.id);
  } catch (err) {
    console.error(err);
    setUserStatusErr('Error de red al crear el préstamo.');
  }
}
 
 
// ---------- Préstamos (modal) ----------
async function cargarPrestamos(libroId) {
  const info = document.getElementById('info-prestamos');
  const pre = document.getElementById('prestamos-detalle');
  if (!info || !pre) return;
 
  info.textContent = 'Cargando préstamos...';
  pre.textContent = '';
 
  try {
    const res = await fetch(`${API_BASE}/api/libros/${libroId}/prestamos`, {
      headers: getHeaders(false),
    });
    const prestamos = await res.json();
 
    if (!res.ok) {
      info.textContent = prestamos.error || 'Error al cargar los préstamos.';
      return;
    }
 
    if (!Array.isArray(prestamos) || prestamos.length === 0) {
      info.textContent = 'Este libro no tiene préstamos registrados.';
      return;
    }
 
    info.textContent = `Préstamos: ${prestamos.length}`;
 
    const lineas = prestamos.map((p) => {
      const activo = p.estado !== 'devuelto' && !p.fecha_devolucion;
      const badge = activo ? '📚' : '↩';
 
      const receptor = p.nombre_receptor_usuario || p.nombre_receptor || '—';
      const prestado = p.fecha_prestamo ? new Date(p.fecha_prestamo).toLocaleDateString('es-ES') : '—';
      const limite = p.fecha_limite ? new Date(p.fecha_limite).toLocaleDateString('es-ES') : '—';
      const dev = p.fecha_devolucion ? new Date(p.fecha_devolucion).toLocaleDateString('es-ES') : '—';
 
      return `${badge} #${p.id} · a ${receptor} · ${p.estado || '—'} · ${prestado} → ${limite} · dev: ${dev}`;
    });
 
    pre.textContent = lineas.join('\n');
  } catch (err) {
    console.error(err);
    info.textContent = 'Error al cargar los préstamos.';
  }
}
 
async function marcarPrestamoDevuelto(prestamoId, libroId) {
  const notas = prompt('Notas sobre la devolución (opcional):') || null;
 
  try {
    const res = await fetch(`${API_BASE}/api/prestamos/${prestamoId}/devolver`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ notas }),
    });
 
    const data = await res.json();
    if (!res.ok) {
      setUserStatusErr(data.error || 'Error al marcar como devuelto.');
      return;
    }
 
    setUserStatusOk('Préstamo devuelto.');
    await cargarPrestamos(libroId);
    await refrescarHome();
  } catch (err) {
    console.error(err);
    setUserStatusErr('Error de red al actualizar el préstamo.');
  }
}
 
async function marcarPrestamoDevueltoGlobal() {
  if (!token || !usuarioActual) {
    setUserStatusErr('Debes iniciar sesión para actualizar préstamos.');
    return;
  }
  if (!libroSeleccionadoId) {
    setUserStatusErr('Selecciona primero un libro.');
    return;
  }
 
  try {
    const res = await fetch(`${API_BASE}/api/libros/${libroSeleccionadoId}/prestamos`, {
      headers: getHeaders(false),
    });
    const prestamos = await res.json();
 
    if (!res.ok) {
      setUserStatusErr(prestamos.error || 'Error cargando préstamos.');
      return;
    }
 
    const prestamoActivo = Array.isArray(prestamos)
      ? prestamos.find((p) => p.estado !== 'devuelto' && p.usuario_prestador_id === usuarioActual.id)
      : null;
 
    if (!prestamoActivo) {
      setUserStatusErr('No tienes ningún préstamo activo para este libro.');
      return;
    }
 
    const confirmar = confirm(`¿Marcar como devuelto el préstamo #${prestamoActivo.id}?`);
    if (!confirmar) return;
 
    await marcarPrestamoDevuelto(prestamoActivo.id, libroSeleccionadoId);
  } catch (err) {
    console.error(err);
    setUserStatusErr('Error de red al marcar préstamo como devuelto.');
  }
}
