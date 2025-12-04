const API_BASE = 'http://localhost:3011'; // ajusta puerto si cambias

let codeReader = null;
let currentStream = null;
let token = null;
let usuarioActual = null; // { id, nombre_usuario, ... }
// selección actual en la tabla
let libroSeleccionadoId = null;
let ejemplarSeleccionadoId = null;
// ---------- Helpers ----------

function getHeaders(json = true) {
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function actualizarUIAutenticacion() {
  const zonaNo = document.getElementById('zona-no-autenticado');
  const zonaSi = document.getElementById('zona-autenticado');
  const nombreSpan = document.getElementById('nombre-usuario-actual');
  const selectUsuario = document.getElementById('usuario');

  if (usuarioActual && token) {
    zonaNo.style.display = 'none';
    zonaSi.style.display = 'block';
    nombreSpan.textContent = usuarioActual.nombre_usuario;

    // rellenar select de usuario con SOLO el actual
    if (selectUsuario) {
      selectUsuario.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = usuarioActual.id;
      opt.textContent = usuarioActual.nombre_usuario;
      selectUsuario.appendChild(opt);
    }

    // cargar ejemplares de este usuario
    cargarEjemplares(usuarioActual.id);
  } else {
    zonaNo.style.display = 'block';
    zonaSi.style.display = 'none';
    nombreSpan.textContent = '';

    if (selectUsuario) {
      selectUsuario.innerHTML = '';
    }

    const info = document.getElementById('info-ejemplares');
    if (info) info.textContent = 'Inicia sesión para ver tus ejemplares.';
  }
}

// ---------- Login / Logout ----------

async function hacerLogin() {
  const usuarioInput = document.getElementById('login-usuario');
  const passInput = document.getElementById('login-contrasena');
  const mensaje = document.getElementById('login-mensaje');

  mensaje.textContent = '';

  const nombre_usuario = usuarioInput.value.trim();
  const contrasena = passInput.value;

  if (!nombre_usuario || !contrasena) {
    mensaje.textContent = 'Introduce usuario y contraseña';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ nombre_usuario, contrasena })
    });

    const data = await res.json();

    if (!res.ok) {
      mensaje.textContent = data.error || 'Error al iniciar sesión';
      return;
    }

    token = data.token;
    usuarioActual = data.usuario;

    mensaje.textContent = 'Login correcto ✅';

    // limpiar campos
    usuarioInput.value = '';
    passInput.value = '';

    actualizarUIAutenticacion();
  } catch (err) {
    console.error(err);
    mensaje.textContent = 'Error de red al iniciar sesión';
  }
}

function hacerLogout() {
  token = null;
  usuarioActual = null;
  actualizarUIAutenticacion();

  const mensaje = document.getElementById('login-mensaje');
  if (mensaje) mensaje.textContent = 'Sesión cerrada';
}

// ---------- Cargar ejemplares ----------

async function cargarEjemplares(usuarioId) {
  const info = document.getElementById('info-ejemplares');
  const tbody = document.querySelector('#tabla-ejemplares tbody');

  if (!tbody) return;

  tbody.innerHTML = '';
  if (!usuarioId) {
    if (info) info.textContent = 'Inicia sesión para ver tus ejemplares.';
    return;
  }

  if (info) info.textContent = 'Cargando ejemplares...';

  try {
    const res = await fetch(`${API_BASE}/api/usuarios/${usuarioId}/ejemplares`, {
      headers: getHeaders(false)
    });
    const ejemplares = await res.json();

    if (!Array.isArray(ejemplares) || ejemplares.length === 0) {
      if (info) info.textContent = 'No tienes ejemplares todavía.';
      return;
    }

    if (info) info.textContent = `Total ejemplares: ${ejemplares.length}`;
      for (const e of ejemplares) {
  const tr = document.createElement('tr');

  // si todavía no lo tienes, puedes añadir estos data-atributos
  tr.dataset.libroId = e.libro_id;
  tr.dataset.ejemplarId = e.ejemplar_id;

  tr.innerHTML = `
    <td>${e.titulo || ''}</td>
    <td>${e.autores || ''}</td>
    <td>${e.isbn || ''}</td>
    <td>${e.estado || ''}</td>
    <td>${e.ubicacion || ''}</td>
    <td>${e.notas || ''}</td>
    <td>
      <button
        class="btn btn-ghost btn-sm btn-leer"
        data-libro-id="${e.libro_id}"
        data-ejemplar-id="${e.ejemplar_id}"
      >
        Empezar lectura
      </button>
      <button
        class="btn btn-ghost btn-sm btn-prestar"
        data-libro-id="${e.libro_id}"
        data-ejemplar-id="${e.ejemplar_id}"
      >
        Prestar
      </button>
      <button
        class="btn btn-danger btn-sm btn-eliminar"
        data-ejemplar-id="${e.ejemplar_id}"
      >
        Eliminar
      </button>
    </td>
  `;

  tbody.appendChild(tr);
}
    
  } catch (err) {
    console.error(err);
    if (info) info.textContent = 'Error al cargar los ejemplares.';
  }
}

