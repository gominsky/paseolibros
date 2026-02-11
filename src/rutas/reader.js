// src/rutas/reader.js
import { Router } from "express";
import pool from "../bd.js";
import { verificarToken } from "../middlewares/auth.js";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

/** Asegura que el usuario tenga acceso al libro:
 *  mismo criterio que libros.js: tener algún ejemplar activo de ese libro. :contentReference[oaicite:5]{index=5}
 */
async function assertAccesoLibro({ usuarioId, libroId }) {
  const r = await pool.query(
    `SELECT 1
     FROM ejemplares
     WHERE libro_id = $1
       AND usuario_id = $2
       AND activo = TRUE
     LIMIT 1`,
    [libroId, usuarioId]
  );
  return r.rowCount > 0;
}

/* =========================
   META: favorito + tags + notas + audios
   GET /api/libros/:id/reader-meta
   ========================= */
router.get("/libros/:id/reader-meta", verificarToken, async (req, res) => {
  const usuarioId = Number(req.usuario?.id);
  const libroId = Number(req.params.id);
  if (!usuarioId) return res.status(401).json({ error: "Usuario no autenticado" });
  if (!libroId) return res.status(400).json({ error: "ID de libro no válido" });

  try {
    const ok = await assertAccesoLibro({ usuarioId, libroId });
    if (!ok) return res.status(403).json({ error: "No puedes ver este libro (no tienes ejemplares suyos)" });

    const [fav, tags, notas, audios] = await Promise.all([
      pool.query(
        "SELECT 1 FROM libro_favoritos WHERE usuario_id=$1 AND libro_id=$2 LIMIT 1",
        [usuarioId, libroId]
      ),
      pool.query(
        `SELECT id, tag, creado_en
         FROM libro_tags
         WHERE usuario_id=$1 AND libro_id=$2
         ORDER BY creado_en DESC`,
        [usuarioId, libroId]
      ),
      pool.query(
        `SELECT id, texto, creado_en, actualizado_en
         FROM libro_notas
         WHERE usuario_id=$1 AND libro_id=$2
         ORDER BY creado_en DESC`,
        [usuarioId, libroId]
      ),
      pool.query(
        `SELECT id, mime, bytes, duracion_ms, creado_en
         FROM libro_audios
         WHERE usuario_id=$1 AND libro_id=$2
         ORDER BY creado_en DESC`,
        [usuarioId, libroId]
      ),
    ]);

    return res.json({
      favorite: fav.rowCount > 0,
      tags: tags.rows,
      notes: notas.rows,
      audios: audios.rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error obteniendo reader-meta" });
  }
});

/* =========================
   FAVORITO
   POST /api/libros/:id/favorite  body: { favorite: true/false }
   ========================= */
router.post("/libros/:id/favorite", verificarToken, async (req, res) => {
  const usuarioId = Number(req.usuario?.id);
  const libroId = Number(req.params.id);
  const favorite = !!req.body?.favorite;

  if (!usuarioId) return res.status(401).json({ error: "Usuario no autenticado" });
  if (!libroId) return res.status(400).json({ error: "ID de libro no válido" });

  try {
    const ok = await assertAccesoLibro({ usuarioId, libroId });
    if (!ok) return res.status(403).json({ error: "No puedes marcar favorito un libro sin ejemplares" });

    if (favorite) {
      await pool.query(
        `INSERT INTO libro_favoritos (usuario_id, libro_id)
         VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [usuarioId, libroId]
      );
    } else {
      await pool.query(
        `DELETE FROM libro_favoritos
         WHERE usuario_id=$1 AND libro_id=$2`,
        [usuarioId, libroId]
      );
    }

    return res.sendStatus(204);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error actualizando favorito" });
  }
});

/* =========================
   TAGS (reemplazar lista completa)
   POST /api/libros/:id/tags  body: { tags: ["a","b"] }
   ========================= */
router.post("/libros/:id/tags", verificarToken, async (req, res) => {
  const usuarioId = Number(req.usuario?.id);
  const libroId = Number(req.params.id);
  const tags = Array.isArray(req.body?.tags) ? req.body.tags : [];

  if (!usuarioId) return res.status(401).json({ error: "Usuario no autenticado" });
  if (!libroId) return res.status(400).json({ error: "ID de libro no válido" });

  try {
    const ok = await assertAccesoLibro({ usuarioId, libroId });
    if (!ok) return res.status(403).json({ error: "No puedes etiquetar un libro sin ejemplares" });

    await pool.query("BEGIN");
    try {
      await pool.query(`DELETE FROM libro_tags WHERE usuario_id=$1 AND libro_id=$2`, [usuarioId, libroId]);

      for (const t of tags) {
        const tag = String(t ?? "").trim();
        if (!tag) continue;
        await pool.query(
          `INSERT INTO libro_tags (usuario_id, libro_id, tag)
           VALUES ($1,$2,$3)
           ON CONFLICT DO NOTHING`,
          [usuarioId, libroId, tag]
        );
      }

      await pool.query("COMMIT");
      return res.sendStatus(204);
    } catch (e) {
      await pool.query("ROLLBACK");
      throw e;
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error guardando tags" });
  }
});

/* =========================
   NOTAS
   POST   /api/libros/:id/notes  body: { texto }
   DELETE /api/libros/:id/notes/:noteId
   ========================= */
router.post("/libros/:id/notes", verificarToken, async (req, res) => {
  const usuarioId = Number(req.usuario?.id);
  const libroId = Number(req.params.id);
  const texto = String(req.body?.texto ?? "").trim();

  if (!usuarioId) return res.status(401).json({ error: "Usuario no autenticado" });
  if (!libroId) return res.status(400).json({ error: "ID de libro no válido" });
  if (!texto) return res.status(400).json({ error: "texto requerido" });

  try {
    const ok = await assertAccesoLibro({ usuarioId, libroId });
    if (!ok) return res.status(403).json({ error: "No puedes añadir notas a un libro sin ejemplares" });

    const r = await pool.query(
      `INSERT INTO libro_notas (usuario_id, libro_id, texto)
       VALUES ($1,$2,$3)
       RETURNING id, texto, creado_en, actualizado_en`,
      [usuarioId, libroId, texto]
    );

    return res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error creando nota" });
  }
});

router.delete("/libros/:id/notes/:noteId", verificarToken, async (req, res) => {
  const usuarioId = Number(req.usuario?.id);
  const libroId = Number(req.params.id);
  const noteId = Number(req.params.noteId);

  if (!usuarioId) return res.status(401).json({ error: "Usuario no autenticado" });
  if (!libroId || !noteId) return res.status(400).json({ error: "Parámetros inválidos" });

  try {
    const r = await pool.query(
      `DELETE FROM libro_notas
       WHERE id=$1 AND usuario_id=$2 AND libro_id=$3`,
      [noteId, usuarioId, libroId]
    );
    // aunque no exista, devolvemos 204 (idempotente)
    return res.sendStatus(204);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error borrando nota" });
  }
});

/* =========================
   AUDIO (local uploads)
   - POST   /api/libros/:id/audios  multipart: audio
   - GET    /api/libros/:id/audios  lista metadata
   - GET    /api/libros/:id/audios/:audioId  stream
   - DELETE /api/libros/:id/audios/:audioId
   ========================= */

// Carpeta uploads/audios (similar a libros.js con uploads) :contentReference[oaicite:6]{index=6}
const audiosDir = path.join(process.cwd(), "uploads", "audios");
fs.mkdirSync(audiosDir, { recursive: true });

const audioStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, audiosDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".webm";
    cb(null, `audio_libro_${req.params.id}_${Date.now()}${ext}`);
  },
});

const uploadAudio = multer({
  storage: audioStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

router.post("/libros/:id/audios", verificarToken, uploadAudio.single("audio"), async (req, res) => {
  const usuarioId = Number(req.usuario?.id);
  const libroId = Number(req.params.id);
  if (!usuarioId) return res.status(401).json({ error: "Usuario no autenticado" });
  if (!libroId) return res.status(400).json({ error: "ID de libro no válido" });
  if (!req.file) return res.status(400).json({ error: "audio requerido" });

  try {
    const ok = await assertAccesoLibro({ usuarioId, libroId });
    if (!ok) return res.status(403).json({ error: "No puedes subir audios a un libro sin ejemplares" });

    // Guardamos metadata en BD; el archivo queda en uploads/audios
    const r = await pool.query(
      `INSERT INTO libro_audios (usuario_id, libro_id, storage, path, mime, bytes, duracion_ms)
       VALUES ($1,$2,'local',$3,$4,$5,$6)
       RETURNING id, mime, bytes, duracion_ms, creado_en`,
      [usuarioId, libroId, req.file.filename, req.file.mimetype, req.file.size, null]
    );

    return res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error subiendo audio" });
  }
});

router.get("/libros/:id/audios", verificarToken, async (req, res) => {
  const usuarioId = Number(req.usuario?.id);
  const libroId = Number(req.params.id);

  if (!usuarioId) return res.status(401).json({ error: "Usuario no autenticado" });
  if (!libroId) return res.status(400).json({ error: "ID de libro no válido" });

  try {
    const ok = await assertAccesoLibro({ usuarioId, libroId });
    if (!ok) return res.status(403).json({ error: "No puedes ver audios de un libro sin ejemplares" });

    const r = await pool.query(
      `SELECT id, mime, bytes, duracion_ms, creado_en
       FROM libro_audios
       WHERE usuario_id=$1 AND libro_id=$2
       ORDER BY creado_en DESC`,
      [usuarioId, libroId]
    );
    return res.json(r.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error listando audios" });
  }
});

router.get("/libros/:id/audios/:audioId", verificarToken, async (req, res) => {
  const usuarioId = Number(req.usuario?.id);
  const libroId = Number(req.params.id);
  const audioId = Number(req.params.audioId);

  if (!usuarioId) return res.status(401).json({ error: "Usuario no autenticado" });
  if (!libroId || !audioId) return res.status(400).json({ error: "Parámetros inválidos" });

  try {
    const r = await pool.query(
      `SELECT path, mime
       FROM libro_audios
       WHERE id=$1 AND usuario_id=$2 AND libro_id=$3`,
      [audioId, usuarioId, libroId]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Audio no encontrado" });

    res.setHeader("Content-Type", r.rows[0].mime);
    return res.sendFile(path.join(audiosDir, r.rows[0].path));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error sirviendo audio" });
  }
});

router.delete("/libros/:id/audios/:audioId", verificarToken, async (req, res) => {
  const usuarioId = Number(req.usuario?.id);
  const libroId = Number(req.params.id);
  const audioId = Number(req.params.audioId);

  if (!usuarioId) return res.status(401).json({ error: "Usuario no autenticado" });
  if (!libroId || !audioId) return res.status(400).json({ error: "Parámetros inválidos" });

  try {
    const r = await pool.query(
      `DELETE FROM libro_audios
       WHERE id=$1 AND usuario_id=$2 AND libro_id=$3
       RETURNING path`,
      [audioId, usuarioId, libroId]
    );

    if (r.rowCount > 0) {
      const filepath = path.join(audiosDir, r.rows[0].path);
      try { fs.unlinkSync(filepath); } catch {}
    }

    return res.sendStatus(204);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error borrando audio" });
  }
});

/* =========================
   EXPORT (JSON)
   GET /api/export
   Incluye tus datos + las nuevas tablas
   ========================= */
router.get("/export", verificarToken, async (req, res) => {
  const usuarioId = Number(req.usuario?.id);
  if (!usuarioId) return res.status(401).json({ error: "Usuario no autenticado" });

  try {
    const [
      ejemplares,
      lecturas,
      deseos,
      favs,
      tags,
      notas,
      audios,
    ] = await Promise.all([
      pool.query("SELECT * FROM ejemplares WHERE usuario_id=$1 ORDER BY id", [usuarioId]),
      pool.query("SELECT * FROM lecturas   WHERE usuario_id=$1 ORDER BY id", [usuarioId]),
      pool.query("SELECT * FROM deseos     WHERE usuario_id=$1 ORDER BY id", [usuarioId]),
      pool.query("SELECT * FROM libro_favoritos WHERE usuario_id=$1 ORDER BY creado_en DESC", [usuarioId]),
      pool.query("SELECT * FROM libro_tags      WHERE usuario_id=$1 ORDER BY creado_en DESC", [usuarioId]),
      pool.query("SELECT * FROM libro_notas     WHERE usuario_id=$1 ORDER BY creado_en DESC", [usuarioId]),
      pool.query("SELECT * FROM libro_audios    WHERE usuario_id=$1 ORDER BY creado_en DESC", [usuarioId]),
    ]);

    // prestamos: según tu modelo, están ligados a ejemplar_id y prestador_id, así que sacamos los del usuario
    const prestamos = await pool.query(
      `SELECT p.*
       FROM prestamos p
       JOIN ejemplares e ON e.id = p.ejemplar_id
       WHERE e.usuario_id = $1
       ORDER BY p.id`,
      [usuarioId]
    );

    return res.json({
      exportedAt: new Date().toISOString(),
      version: 1,
      usuarioId,
      data: {
        ejemplares: ejemplares.rows,
        lecturas: lecturas.rows,
        prestamos: prestamos.rows,
        deseos: deseos.rows,
        favorites: favs.rows,
        tags: tags.rows,
        notes: notas.rows,
        audios: audios.rows, // metadata; ficheros se bajan por /libros/:id/audios/:audioId
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error exportando datos" });
  }
});

export default router;
