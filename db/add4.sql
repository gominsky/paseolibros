-- db/add4.sql
-- 1) Libros que me han prestado: leerlos (en curso, con marcapáginas) y marcarlos como leídos;
--    cuentan en las estadísticas
-- 2) Bibliotecas compartidas: aparecer voluntariamente en la lista de usuarios
-- Se puede ejecutar varias veces sin problema.

ALTER TABLE public.libros_recibidos
  ADD COLUMN IF NOT EXISTS leido       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fecha_leido DATE,
  -- también pueden estar «en curso» (aparecen en Leyendo, con marcapáginas)
  ADD COLUMN IF NOT EXISTS leyendo              BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fecha_inicio_lectura DATE,
  ADD COLUMN IF NOT EXISTS pagina_actual        INTEGER;

CREATE INDEX IF NOT EXISTS idx_lr_usuario_leido
  ON public.libros_recibidos (usuario_id) WHERE leido = TRUE;

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS visible_compartir BOOLEAN NOT NULL DEFAULT FALSE;