// ---------- Crear ejemplar ----------

async function crearEjemplar() {
  const mensaje = document.getElementById('mensaje');
  const resultado = document.getElementById('resultado');

  mensaje.textContent = '';
  resultado.textContent = '';

  if (!token || !usuarioActual) {
    mensaje.textContent = 'Debes iniciar sesión para crear ejemplares';
    return;
  }

  const isbn = document.getElementById('isbn').value.trim();
  const ubicacion = document.getElementById('ubicacion').value.trim();
  const notas = document.getElementById('notas').value.trim();

  if (!isbn) {
    mensaje.textContent = 'Introduce un ISBN (o escanéalo)';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/ejemplares`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        isbn,
        estado: 'propio',
        ubicacion: ubicacion || null,
        notas: notas || null
      })
    });

    const data = await res.json();

    if (!res.ok) {
      mensaje.textContent = `Error: ${data.error || 'Error desconocido'}`;
      return;
    }

    mensaje.textContent = 'Ejemplar creado correctamente ✅';
    resultado.textContent = JSON.stringify(data, null, 2);
    document.getElementById('isbn').value = '';

    await cargarEjemplares(usuarioActual.id);
  } catch (err) {
    console.error(err);
    mensaje.textContent = 'Error de red al crear el ejemplar';
  }
}

// ---------- LECTURAS Y PRÉSTAMOS ----------
// (no cambio aquí la lógica de negocio, solo añado getHeaders() y uso usuarioActual.id)

async function empezarLectura(libroId, ejemplarId) {
  const mensaje = document.getElementById('mensaje');

  mensaje.textContent = '';

  if (!token || !usuarioActual) {
    mensaje.textContent = 'Debes iniciar sesión para registrar lecturas';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/lecturas`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        usuario_id: usuarioActual.id, // de momento sigue yendo en el body
        libro_id: Number(libroId),
        ejemplar_id: Number(ejemplarId),
        estado: 'leyendo',
        pagina_actual: null,
        notas: null
      })
    });

    const data = await res.json();

    if (!res.ok) {
      mensaje.textContent = `Error al empezar la lectura: ${data.error || 'Error desconocido'}`;
      return;
    }

    mensaje.textContent = 'Lectura iniciada ✅';

    await cargarLecturas(libroId);
  } catch (err) {
    console.error(err);
    mensaje.textContent = 'Error de red al empezar la lectura';
  }
}

