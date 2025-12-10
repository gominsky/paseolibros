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
    cargarLecturasAbiertas();
    cargarPrestamosActivos();
  } else {
    zonaNo.style.display = 'block';
    zonaSi.style.display = 'none';
    nombreSpan.textContent = '';

    if (selectUsuario) {
      selectUsuario.innerHTML = '';
    }

    const info = document.getElementById('info-ejemplares');
    if (info) info.textContent = 'Inicia sesión para ver tus ejemplares.';

    // limpiar paneles globales
    cargarLecturasAbiertas();
    cargarPrestamosActivos();
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
      body: JSON.stringify({ nombre_usuario, contrasena }),
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

// ---------- Modal ficha libro/ejemplar ----------

function abrirModalFicha() {
  const modal = document.getElementById('modal-ficha');
  if (!modal) return;
  modal.classList.add('is-visible');
  document.body.classList.add('no-scroll');

  if (libroSeleccionadoId) {
    cargarLecturas(libroSeleccionadoId);
    cargarPrestamos(libroSeleccionadoId);
  }
}

function cerrarModalFicha() {
  const modal = document.getElementById('modal-ficha');
  if (!modal) return;
  modal.classList.remove('is-visible');
  document.body.classList.remove('no-scroll');
}

async function subirPortadaArchivo(file) {
  const msg = document.getElementById('edit-mensaje');
  if (!libroSeleccionadoId || !file) return;

  if (msg) msg.textContent = 'Subiendo portada...';

  const formData = new FormData();
  formData.append('portada', file);

  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(
      `${API_BASE}/api/libros/${libroSeleccionadoId}/portada`,
      {
        method: 'POST',
        headers,
        body: formData,
      }
    );

    const data = await res.json();

    if (!res.ok) {
      if (msg) msg.textContent = data.error || 'Error subiendo la portada.';
      return;
    }

    if (msg) msg.textContent = 'Portada actualizada ✅';

    if (data.url_portada) {
      const img = document.getElementById('ficha-portada-img');
      if (img) img.src = data.url_portada;
      const portadaInput = document.getElementById('edit-libro-portada');
      if (portadaInput) portadaInput.value = data.url_portada;
    }

    if (usuarioActual) {
      cargarEjemplares(usuarioActual.id);
    }
  } catch (err) {
    console.error(err);
    if (msg) msg.textContent = 'Error de red al subir la portada.';
  }
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
    const res = await fetch(
      `${API_BASE}/api/usuarios/${usuarioId}/ejemplares`,
      {
        headers: getHeaders(false),
      }
    );
    const ejemplares = await res.json();

    if (!Array.isArray(ejemplares) || ejemplares.length === 0) {
      if (info) info.textContent = 'No tienes ejemplares todavía.';
      return;
    }

    if (info) info.textContent = `Total ejemplares: ${ejemplares.length}`;

    for (const e of ejemplares) {
      const tr = document.createElement('tr');

      tr.dataset.libroId = e.libro_id;
      tr.dataset.ejemplarId = e.ejemplar_id;
      tr.dataset.creadoEn = e.creado_en || '';

      tr.innerHTML = `
  <td>
    ${
      e.url_portada
        ? '<img src="' +
          e.url_portada +
          '" alt="Portada" class="portada-mini-img" />'
        : '<div class="portada-placeholder-mini">📚</div>'
    }
  </td>
  <td>${e.titulo || ''}</td>
  <td>${e.autores || ''}</td>
  <td>${e.isbn || ''}</td>
  <td>${e.estado || ''}</td>
  <td>${e.ubicacion || ''}</td>
  <td>${e.notas || ''}</td>
  <td class="celda-acciones">
    <button
      class="icon-btn btn-leer"
      title="Empezar / ver lectura"
      data-libro-id="${e.libro_id}"
      data-ejemplar-id="${e.ejemplar_id}"
    >
      <span class="icon-circle icon-read">▶</span>
    </button>
    <button
      class="icon-btn btn-prestar"
      title="Registrar préstamo"
      data-libro-id="${e.libro_id}"
      data-ejemplar-id="${e.ejemplar_id}"
    >
      <span class="icon-circle icon-loan">⇄</span>
    </button>
    <button
      class="icon-btn btn-eliminar"
      title="Eliminar ejemplar"
      data-ejemplar-id="${e.ejemplar_id}"
    >
      <span class="icon-circle icon-delete">✕</span>
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
        notas: notas || null,
      }),
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
      mensaje.textContent = `Error al empezar la lectura: ${
        data.error || 'Error desconocido'
      }`;
      return;
    }

    mensaje.textContent = 'Lectura iniciada ✅';

    await cargarLecturas(libroId);
    await cargarLecturasAbiertas();
  } catch (err) {
    console.error(err);
    mensaje.textContent = 'Error de red al empezar la lectura';
  }
}

async function cargarLecturas(libroId) {
  const infoLecturas = document.getElementById('info-lecturas');
  const detalle = document.getElementById('lecturas-detalle');

  if (!infoLecturas || !detalle) return;

  infoLecturas.textContent = 'Cargando lecturas...';
  detalle.textContent = '';

  try {
    const res = await fetch(`${API_BASE}/api/libros/${libroId}/lecturas`, {
      headers: getHeaders(false),
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
          '---------------------------',
        ].join('\n');
      })
      .join('\n');

    detalle.textContent = texto;
  } catch (err) {
    console.error(err);
    infoLecturas.textContent = 'Error al cargar las lecturas.';
  }
}
// ---------- Resumen GLOBAL: lecturas y préstamos abiertos ----------

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
    const res = await fetch(
      `${API_BASE}/api/usuarios/${usuarioActual.id}/lecturas-abiertas`,
      { headers: getHeaders(false) }
    );
    const lecturas = await res.json();

    if (!Array.isArray(lecturas) || lecturas.length === 0) {
      info.textContent = 'No tienes lecturas en curso.';
      return;
    }

    const maxFilas = 4;
    const aMostrar = lecturas.slice(0, maxFilas);

    if (lecturas.length > maxFilas) {
      info.textContent = `Lecturas en curso: ${lecturas.length} (mostrando ${maxFilas})`;
    } else {
      info.textContent = `Lecturas en curso: ${lecturas.length}`;
    }

    for (const l of aMostrar) {
      const tr = document.createElement('tr');

      const fecha = l.inicio
        ? new Date(l.inicio).toLocaleDateString('es-ES')
        : '—';

      tr.innerHTML = `
        <td>${l.titulo || 'Sin título'}</td>
        <td>${l.pagina_actual || '—'}</td>
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
    const res = await fetch(
      `${API_BASE}/api/usuarios/${usuarioActual.id}/prestamos-activos`,
      { headers: getHeaders(false) }
    );
    const prestamos = await res.json();

    if (!Array.isArray(prestamos) || prestamos.length === 0) {
      info.textContent = 'No tienes préstamos activos.';
      return;
    }

    const maxFilas = 4;
    const aMostrar = prestamos.slice(0, maxFilas);

    if (prestamos.length > maxFilas) {
      info.textContent = `Préstamos activos: ${prestamos.length} (mostrando ${maxFilas})`;
    } else {
      info.textContent = `Préstamos activos: ${prestamos.length}`;
    }

    for (const p of aMostrar) {
      const tr = document.createElement('tr');

      const nombreReceptor =
        p.nombre_receptor_usuario || p.nombre_receptor || '—';

      const fechaLimite = p.fecha_limite
        ? new Date(p.fecha_limite).toLocaleDateString('es-ES')
        : '—';

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
    await cargarLecturasAbiertas();
  } catch (err) {
    console.error(err);
    mensaje.textContent = 'Error de red al terminar la lectura.';
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
        usuario_prestador_id: usuarioActual.id,
        usuario_receptor_id: usuarioReceptorId || null,
        nombre_receptor: nombreReceptor || null,
        fecha_limite: fechaLimiteStr || null,
        notas,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      mensaje.textContent = `Error al crear el préstamo: ${
        data.error || 'Error desconocido'
      }`;
      return;
    }

    mensaje.textContent = 'Préstamo creado ✅';

    await cargarPrestamos(libroId);
    await cargarPrestamosActivos();
  } catch (err) {
    console.error(err);
    mensaje.textContent = 'Error de red al crear el préstamo';
  }
}

