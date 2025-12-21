// src/rutas/ejemplares.js
import { Router } from 'express';
import fetch from 'node-fetch';
import pool from '../bd.js';

const router = Router();

/**
 * Limpia el ISBN (quita espacios, guiones, etc.)
 */
function limpiarIsbn(isbn) {
  if (!isbn) return null;
  return isbn.replace(/[^0-9Xx]/g, '');
}

/**
 * Busca un libro en la BD por ISBN
 */
async function buscarLibroEnBD(isbn) {
  const resultado = await pool.query(
    'SELECT * FROM libros WHERE isbn = $1',
    [isbn]
  );
  return resultado.rows[0] || null;
}
function normalizarAutores(arr) {
  if (!arr) return null;
  if (Array.isArray(arr)) return arr.filter(Boolean).join(', ') || null;
  return String(arr);
}

function normalizarEditorial(arr) {
  if (!arr) return null;
  if (Array.isArray(arr)) return arr.filter(Boolean).join(', ') || null;
  return String(arr);
}

/**
 * Obtiene datos de un libro desde Open Library usando el ISBN.
 * Usa el endpoint de búsqueda para obtener título, autores, editorial, etc.
 */
async function obtenerDatosLibroDeApi(isbn) {
  // 1) GOOGLE BOOKS (gratis con cuota)
  try {
    const urlGoogle = `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`;
    const rG = await fetch(urlGoogle);

    if (rG.ok) {
      const g = await rG.json();
      if (g.items && g.items.length > 0) {
        // elegimos el primero; normalmente es el mejor match por ISBN
        const v = g.items[0].volumeInfo || {};

        const titulo = v.title || `Título desconocido (${isbn})`;
        const autores = v.authors ? v.authors.join(', ') : null;
        const editorial = v.publisher || null;
        const fecha_publicacion = v.publishedDate ? String(v.publishedDate).slice(0, 4) : null;
        const numero_paginas = v.pageCount || null;
        const descripcion = v.description || null;

        // imagen (si existe)
        const img =
          (v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail)) || null;

        return {
          isbn,
          titulo,
          autores,
          editorial,
          fecha_publicacion,
          numero_paginas,
          descripcion,
          url_portada: img, // a veces viene en http/https
        };
      }
    }
  } catch (e) {
    console.warn('Google Books falló:', e?.message || e);
  }

  // 2) OPEN LIBRARY BOOKS API (por ISBN)
  try {
    const urlOLBooks = `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`;
    const rB = await fetch(urlOLBooks);

    if (rB.ok) {
      const b = await rB.json();
      const key = `ISBN:${isbn}`;
      const libro = b[key];

      if (libro) {
        const titulo = libro.title || `Título desconocido (${isbn})`;
        const autores = libro.authors ? libro.authors.map(a => a.name) : null;
        const editorial = libro.publishers ? libro.publishers.map(p => p.name) : null;

        // fecha: puede venir en publish_date tipo "2007" o "May 2007"
        const fecha_publicacion = libro.publish_date
          ? String(libro.publish_date).match(/\d{4}/)?.[0] || null
          : null;

        const numero_paginas = libro.number_of_pages || null;

        // cover: large/medium/small
        const url_portada =
          (libro.cover && (libro.cover.large || libro.cover.medium || libro.cover.small)) ||
          `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;

        return {
          isbn,
          titulo,
          autores: normalizarAutores(autores),
          editorial: normalizarEditorial(editorial),
          fecha_publicacion,
          numero_paginas,
          descripcion: null,
          url_portada,
        };
      }
    }
  } catch (e) {
    console.warn('OpenLibrary Books API falló:', e?.message || e);
  }

  // 3) OPEN LIBRARY SEARCH (tu implementación actual, como fallback final)
  try {
    const url = `https://openlibrary.org/search.json?isbn=${encodeURIComponent(isbn)}`;
    const respuesta = await fetch(url);

    if (!respuesta.ok) {
      console.warn(`Open Library search devolvió estado ${respuesta.status} para ISBN ${isbn}`);
      return null;
    }

    const data = await respuesta.json();
    if (!data.docs || data.docs.length === 0) return null;

    const libro = data.docs[0];

    return {
      isbn,
      titulo: libro.title || `Título desconocido (${isbn})`,
      autores: libro.author_name ? libro.author_name.join(', ') : null,
      editorial: libro.publisher ? libro.publisher.join(', ') : null,
      fecha_publicacion: libro.first_publish_year ? String(libro.first_publish_year) : null,
      numero_paginas: libro.number_of_pages_median || null,
      descripcion: null,
      url_portada: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`,
    };
  } catch (e) {
    console.warn('OpenLibrary search falló:', e?.message || e);
    return null;
  }
}

/**
 * Crea un registro en la tabla libros
 */
async function crearLibroEnBD(datosLibro) {
  const {
    isbn,
    titulo,
    autores,
    editorial,
    fecha_publicacion,
    numero_paginas,
    descripcion,
    url_portada
  } = datosLibro;

  const resultado = await pool.query(
    `INSERT INTO libros (
       isbn, titulo, autores, editorial, fecha_publicacion,
       numero_paginas, descripcion, url_portada
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      isbn,
      titulo,
      autores,
      editorial,
      fecha_publicacion,
      numero_paginas,
      descripcion,
      url_portada
    ]
  );

  return resultado.rows[0];
}

// Crear un ejemplar a partir de un ISBN
router.post('/', async (req, res) => {
  // usuario viene del token, NO del body
  const usuario_id = req.usuario?.id;
  let { isbn, estado, ubicacion, notas, tipo } = req.body;

  if (!usuario_id) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }

  if (!isbn) {
    return res.status(400).json({ error: 'isbn es obligatorio' });
  }

  const isbnLimpio = limpiarIsbn(isbn);

  if (!isbnLimpio) {
    return res.status(400).json({ error: 'ISBN no válido' });
  }

  try {
    // 1. ¿El libro ya existe en la BD?
    let libro = await buscarLibroEnBD(isbnLimpio);

    // 2. Si no existe, lo obtenemos de la API o creamos mínimo
    if (!libro) {
      let datosLibro = await obtenerDatosLibroDeApi(isbnLimpio);

      if (!datosLibro) {
        datosLibro = {
          isbn: isbnLimpio,
          titulo: `Libro desconocido (${isbnLimpio})`,
          autores: null,
          editorial: null,
          fecha_publicacion: null,
          numero_paginas: null,
          descripcion: null,
          url_portada: null,
        };
      }

      libro = await crearLibroEnBD(datosLibro);
    }

const resultadoEjemplar = await pool.query(
  `INSERT INTO ejemplares (usuario_id, libro_id, estado, ubicacion, notas, tipo)
   VALUES ($1, $2, COALESCE($3, 'propio'), $4, $5, COALESCE($6, 'libro'))
   RETURNING *`,
  [
    usuario_id,
    libro.id,
    estado || null,
    ubicacion || null,
    notas || null,
    tipo || null,
  ]
);

    const ejemplar = resultadoEjemplar.rows[0];

    res.status(201).json({ ejemplar, libro });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creando ejemplar a partir del ISBN' });
  }
});

// Listar ejemplares (opcionalmente filtrando por usuario_id ?usuario_id=1)
router.get('/', async (req, res) => {
  const { usuario_id } = req.query;

  try {
    let consulta = `
  SELECT 
    e.id AS ejemplar_id,
    e.usuario_id,
    u.nombre_usuario,
    e.libro_id,
    l.titulo,
    l.autores,
    l.isbn,
    l.url_portada,
    e.estado,
    e.ubicacion,
    e.notas,
    e.creado_en
  FROM ejemplares e
  JOIN usuarios u ON u.id = e.usuario_id
  JOIN libros l ON l.id = e.libro_id
`;

    const parametros = [];

    if (usuario_id) {
      consulta += ' WHERE e.usuario_id = $1';
      parametros.push(usuario_id);
    }

    consulta += ' ORDER BY e.creado_en DESC';

    const resultado = await pool.query(consulta, parametros);
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo ejemplares' });
  }
});
// Eliminar (borrado lógico) un ejemplar
router.delete('/:id', async (req, res) => {
  const ejemplarId = Number(req.params.id);

  if (!ejemplarId) {
    return res.status(400).json({ error: 'ID de ejemplar no válido' });
  }

  try {
    // Solo puedes eliminar ejemplares tuyos
    const resultado = await pool.query(
      `UPDATE ejemplares
       SET activo = FALSE
       WHERE id = $1
         AND usuario_id = $2
         AND activo = TRUE
       RETURNING *`,
      [ejemplarId, req.usuario.id]
    );

    if (resultado.rowCount === 0) {
      return res
        .status(404)
        .json({ error: 'Ejemplar no encontrado o ya eliminado' });
    }

    res.json({ ok: true, ejemplar: resultado.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error eliminando ejemplar' });
  }
});
// Obtener un ejemplar concreto (del usuario autenticado)
router.get('/:id', async (req, res) => {
  const ejemplarId = Number(req.params.id);
  if (!ejemplarId) {
    return res.status(400).json({ error: 'ID de ejemplar no válido' });
  }

  try {
    const resultado = await pool.query(
      `SELECT 
         e.id,
         e.usuario_id,
         e.libro_id,
         e.estado,
         e.ubicacion,
         e.notas,
         e.activo,
         e.creado_en
       FROM ejemplares e
       WHERE e.id = $1
         AND e.usuario_id = $2`,
      [ejemplarId, req.usuario.id]
    );

    if (resultado.rowCount === 0) {
      return res
        .status(404)
        .json({ error: 'Ejemplar no encontrado o no pertenece al usuario' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo ejemplar' });
  }
});

// Actualizar un ejemplar (estado / ubicación / notas)
router.put('/:id', async (req, res) => {
  const ejemplarId = Number(req.params.id);
  if (!ejemplarId) {
    return res.status(400).json({ error: 'ID de ejemplar no válido' });
  }

  const { estado, ubicacion, notas } = req.body;

  try {
    const resultado = await pool.query(
      `UPDATE ejemplares
       SET
         estado = COALESCE($1, estado),
         ubicacion = COALESCE($2, ubicacion),
         notas = COALESCE($3, notas)
       WHERE id = $4
         AND usuario_id = $5
         AND activo = TRUE
       RETURNING *`,
      [estado, ubicacion, notas, ejemplarId, req.usuario.id]
    );

    if (resultado.rowCount === 0) {
      return res
        .status(404)
        .json({ error: 'Ejemplar no encontrado o no editable' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error actualizando ejemplar' });
  }
});

export default router;
