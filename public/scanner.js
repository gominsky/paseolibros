// scanner.js
(() => {
  // --- Helpers (fallbacks a prueba de fallos) ---
  const getEl = (id) => document.getElementById(id);

  function setUserStatus(msg) {
    // usa tu función global si existe
    if (typeof window.setUserStatus === 'function') return window.setUserStatus(msg);
    // fallback mínimo
    const el = getEl('user-status-msg');
    if (el) el.textContent = msg || '';
  }
  function setUserStatusOk(msg) {
    if (typeof window.setUserStatusOk === 'function') return window.setUserStatusOk(msg);
    setUserStatus(msg ? `✅ ${msg}` : '');
  }
  function setUserStatusErr(msg) {
    if (typeof window.setUserStatusErr === 'function') return window.setUserStatusErr(msg);
    setUserStatus(msg ? `❌ ${msg}` : '');
  }

  function setScanButtonState(isOn) {
    // si ya tienes una global, úsala
    if (typeof window.setScanButtonState === 'function') return window.setScanButtonState(isOn);

    // fallback
    const btn = getEl('btn-escanear');
    if (!btn) return;
    btn.dataset.scanning = isOn ? '1' : '0';
    btn.textContent = isOn ? 'Detener' : 'Escanear';
    btn.classList.toggle('btn-danger', isOn);
    btn.classList.toggle('btn-secondary', !isOn);
  }

  // --- Estado interno del escáner ---
  let codeReader = null;
  let currentStream = null;
  let scannerRunning = false;

  // BarcodeDetector nativo
  let bd = null;
  let bdRunning = false;

  // ZXing (fallback)
  function getZXing() {
    if (!window.ZXing) return null;
    const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = window.ZXing;
    if (!BrowserMultiFormatReader) return null;
    return { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat };
  }

  function extraerISBN(texto) {
    const digits = String(texto || "").replace(/\D/g, "");
    for (let i = 0; i <= digits.length - 13; i++) {
      const cand = digits.slice(i, i + 13);
      if (cand.startsWith("978") || cand.startsWith("979")) return cand;
    }
    if (digits.length === 13) return digits;
    return null;
  }

  async function aplicarMejorasDeCamara(stream) {
    try {
      const track = stream.getVideoTracks?.()[0];
      if (!track) return;

      const caps = track.getCapabilities?.() || {};
      const adv = [];

      if (caps.focusMode?.includes?.("continuous")) adv.push({ focusMode: "continuous" });
      if (caps.torch) adv.push({ torch: true });

      if (adv.length) {
        await track.applyConstraints({ advanced: adv });
      }
    } catch {
      // silencioso
    }
  }

  function resetInternal() {
    bdRunning = false;
    bd = null;

    if (codeReader) {
      try { codeReader.reset(); } catch {}
      codeReader = null;
    }

    if (currentStream) {
      try { currentStream.getTracks().forEach(t => t.stop()); } catch {}
      currentStream = null;
    }

    const video = getEl("video");
    if (video) {
      try { video.pause(); } catch {}
      video.srcObject = null;
    }

    const scannerDiv = getEl("scanner");
    if (scannerDiv) scannerDiv.style.display = "none";
  }

  async function detectarConBarcodeDetector(video, textEl) {
    if (!bdRunning || !bd) return;

    try {
      const barcodes = await bd.detect(video);
      if (barcodes && barcodes.length) {
        const raw = barcodes[0].rawValue || "";
        if (textEl) textEl.textContent = `Detectado: ${raw}`;

        const isbn = extraerISBN(raw);
        if (isbn) {
          const input = getEl("isbn");
          if (input) input.value = isbn;
          setUserStatusOk(`ISBN detectado: ${isbn}`);

          bdRunning = false;
          scannerRunning = false;
          stop({ keepButtonState: false });
          return;
        }
      }
    } catch {
      // silencioso
    }

    requestAnimationFrame(() => detectarConBarcodeDetector(video, textEl));
  }

  function iniciarZXingFallback(video, textEl) {
    const z = getZXing();
    if (!z) {
      setUserStatusErr("No hay BarcodeDetector y ZXing no está cargado.");
      stop({ keepButtonState: false });
      scannerRunning = false;
      return;
    }

    const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = z;

    const hints = new Map();
    hints.set(DecodeHintType.TRY_HARDER, true);
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.CODE_128
    ]);

    codeReader = new BrowserMultiFormatReader(hints);

    codeReader.decodeFromVideoElement(video, (result) => {
      if (!result?.text) return;

      const raw = String(result.text);
      if (textEl) textEl.textContent = `Detectado: ${raw}`;

      const isbn = extraerISBN(raw);
      if (!isbn) return;

      const input = getEl("isbn");
      if (input) input.value = isbn;

      setUserStatusOk(`ISBN detectado: ${isbn}`);
      scannerRunning = false;
      stop({ keepButtonState: false });
    });
  }

  async function start() {
    const scannerDiv = getEl("scanner");
    const video = getEl("video");
    const textEl = document.querySelector("#scanner .scanner-text");

    if (!scannerDiv || !video) return;

    if (!window.isSecureContext) {
      setUserStatusErr(`La cámara requiere HTTPS (o localhost). Estás en: ${window.location.origin}`);
      return;
    }

    if (scannerRunning) return;
    scannerRunning = true;

    // si quedara algo anterior
    stop({ keepButtonState: true, keepScannerRunning: true });

    scannerDiv.style.display = "block";
    setScanButtonState(true);
    if (textEl) textEl.textContent = "Apunta al código de barras…";

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });

      currentStream = stream;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play().catch(()=>{});

      await aplicarMejorasDeCamara(stream);

      if ("BarcodeDetector" in window) {
        const formats = await BarcodeDetector.getSupportedFormats();
        const wanted = ["ean_13", "ean_8", "upc_a", "code_128"];
        const use = wanted.filter(f => formats.includes(f));
        bd = new BarcodeDetector({ formats: use.length ? use : formats });

        bdRunning = true;
        detectarConBarcodeDetector(video, textEl);
        return;
      }

      iniciarZXingFallback(video, textEl);
    } catch (e) {
      console.error(e);
      setUserStatusErr(`No se pudo iniciar la cámara: ${e?.name || "error"}`);
      scannerRunning = false;
      stop({ keepButtonState: false });
    }
  }

  function stop(opts = {}) {
    const { keepButtonState = false, keepScannerRunning = false } = opts;
    resetInternal();
    if (!keepButtonState) setScanButtonState(false);
    if (!keepScannerRunning) scannerRunning = false;
  }

  async function toggle() {
    const btn = getEl("btn-escanear");
    const isOn = btn?.dataset?.scanning === "1";
    if (isOn) {
      stop({ keepButtonState: false });
      return;
    }
    setScanButtonState(true);
    await start();
  }

  // API pública
  window.Scanner = {
    start,
    stop,
    toggle,
    isRunning: () => scannerRunning,
  };
})();
