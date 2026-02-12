BEGIN;

-- 1) Favoritos (1 fila por usuario+libro)
CREATE TABLE IF NOT EXISTS public.libro_favoritos (
  usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  libro_id   integer NOT NULL REFERENCES public.libros(id)   ON DELETE CASCADE,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, libro_id)
);

-- 2) Etiquetas (tags) (varias filas por usuario+libro)
CREATE TABLE IF NOT EXISTS public.libro_tags (
  id         bigserial PRIMARY KEY,
  usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  libro_id   integer NOT NULL REFERENCES public.libros(id)   ON DELETE CASCADE,
  tag        text NOT NULL,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT libro_tags_tag_len CHECK (length(btrim(tag)) > 0)
);

-- Evita duplicados del mismo tag en el mismo libro para el mismo usuario
CREATE UNIQUE INDEX IF NOT EXISTS uq_libro_tags_usuario_libro_tag
  ON public.libro_tags (usuario_id, libro_id, lower(tag));

CREATE INDEX IF NOT EXISTS idx_libro_tags_usuario_libro
  ON public.libro_tags (usuario_id, libro_id);

-- 3) Notas de texto (historial por libro)
CREATE TABLE IF NOT EXISTS public.libro_notas (
  id            bigserial PRIMARY KEY,
  usuario_id    integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  libro_id      integer NOT NULL REFERENCES public.libros(id)   ON DELETE CASCADE,
  texto         text NOT NULL,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT libro_notas_texto_len CHECK (length(btrim(texto)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_libro_notas_usuario_libro
  ON public.libro_notas (usuario_id, libro_id, creado_en DESC);

-- Trigger para actualizar actualizado_en
CREATE OR REPLACE FUNCTION public.set_actualizado_en()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_libro_notas_actualizado ON public.libro_notas;
CREATE TRIGGER trg_libro_notas_actualizado
BEFORE UPDATE OF texto ON public.libro_notas
FOR EACH ROW EXECUTE FUNCTION public.set_actualizado_en();

-- 4) Audios (metadata en BD; el archivo va a disco o S3)
CREATE TABLE IF NOT EXISTS public.libro_audios (
  id          bigserial PRIMARY KEY,
  usuario_id  integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  libro_id    integer NOT NULL REFERENCES public.libros(id)   ON DELETE CASCADE,
  storage     text NOT NULL DEFAULT 'local',   -- 'local' o 's3'
  path        text NOT NULL,                  -- ruta local o key/url
  mime        text NOT NULL,
  bytes       bigint NOT NULL,
  duracion_ms integer,
  creado_en   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_libro_audios_usuario_libro
  ON public.libro_audios (usuario_id, libro_id, creado_en DESC);

COMMIT;