async function cargarPrestamos(libroId) {
  const info = document.getElementById('info-prestamos');
  const tbody = document.querySelector('#tabla-prestamos tbody');

  if (!info || !tbody) return;

  info.textContent = 'Cargando préstamos...';
  tbody.innerHTML = '';

  try {
    const res = await fetch(
      `${API_BASE}/api/libros/${libroId}/prestamos`,
      {
        headers: getHeaders(false),
      }
    );
    const prestamos = await res.json();

    if (!Array.isArray(prestamos) || prestamos.length === 0) {
      info.textContent = 'Este libro no tiene préstamos registrados.';
      return;
    }

    info.textContent = `Total préstamos registrados: ${prestamos.length}`;

    for (const p of prestamos) {
      const tr = document.createElement('tr');

      const nombreReceptor =
        p.nombre_receptor_usuario || p.nombre_receptor || '—';

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
    const res = await fetch(
      `${API_BASE}/api/prestamos/${prestamoId}/devolver`,
      {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ notas }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      mensaje.textContent = `Error al marcar como devuelto: ${
        data.error || 'Error desconocido'
      }`;
      return;
    }

    mensaje.textContent = 'Préstamo marcado como devuelto ✅';

    await cargarPrestamos(libroId);
    await cargarPrestamosActivos();
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

    const prestamoActivo = prestamos.find(
      (p) => p.estado !== 'devuelto' && p.usuario_prestador_id === usuarioActual.id
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
        facingMode: 'environment',
      },
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
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
  }

  scannerDiv.style.display = 'none';
}

// ---------- Eliminar ejemplar ----------

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

    await cargarEjemplares(usuarioActual.id);
  } catch (err) {
    console.error(err);
    mensaje.textContent = 'Error de red al eliminar ejemplar';
  }
}

