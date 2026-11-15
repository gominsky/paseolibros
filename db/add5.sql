-- db/add5.sql — Reparaciones idempotentes (15/11/2026)
-- Se aplica sola al arrancar el servidor (src/migraciones.js). Se puede repetir sin problema.
SET search_path = public;

-- 1) libros_recibidos: por si la tabla se creó antes con otra definición
ALTER TABLE public.libros_recibidos
  ADD COLUMN IF NOT EXISTS autores        TEXT,
  ADD COLUMN IF NOT EXISTS fecha_recibido DATE,
  ADD COLUMN IF NOT EXISTS fecha_devolver DATE,
  ADD COLUMN IF NOT EXISTS notas          TEXT,
  ADD COLUMN IF NOT EXISTS devuelto       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fecha_devuelto DATE,
  ADD COLUMN IF NOT EXISTS creado_en      TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.libros_recibidos ALTER COLUMN fecha_recibido SET DEFAULT CURRENT_DATE;
ALTER TABLE public.libros_recibidos ALTER COLUMN fecha_recibido DROP NOT NULL;
ALTER TABLE public.libros_recibidos ALTER COLUMN autores        DROP NOT NULL;
ALTER TABLE public.libros_recibidos ALTER COLUMN fecha_devolver DROP NOT NULL;
ALTER TABLE public.libros_recibidos ALTER COLUMN notas          DROP NOT NULL;

-- 2) Contadores de id al día: tras restaurar una copia, el contador puede quedarse
--    por detrás de los ids existentes y cada alta falla con «llave duplicada».
--    Solo se adelantan, nunca se retrasan.
DO $$
DECLARE
  r RECORD;
  maximo BIGINT;
  actual BIGINT;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name,
           pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), c.column_name) AS seq
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), c.column_name) IS NOT NULL
  LOOP
    EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM public.%I', r.column_name, r.table_name) INTO maximo;
    EXECUTE format('SELECT last_value FROM %s', r.seq) INTO actual;
    IF maximo >= actual THEN
      PERFORM setval(r.seq, maximo, true);
    END IF;
  END LOOP;
END $$;
