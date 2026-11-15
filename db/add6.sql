-- db/add6.sql — Libros electrónicos (15/11/2026)
-- Se guardan en la misma tabla que los libros prestados (comparten lectura, marcapáginas
-- y estadísticas), marcados con electronico = TRUE y sin prestador. No se mezclan con la
-- biblioteca real. Se aplica sola al arrancar (src/migraciones.js); se puede repetir.
SET search_path = public;

ALTER TABLE public.libros_recibidos
  ADD COLUMN IF NOT EXISTS electronico BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS formato     TEXT;
ALTER TABLE public.libros_recibidos ALTER COLUMN prestador DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lr_usuario_electronico ON public.libros_recibidos (usuario_id, electronico);