// ---------- Cargar formulario de edición (para la ficha) ----------

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

    // Cabecera de la ficha (modal)
    const img = document.getElementById('ficha-portada-img');
    if (img) {
      img.src = libro.url_portada || '';
    }

    const tituloSpan = document.getElementById('ficha-titulo');
    if (tituloSpan) {
      tituloSpan.textContent = libro.titulo || 'Sin título';
    }

    const autoresSpan = document.getElementById('ficha-autores');
    if (autoresSpan) {
      autoresSpan.textContent = libro.autores || 'Autor desconocido';
    }

    const isbnSpan = document.getElementById('ficha-isbn');
    if (isbnSpan) {
      isbnSpan.textContent = libro.isbn || '—';
    }

    const creadoSpan = document.getElementById('ficha-creado-en');
    if (creadoSpan) {
      if (ejemplar.creado_en) {
        const fecha = new Date(ejemplar.creado_en);
        creadoSpan.textContent = fecha.toLocaleString('es-ES');
      } else {
        creadoSpan.textContent = '—';
      }
    }
  } catch (err) {
    console.error(err);
    if (msg) msg.textContent = 'Error de red al cargar datos de edición.';
  }
}

// ---------- Guardar libro / ejemplar ----------

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

  // Botones básicos
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

  // Botones dentro de la ficha (modal)
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

  // Modal: cerrar
  const btnCerrarModal = document.getElementById('modal-ficha-cerrar');
  const backdropModal = document.getElementById('modal-ficha-backdrop');

  if (btnCerrarModal) {
    btnCerrarModal.addEventListener('click', cerrarModalFicha);
  }
  if (backdropModal) {
    backdropModal.addEventListener('click', cerrarModalFicha);
  }

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      const modal = document.getElementById('modal-ficha');
      if (modal && modal.classList.contains('is-visible')) {
        cerrarModalFicha();
      }
    }
  });

  // Subida de portada desde fichero
  const inputPortadaFile = document.getElementById('ficha-portada-file');
  if (inputPortadaFile) {
    inputPortadaFile.addEventListener('change', (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;

      const preview = document.getElementById('ficha-portada-img');
      if (preview) {
        preview.src = URL.createObjectURL(file);
      }

      subirPortadaArchivo(file);
    });
  }

  // Buscador dinámico de ejemplares
  const buscador = document.getElementById('buscador-ejemplares');
  if (buscador) {
    buscador.addEventListener('input', () => {
      const q = buscador.value.toLowerCase().trim();
      const tbody = document.querySelector('#tabla-ejemplares tbody');
      if (!tbody) return;

      const filas = tbody.querySelectorAll('tr');
      filas.forEach((tr) => {
        const textoVisible = tr.textContent.toLowerCase();
        const extra =
          (tr.dataset.libroId || '') +
          ' ' +
          (tr.dataset.ejemplarId || '') +
          ' ' +
          (tr.dataset.creadoEn || '');
        const hay = (textoVisible + ' ' + extra.toLowerCase()).includes(q);
        tr.style.display = hay ? '' : 'none';
      });
    });
  }

  // Eventos delegados en la tabla de ejemplares
  const tbodyEjemplares = document.querySelector('#tabla-ejemplares tbody');
  if (tbodyEjemplares) {
    tbodyEjemplares.addEventListener('click', (e) => {
      const target = e.target;
      const fila = target.closest('tr');
      // botón real de acción (aunque hagas click en el <span> interno)
      const botonAccion = target.closest('.btn-leer, .btn-prestar, .btn-eliminar');
  
      if (!fila) return;
  
      // Actualizar selección de fila SIEMPRE que se haga click en ella
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
  
      // Si el click es en un botón de acción → NO abrir modal, solo hacer la acción
      if (botonAccion) {
        e.stopPropagation();
  
        if (botonAccion.classList.contains('btn-leer')) {
          const libroId = botonAccion.getAttribute('data-libro-id');
          const ejemplarId = botonAccion.getAttribute('data-ejemplar-id');
          empezarLectura(libroId, ejemplarId);
        }
  
        if (botonAccion.classList.contains('btn-prestar')) {
          const libroId = botonAccion.getAttribute('data-libro-id');
          const ejemplarId = botonAccion.getAttribute('data-ejemplar-id');
          crearPrestamo(libroId, ejemplarId);
        }
  
        if (botonAccion.classList.contains('btn-eliminar')) {
          const ejemplarId = botonAccion.getAttribute('data-ejemplar-id');
          eliminarEjemplar(ejemplarId);
        }
  
        return; // importante: no abrir modal
      }
  
      // Si NO es un botón de acción (click en cualquier otra celda) → abrir modal
      cargarFormEdicion();
      abrirModalFicha();
    });
  }
  
});
