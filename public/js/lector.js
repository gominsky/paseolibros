// js/lector.js — Panel "Del lector": favorito, etiquetas, notas y audios
// (El servidor une todos los ficheros de js/ en /main.js según js/orden.json)

// =========================
// Panel "Del lector" (favorito/tags/notas/audio)
// Usa API_BASE + getHeaders + token actual
// =========================
(() => {
  const els = {};
  let currentLibroId = null;
  let rec = { mediaRecorder: null, chunks: [], blob: null };
 
  function $(id){ return document.getElementById(id); }
 
  async function api(path, opts = {}) {
    const url = `${API_BASE}${path}`;
 
    const isFormData = (opts.body instanceof FormData);
    const headers = opts.headers
      ? { ...opts.headers }
      : getHeaders(!isFormData); // si es FormData, NO Content-Type
 
    const res = await fetch(url, { ...opts, headers });
 
    if (res.status === 401) {
      handleUnauthorized?.();
      throw new Error('401 Unauthorized');
    }
 
    const ct = res.headers.get("content-type") || "";
    const payload = ct.includes("application/json")
      ? await res.json().catch(() => ({}))
      : await res.text().catch(() => "");
 
    if (!res.ok) {
      const msg = payload?.error || (typeof payload === 'string' ? payload : '') || `${res.status} ${res.statusText}`;
      throw new Error(msg);
    }
 
    // Si cambia favorito/notas/etiquetas/audios, refresca las insignias del listado
    const cambio = /^\/api\/libros\/(\d+)\/(favorite|tags|notes|audios)/.exec(path);
    if (cambio && String(opts.method || 'GET').toUpperCase() !== 'GET') {
      const id = Number(cambio[1]);
      readerMetaCache.delete(id);
      fetchReaderMeta(id).then(() => applyBadgesForLibro(id)).catch(() => {});
    }
 
    return payload;
  }
 
  function setFavUI(isFav){
    els.fav.setAttribute("aria-pressed", String(!!isFav));
    els.fav.innerHTML = `<span class="modal-fav-star">${icono(isFav ? "estrella-llena" : "estrella")}</span><span class="modal-fav-label">Favorito</span>`;
  }
 
  function renderTags(tagsRows){
    els.tags.innerHTML = "";
    const tags = (tagsRows || []).map(t => t.tag);
 
    for (const tag of tags) {
      const chip = document.createElement("span");
      chip.className = "reader-chip";
      chip.innerHTML = `<span>${escapeHtml(tag)}</span><button type="button" aria-label="Quitar">✕</button>`;
      chip.querySelector("button").onclick = async () => {
        const next = tags.filter(x => x.toLowerCase() !== tag.toLowerCase());
        await api(`/api/libros/${currentLibroId}/tags`, {
          method: "POST",
          body: JSON.stringify({ tags: next }),
        });
        await refresh();
      };
      els.tags.appendChild(chip);
    }
  }
 
  function renderNotes(notesRows){
    els.notes.innerHTML = "";
    for (const n of (notesRows || [])) {
      const item = document.createElement("div");
      item.className = "reader-item";
      const created = n.creado_en ? new Date(n.creado_en).toLocaleString() : "";
      item.innerHTML = `
        <div class="reader-item-head">
          <small>${escapeHtml(created)}</small>
          <button class="btn btn-ghost btn-sm" type="button">Borrar</button>
        </div>
        <p>${escapeHtml(n.texto)}</p>
      `;
      item.querySelector("button").onclick = async () => {
        await api(`/api/libros/${currentLibroId}/notes/${n.id}`, { method: "DELETE" });
        await refresh();
      };
      els.notes.appendChild(item);
    }
  }
 
  function renderAudios(audiosRows){
    els.audios.innerHTML = "";
    for (const a of (audiosRows || [])) {
      const created = a.creado_en ? new Date(a.creado_en).toLocaleString() : "";
      const item = document.createElement("div");
      item.className = "reader-item";
      item.innerHTML = `
        <div class="reader-item-head">
          <small>${escapeHtml(created)}</small>
          <div style="display:flex; gap:8px; align-items:center;">
            <button class="btn btn-secondary btn-sm" type="button">▶ Reproducir</button>
            <button class="btn btn-ghost btn-sm" type="button">Borrar</button>
          </div>
        </div>
        <audio controls style="display:none; width:100%; margin-top:8px;"></audio>
      `;
 
      const playBtn = item.querySelectorAll("button")[0];
      const delBtn  = item.querySelectorAll("button")[1];
      const audioEl = item.querySelector("audio");
 
      playBtn.onclick = async () => {
  try {
    audioEl.style.display = "block";
 
    const url = `${API_BASE}/api/libros/${currentLibroId}/audios/${a.id}`;
 
    // 1) Descarga con headers (token)
    const res = await fetch(url, { headers: getHeaders(false) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
 
    // 2) Convierte a blob y reproduce
    const blob = await res.blob();
    if (!blob || blob.size === 0) throw new Error("Audio vacío (0 bytes)");
 
    const objectUrl = URL.createObjectURL(blob);
 
    // Limpia url previa
    if (audioEl.dataset.objectUrl) URL.revokeObjectURL(audioEl.dataset.objectUrl);
    audioEl.dataset.objectUrl = objectUrl;
 
    audioEl.src = objectUrl;
    await audioEl.play();
  } catch (e) {
    console.error(e);
    alert("No se pudo reproducir el audio (revisar token / ruta / bytes).");
  }
};
 
 
      delBtn.onclick = async () => {
        await api(`/api/libros/${currentLibroId}/audios/${a.id}`, { method: "DELETE" });
        await refresh();
      };
 
      els.audios.appendChild(item);
    }
  }
 
  async function refresh() {
    if (!currentLibroId) return;
    const meta = await api(`/api/libros/${currentLibroId}/reader-meta`);
    setFavUI(meta.favorite);
    renderTags(meta.tags);
    renderNotes(meta.notes);
    renderAudios(meta.audios);
  }
 
  // usa tu escapeHtml global si existe
  function escapeHtmlLocal(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }
  const escapeHtml = (window.escapeHtml || escapeHtmlLocal);
 
  async function startRec(){
    if (!navigator.mediaDevices?.getUserMedia) {
      els.audioStatus.textContent = "Tu navegador no permite grabación.";
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    rec.chunks = [];
    rec.blob = null;
 
    const mr = new MediaRecorder(stream);
    rec.mediaRecorder = mr;
 
    mr.ondataavailable = (e) => { if (e.data?.size) rec.chunks.push(e.data); };
    mr.onstop = () => {
      rec.blob = new Blob(rec.chunks, { type: mr.mimeType || "audio/webm" });
      els.preview.src = URL.createObjectURL(rec.blob);
      els.preview.style.display = "block";
      els.upload.disabled = false;
      els.discard.disabled = false;
      els.audioStatus.textContent = "Audio listo para guardar";
      stream.getTracks().forEach(t => t.stop());
    };
 
    mr.start();
    els.rec.disabled = true;
    els.stop.disabled = false;
    els.audioStatus.textContent = "Grabando…";
  }
 
  function stopRec(){
    if (rec.mediaRecorder && rec.mediaRecorder.state !== "inactive") {
      rec.mediaRecorder.stop();
    }
    els.stop.disabled = true;
  }
 
  async function uploadRec(){
    if (!rec.blob) return;
    const fd = new FormData();
    const ext = (rec.blob.type || "").includes("ogg") ? "ogg" : "webm";
    fd.append("audio", rec.blob, `nota.${ext}`);
 
    await api(`/api/libros/${currentLibroId}/audios`, { method: "POST", body: fd });
 
    discardRec();
    els.audioStatus.textContent = "Guardado ✓";
    await refresh();
  }
 
  function discardRec(){
    try { if (els.preview?.src) URL.revokeObjectURL(els.preview.src); } catch {}
    if (els.preview) {
      els.preview.pause();
      els.preview.removeAttribute("src");
      els.preview.style.display = "none";
    }
    if (els.upload) els.upload.disabled = true;
    if (els.discard) els.discard.disabled = true;
    if (els.audioStatus) els.audioStatus.textContent = "";
    rec.blob = null;
    if (els.rec) els.rec.disabled = false;
    if (els.stop) els.stop.disabled = true;
  }
 
  function bind(){
    els.panel = $("reader-panel");
    if (!els.panel) return;
 
    els.fav = $("reader-fav");
    els.tagInput = $("reader-tag-input");
    els.tagAdd = $("reader-tag-add");
    els.tags = $("reader-tags");
    els.noteText = $("reader-note-text");
    els.noteSave = $("reader-note-save");
    els.notes = $("reader-notes");
    els.rec = $("reader-rec");
    els.stop = $("reader-stop");
    els.preview = $("reader-audio-preview");
    els.audioStatus = $("reader-audio-status");
    els.upload = $("reader-audio-upload");
    els.discard = $("reader-audio-discard");
    els.audios = $("reader-audios");
 
    els.fav.onclick = async () => {
      const next = els.fav.getAttribute("aria-pressed") !== "true";
      await api(`/api/libros/${currentLibroId}/favorite`, {
        method: "POST",
        body: JSON.stringify({ favorite: next }),
      });
      setFavUI(next);
    };
 
    const addTag = async () => {
      const value = (els.tagInput.value || "").trim();
      if (!value) return;
 
      const existing = Array.from(els.tags.querySelectorAll(".reader-chip span")).map(s => s.textContent);
      const next = Array.from(new Set([...existing, value]));
 
      await api(`/api/libros/${currentLibroId}/tags`, {
        method: "POST",
        body: JSON.stringify({ tags: next }),
      });
 
      els.tagInput.value = "";
      await refresh();
    };
 
    els.tagAdd.onclick = addTag;
    els.tagInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); addTag(); }
    });
 
    els.noteSave.onclick = async () => {
      const texto = (els.noteText.value || "").trim();
      if (!texto) return;
 
      await api(`/api/libros/${currentLibroId}/notes`, {
        method: "POST",
        body: JSON.stringify({ texto }),
      });
 
      els.noteText.value = "";
      await refresh();
    };
 
    els.rec.onclick = startRec;
    els.stop.onclick = stopRec;
    els.upload.onclick = uploadRec;
    els.discard.onclick = discardRec;
  }
 
  window.readerPanelOpen = async function readerPanelOpen(libroId){
    currentLibroId = Number(libroId);
    if (!currentLibroId) return;
 
    if (!els.panel) bind();
    if (!els.panel) return;
 
    els.panel.dataset.libroId = String(currentLibroId);
    discardRec();
 
    try { await refresh(); } catch (e) { console.warn(e); }
  };
})();
