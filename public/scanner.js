// scanner.js — Escáner de ISBN (EAN-13) para PaseoLibros
// ------------------------------------------------------------------
// Único módulo de escaneo de la app (main.js ya no tiene escáner propio).
//
// Mejoras respecto a la versión anterior:
//  · Solo lee EAN-13 con prefijo 978/979 y dígito de control válido
//    (antes aceptaba cualquier código de 13 dígitos → lecturas falsas).
//  · Exige 2 lecturas idénticas seguidas antes de aceptar.
//  · Analiza ~10 fotogramas/seg sobre un recorte central reducido,
//    en vez de procesar 1080p a 60 fps (calentaba el móvil y lo ralentizaba).
//  · Elige la cámara trasera principal (evita el gran angular, que no enfoca de cerca)
//    y recuerda la elección para la próxima vez.
//  · Linterna APAGADA por defecto (con reflejos sobre portadas brillantes no lee):
//    ahora hay un botón para encenderla si hace falta.
//  · ZXing se carga solo cuando hace falta (iPhone / navegadores sin BarcodeDetector),
//    no bloquea la carga de la página.
//  · Botón "Cancelar" visible en móvil, vibración al detectar y liberación
//    de la cámara al cambiar de app / pestaña.
// ------------------------------------------------------------------
(() => {
  'use strict';

  const ZXING_URLS = [
    'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js',
    'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js',
  ];
  const CAMERA_KEY = 'paseolibros_scanner_camera';
  const SCAN_INTERVAL_MS = 100;   // ~10 análisis por segundo
  const LECTURAS_IGUALES = 2;     // lecturas idénticas necesarias
  const MAX_LADO = 1280;          // resolución máxima de análisis

  const $ = (id) => document.getElementById(id);

  // ---------- Mensajes (usa las funciones globales de main.js si existen) ----------
  const statusOk = (m) => (typeof window.setUserStatusOk === 'function' ? window.setUserStatusOk(m) : null);
  const statusErr = (m) => (typeof window.setUserStatusErr === 'function' ? window.setUserStatusErr(m) : alert(m));

  function setBoton(on) {
    if (typeof window.setScanButtonState === 'function') return window.setScanButtonState(on);
    const btn = $('btn-escanear');
    if (!btn) return;
    btn.dataset.scanning = on ? '1' : '0';
    btn.textContent = on ? 'Detener' : 'Escanear';
  }

  // ---------- Validación ISBN ----------
  function eanValido(code) {
    if (!/^\d{13}$/.test(code)) return false;
    let suma = 0;
    for (let i = 0; i < 12; i++) suma += Number(code[i]) * (i % 2 ? 3 : 1);
    return (10 - (suma % 10)) % 10 === Number(code[12]);
  }

  function extraerISBN(texto) {
    const d = String(texto || '').replace(/\D/g, '');
    for (let i = 0; i + 13 <= d.length; i++) {
      const c = d.slice(i, i + 13);
      if ((c.startsWith('978') || c.startsWith('979')) && eanValido(c)) return c;
    }
    return null;
  }

  // ---------- Estado ----------
  const st = {
    activo: false,
    stream: null,
    track: null,
    timer: null,
    motor: null,           // 'native' | 'zxing'
    detector: null,
    zx: null,              // { reader, hints, Z }
    ultimo: null,
    repeticiones: 0,
    tick: 0,
    canvas: null,
    ctx: null,
    linterna: false,
    ui: null,
  };

  // ---------- UI dentro de #scanner (marco guía + botones) ----------
  function prepararUI() {
    const cont = $('scanner');
    const video = $('video');
    if (!cont || !video) return null;
    if (st.ui) return st.ui;

    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    video.muted = true;
    video.autoplay = true;

    // Envoltorio para poder superponer el marco sobre el vídeo
    let wrap = cont.querySelector('.scanner-stage');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'scanner-stage';
      video.parentNode.insertBefore(wrap, video);
      wrap.appendChild(video);
      const marco = document.createElement('div');
      marco.className = 'scanner-marco';
      marco.innerHTML = '<span class="scanner-laser"></span>';
      wrap.appendChild(marco);
    }

    let barra = cont.querySelector('.scanner-acciones');
    if (!barra) {
      barra = document.createElement('div');
      barra.className = 'scanner-acciones';
      barra.innerHTML = `
        <button type="button" class="btn btn-secondary scanner-btn-luz" hidden>${window.icono ? window.icono('bombilla') : ''} Linterna</button>
        <button type="button" class="btn btn-secondary scanner-btn-cancelar">Cancelar</button>`;
      cont.appendChild(barra);
      barra.querySelector('.scanner-btn-cancelar').addEventListener('click', () => stop());
      barra.querySelector('.scanner-btn-luz').addEventListener('click', alternarLinterna);
    }

    st.ui = {
      cont,
      video,
      texto: cont.querySelector('.scanner-text'),
      btnLuz: barra.querySelector('.scanner-btn-luz'),
    };
    return st.ui;
  }

  const mensaje = (t) => { if (st.ui?.texto) st.ui.texto.textContent = t; };

  // ---------- Cámara ----------
  const MALA_CAMARA = /ultra|0[.,]5|tele|depth|infrared|\bir\b|macro|front|frontal|user/i;

  async function abrirCamara(deviceId) {
    const video = deviceId
      ? { deviceId: { exact: deviceId } }
      : { facingMode: { ideal: 'environment' } };
    Object.assign(video, { width: { ideal: 1280 }, height: { ideal: 720 } });
    return navigator.mediaDevices.getUserMedia({ video, audio: false });
  }

  // Tras tener permiso (las etiquetas ya son visibles), busca la cámara trasera principal
  async function mejorCamaraTrasera(actualLabel) {
    try {
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      const traseras = devs.filter((d) => /back|rear|trasera|environment|facing back/i.test(d.label));
      if (traseras.length < 2) return null;
      // Android: "camera2 0, facing back" suele ser la principal
      const principal = traseras.find((d) => /camera2 0\b|\b0, facing back/i.test(d.label))
        || traseras.find((d) => !MALA_CAMARA.test(d.label));
      if (!principal || principal.label === actualLabel) return null;
      return principal.deviceId;
    } catch {
      return null;
    }
  }

  async function ajustarCamara(track) {
    try {
      const caps = track.getCapabilities?.() || {};
      const adv = [];
      if (caps.focusMode?.includes('continuous')) adv.push({ focusMode: 'continuous' });
      // Un poco de zoom permite separar el móvil del libro, donde la cámara sí enfoca
      if (caps.zoom && caps.zoom.max >= 1.5) adv.push({ zoom: Math.max(caps.zoom.min || 1, 1.5) });
      if (adv.length) await track.applyConstraints({ advanced: adv });
      if (st.ui?.btnLuz) st.ui.btnLuz.hidden = !caps.torch;
    } catch { /* no todos los navegadores lo soportan */ }
  }

  async function alternarLinterna() {
    if (!st.track) return;
    st.linterna = !st.linterna;
    try {
      await st.track.applyConstraints({ advanced: [{ torch: st.linterna }] });
      st.ui.btnLuz.classList.toggle('is-on', st.linterna);
    } catch {
      st.linterna = false;
    }
  }

  // ---------- Motores de lectura ----------
  function cargarScript(src) {
    return new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = ok;
      s.onerror = () => { s.remove(); ko(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(s);
    });
  }

  let zxingPromesa = null;
  function cargarZXing() {
    if (window.ZXing?.MultiFormatReader) return Promise.resolve(window.ZXing);
    if (!zxingPromesa) {
      zxingPromesa = (async () => {
        for (const url of ZXING_URLS) {
          try { await cargarScript(url); if (window.ZXing) return window.ZXing; } catch { /* siguiente */ }
        }
        zxingPromesa = null;
        throw new Error('No se pudo cargar el lector de códigos');
      })();
    }
    return zxingPromesa;
  }

  async function prepararMotor() {
    if ('BarcodeDetector' in window) {
      try {
        const formatos = await window.BarcodeDetector.getSupportedFormats();
        if (formatos.includes('ean_13')) {
          st.detector = new window.BarcodeDetector({ formats: ['ean_13'] });
          st.motor = 'native';
          return;
        }
      } catch { /* cae a ZXing */ }
    }
    const Z = await cargarZXing();
    const hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    const reader = new Z.MultiFormatReader();
    reader.setHints(hints);
    st.zx = { Z, reader, hints };
    st.motor = 'zxing';
  }

  // Zona central visible del vídeo (el vídeo usa object-fit: cover)
  function zonaVisible(video) {
    const vw = video.videoWidth, vh = video.videoHeight;
    const ew = video.clientWidth || vw, eh = video.clientHeight || vh;
    const esc = Math.max(ew / vw, eh / vh);
    const w = Math.min(vw, ew / esc), h = Math.min(vh, eh / esc);
    return { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
  }

  // Copia a un canvas un recorte del fotograma (franja central o fotograma entero)
  function capturar(video, franja) {
    const z = zonaVisible(video);
    let sx = z.x, sy = z.y, sw = z.w, sh = z.h;
    if (franja) {
      sw = z.w * 0.9; sh = Math.min(z.h, z.w * 0.45);
      sx = z.x + (z.w - sw) / 2; sy = z.y + (z.h - sh) / 2;
    }
    const k = Math.min(1, MAX_LADO / Math.max(sw, sh));
    const w = Math.round(sw * k), h = Math.round(sh * k);
    if (!st.canvas) {
      st.canvas = document.createElement('canvas');
      st.ctx = st.canvas.getContext('2d', { willReadFrequently: true });
    }
    if (st.canvas.width !== w) st.canvas.width = w;
    if (st.canvas.height !== h) st.canvas.height = h;
    st.ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
    return st.canvas;
  }

  async function leerFotograma(video) {
    st.tick++;
    if (st.motor === 'native') {
      // Alterna franja central (rápida y precisa) y fotograma completo (código descentrado)
      const fuente = st.tick % 3 === 0 ? video : capturar(video, true);
      const r = await st.detector.detect(fuente);
      return r?.length ? r.map((b) => b.rawValue) : [];
    }
    // ZXing: franja central; uno de cada tres intentos con el fotograma completo
    const canvas = capturar(video, st.tick % 3 !== 0);
    const { Z, reader, hints } = st.zx;
    try {
      const fuente = new Z.HTMLCanvasElementLuminanceSource(canvas);
      const res = reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(fuente)), hints);
      return res?.getText ? [res.getText()] : [];
    } catch {
      return []; // NotFoundException: no hay código en este fotograma
    } finally {
      try { reader.reset(); } catch { /* nada */ }
    }
  }

  function aceptar(isbn) {
    const input = $('isbn');
    if (input) {
      input.value = isbn;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    try { navigator.vibrate?.(80); } catch { /* nada */ }
    statusOk(`ISBN detectado: ${isbn}`);
    stop();
    // Lleva al usuario al formulario tras cerrar el overlay
    setTimeout(() => $('ubicacion')?.focus({ preventScroll: false }), 50);
  }

  function bucle() {
    if (!st.activo) return;
    const video = st.ui.video;
    const t0 = performance.now();

    const seguir = () => {
      if (!st.activo) return;
      const espera = Math.max(0, SCAN_INTERVAL_MS - (performance.now() - t0));
      st.timer = setTimeout(bucle, espera);
    };

    if (video.readyState < 2 || !video.videoWidth) return seguir();

    leerFotograma(video)
      .then((valores) => {
        if (!st.activo) return;
        const isbn = valores.map(extraerISBN).find(Boolean);
        if (!isbn) {
          if (valores.length) mensaje('Código leído pero no es un ISBN. Prueba con el código del libro.');
          return;
        }
        if (isbn === st.ultimo) st.repeticiones++;
        else { st.ultimo = isbn; st.repeticiones = 1; }
        mensaje(`Leyendo… ${isbn}`);
        if (st.repeticiones >= LECTURAS_IGUALES) aceptar(isbn);
      })
      .catch(() => { /* fotograma fallido, se reintenta */ })
      .finally(seguir);
  }

  // ---------- API ----------
  async function start() {
    const ui = prepararUI();
    if (!ui || st.activo) return;

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      statusErr('La cámara requiere HTTPS y un navegador compatible.');
      return;
    }

    st.activo = true;
    st.ultimo = null;
    st.repeticiones = 0;
    st.tick = 0;
    st.linterna = false;
    ui.cont.style.display = 'block';
    document.body.classList.add('scanner-abierto');
    setBoton(true);
    mensaje('Abriendo cámara…');

    try {
      // Motor y cámara en paralelo: la carga de ZXing no retrasa la cámara
      const motorListo = prepararMotor();

      let guardada = null;
      try { guardada = localStorage.getItem(CAMERA_KEY); } catch { /* nada */ }

      let stream = null;
      if (guardada) {
        try { stream = await abrirCamara(guardada); } catch { stream = null; }
      }
      if (!stream) {
        stream = await abrirCamara(null);
        const label = stream.getVideoTracks()[0]?.label || '';
        const mejor = await mejorCamaraTrasera(label);
        if (mejor) {
          try {
            const alt = await abrirCamara(mejor);
            stream.getTracks().forEach((t) => t.stop());
            stream = alt;
          } catch { /* nos quedamos con la primera */ }
        }
      }
      if (!st.activo) { stream.getTracks().forEach((t) => t.stop()); return; }

      st.stream = stream;
      st.track = stream.getVideoTracks()[0];
      try {
        const id = st.track.getSettings?.().deviceId;
        if (id) localStorage.setItem(CAMERA_KEY, id);
      } catch { /* nada */ }

      ui.video.srcObject = stream;
      await ui.video.play().catch(() => {});
      await ajustarCamara(st.track);

      mensaje('Preparando lector…');
      await motorListo;
      if (!st.activo) return;

      mensaje('Centra el código de barras dentro del recuadro');
      bucle();
    } catch (e) {
      console.error('[scanner]', e);
      const n = e?.name;
      const texto = n === 'NotAllowedError' ? 'Permiso de cámara denegado. Actívalo en los ajustes del navegador.'
        : n === 'NotFoundError' ? 'No se ha encontrado ninguna cámara.'
        : n === 'NotReadableError' ? 'La cámara está en uso por otra aplicación.'
        : (e?.message || 'No se pudo iniciar la cámara.');
      statusErr(texto);
      stop();
    }
  }

  function stop() {
    st.activo = false;
    clearTimeout(st.timer);
    st.timer = null;
    if (st.stream) {
      try { st.stream.getTracks().forEach((t) => t.stop()); } catch { /* nada */ }
    }
    st.stream = null;
    st.track = null;
    st.detector = null;
    if (st.ui) {
      try { st.ui.video.pause(); } catch { /* nada */ }
      st.ui.video.srcObject = null;
      st.ui.cont.style.display = 'none';
      if (st.ui.btnLuz) { st.ui.btnLuz.hidden = true; st.ui.btnLuz.classList.remove('is-on'); }
    }
    document.body.classList.remove('scanner-abierto');
    setBoton(false);
  }

  function toggle() {
    return st.activo ? stop() : start();
  }

  // Libera la cámara si el usuario cambia de app o pestaña
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && st.activo) stop();
  });
  // Tecla Escape cierra el escáner
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && st.activo) stop();
  });

  window.Scanner = { start, stop, toggle, isRunning: () => st.activo, _extraerISBN: extraerISBN };
})();
