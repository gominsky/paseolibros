const API_BASE = 'http://localhost:3011'; // ajusta puerto si cambias

let codeReader = null;
let currentStream = null;

async function cargarUsuarios() {
  const select = document.getElementById('usuario');
  select.innerHTML = '<option value="">Cargando...</option>';

  try {
    const res = await fetch(`${API_BASE}/api/usuarios`);
    const usuarios = await res.json();

    select.innerHTML = '<option value="">-- Selecciona usuario --</option>';
    for (const u of usuarios) {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = u.nombre_usuario;
      select.appendChild(opt);
    }
  } catch (err) {
    console.error(err);
    select.innerHTML = '<option value="">Error cargando usuarios</option>';
  }
}

async function cargarEjemplares(usuarioId) {
  const info = document.getElementById('info-ejemplares');
  const tbody = document.querySelector('#tabla-ejemplares tbody');

  tbody.innerHTML = '';
  if (!usuarioId) {
    info.textContent = 'Selecciona un usuario para ver sus ejemplares.';
    return;
  }

  info.textContent = 'Cargando ejemplares...';

  try {
    const res = await fetch(`${API_BASE}/api/usuarios/${usuarioId}/ejemplares`);
    const ejemplares = await res.json();

    if (!Array.isArray(ejemplares) || ejemplares.length === 0) {
      info.textContent = 'Este usuario no tiene ejemplares todavía.';
      return;
    }

    info.textContent = `Total ejemplares: ${ejemplares.length}`;

    for (const e of ejemplares) {
      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td>${e.ejemplar_id}</td>
        <td>${e.titulo || ''}</td>
        <td>${e.isbn || ''}</td>
        <td>${e.estado || ''}</td>
        <td>${e.ubicacion || ''}</td>
        <td>${e.notas || ''}</td>
        <td>
          <button 
            class="btn-leer" 
            data-libro-id="${e.libro_id}" 
            data-ejemplar-id="${e.ejemplar_id}"
          >
            Empezar lectura
          </button>
          <button 
            class="btn-ver-lecturas" 
            data-libro-id="${e.libro_id}"
          >
            Ver lecturas
          </button>
          <button
            class="btn-prestar"
            data-libro-id="${e.libro_id}"
            data-ejemplar-id="${e.ejemplar_id}"
          >
            Prestar
          </button>
          <button
            class="btn-ver-prestamos"
            data-libro-id="${e.libro_id}"
          >
            Ver préstamos
          </button>
        </td>
      `;

      tbody.appendChild(tr);
    }
  } catch (err) {
    console.error(err);
    info.textContent = 'Error al cargar los ejemplares.';
  }
}

async function crearEjemplar() {
  const usuarioId = document.getElementById('usuario').value;
  const isbn = document.getElementById('isbn').value.trim();
  const ubicacion = document.getElementById('ubicacion').value.trim();
  const notas = document.getElementById('notas').value.trim();
  const mensaje = document.getElementById('mensaje');
  const resultado = document.getElementById('resultado');

  mensaje.textContent = '';
  resultado.textContent = '';

  if (!usuarioId) {
    mensaje.textContent = 'Selecciona un usuario';
    return;
  }
  if (!isbn) {
    mensaje.textContent = 'Introduce un ISBN (o escanéalo)';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/ejemplares`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        usuario_id: Number(usuarioId),
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

    await cargarEjemplares(usuarioId);
  } catch (err) {
    console.error(err);
    mensaje.textContent = 'Error de red al crear el ejemplar';
  }
}

// ---------- LECTURAS ----------

async function empezarLectura(libroId, ejemplarId, usuarioId) {
  const mensaje = document.getElementById('mensaje');

  mensaje.textContent = '';

  if (!usuarioId) {
    mensaje.textContent = 'Selecciona un usuario antes de empezar una lectura.';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/lecturas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        usuario_id: Number(usuarioId),
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
    const res = await fetch(`${API_BASE}/api/libros/${libroId}/lecturas`);
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

// ---------- PRÉSTAMOS ----------

async function crearPrestamo(libroId, ejemplarId, usuarioPrestadorId) {
  const mensaje = document.getElementById('mensaje');

  mensaje.textContent = '';

  if (!usuarioPrestadorId) {
    mensaje.textContent = 'Selecciona un usuario (propietario) antes de prestar.';
    return;
  }

  // Esto es simple con prompts; más adelante se puede hacer un formulario bonito
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
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ejemplar_id: Number(ejemplarId),
        usuario_prestador_id: Number(usuarioPrestadorId),
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
    const res = await fetch(`${API_BASE}/api/libros/${libroId}/prestamos`);
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
      headers: {
        'Content-Type': 'application/json'
      },
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

// ---------- Inicialización ----------

document.addEventListener('DOMContentLoaded', () => {
  cargarUsuarios();

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
    .getElementById('usuario')
    .addEventListener('change', (e) => {
      const usuarioId = e.target.value;
      cargarEjemplares(usuarioId);
    });

  // delegación de eventos en la tabla de ejemplares
  const tbodyEjemplares = document.querySelector('#tabla-ejemplares tbody');
  tbodyEjemplares.addEventListener('click', (e) => {
    const target = e.target;

    if (target.classList.contains('btn-leer')) {
      const libroId = target.getAttribute('data-libro-id');
      const ejemplarId = target.getAttribute('data-ejemplar-id');
      const usuarioId = document.getElementById('usuario').value;
      empezarLectura(libroId, ejemplarId, usuarioId);
    }

    if (target.classList.contains('btn-ver-lecturas')) {
      const libroId = target.getAttribute('data-libro-id');
      cargarLecturas(libroId);
    }

    if (target.classList.contains('btn-prestar')) {
      const libroId = target.getAttribute('data-libro-id');
      const ejemplarId = target.getAttribute('data-ejemplar-id');
      const usuarioId = document.getElementById('usuario').value;
      crearPrestamo(libroId, ejemplarId, usuarioId);
    }

    if (target.classList.contains('btn-ver-prestamos')) {
      const libroId = target.getAttribute('data-libro-id');
      cargarPrestamos(libroId);
    }
  });

  // delegación de eventos en la tabla de préstamos
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