async function cargarLecturas(libroId) {
  const infoLecturas = document.getElementById('info-lecturas');
  const detalle = document.getElementById('lecturas-detalle');

  infoLecturas.textContent = 'Cargando lecturas...';
  detalle.textContent = '';

  try {
    const res = await fetch(`${API_BASE}/api/libros/${libroId}/lecturas`, {
      headers: getHeaders(false)
    });
    const lecturas = await res.json();

    if (!Array.isArray(lecturas) || lecturas.length === 0) {
      infoLecturas.textContent = 'Este libro no tiene lecturas registradas.';
      return;
    }

    infoLecturas.textContent = `Total lecturas registradas: ${lecturas.length}`;

    const texto = lecturas
      .map((l) => {
        return [
          `ID lectura: ${l.id}`,
          `Usuario: ${l.nombre_usuario} (id ${l.usuario_id})`,
          `Estado: ${l.estado}`,
          `Inicio: ${l.inicio}`,
          `Fin: ${l.fin || '—'}`,
          `Página actual: ${l.pagina_actual || '—'}`,
          `Valoración: ${l.valoracion || '—'}`,
          `Notas: ${l.notas || '—'}`,
          '---------------------------'
        ].join('\n');
      })
      .join('\n');

    detalle.textContent = texto;
  } catch (err) {
    console.error(err);
    infoLecturas.textContent = 'Error al cargar las lecturas.';
  }
}

async function crearPrestamo(libroId, ejemplarId) {
  const mensaje = document.getElementById('mensaje');

  mensaje.textContent = '';

  if (!token || !usuarioActual) {
    mensaje.textContent = 'Debes iniciar sesión para prestar libros';
    return;
  }

  const receptorIdStr = prompt(
    'ID del usuario receptor (si usa la app). Deja vacío si es alguien externo.'
  );
  let usuarioReceptorId = null;
  let nombreReceptor = null;

  if (receptorIdStr && receptorIdStr.trim() !== '') {
    usuarioReceptorId = Number(receptorIdStr);
    if (Number.isNaN(usuarioReceptorId)) {
      alert('ID de usuario receptor no válido');
      return;
    }
  } else {
    nombreReceptor = prompt('Nombre de la persona a la que prestas el libro:');
  }

  const fechaLimiteStr = prompt(
    'Fecha límite de devolución (YYYY-MM-DD, opcional):'
  );
  const notas = prompt('Notas del préstamo (opcional):') || null;

  try {
    const res = await fetch(`${API_BASE}/api/prestamos`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        ejemplar_id: Number(ejemplarId),
        usuario_prestador_id: usuarioActual.id, // de momento sigue yendo en el body
        usuario_receptor_id: usuarioReceptorId || null,
        nombre_receptor: nombreReceptor || null,
        fecha_limite: fechaLimiteStr || null,
        notas
      })
    });

    const data = await res.json();

    if (!res.ok) {
      mensaje.textContent = `Error al crear el préstamo: ${data.error || 'Error desconocido'}`;
      return;
    }

    mensaje.textContent = 'Préstamo creado ✅';

    await cargarPrestamos(libroId);
  } catch (err) {
    console.error(err);
    mensaje.textContent = 'Error de red al crear el préstamo';
  }
}

async function cargarPrestamos(libroId) {
  const info = document.getElementById('info-prestamos');
  const tbody = document.querySelector('#tabla-prestamos tbody');

  info.textContent = 'Cargando préstamos...';
  tbody.innerHTML = '';

  try {
    const res = await fetch(`${API_BASE}/api/libros/${libroId}/prestamos`, {
      headers: getHeaders(false)
    });
    const prestamos = await res.json();

    if (!Array.isArray(prestamos) || prestamos.length === 0) {
      info.textContent = 'Este libro no tiene préstamos registrados.';
      return;
    }

    info.textContent = `Total préstamos registrados: ${prestamos.length}`;

    for (const p of prestamos) {
      const tr = document.createElement('tr');

      const nombreReceptor =
        p.nombre_receptor_usuario ||
        p.nombre_receptor ||
        '—';

      tr.innerHTML = `
        <td>${p.id}</td>
        <td>${p.nombre_prestador || ''}</td>
        <td>${nombreReceptor}</td>
        <td>${p.fecha_prestamo || ''}</td>
        <td>${p.fecha_limite || ''}</td>
        <td>${p.fecha_devolucion || ''}</td>
        <td>${p.estado || ''}</td>
        <td>${p.notas || ''}</td>
        <td>
          ${
            p.estado !== 'devuelto'
              ? `<button 
                  class="btn-devolver" 
                  data-prestamo-id="${p.id}" 
                  data-libro-id="${libroId}"
                 >
                 Marcar devuelto
                 </button>`
              : '—'
          }
        </td>
      `;

      tbody.appendChild(tr);
    }
  } catch (err) {
    console.error(err);
    info.textContent = 'Error al cargar los préstamos.';
  }
}

