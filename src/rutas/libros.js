// src/rutas/libros.js
import { Router } from 'express';
import pool from '../bd.js';
import multer from 'multer';
import path from 'path';
import { requiereUsuario } from '../middlewares/acceso.js';

const router = Router();

// ¿Tiene el usuario algún ejemplar activo de este libro?
async function tieneEjemplar(libroId, usuarioId) {
  const r = await pool.query(
    `SELECT 1 FROM ejemplares
     WHERE libro_id = $1 AND usuario_id = $2 AND activo = TRUE
     LIMIT 1`,
    [libroId, usuarioId]
  );
  return r.rowCount > 0;
}

// Solo se aceptan portadas http(s) o subidas propias (/uploads/nombre.ext).
// Evita guardar rutas tipo '/uploads/../src/app.js' que luego se borrarían.
function portadaValida(url) {
  if (url === undefined || url === null || url === '') return true;
  const u = String(url).trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(u) || /^\/uploads\/[\w.-]+$/.test(u);
}

// ---------- Valoración media de lectores ----------
// Goodreads ya no tiene API pública (desde 2020). Se usa Open Library y, si no hay
// datos, Google Books. Se guarda en la tabla libros durante 30 días.
const DIAS_CACHE_VALORACION = 30;
const conTimeout = () => ({ signal: AbortSignal.timeout(6000) });

async function valoracionOpenLibrary(isbn) {
  const r = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`, conTimeout());
  if (!r.ok) return null;
  const ed = await r.json();
  const work = ed?.works?.[0]?.key;               // p. ej. /works/OL45804W
  if (!work) return null;
  const rr = await fetch(`https://openlibrary.org${work}/ratings.json`, conTimeout());
  if (!rr.ok) return null;
  const s = (await rr.json())?.summary;
  if (!s?.count || !s?.average) return null;
  return { media: Number(s.average), votos: Number(s.count), fuente: 'Open Library', url: `https://openlibrary.org${work}` };
}

async function valoracionGoogle(isbn) {
  const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`, conTimeout());
  if (!r.ok) return null;
  const v = (await r.json())?.items?.find((i) => i.volumeInfo?.averageRating)?.volumeInfo;
  if (!v?.averageRating) return null;
  return { media: Number(v.averageRating), votos: Number(v.ratingsCount || 0), fuente: 'Google Books', url: v.infoLink || null };
}

// GET /api/libros/:id/valoracion → { media, votos, fuente, url, goodreads }
router.get('/:id/valoracion', requiereUsuario, async (req, res) => {
  const libroId = Number(req.params.id);
  if (!libroId) return res.status(400).json({ error: 'ID de libro no válido' });
  try {
    if (!(await tieneEjemplar(libroId, req.usuario.id))) return res.status(404).json({ error: 'Libro no encontrado' });
    const { rows } = await pool.query(
      `SELECT isbn, titulo, autores, valoracion_media, valoracion_votos, valoracion_fuente, valoracion_url, valoracion_en
       FROM libros WHERE id = $1`, [libroId]);
    const l = rows[0];
    if (!l) return res.status(404).json({ error: 'Libro no encontrado' });

    // Enlace a Goodreads: búsqueda por ISBN (o por título y autor)
    const q = l.isbn || [l.titulo, l.autores].filter(Boolean).join(' ');
    const goodreads = q ? `https://www.goodreads.com/search?q=${encodeURIComponent(q)}` : null;

    const fresca = l.valoracion_en && (Date.now() - new Date(l.valoracion_en)) < DIAS_CACHE_VALORACION * 864e5;
    if (fresca || !l.isbn) {
      return res.json({
        media: l.valoracion_media != null ? Number(l.valoracion_media) : null,
        votos: l.valoracion_votos, fuente: l.valoracion_fuente, url: l.valoracion_url, goodreads,
      });
    }

    let v = null;
    try { v = await valoracionOpenLibrary(l.isbn); } catch (e) { console.warn('Valoración Open Library:', e?.message); }
    if (!v) { try { v = await valoracionGoogle(l.isbn); } catch (e) { console.warn('Valoración Google:', e?.message); } }

    await pool.query(
      `UPDATE libros SET valoracion_media = $1, valoracion_votos = $2, valoracion_fuente = $3,
              valoracion_url = $4, valoracion_en = NOW()
       WHERE id = $5`,
      [v?.media ?? null, v?.votos ?? null, v?.fuente ?? null, v?.url ?? null, libroId]
    );
    res.json({ media: v?.media ?? null, votos: v?.votos ?? null, fuente: v?.fuente ?? null, url: v?.url ?? null, goodreads });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error obteniendo la valoración' });
  }
});

