-- db/add7.sql — Posponer o abandonar lecturas (16/11/2026)
-- Se aplica sola al arrancar (src/migraciones.js); se puede repetir.
SET search_path = public;

-- Lecturas de mis libros: estado 'leyendo' | 'pospuesto' | 'abandonado' | 'terminado'
-- fecha_estado = cuándo se pospuso o abandonó.
ALTER TABLE public.lecturas ADD COLUMN IF NOT EXISTS fecha_estado TIMESTAMP;

-- Libros prestados y electrónicos: en pausa (conserva la página y la fecha de inicio)
ALTER TABLE public.libros_recibidos
  ADD COLUMN IF NOT EXISTS pospuesto       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fecha_pospuesto DATE;