async function marcarPrestamoDevuelto(prestamoId, libroId) {
  const mensaje = document.getElementById('mensaje');
  const notas = prompt('Notas sobre la devolución (opcional):') || null;

  try {
    const res = await fetch(`${API_BASE}/api/prestamos/${prestamoId}/devolver`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ notas })
    });

    const data = await res.json();

    if (!res.ok) {
      mensaje.textContent = `Error al marcar como devuelto: ${data.error || 'Error desconocido'}`;
      return;
    }

    mensaje.textContent = 'Préstamo marcado como devuelto ✅';

    await cargarPrestamos(libroId);
  } catch (err) {
    console.error(err);
    mensaje.textContent = 'Error de red al actualizar el préstamo';
  }
}
async function marcarPrestamoDevueltoGlobal() {
  const mensaje = document.getElementById('mensaje');

  if (!token || !usuarioActual) {
    mensaje.textContent = 'Debes iniciar sesión para actualizar préstamos';
    return;
  }

  if (!libroSeleccionadoId) {
    mensaje.textContent = 'Selecciona primero un ejemplar en la tabla.';
    return;
  }

  try {
    const res = await fetch(
      `${API_BASE}/api/libros/${libroSeleccionadoId}/prestamos`,
      { headers: getHeaders(false) }
    );
    const prestamos = await res.json();

    if (!res.ok) {
      mensaje.textContent = prestamos.error || 'Error cargando préstamos.';
      return;
    }

    if (!Array.isArray(prestamos) || prestamos.length === 0) {
      mensaje.textContent = 'Este libro no tiene préstamos registrados.';
      return;
    }

    // último préstamo activo del usuario prestador actual
    const prestamoActivo = prestamos.find(
      (p) =>
        p.estado !== 'devuelto' &&
        p.usuario_prestador_id === usuarioActual.id
    );

    if (!prestamoActivo) {
      mensaje.textContent =
        'No tienes ningún préstamo activo para este libro.';
      return;
    }

    const confirmar = confirm(
      `¿Marcar como devuelto el préstamo #${prestamoActivo.id}?`
    );
    if (!confirmar) return;

    const notas = prompt('Notas sobre la devolución (opcional):') || null;

    const resDev = await fetch(
      `${API_BASE}/api/prestamos/${prestamoActivo.id}/devolver`,
      {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ notas }),
      }
    );

    const dataDev = await resDev.json();

    if (!resDev.ok) {
      mensaje.textContent =
        dataDev.error || 'Error al marcar el préstamo como devuelto.';
      return;
    }

    mensaje.textContent = 'Préstamo marcado como devuelto ✅';
    await cargarPrestamos(libroSeleccionadoId);
  } catch (err) {
    console.error(err);
    mensaje.textContent = 'Error de red al marcar préstamo como devuelto.';
  }
}

// ---------- Escaneo de código de barras ----------

