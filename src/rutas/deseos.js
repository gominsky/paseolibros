// src/rutas/deseos.js
import { Router } from 'express';
import pool from '../bd.js';
import { verificarToken } from '../middlewares/auth.js';
import { soloPropio } from '../middlewares/acceso.js';
const router = Router();

// Helper: normaliza con Postgres unaccent+lower (lo hacemos en SQL, no aquí)

// ---------- Búsqueda de libros en internet (Google Books → Open Library) ----------
const TIMEOUT_EXTERNO_MS = 6000;
const conTimeout = () => ({ signal: AbortSignal.timeout(TIMEOUT_EXTERNO_MS) });
const https = (u) => (u ? String(u).replace(/^http:\/\//i, 'https://') : null);
const cacheBusqueda = new Map(); // q -> { t, resultados }
const CACHE_MS = 10 * 60 * 1000;

function isbnDe(ids = []) {
  const i13 = ids.find((x) => x.type === 'ISBN_13')?.identifier;
  const i10 = ids.find((x) => x.type === 'ISBN_10')?.identifier;
  return i13 || i10 || null;
}

export function normalizarGoogle(json) {
  return (json?.items || []).map((it) => {
    const v = it.volumeInfo || {};
    const img = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || null;
    return {
      titulo: [v.title, v.subtitle].filter(Boolean).join(': ') || null,
      autores: v.authors?.length ? v.authors.join(', ') : null,
      isbn: isbnDe(v.industryIdentifiers),
      editorial: v.publisher || null,
      anio: v.publishedDate ? String(v.publishedDate).slice(0, 4) : null,
      paginas: v.pageCount || null,
      url_portada: https(img),
    };
  }).filter((r) => r.titulo);
}

export function normalizarOpenLibrary(json) {
  return (json?.docs || []).map((d) => {
    const isbns = d.isbn || [];
    const isbn = isbns.find((x) => x.length === 13) || isbns[0] || null;
    return {
      titulo: d.title || null,
      autores: d.author_name?.length ? d.author_name.slice(0, 3).join(', ') : null,
      isbn,
      editorial: d.publisher?.[0] || null,
      anio: d.first_publish_year ? String(d.first_publish_year) : null,
      paginas: d.number_of_pages_median || null,
      url_portada: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`
        : (isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false` : null),
    };
  }).filter((r) => r.titulo);
}

// Quita repetidos (mismo ISBN o mismo título+autor)
function sinRepetidos(lista) {
  const vistos = new Set();
  return lista.filter((r) => {
    const k = r.isbn || `${r.titulo}|${r.autores || ''}`.toLowerCase();
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

async function buscarEnInternet(q) {
  const enCache = cacheBusqueda.get(q);
  if (enCache && Date.now() - enCache.t < CACHE_MS) return enCache.resultados;

  const soloDigitos = q.replace(/[-\s]/g, '');
  const esIsbn = /^(\d{9}[\dXx]|\d{13})$/.test(soloDigitos);
  let resultados = [];

  try {
    const consulta = esIsbn ? `isbn:${soloDigitos}` : q;
    const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(consulta)}&maxResults=20&printType=books`, conTimeout());
    if (r.ok) resultados = normalizarGoogle(await r.json());
  } catch (e) {
    console.warn('Búsqueda Google Books falló:', e?.message || e);
  }

  if (resultados.length < 3) {
    try {
      const campo = esIsbn ? `isbn=${soloDigitos}` : `q=${encodeURIComponent(q)}`;
      const r = await fetch(`https://openlibrary.org/search.json?${campo}&limit=15&fields=title,author_name,isbn,first_publish_year,publisher,cover_i,number_of_pages_median`, conTimeout());
      if (r.ok) resultados = resultados.concat(normalizarOpenLibrary(await r.json()));
    } catch (e) {
      console.warn('Búsqueda Open Library falló:', e?.message || e);
    }
  }

  resultados = sinRepetidos(resultados).slice(0, 20);
  if (cacheBusqueda.size > 200) cacheBusqueda.delete(cacheBusqueda.keys().next().value);
  cacheBusqueda.set(q, { t: Date.now(), resultados });
  return resultados;
}

// GET /api/deseos/buscar-internet?q=  → libros encontrados en internet,
// marcando los que ya tienes en tu biblioteca o en tu lista de deseos.
router.get('/deseos/buscar-internet', verificarToken, async (req, res) => {
  const usuario_id = req.usuario?.id;
  const q = String(req.query.q || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (q.length < 2) return res.status(400).json({ error: 'Escribe al menos 2 letras' });

  try {
    const resultados = await buscarEnInternet(q.toLowerCase());
    const isbns = resultados.map((r) => r.isbn).filter(Boolean);
    const titulos = resultados.map((r) => r.titulo.toLowerCase());

    const [mios, deseados] = await Promise.all([
      isbns.length ? pool.query(
        `SELECT DISTINCT l.isbn FROM ejemplares e JOIN libros l ON l.id = e.libro_id
         WHERE e.usuario_id = $1 AND e.activo AND l.isbn = ANY($2)`, [usuario_id, isbns]) : { rows: [] },
      pool.query(
        `SELECT isbn, lower(titulo) AS titulo FROM deseos
         WHERE usuario_id = $1 AND (isbn = ANY($2) OR lower(titulo) = ANY($3))`, [usuario_id, isbns, titulos]),
    ]);
    const tengo = new Set(mios.rows.map((r) => r.isbn));
    const deseoIsbn = new Set(deseados.rows.map((r) => r.isbn).filter(Boolean));
    const deseoTitulo = new Set(deseados.rows.map((r) => r.titulo));

    res.json(resultados.map((r) => ({
      ...r,
      ya_tengo: Boolean(r.isbn && tengo.has(r.isbn)),
      ya_deseado: Boolean((r.isbn && deseoIsbn.has(r.isbn)) || deseoTitulo.has(r.titulo.toLowerCase())),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error buscando en internet' });
  }
});

// GET /api/usuarios/:usuarioId/deseos?q=&tipo=&ubicacion=&order=
router.get('/usuarios/:usuarioId/deseos', verificarToken, soloPropio('usuarioId'), async (req, res) => {
  const { usuarioId } = req.params;
  const q = String(req.query.q || '').trim();
  const tipo = String(req.query.tipo || '').trim();
  const ubicacion = String(req.query.ubicacion || '').trim();
  const order = String(req.query.order || 'creado_desc').trim();

  // ✅ seguridad: solo el propio usuario (si quieres)
  // Si prefieres permitir admin, aquí lo amplías
  if (Number(req.usuario.id) !== Number(usuarioId)) {
    return res.status(403).json({ error: 'No puedes ver los deseos de otro usuario' });
  }

  let orderSql = 'd.creado_en DESC';
  if (order === 'prioridad_desc') orderSql = 'd.prioridad DESC, d.creado_en DESC';
  if (order === 'titulo_asc') orderSql = 'd.titulo_norm ASC, d.creado_en DESC';

  try {
    const params = [usuarioId, q, tipo, ubicacion];

    const sql = `
      SELECT
        d.id,
        d.usuario_id,
        d.titulo,
        d.autores,
        d.isbn,
        d.tipo,
        d.ubicacion,
        d.prioridad,
        d.notas,
        d.url_portada,
        d.creado_en,
        d.actualizado_en
      FROM deseos d
      WHERE d.usuario_id = $1
        AND (
          $2 = '' OR
          d.titulo_norm ILIKE '%' || lower(unaccent($2)) || '%' OR
          d.autores_norm ILIKE '%' || lower(unaccent($2)) || '%'
        )
        AND ($3 = '' OR d.tipo = $3)
        AND (
          $4 = '' OR
          d.ubicacion_norm ILIKE '%' || lower(unaccent($4)) || '%'
        )
      ORDER BY ${orderSql}
    `;

    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error obteniendo deseos' });
  }
});

// POST /api/deseos  (usuario viene del token, igual que en ejemplares.js)
router.post('/deseos', verificarToken, async (req, res) => {
  const usuario_id = req.usuario?.id;
  if (!usuario_id) return res.status(401).json({ error: 'Usuario no autenticado' });

  const {
    titulo,
    autores,
    isbn,
    tipo,
    ubicacion,
    prioridad,
    notas,
    url_portada,
  } = req.body;

  if (!titulo || !String(titulo).trim()) {
    return res.status(400).json({ error: 'titulo es obligatorio' });
  }

  try {
    const r = await pool.query(
      `INSERT INTO deseos (
         usuario_id, titulo, autores, isbn, tipo, ubicacion, prioridad, notas, url_portada
       )
       VALUES ($1,$2,$3,$4,COALESCE($5,'libro'),$6,COALESCE($7,2),$8,$9)
       RETURNING *`,
      [
        usuario_id,
        String(titulo).trim(),
        autores ? String(autores).trim() : null,
        isbn ? String(isbn).trim() : null,
        tipo ? String(tipo).trim() : null,
        ubicacion ? String(ubicacion).trim() : null,
        Number.isFinite(Number(prioridad)) ? Number(prioridad) : null,
        notas ? String(notas).trim() : null,
        url_portada ? String(url_portada).trim() : null,
      ]
    );

    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    // índice único parcial por ISBN si lo creaste
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Ya tienes un deseo con ese ISBN' });
    }
    res.status(500).json({ error: 'Error creando deseo' });
  }
});

// PATCH /api/deseos/:id
router.patch('/deseos/:id', verificarToken, async (req, res) => {
  const usuario_id = req.usuario?.id;
  if (!usuario_id) return res.status(401).json({ error: 'Usuario no autenticado' });

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID no válido' });

  const { titulo, autores, isbn, tipo, ubicacion, prioridad, notas, url_portada } = req.body;

  try {
    const r = await pool.query(
      `UPDATE deseos
       SET
         titulo = COALESCE($1, titulo),
         autores = COALESCE($2, autores),
         isbn = COALESCE($3, isbn),
         tipo = COALESCE($4, tipo),
         ubicacion = COALESCE($5, ubicacion),
         prioridad = COALESCE($6, prioridad),
         notas = COALESCE($7, notas),
         url_portada = COALESCE($8, url_portada)
       WHERE id = $9 AND usuario_id = $10
       RETURNING *`,
      [
        titulo ?? null,
        autores ?? null,
        isbn ?? null,
        tipo ?? null,
        ubicacion ?? null,
        Number.isFinite(Number(prioridad)) ? Number(prioridad) : null,
        notas ?? null,
        url_portada ?? null,
        id,
        usuario_id,
      ]
    );

    if (r.rowCount === 0) return res.status(404).json({ error: 'Deseo no encontrado' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error actualizando deseo' });
  }
});

// DELETE /api/deseos/:id
router.delete('/deseos/:id', verificarToken, async (req, res) => { 
  const usuario_id = req.usuario?.id;
  if (!usuario_id) return res.status(401).json({ error: 'Usuario no autenticado' });

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID no válido' });

  try {
    const r = await pool.query(
      `DELETE FROM deseos WHERE id = $1 AND usuario_id = $2`,
      [id, usuario_id]
    );

    if (r.rowCount === 0) return res.status(404).json({ error: 'Deseo no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error eliminando deseo' });
  }
});

export default router;
