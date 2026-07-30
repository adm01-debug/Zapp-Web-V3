ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS slug text;

UPDATE public.departments
   SET slug = trim(both '-' from lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')))
 WHERE slug IS NULL OR slug = '';

-- Desambiguar eventuais colisões pós-normalização
WITH d AS (
  SELECT id, slug,
         row_number() OVER (PARTITION BY slug ORDER BY created_at NULLS LAST, id) AS rn
    FROM public.departments
)
UPDATE public.departments t
   SET slug = t.slug || '-' || d.rn
  FROM d
 WHERE d.id = t.id AND d.rn > 1;

ALTER TABLE public.departments
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS departments_slug_unique
  ON public.departments (slug);