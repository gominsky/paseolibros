-- db/add8.sql — Valoración media de lectores (17/11/2026)
-- Goodreads cerró su API en 2020: la nota se toma de Open Library (o Google Books)
-- y se guarda aquí 30 días para no consultarla cada vez. Automática al arrancar.
SET search_path = public;

ALTER TABLE public.libros
  ADD COLUMN IF NOT EXISTS valoracion_media  NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS valoracion_votos  INTEGER,
  ADD COLUMN IF NOT EXISTS valoracion_fuente TEXT,
  ADD COLUMN IF NOT EXISTS valoracion_url    TEXT,
  ADD COLUMN IF NOT EXISTS valoracion_en     TIMESTAMP;
