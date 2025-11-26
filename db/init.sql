BEGIN;

-- Borrar tablas antiguas si existen
DROP TABLE IF EXISTS prestamos CASCADE;
DROP TABLE IF EXISTS lecturas CASCADE;
DROP TABLE IF EXISTS ejemplares CASCADE;
DROP TABLE IF EXISTS libros CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;

-- =========================
-- Tabla: usuarios
-- =========================
CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  nombre_usuario VARCHAR(50) UNIQUE NOT NULL,
  correo VARCHAR(100),
  contrasena_hash TEXT NOT NULL,
  creado_en TIMESTAMP DEFAULT NOW()
);

-- =========================
-- Tabla: libros
-- =========================
CREATE TABLE libros (
  id SERIAL PRIMARY KEY,
  isbn VARCHAR(20) UNIQUE NOT NULL,
  titulo TEXT NOT NULL,
  autores TEXT,
  editorial TEXT,
  fecha_publicacion VARCHAR(20),
  numero_paginas INT,
  descripcion TEXT,
  url_portada TEXT,
  creado_en TIMESTAMP DEFAULT NOW()
);

-- =========================
-- Tabla: ejemplares (libros físicos que tiene un usuario)
-- =========================
CREATE TABLE ejemplares (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id),
  libro_id INTEGER REFERENCES libros(id),
  estado TEXT,
  ubicacion TEXT,
  notas TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ejemplares_usuario_id ON ejemplares(usuario_id);
CREATE INDEX idx_ejemplares_libro_id ON ejemplares(libro_id);

-- =========================
-- Tabla: lecturas (histórico de lecturas)
-- =========================
CREATE TABLE lecturas (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  libro_id INT NOT NULL REFERENCES libros(id) ON DELETE CASCADE,
  ejemplar_id INT REFERENCES ejemplares(id) ON DELETE SET NULL,
  estado VARCHAR(20) NOT NULL,         -- 'leyendo', 'terminado', 'abandonado'
  inicio TIMESTAMP NOT NULL DEFAULT NOW(),
  fin TIMESTAMP,
  pagina_actual INT,
  valoracion INT CHECK (valoracion BETWEEN 1 AND 5),
  notas TEXT
);

CREATE INDEX idx_lecturas_usuario_id ON lecturas(usuario_id);
CREATE INDEX idx_lecturas_libro_id ON lecturas(libro_id);

-- =========================
-- Tabla: prestamos (histórico de préstamos)
-- =========================
CREATE TABLE prestamos (
  id SERIAL PRIMARY KEY,
  ejemplar_id INT NOT NULL REFERENCES ejemplares(id) ON DELETE CASCADE,
  usuario_prestador_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  usuario_receptor_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
  nombre_receptor VARCHAR(100),
  fecha_prestamo TIMESTAMP NOT NULL DEFAULT NOW(),
  fecha_limite DATE,
  fecha_devolucion TIMESTAMP,
  estado VARCHAR(20) NOT NULL DEFAULT 'activo',  -- 'activo', 'devuelto', 'perdido'
  notas TEXT
);

CREATE INDEX idx_prestamos_prestador_id ON prestamos(usuario_prestador_id);
CREATE INDEX idx_prestamos_receptor_id ON prestamos(usuario_receptor_id);

-- =========================
-- Datos de ejemplo
-- =========================

-- Usuarios
INSERT INTO usuarios (nombre_usuario, correo, contrasena_hash) VALUES
  ('ana', 'ana@example.com', 'hash-ana'),
  ('carlos', 'carlos@example.com', 'hash-carlos');

-- Libros
INSERT INTO libros (isbn, titulo, autores, editorial, fecha_publicacion, numero_paginas, descripcion, url_portada) VALUES
  ('9788497592208', 'El Señor de los Anillos', 'J. R. R. Tolkien', 'Minotauro', '2002', 1200, 'Edición de ejemplo.', NULL),
  ('9788498382662', 'Juego de Tronos', 'George R. R. Martin', 'Gigamesh', '2002', 800, 'Libro 1 de Canción de Hielo y Fuego.', NULL),
  ('9788420471839', 'Cien años de soledad', 'Gabriel García Márquez', 'Sudamericana', '1967', 500, 'Clásico.', NULL);

-- Ejemplares
-- usuarios: ana = 1, carlos = 2
-- libros: lotr = 1, got = 2, cien = 3
INSERT INTO ejemplares (usuario_id, libro_id, estado, ubicacion, notas) VALUES
  (1, 1, 'propio', 'Salón - Estantería 1', 'Edición tapa dura'),
  (1, 2, 'propio', 'Salón - Estantería 2', NULL),
  (2, 3, 'propio', 'Habitación - Estantería', 'Regalo');

-- Lecturas
INSERT INTO lecturas (usuario_id, libro_id, ejemplar_id, estado, inicio, fin, pagina_actual, valoracion, notas) VALUES
  (1, 1, 1, 'terminado', NOW() - INTERVAL '30 days', NOW() - INTERVAL '25 days', 1200, 5, 'Primera lectura de prueba');

INSERT INTO lecturas (usuario_id, libro_id, ejemplar_id, estado, inicio, pagina_actual, notas) VALUES
  (2, 2, 2, 'leyendo', NOW() - INTERVAL '5 days', 150, 'Leyendo poco a poco');

-- Préstamo de ejemplo: Ana presta "Juego de Tronos" a Carlos
INSERT INTO prestamos (ejemplar_id, usuario_prestador_id, usuario_receptor_id, nombre_receptor, fecha_prestamo, fecha_limite, fecha_devolucion, estado, notas) VALUES
  (2, 1, 2, NULL, NOW() - INTERVAL '10 days', (NOW() + INTERVAL '20 days')::date, NULL, 'activo', 'Préstamo de prueba');

COMMIT;

ALTER TABLE ejemplares
  ADD COLUMN activo BOOLEAN NOT NULL DEFAULT TRUE;