async function iniciarEscaneo() {
  const scannerDiv = document.getElementById('scanner');
  const video = document.getElementById('video');
  const mensaje = document.getElementById('mensaje');

  mensaje.textContent = '';
  scannerDiv.style.display = 'block';

  try {
    const constraints = {
      video: {
        facingMode: 'environment'
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;
    video.srcObject = stream;
    video.setAttribute('playsinline', true);
    await video.play();

    const { BrowserMultiFormatReader } = ZXing;
    codeReader = new BrowserMultiFormatReader();

    codeReader.decodeFromVideoDevice(null, video, (result, err) => {
      if (result) {
        console.log('Código detectado:', result.text);
        document.getElementById('isbn').value = result.text;
        mensaje.textContent = `Código detectado: ${result.text}`;

        detenerEscaneo();
      }
    });
  } catch (error) {
    console.error(error);
    mensaje.textContent = 'No se pudo acceder a la cámara';
    scannerDiv.style.display = 'none';
  }
}

function detenerEscaneo() {
  const scannerDiv = document.getElementById('scanner');

  if (codeReader) {
    try {
      codeReader.reset();
    } catch (e) {
      console.warn('Error al resetear codeReader', e);
    }
    codeReader = null;
  }

  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }

  scannerDiv.style.display = 'none';
}
async function eliminarEjemplar(ejemplarId) {
  const mensaje = document.getElementById('mensaje');

  if (!token || !usuarioActual) {
    mensaje.textContent = 'Debes iniciar sesión para eliminar ejemplares';
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
      mensaje.textContent = data.error || 'Error eliminando ejemplar';
      return;
    }

    mensaje.textContent = 'Ejemplar eliminado ✅';

    // recargar la lista
    await cargarEjemplares(usuarioActual.id);
  } catch (err) {
    console.error(err);
    mensaje.textContent = 'Error de red al eliminar ejemplar';
  }
}
async function cargarFormEdicion() {
  const msg = document.getElementById('edit-mensaje');
  if (!libroSeleccionadoId || !ejemplarSeleccionadoId) {
    if (msg) msg.textContent = 'Selecciona un ejemplar en la tabla para editar.';
    return;
  }

  if (msg) msg.textContent = '';

  try {
    const [resLibro, resEjemplar] = await Promise.all([
      fetch(`${API_BASE}/api/libros/${libroSeleccionadoId}`, {
        headers: getHeaders(false),
      }),
      fetch(`${API_BASE}/api/ejemplares/${ejemplarSeleccionadoId}`, {
        headers: getHeaders(false),
      }),
    ]);

    const libro = await resLibro.json();
    const ejemplar = await resEjemplar.json();

    if (!resLibro.ok) {
      msg.textContent = libro.error || 'Error cargando datos del libro.';
      return;
    }
    if (!resEjemplar.ok) {
      msg.textContent = ejemplar.error || 'Error cargando datos del ejemplar.';
      return;
    }

    // Libro
    document.getElementById('edit-libro-titulo').value =
      libro.titulo || '';
    document.getElementById('edit-libro-autores').value =
      libro.autores || '';
    document.getElementById('edit-libro-editorial').value =
      libro.editorial || '';
    document.getElementById('edit-libro-fecha').value =
      libro.fecha_publicacion || '';
    document.getElementById('edit-libro-paginas').value =
      libro.numero_paginas || '';
    document.getElementById('edit-libro-portada').value =
      libro.url_portada || '';
    document.getElementById('edit-libro-descripcion').value =
      libro.descripcion || '';

    // Ejemplar
    document.getElementById('edit-ejemplar-estado').value =
      ejemplar.estado || '';
    document.getElementById('edit-ejemplar-ubicacion').value =
      ejemplar.ubicacion || '';
    document.getElementById('edit-ejemplar-notas').value =
      ejemplar.notas || '';
  } catch (err) {
    console.error(err);
    if (msg) msg.textContent = 'Error de red al cargar datos de edición.';
  }
}
async function guardarLibroEditado() {
  const msg = document.getElementById('edit-mensaje');
  msg.textContent = '';

  if (!token || !usuarioActual) {
    msg.textContent = 'Debes iniciar sesión para editar libros.';
    return;
  }

  if (!libroSeleccionadoId) {
    msg.textContent = 'Selecciona un libro desde la tabla de ejemplares.';
    return;
  }

  const titulo = document.getElementById('edit-libro-titulo').value.trim();
  const autores = document.getElementById('edit-libro-autores').value.trim();
  const editorial = document
    .getElementById('edit-libro-editorial')
    .value.trim();
  const fecha_publicacion = document
    .getElementById('edit-libro-fecha')
    .value.trim();
  const paginasStr = document
    .getElementById('edit-libro-paginas')
    .value.trim();
  const url_portada = document
    .getElementById('edit-libro-portada')
    .value.trim();
  const descripcion = document
    .getElementById('edit-libro-descripcion')
    .value.trim();

  const numero_paginas = paginasStr ? Number(paginasStr) : null;

  try {
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
        url_portada: url_portada || null,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      msg.textContent = data.error || 'Error guardando datos del libro.';
      return;
    }

    msg.textContent = 'Datos del libro guardados ✅';

    // recargar la tabla para reflejar cambios de título/autores
    if (usuarioActual) {
      cargarEjemplares(usuarioActual.id);
    }
  } catch (err) {
    console.error(err);
    msg.textContent = 'Error de red al guardar datos del libro.';
  }
}

