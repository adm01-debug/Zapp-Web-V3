-- ============================================================
-- Migration: Performance Indexes for Contacts
-- Purpose: Support 100k+ contacts with sub-200ms search
-- ============================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create unaccent-aware search function (immutable = indexable)
CREATE OR REPLACE FUNCTION public.contact_search_vector(
  name    text,
  phone   text,
  email   text,
  company text
)
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  setweight(
    to_tsvector('portuguese', unaccent(coalesce(name, ''))),
    'A'
  ) ||
  setweight(
    to_tsvector('simple', coalesce(regexp_replace(phone, '[^0-9]', '', 'g'), '')),
    'B'
  ) ||
  setweight(
    to_tsvector('simple', unaccent(coalesce(email, ''))),
    'B'
  ) ||
  setweight(
    to_tsvector('portuguese', unaccent(coalesce(company, ''))),
    'C'
  )
$$;

-- 3. Add generated search_vector column (auto-updated on INSERT/UPDATE)
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
      contact_search_vector(name, phone, email, company)
    ) STORED;

-- 4. GIN index on search_vector (full-text search — handles "jose" → "José")
CREATE INDEX IF NOT EXISTS idx_contacts_search_vector
  ON public.contacts USING gin(search_vector)
  WHERE deleted_at IS NULL;

-- 5. Trigram index on name (fuzzy search — handles typos and partial matches)
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm
  ON public.contacts USING gin(unaccent(name) gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- 6. Hash index on normalized phone (exact phone lookup — O(1))
-- Normalized: strip all non-digits
CREATE INDEX IF NOT EXISTS idx_contacts_phone_normalized
  ON public.contacts (regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'))
  WHERE deleted_at IS NULL AND phone IS NOT NULL;

-- 7. Hash index on email (exact email lookup)
CREATE INDEX IF NOT EXISTS idx_contacts_email
  ON public.contacts (lower(coalesce(email, '')))
  WHERE deleted_at IS NULL AND email IS NOT NULL;

-- 8. Composite index for workspace + active contacts (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_contacts_workspace_active
  ON public.contacts (workspace_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- 9. Index for birthday queries (ContactBirthdayPanel)
CREATE INDEX IF NOT EXISTS idx_contacts_birthday_month
  ON public.contacts (
    EXTRACT(MONTH FROM birth_date),
    EXTRACT(DAY FROM birth_date)
  )
  WHERE deleted_at IS NULL AND birth_date IS NOT NULL;

-- 10. Index for last seen / recency queries
CREATE INDEX IF NOT EXISTS idx_contacts_last_seen
  ON public.contacts (last_seen_at DESC NULLS LAST)
  WHERE deleted_at IS NULL;

-- 11. RPC: Full-text + trigram hybrid search with unaccent support
CREATE OR REPLACE FUNCTION public.search_contacts(
  p_query        text,
  p_workspace_id uuid,
  p_limit        integer DEFAULT 50,
  p_offset       integer DEFAULT 0
)
RETURNS TABLE (
  id            uuid,
  name          text,
  phone         text,
  email         text,
  company       text,
  tags          text[],
  channel       text,
  avatar_url    text,
  created_at    timestamptz,
  last_seen_at  timestamptz,
  rank          real
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tsquery    tsquery;
  v_normalized text;
BEGIN
  -- Normalize query: remove accents, trim whitespace
  v_normalized := unaccent(trim(p_query));

  -- Build tsquery (websearch format handles multi-word gracefully)
  BEGIN
    v_tsquery := websearch_to_tsquery('portuguese', v_normalized);
  EXCEPTION WHEN OTHERS THEN
    v_tsquery := plainto_tsquery('portuguese', v_normalized);
  END;

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.phone,
    c.email,
    c.company,
    c.tags,
    c.channel,
    c.avatar_url,
    c.created_at,
    c.last_seen_at,
    -- Hybrid rank: full-text weight + trigram similarity
    (
      ts_rank(c.search_vector, v_tsquery) * 0.7 +
      similarity(unaccent(c.name), v_normalized) * 0.3
    )::real AS rank
  FROM public.contacts c
  WHERE
    c.workspace_id = p_workspace_id
    AND c.deleted_at IS NULL
    AND (
      c.search_vector @@ v_tsquery
      OR similarity(unaccent(c.name), v_normalized) > 0.3
      OR unaccent(lower(c.phone)) LIKE '%' || v_normalized || '%'
      OR unaccent(lower(c.email)) LIKE '%' || v_normalized || '%'
    )
  ORDER BY rank DESC, c.last_seen_at DESC NULLS LAST
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;
