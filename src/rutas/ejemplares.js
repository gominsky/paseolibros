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

/**
 * Obtiene datos de un libro desde Open Library usando el ISBN.
 * Usa el endpoint de búsqueda para obtener título, autores, editorial, etc.
 */
async function obtenerDatosLibroDeApi(isbn) {
  const url = `https://openlibrary.org/search.json?isbn=${isbn}`;

  const respuesta = await fetch(url);
  if (!respuesta.ok) {
    console.warn(`Open Library devolvió estado ${respuesta.status} para ISBN ${isbn}`);
    return null;
  }

  const data = await respuesta.json();
  if (!data.docs || data.docs.length === 0) {
    return null;
  }

  const libro = data.docs[0];

  return {
    isbn,
    titulo: libro.title || `Título desconocido (${isbn})`,
    autores: libro.author_name ? libro.author_name.join(', ') : null,
    editorial: libro.publisher ? libro.publisher.join(', ') : null,
    fecha_publicacion: libro.first_publish_year
      ? String(libro.first_publish_year)
      : null,
    numero_paginas: libro.number_of_pages_median || null,
    descripcion: null, // se podría enriquecer con otra llamada si quisieras
    url_portada: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`
  };
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

/**
 * Endpoint: crear un ejemplar a partir de un ISBN
 * POST /api/ejemplares
 * Body:
 *  {
 *    "usuario_id": 1,
 *    "isbn": "9788497592208",
 *    "estado": "propio",
 *    "ubicacion": "Salón - Estantería 3",
 *    "notas": "Comprado en 2025"
 *  }
 */
router.post('/', async (req, res) => {
  let { usuario_id, isbn, estado, ubicacion, notas } = req.body;

  if (!usuario_id || !isbn) {
    return res.status(400).json({ error: 'usuario_id e isbn son obligatorios' });
  }

  const isbnLimpio = limpiarIsbn(isbn);

  if (!isbnLimpio) {
    return res.status(400).json({ error: 'ISBN no válido' });
  }

  try {
    // 1. ¿El libro ya existe en la BD?
    let libro = await buscarLibroEnBD(isbnLimpio);

    // 2. Si no existe, lo intentamos obtener de la API
    if (!libro) {
      let datosLibro = await obtenerDatosLibroDeApi(isbnLimpio);

      // Si no encontramos datos, creamos un libro mínimo
      if (!datosLibro) {
        datosLibro = {
          isbn: isbnLimpio,
          titulo: `Libro desconocido (${isbnLimpio})`,
          autores: null,
          editorial: null,
          fecha_publicacion: null,
          numero_paginas: null,
          descripcion: null,
          url_portada: null
        };
      }

      libro = await crearLibroEnBD(datosLibro);
    }

    // 3. Crear el ejemplar para el usuario
    const resultadoEjemplar = await pool.query(
      `INSERT INTO ejemplares (usuario_id, libro_id, estado, ubicacion, notas)
       VALUES ($1, $2, COALESCE($3, 'propio'), $4, $5)
       RETURNING *`,
      [
        usuario_id,
        libro.id,
        estado || null,
        ubicacion || null,
        notas || null
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
        l.isbn,
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

export default router;