// Obtener un libro por ID (solo si el usuario tiene algún ejemplar de ese libro)
router.get('/:id', async (req, res) => {
  const libroId = Number(req.params.id);
  if (!libroId) {
    return res.status(400).json({ error: 'ID de libro no válido' });
  }
  if (!req.usuario?.id) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }
  
  try {
    // comprobamos que el usuario tiene al menos un ejemplar de este libro
    const tieneEjemplar = await pool.query(
      `SELECT 1
       FROM ejemplares
       WHERE libro_id = $1
         AND usuario_id = $2
         AND activo = TRUE
       LIMIT 1`,
      [libroId, req.usuario.id]
    );

    if (tieneEjemplar.rowCount === 0) {
      return res
        .status(403)
        .json({ error: 'No puedes ver este libro (no tienes ejemplares suyos)' });
    }

    const resultado = await pool.query(
      'SELECT * FROM libros WHERE id = $1',
      [libroId]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ error: 'Libro no encontrado' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo libro' });
  }
  
});

// Actualizar datos del libro
router.put('/:id', async (req, res) => {
  const libroId = Number(req.params.id);
  if (!libroId) {
    return res.status(400).json({ error: 'ID de libro no válido' });
  }
  if (!req.usuario?.id) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }
  
  const {
    titulo,
    autores,
    editorial,
    fecha_publicacion,
    numero_paginas,
    descripcion,
    url_portada,
  } = req.body;

  if (!portadaValida(url_portada)) {
    return res.status(400).json({ error: 'La portada debe ser una URL http(s)' });
  }

  try {
    // de nuevo, sólo si el usuario tiene ejemplares de este libro
    const tieneEjemplar = await pool.query(
      `SELECT 1
       FROM ejemplares
       WHERE libro_id = $1
         AND usuario_id = $2
         AND activo = TRUE
       LIMIT 1`,
      [libroId, req.usuario.id]
    );

    if (tieneEjemplar.rowCount === 0) {
      return res
        .status(403)
        .json({ error: 'No puedes editar un libro del que no tienes ejemplares' });
    }

   const resultado = await pool.query(
  `UPDATE libros
   SET
     titulo = COALESCE(NULLIF($1, ''), titulo),
     autores = COALESCE(NULLIF($2, ''), autores),
     editorial = COALESCE(NULLIF($3, ''), editorial),
     fecha_publicacion = COALESCE(NULLIF($4, ''), fecha_publicacion),
     numero_paginas = COALESCE($5, numero_paginas),
     descripcion = COALESCE(NULLIF($6, ''), descripcion),
     url_portada = COALESCE(NULLIF($7, ''), url_portada)
   WHERE id = $8
   RETURNING *`,
  [
    titulo,
    autores,
    editorial,
    fecha_publicacion,
    numero_paginas,
    descripcion,
    url_portada,
    libroId,
  ]
);

    if (resultado.rowCount === 0) {
      return res.status(404).json({ error: 'Libro no encontrado' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error actualizando libro' });
  }
});
const uploadsDir = path.join(process.cwd(), 'uploads');

// La extensión sale del tipo de imagen, nunca del nombre que manda el navegador
// (antes se podía subir un .html y quedaba publicado en /uploads → XSS).
const EXT_IMAGEN = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    cb(null, `libro_${Number(req.params.id) || 0}_${Date.now()}${EXT_IMAGEN[file.mimetype]}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024, files: 1 }, // 6MB
  fileFilter: (req, file, cb) => cb(null, Boolean(EXT_IMAGEN[file.mimetype])),
});

// Comprueba sesión y propiedad ANTES de aceptar el fichero
async function puedeSubirPortada(req, res, next) {
  const libroId = Number(req.params.id);
  if (!libroId) return res.status(400).json({ error: 'ID de libro no válido' });
  try {
    if (!(await tieneEjemplar(libroId, req.usuario.id))) {
      return res.status(403).json({ error: 'No tienes ejemplares de este libro' });
    }
    next();
  } catch (e) {
    next(e);
  }
}

// Subir portada y guardar su URL en libros.url_portada
// POST /api/libros/:id/portada
router.post('/:id/portada', requiereUsuario, puedeSubirPortada, upload.single('portada'), async (req, res) => {
  const libroId = Number(req.params.id);
  if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen (JPG, PNG, WebP o GIF)' });

  try {
    const urlPortada = `/uploads/${req.file.filename}`;

    const result = await pool.query(
      `UPDATE libros
       SET url_portada = $1
       WHERE id = $2
       RETURNING id, url_portada`,
      [urlPortada, libroId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error guardando portada' });
  }
});

export default router;
