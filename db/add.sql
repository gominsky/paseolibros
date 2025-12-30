CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE ejemplares
  ADD COLUMN IF NOT EXISTS tipo TEXT;

ALTER TABLE ejemplares
  ALTER COLUMN tipo SET DEFAULT 'libro';

CREATE TABLE IF NOT EXISTS deseos (
  id            BIGSERIAL PRIMARY KEY,
  usuario_id    BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

  titulo        TEXT NOT NULL,
  autores       TEXT,
  isbn          TEXT,

  tipo          TEXT DEFAULT 'libro',
  ubicacion     TEXT,   -- ← aquí guardas “Salón - Estantería 1”, etc.

  prioridad     INT  NOT NULL DEFAULT 2 CHECK (prioridad BETWEEN 1 AND 3),
  notas         TEXT,
  url_portada   TEXT,

  titulo_norm   TEXT NOT NULL DEFAULT '',
  autores_norm  TEXT NOT NULL DEFAULT '',
  ubicacion_norm TEXT NOT NULL DEFAULT '',

  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION deseos_set_norm()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.titulo_norm :=
    regexp_replace(lower(unaccent(coalesce(NEW.titulo,''))), '\s+', ' ', 'g');

  NEW.autores_norm :=
    regexp_replace(lower(unaccent(coalesce(NEW.autores,''))), '\s+', ' ', 'g');

  NEW.ubicacion_norm :=
    regexp_replace(lower(unaccent(coalesce(NEW.ubicacion,''))), '\s+', ' ', 'g');

  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deseos_set_norm ON deseos;

CREATE TRIGGER trg_deseos_set_norm
BEFORE INSERT OR UPDATE OF titulo, autores, isbn, tipo, ubicacion, prioridad, notas, url_portada
ON deseos
FOR EACH ROW
EXECUTE FUNCTION deseos_set_norm();
CREATE INDEX IF NOT EXISTS idx_deseos_usuario_creado
  ON deseos (usuario_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_deseos_titulo_trgm
  ON deseos USING gin (titulo_norm gin_trgm_ops)
  WHERE titulo_norm <> '';

CREATE INDEX IF NOT EXISTS idx_deseos_autores_trgm
  ON deseos USING gin (autores_norm gin_trgm_ops)
  WHERE autores_norm <> '';

CREATE INDEX IF NOT EXISTS idx_deseos_ubicacion_trgm
  ON deseos USING gin (ubicacion_norm gin_trgm_ops)
  WHERE ubicacion_norm <> '';

CREATE INDEX IF NOT EXISTS idx_deseos_usuario_tipo
  ON deseos (usuario_id, tipo);

-- Evitar duplicados si hay ISBN
CREATE UNIQUE INDEX IF NOT EXISTS uq_deseos_usuario_isbn
  ON deseos (usuario_id, isbn)
  WHERE isbn IS NOT NULL AND length(trim(isbn)) > 0;