async function guardarEjemplarEditado() {
  const msg = document.getElementById('edit-mensaje');
  msg.textContent = '';

  if (!token || !usuarioActual) {
    msg.textContent = 'Debes iniciar sesión para editar ejemplares.';
    return;
  }

  if (!ejemplarSeleccionadoId) {
    msg.textContent = 'Selecciona un ejemplar desde la tabla.';
    return;
  }

  const estado = document
    .getElementById('edit-ejemplar-estado')
    .value.trim();
  const ubicacion = document
    .getElementById('edit-ejemplar-ubicacion')
    .value.trim();
  const notas = document
    .getElementById('edit-ejemplar-notas')
    .value.trim();

  try {
    const res = await fetch(
      `${API_BASE}/api/ejemplares/${ejemplarSeleccionadoId}`,
      {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          estado: estado || null,
          ubicacion: ubicacion || null,
          notas: notas || null,
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      msg.textContent = data.error || 'Error guardando datos del ejemplar.';
      return;
    }

    msg.textContent = 'Datos del ejemplar guardados ✅';

    if (usuarioActual) {
      cargarEjemplares(usuarioActual.id);
    }
  } catch (err) {
    console.error(err);
    msg.textContent = 'Error de red al guardar datos del ejemplar.';
  }
}

// ---------- Inicialización ----------

document.addEventListener('DOMContentLoaded', () => {
  actualizarUIAutenticacion();

  document
    .getElementById('btn-crear')
    .addEventListener('click', crearEjemplar);

  document
    .getElementById('btn-escanear')
    .addEventListener('click', iniciarEscaneo);

  document
    .getElementById('btn-detener')
    .addEventListener('click', detenerEscaneo);

  document
    .getElementById('btn-login')
    .addEventListener('click', hacerLogin);

  document
    .getElementById('btn-logout')
    .addEventListener('click', hacerLogout);
    const btnVerLecturas = document.getElementById('btn-ver-lecturas');
  if (btnVerLecturas) {
    btnVerLecturas.addEventListener('click', () => {
      if (!libroSeleccionadoId) {
        alert('Selecciona primero un ejemplar en la tabla.');
        return;
      }
      cargarLecturas(libroSeleccionadoId);
    });
  }

  const btnTerminarLectura = document.getElementById('btn-terminar-lectura');
  if (btnTerminarLectura) {
    btnTerminarLectura.addEventListener('click', terminarLecturaActual);
  }

  const btnVerPrestamos = document.getElementById('btn-ver-prestamos');
  if (btnVerPrestamos) {
    btnVerPrestamos.addEventListener('click', () => {
      if (!libroSeleccionadoId) {
        alert('Selecciona primero un ejemplar en la tabla.');
        return;
      }
      cargarPrestamos(libroSeleccionadoId);
    });
  }

  const btnMarcarDevueltoGlobal = document.getElementById(
    'btn-marcar-devuelto-global'
  );
  if (btnMarcarDevueltoGlobal) {
    btnMarcarDevueltoGlobal.addEventListener(
      'click',
      marcarPrestamoDevueltoGlobal
    );
  }

  const btnGuardarLibro = document.getElementById('btn-guardar-libro');
  if (btnGuardarLibro) {
    btnGuardarLibro.addEventListener('click', guardarLibroEditado);
  }

  const btnGuardarEjemplar = document.getElementById('btn-guardar-ejemplar');
  if (btnGuardarEjemplar) {
    btnGuardarEjemplar.addEventListener('click', guardarEjemplarEditado);
  }
  // Eventos delegados en la tabla de ejemplares
  const tbodyEjemplares = document.querySelector('#tabla-ejemplares tbody');
  tbodyEjemplares.addEventListener('click', (e) => {
  const target = e.target;
  const fila = target.closest('tr');

  if (fila) {
    libroSeleccionadoId = fila.dataset.libroId
      ? Number(fila.dataset.libroId)
      : null;
    ejemplarSeleccionadoId = fila.dataset.ejemplarId
      ? Number(fila.dataset.ejemplarId)
      : null;

    Array.from(tbodyEjemplares.querySelectorAll('tr')).forEach((tr) =>
      tr.classList.remove('fila-seleccionada')
    );
    fila.classList.add('fila-seleccionada');

    cargarFormEdicion();
  }

  if (target.classList.contains('btn-leer')) {
    const libroId = target.getAttribute('data-libro-id');
    const ejemplarId = target.getAttribute('data-ejemplar-id');
    empezarLectura(libroId, ejemplarId);
  }

  if (target.classList.contains('btn-prestar')) {
    const libroId = target.getAttribute('data-libro-id');
    const ejemplarId = target.getAttribute('data-ejemplar-id');
    crearPrestamo(libroId, ejemplarId);
  }

  if (target.classList.contains('btn-eliminar')) {
    const ejemplarId = target.getAttribute('data-ejemplar-id');
    eliminarEjemplar(ejemplarId);
  }
});


  // Eventos delegados en la tabla de préstamos
  const tbodyPrestamos = document.querySelector('#tabla-prestamos tbody');
  tbodyPrestamos.addEventListener('click', (e) => {
    const target = e.target;

    if (target.classList.contains('btn-devolver')) {
      const prestamoId = target.getAttribute('data-prestamo-id');
      const libroId = target.getAttribute('data-libro-id');
      marcarPrestamoDevuelto(prestamoId, libroId);
    }
  });
});
async function terminarLecturaActual() {
  const mensaje = document.getElementById('mensaje');

  if (!token || !usuarioActual) {
    mensaje.textContent = 'Debes iniciar sesión para terminar una lectura';
    return;
  }

  if (!libroSeleccionadoId) {
    mensaje.textContent = 'Selecciona primero un ejemplar en la tabla.';
    return;
  }

  try {
    const res = await fetch(
      `${API_BASE}/api/libros/${libroSeleccionadoId}/lecturas`,
      {
        headers: getHeaders(false),
      }
    );
    const lecturas = await res.json();

    if (!res.ok) {
      mensaje.textContent = lecturas.error || 'Error cargando lecturas.';
      return;
    }

    if (!Array.isArray(lecturas) || lecturas.length === 0) {
      mensaje.textContent = 'Este libro no tiene lecturas registradas.';
      return;
    }

    // buscamos la lectura ACTIVA del usuario actual
    const lecturaActiva = lecturas.find(
      (l) => l.usuario_id === usuarioActual.id && l.estado !== 'terminado'
    );

    if (!lecturaActiva) {
      mensaje.textContent = 'No tienes ninguna lectura activa para este libro.';
      return;
    }

    const paginaStr = prompt('Última página leída (opcional):');
    const valoracionStr = prompt('Valoración (1-5, opcional):');
    const notas = prompt('Notas sobre la lectura (opcional):') || null;

    let pagina_actual = paginaStr ? Number(paginaStr) : null;
    if (Number.isNaN(pagina_actual)) pagina_actual = null;

    let valoracion = valoracionStr ? Number(valoracionStr) : null;
    if (Number.isNaN(valoracion)) valoracion = null;

    const resFin = await fetch(
      `${API_BASE}/api/lecturas/${lecturaActiva.id}/finalizar`,
      {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ pagina_actual, valoracion, notas }),
      }
    );

    const dataFin = await resFin.json();

    if (!resFin.ok) {
      mensaje.textContent =
        dataFin.error || 'Error al marcar la lectura como terminada.';
      return;
    }

    mensaje.textContent = 'Lectura marcada como terminada ✅';
    await cargarLecturas(libroSeleccionadoId);
  } catch (err) {
    console.error(err);
    mensaje.textContent = 'Error de red al terminar la lectura.';
  }
}
