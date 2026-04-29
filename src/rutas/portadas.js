// src/rutas/portadas.js
// Busca portadas en Google Books y Open Library por ISBN
// y las descarga al servidor para servirlas localmente.

import { Router } from 'express';
import pool from '../bd.js';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const router = Router();

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ── Auth middleware ───────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.usuario?.id) return res.status(401).json({ error: 'No autenticado' });
  next();
}

// ── Descarga una URL a disco y devuelve la ruta local ─────
function descargarImagen(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file  = fs.createWriteStream(destPath);

    const request = proto.get(url, { timeout: 10000 }, res => {
      // Seguir redirecciones (hasta 3)
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        file.close();
        fs.unlink(destPath, () => {});
        return descargarImagen(res.headers.location, destPath)
          .then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(destPath, () => {});
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const ct = res.headers['content-type'] || '';
      if (!ct.startsWith('image/')) {
        file.close();
        fs.unlink(destPath, () => {});
        return reject(new Error(`No es imagen: ${ct}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(destPath)));
    });

    request.on('error', err => {
      file.close();
      fs.unlink(destPath, () => {});
      reject(err);
    });
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Timeout descargando imagen'));
    });
  });
}

// ── Buscar URL de portada por ISBN ────────────────────────
async function buscarPortadaUrl(isbn) {
  const isbnLimpio = String(isbn).replace(/\D/g, '');

  // 1) Google Books
  try {
    const gbUrl  = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbnLimpio}&maxResults=1`;
    const gbRes  = await fetch(gbUrl, { signal: AbortSignal.timeout(8000) });
    const gbData = await gbRes.json();
    const img    = gbData?.items?.[0]?.volumeInfo?.imageLinks;
    if (img) {
      // Preferir la imagen más grande disponible
      const url = (img.extraLarge || img.large || img.medium || img.small || img.thumbnail || '')
        .replace('http://', 'https://')
        .replace('&zoom=1', '&zoom=3')   // pedir resolución mayor
        .replace('zoom=1', 'zoom=3');
      if (url) return { fuente: 'google', url };
    }
  } catch (e) {
    console.warn('[portadas] Google Books falló:', e.message);
  }

  // 2) Open Library (fallback)
  try {
    // Primero intentamos la API de Works para verificar que existe
    const olUrl = `https://covers.openlibrary.org/b/isbn/${isbnLimpio}-L.jpg?default=false`;
    // Hacemos HEAD para ver si existe sin descargar
    const headRes = await fetch(olUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(8000)
    });
    if (headRes.ok && headRes.headers.get('content-type')?.startsWith('image/')) {
      return { fuente: 'openlibrary', url: olUrl };
    }
  } catch (e) {
    console.warn('[portadas] Open Library falló:', e.message);
  }

  return null;
}


// ── Scraping de imágenes: Google Images → Bing fallback ──
// Busca por título+autor en lugar de ISBN (más resultados para libros sin datos en APIs)
async function buscarPortadaWebScraping(titulo, autores, isbn) {
  const query = encodeURIComponent(
    [titulo, autores, 'portada libro']
      .filter(Boolean).join(' ')
      .slice(0, 120)
  );

  // 1) Intentar Bing Images (más permisivo con bots que Google)
  try {
    const bingUrl = `https://www.bing.com/images/search?q=${query}&qft=+filterui:photo-photo&form=IRFLTR`;
    const res = await fetch(bingUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Referer': 'https://www.bing.com/',
      },
      signal: AbortSignal.timeout(10000)
    });

    const html = await res.text();

    // Bing guarda las URLs en atributos "murl" dentro del JSON de cada resultado
    const murlMatches = [...html.matchAll(/"murl":"([^"]+)"/g)];
    const imageUrls = murlMatches
      .map(m => m[1])
      .filter(u => /\.(jpg|jpeg|png|webp)/i.test(u))
      .slice(0, 8); // probar las primeras 8

    for (const url of imageUrls) {
      try {
        const headRes = await fetch(url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const ct = headRes.headers.get('content-type') || '';
        const cl = Number(headRes.headers.get('content-length') || 0);
        if (headRes.ok && ct.startsWith('image/') && (cl === 0 || cl > 2000)) {
          return { fuente: 'bing-scraping', url };
        }
      } catch { continue; }
    }
  } catch (e) {
    console.warn('[portadas] Bing scraping falló:', e.message);
  }

  // 2) Fallback: Google Images (más agresivo con bloqueos, pero vale la pena intentar)
  try {
    const googleUrl = `https://www.google.com/search?q=${query}&tbm=isch&hl=es`;
    const res = await fetch(googleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'es-ES,es;q=0.9',
      },
      signal: AbortSignal.timeout(10000)
    });

    const html = await res.text();

    // Google incrusta thumbnails en base64 y URLs originales en JSON embebido
    // Buscamos el patrón de URLs de imagen directas
    const urlMatches = [...html.matchAll(/"(https?:\/\/[^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/g)];
    const imageUrls = urlMatches
      .map(m => m[1])
      .filter(u => !u.includes('google.com') && !u.includes('gstatic.com'))
      .slice(0, 8);

    for (const url of imageUrls) {
      try {
        const headRes = await fetch(url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const ct = headRes.headers.get('content-type') || '';
        const cl = Number(headRes.headers.get('content-length') || 0);
        if (headRes.ok && ct.startsWith('image/') && (cl === 0 || cl > 2000)) {
          return { fuente: 'google-scraping', url };
        }
      } catch { continue; }
    }
  } catch (e) {
    console.warn('[portadas] Google scraping falló:', e.message);
  }

  return null;
}

// ── buscarPortadaCompleta: API + scraping ─────────────────
// Orquesta las tres fuentes en orden: Google Books → Open Library → scraping web
async function buscarPortadaCompleta(isbn, titulo, autores) {
  // 1+2) APIs estructuradas (más fiables, sin riesgo legal)
  const desdeApi = await buscarPortadaUrl(isbn);
  if (desdeApi) return desdeApi;

  // 3) Scraping web como último recurso
  if (titulo) {
    const desdeScraping = await buscarPortadaWebScraping(titulo, autores, isbn);
    if (desdeScraping) return desdeScraping;
  }

  return null;
}

// ── POST /api/libros/:id/buscar-portada ───────────────────
// Busca y asigna portada para un libro concreto
router.post('/libros/:id/buscar-portada', requireAuth, async (req, res) => {
  const libroId = Number(req.params.id);

  try {
    // Obtener ISBN del libro
    const { rows } = await pool.query(
      'SELECT id, isbn, url_portada FROM libros WHERE id = $1',
      [libroId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Libro no encontrado' });

    const libro = rows[0];

    // Si ya tiene portada, no sobreescribir a menos que se indique force=true
    if (libro.url_portada && !req.body?.force) {
      return res.json({ ok: true, ya_tenia: true, url_portada: libro.url_portada });
    }

    if (!libro.isbn) return res.status(400).json({ error: 'El libro no tiene ISBN' });

    // Buscar URL
    const resultado = await buscarPortadaCompleta(libro.isbn, libro.titulo, libro.autores);
    if (!resultado) {
      return res.status(404).json({ error: 'No se encontró portada en ninguna fuente' });
    }

    // Descargar imagen
    const ext      = 'jpg';
    const filename = `portada_${libroId}_${Date.now()}.${ext}`;
    const destPath = path.join(UPLOADS_DIR, filename);

    await descargarImagen(resultado.url, destPath);

    // Verificar que el archivo tiene tamaño razonable (> 1KB)
    const stats = fs.statSync(destPath);
    if (stats.size < 1024) {
      fs.unlink(destPath, () => {});
      return res.status(404).json({ error: 'Imagen demasiado pequeña (posiblemente placeholder)' });
    }

    const urlPortada = `/uploads/${filename}`;

    // Guardar en BD
    await pool.query(
      'UPDATE libros SET url_portada = $1 WHERE id = $2',
      [urlPortada, libroId]
    );

    res.json({ ok: true, fuente: resultado.fuente, url_portada: urlPortada });
  } catch (e) {
    console.error('[portadas] Error:', e);
    res.status(500).json({ error: e.message || 'Error buscando portada' });
  }
});

// ── GET /api/portadas/sin-portada ─────────────────────────
// Devuelve libros del usuario que no tienen portada
router.get('/portadas/sin-portada', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT l.id, l.titulo, l.isbn, l.autores
       FROM libros l
       JOIN ejemplares ej ON ej.libro_id = l.id
       WHERE ej.usuario_id = $1
         AND (l.url_portada IS NULL OR l.url_portada = '')
         AND l.isbn IS NOT NULL AND l.isbn <> ''
       ORDER BY l.titulo ASC`,
      [req.usuario.id]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error obteniendo libros sin portada' });
  }
});

// ── POST /api/portadas/rellenar-todas ────────────────────
// Lanza búsqueda en lote para todos los libros sin portada del usuario.
// Responde inmediatamente con el total y procesa en background.
router.post('/portadas/rellenar-todas', requireAuth, async (req, res) => {
  try {
    const { rows: libros } = await pool.query(
      `SELECT DISTINCT l.id, l.isbn, l.titulo
       FROM libros l
       JOIN ejemplares ej ON ej.libro_id = l.id
       WHERE ej.usuario_id = $1
         AND (l.url_portada IS NULL OR l.url_portada = '')
         AND l.isbn IS NOT NULL AND l.isbn <> ''`,
      [req.usuario.id]
    );

    if (!libros.length) {
      return res.json({ ok: true, total: 0, mensaje: 'Todos tus libros ya tienen portada' });
    }

    // Responder ya — el proceso continúa en background
    res.json({
      ok: true,
      total: libros.length,
      mensaje: `Buscando portadas para ${libros.length} libro${libros.length > 1 ? 's' : ''}…`
    });

    // Procesar en background con concurrencia limitada (3 a la vez)
    const concurrencia = 3;
    let i = 0;
    const resultados = { ok: 0, error: 0 };

    async function worker() {
      while (i < libros.length) {
        const libro = libros[i++];
        try {
          const resultado = await buscarPortadaCompleta(libro.isbn, libro.titulo, libro.autores);
          if (!resultado) { resultados.error++; continue; }

          const filename = `portada_${libro.id}_${Date.now()}.jpg`;
          const destPath = path.join(UPLOADS_DIR, filename);
          await descargarImagen(resultado.url, destPath);

          const stats = fs.statSync(destPath);
          if (stats.size < 1024) {
            fs.unlink(destPath, () => {});
            resultados.error++;
            continue;
          }

          await pool.query(
            'UPDATE libros SET url_portada = $1 WHERE id = $2',
            [`/uploads/${filename}`, libro.id]
          );
          resultados.ok++;
        } catch (e) {
          console.warn(`[portadas] Error en libro ${libro.id} (${libro.isbn}):`, e.message);
          resultados.error++;
        }

        // Pausa breve para no saturar las APIs externas
        await new Promise(r => setTimeout(r, 300));
      }
    }

    await Promise.all(Array.from({ length: concurrencia }, worker));
    console.log(`[portadas] Lote completado: ${resultados.ok} ok, ${resultados.error} errores`);
  } catch (e) {
    console.error('[portadas] Error en lote:', e);
  }
});

// ── POST /api/libros/:id/portada-url ──────────────────────
// El usuario pega una URL encontrada manualmente; el servidor la descarga y guarda
router.post('/libros/:id/portada-url', requireAuth, async (req, res) => {
  const libroId = Number(req.params.id);
  const { url } = req.body;

  if (!url?.trim()) return res.status(400).json({ error: 'Falta la URL de la imagen' });

  // Validar que sea una URL de imagen razonable
  const urlLimpia = url.trim();
  if (!/^https?:\/\//.test(urlLimpia)) {
    return res.status(400).json({ error: 'La URL debe empezar por http:// o https://' });
  }

  try {
    // Verificar que el libro existe y pertenece a un ejemplar del usuario
    const { rows } = await pool.query(
      `SELECT l.id FROM libros l
       JOIN ejemplares ej ON ej.libro_id = l.id
       WHERE l.id = $1 AND ej.usuario_id = $2
       LIMIT 1`,
      [libroId, req.usuario.id]
    );
    if (!rows.length) return res.status(403).json({ error: 'Sin acceso a este libro' });

    const ext      = /\.png$/i.test(urlLimpia) ? 'png' : 'jpg';
    const filename = `portada_${libroId}_${Date.now()}.${ext}`;
    const destPath = path.join(UPLOADS_DIR, filename);

    await descargarImagen(urlLimpia, destPath);

    const stats = fs.statSync(destPath);
    if (stats.size < 1024) {
      fs.unlink(destPath, () => {});
      return res.status(400).json({ error: 'La imagen descargada es demasiado pequeña' });
    }

    const urlPortada = `/uploads/${filename}`;
    await pool.query('UPDATE libros SET url_portada = $1 WHERE id = $2', [urlPortada, libroId]);

    res.json({ ok: true, url_portada: urlPortada });
  } catch (e) {
    console.error('[portadas] Error URL manual:', e);
    res.status(500).json({ error: e.message || 'Error descargando la imagen' });
  }
});


// ── DELETE /api/libros/:id/portada ───────────────────────
// Elimina la portada de un libro (borra el archivo local y limpia la BD)
router.delete('/libros/:id/portada', requireAuth, async (req, res) => {
  const libroId = Number(req.params.id);

  try {
    // Verificar acceso
    const { rows } = await pool.query(
      `SELECT l.id, l.url_portada FROM libros l
       JOIN ejemplares ej ON ej.libro_id = l.id
       WHERE l.id = $1 AND ej.usuario_id = $2
       LIMIT 1`,
      [libroId, req.usuario.id]
    );
    if (!rows.length) return res.status(403).json({ error: 'Sin acceso a este libro' });

    const urlPortada = rows[0].url_portada;

    // Borrar archivo local si es un upload propio (no una URL externa)
    if (urlPortada && urlPortada.startsWith('/uploads/')) {
      const filePath = path.join(process.cwd(), urlPortada);
      fs.unlink(filePath, () => {}); // silencioso si no existe
    }

    // Limpiar en BD
    await pool.query('UPDATE libros SET url_portada = NULL WHERE id = $1', [libroId]);

    res.json({ ok: true });
  } catch (e) {
    console.error('[portadas] Error eliminando portada:', e);
    res.status(500).json({ error: e.message || 'Error eliminando portada' });
  }
});


export default router;
