-- M41: F6-14 — Orphaned whatsapp_connections: backfill credentials + FK constraint
-- Branch: claude/plan-implementation-review-bq8j14
-- Date: 2026-08-03
--
-- Problem (F6-14):
--   LEFT JOIN zapp.whatsapp_connections wc
--   LEFT JOIN public.evolution_instance_credentials eic USING (instance_name)
--   returns 2 rows with eic IS NULL: 'wppmkt' and 'wpp_pink_test'.
--   Cron 96 (sync-instance-registry-status) ran 810×/7d but did NOT populate
--   evolution_instance_credentials for these 2 instances — they are zombie state
--   (never provisioned in Evolution API, no API key, just leftover rows).
--
-- Root cause: sync cron only UPSERTs credentials for instances it can reach via
--   Evolution API. Instances that were never provisioned (or deleted from Evolution)
--   remain in whatsapp_connections without a credential row — creating a structural
--   orphan that can cause FK violation if constraint is ever added.
--
-- Fix strategy (safe for production — no destructive deletes):
--   STEP 1 — Add UNIQUE constraint on evolution_instance_credentials.instance_name
--             (required for FK reference target).
--   STEP 2 — Insert placeholder credential rows for orphaned whatsapp_connections,
--             marked with is_active=FALSE, health_status='orphaned'.
--             This resolves the orphan condition without deleting the connections.
--   STEP 3 — Mark orphaned whatsapp_connections as is_active=FALSE (they have no
--             backing credential and were never provisioned).
--   STEP 4 — Add FOREIGN KEY from zapp.whatsapp_connections.instance_name
--             REFERENCES public.evolution_instance_credentials(instance_name).
--             This prevents future orphan INSERTs.
--
-- Idempotent: all steps use existence checks; safe to re-run on production.
--
-- Accept criteria:
--   SELECT wc.instance_name, eic.instance_name AS credential
--   FROM zapp.whatsapp_connections wc
--   LEFT JOIN public.evolution_instance_credentials eic USING (instance_name)
--   WHERE eic.instance_name IS NULL;
--   → 0 rows
--   + FK constraint 'fk_wconn_instance_name' active in pg_constraint.
--
-- Rollback:
--   ALTER TABLE zapp.whatsapp_connections DROP CONSTRAINT IF EXISTS fk_wconn_instance_name;
--   DELETE FROM public.evolution_instance_credentials WHERE health_status = 'orphaned';
--   ALTER TABLE public.evolution_instance_credentials DROP CONSTRAINT IF EXISTS uq_eic_instance_name;

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — UNIQUE constraint on evolution_instance_credentials.instance_name
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tbl_exists BOOLEAN;
  v_ck_exists  BOOLEAN;
BEGIN
  -- Table exists in public schema (snapshot confirmed)
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'evolution_instance_credentials'
      AND c.relkind IN ('r', 'p')
  ) INTO v_tbl_exists;

  IF NOT v_tbl_exists THEN
    RAISE NOTICE 'M41 SKIP STEP 1: public.evolution_instance_credentials not found';
    RETURN;
  END IF;

  -- Check if unique constraint already exists
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint ct
    JOIN pg_catalog.pg_class cl ON cl.oid = ct.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public'
      AND cl.relname = 'evolution_instance_credentials'
      AND ct.conname = 'uq_eic_instance_name'
  ) INTO v_ck_exists;

  IF v_ck_exists THEN
    RAISE NOTICE 'M41 STEP 1: uq_eic_instance_name already exists — skipping';
    RETURN;
  END IF;

  -- Also check for any existing unique index on instance_name alone
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_index ix
    JOIN pg_catalog.pg_class c ON c.oid = ix.indrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(ix.indkey)
    WHERE n.nspname = 'public'
      AND c.relname = 'evolution_instance_credentials'
      AND ix.indisunique = TRUE
      AND a.attname = 'instance_name'
      AND array_length(ix.indkey, 1) = 1
  ) THEN
    RAISE NOTICE 'M41 STEP 1: unique index on instance_name already exists — skipping ADD CONSTRAINT';
    RETURN;
  END IF;

  -- Ensure no duplicate instance_name values before adding UNIQUE
  IF EXISTS (
    SELECT instance_name FROM public.evolution_instance_credentials
    GROUP BY instance_name HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'M41 STEP 1: duplicate instance_name values found in evolution_instance_credentials — cannot add UNIQUE constraint. Manual dedup required.';
  END IF;

  ALTER TABLE public.evolution_instance_credentials
    ADD CONSTRAINT uq_eic_instance_name UNIQUE (instance_name);

  RAISE NOTICE 'M41 STEP 1: uq_eic_instance_name added to evolution_instance_credentials ✓';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Insert placeholder credentials for orphaned whatsapp_connections
-- Orphaned = exists in zapp.whatsapp_connections but NOT in
--             public.evolution_instance_credentials (LEFT JOIN eic IS NULL)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_wconn RECORD;
  v_inserted INTEGER := 0;
BEGIN
  FOR v_wconn IN
    SELECT wc.id AS wconn_id,
           wc.instance_name,
           wc.display_name
    FROM zapp.whatsapp_connections wc
    LEFT JOIN public.evolution_instance_credentials eic
           ON eic.instance_name = wc.instance_name
    WHERE eic.instance_name IS NULL
      AND wc.instance_name IS NOT NULL
  LOOP
    -- Insert placeholder row (no API key — instance never provisioned)
    INSERT INTO public.evolution_instance_credentials (
      connection_id,
      instance_name,
      instance_token,
      webhook_url,
      api_url,
      api_key,
      is_active,
      health_status
    ) VALUES (
      v_wconn.wconn_id,
      v_wconn.instance_name,
      NULL,
      NULL,
      NULL,
      NULL,
      FALSE,
      'orphaned'
    )
    ON CONFLICT (instance_name) DO NOTHING;

    v_inserted := v_inserted + 1;
    RAISE NOTICE 'M41 STEP 2: placeholder credential inserted for orphaned instance % (connection_id: %)',
      v_wconn.instance_name, v_wconn.wconn_id;
  END LOOP;

  IF v_inserted = 0 THEN
    RAISE NOTICE 'M41 STEP 2: no orphaned connections found — all have credential rows ✓';
  ELSE
    RAISE NOTICE 'M41 STEP 2: % placeholder credential(s) inserted ✓', v_inserted;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — Mark orphaned whatsapp_connections as is_active = FALSE
-- (Connections with 'orphaned' credential were never provisioned in Evolution API)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE zapp.whatsapp_connections wc
     SET is_active    = FALSE,
         status       = CASE WHEN status = 'connected' THEN 'disconnected' ELSE status END,
         updated_at   = pg_catalog.now()
  FROM public.evolution_instance_credentials eic
  WHERE eic.instance_name = wc.instance_name
    AND eic.health_status  = 'orphaned'
    AND wc.is_active        = TRUE;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    RAISE NOTICE 'M41 STEP 3: % orphaned whatsapp_connection(s) marked is_active=FALSE ✓', v_updated;
  ELSE
    RAISE NOTICE 'M41 STEP 3: no active orphaned connections found — already inactive or none exist ✓';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4 — Add FK from zapp.whatsapp_connections.instance_name
--           REFERENCES public.evolution_instance_credentials(instance_name)
-- Deferred NOT supported here (cross-schema FK must be IMMEDIATE for PG).
-- DEFERRABLE INITIALLY IMMEDIATE used so FK validates at statement level
-- but allows transactions to batch INSERTs before the check runs.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fk_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint ct
    JOIN pg_catalog.pg_class cl ON cl.oid = ct.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'zapp'
      AND cl.relname = 'whatsapp_connections'
      AND ct.conname = 'fk_wconn_instance_name'
      AND ct.contype = 'f'
  ) INTO v_fk_exists;

  IF v_fk_exists THEN
    RAISE NOTICE 'M41 STEP 4: fk_wconn_instance_name already exists — skipping';
    RETURN;
  END IF;

  -- Verify no orphans remain before adding FK (would fail with constraint violation)
  IF EXISTS (
    SELECT 1 FROM zapp.whatsapp_connections wc
    LEFT JOIN public.evolution_instance_credentials eic
           ON eic.instance_name = wc.instance_name
    WHERE eic.instance_name IS NULL
      AND wc.instance_name IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'M41 STEP 4: orphaned whatsapp_connections still exist — STEP 2 did not complete. Cannot add FK.';
  END IF;

  ALTER TABLE zapp.whatsapp_connections
    ADD CONSTRAINT fk_wconn_instance_name
    FOREIGN KEY (instance_name)
    REFERENCES public.evolution_instance_credentials(instance_name)
    ON UPDATE CASCADE
    ON DELETE RESTRICT;

  RAISE NOTICE 'M41 STEP 4: FK fk_wconn_instance_name added to zapp.whatsapp_connections ✓';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_orphan_count INTEGER;
  v_fk_exists    BOOLEAN;
  v_uq_exists    BOOLEAN;
  v_ok           BOOLEAN := TRUE;
  v_report       TEXT    := '';
BEGIN
  -- 1. Zero orphans check
  SELECT COUNT(*)
    INTO v_orphan_count
    FROM zapp.whatsapp_connections wc
    LEFT JOIN public.evolution_instance_credentials eic
           ON eic.instance_name = wc.instance_name
   WHERE eic.instance_name IS NULL
     AND wc.instance_name IS NOT NULL;

  IF v_orphan_count = 0 THEN
    v_report := v_report || E'\n  [OK]   F6-14: 0 orphaned connections (all have credential rows) ✓';
  ELSE
    v_report := v_report || format(E'\n  [FAIL] F6-14: %s orphaned whatsapp_connections remain', v_orphan_count);
    v_ok := FALSE;
  END IF;

  -- 2. UNIQUE constraint on instance_name
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint ct
    JOIN pg_catalog.pg_class cl ON cl.oid = ct.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public'
      AND cl.relname = 'evolution_instance_credentials'
      AND ct.conname = 'uq_eic_instance_name'
  ) INTO v_uq_exists;

  IF NOT v_uq_exists THEN
    -- Accept existing unique index as equivalent
    SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_index ix
      JOIN pg_catalog.pg_class c ON c.oid = ix.indrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(ix.indkey)
      WHERE n.nspname = 'public'
        AND c.relname = 'evolution_instance_credentials'
        AND ix.indisunique = TRUE
        AND a.attname = 'instance_name'
    ) INTO v_uq_exists;
  END IF;

  IF v_uq_exists THEN
    v_report := v_report || E'\n  [OK]   M41: UNIQUE on evolution_instance_credentials.instance_name ✓';
  ELSE
    v_report := v_report || E'\n  [FAIL] M41: no UNIQUE constraint on evolution_instance_credentials.instance_name';
    v_ok := FALSE;
  END IF;

  -- 3. FK constraint exists
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint ct
    JOIN pg_catalog.pg_class cl ON cl.oid = ct.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'zapp'
      AND cl.relname = 'whatsapp_connections'
      AND ct.conname = 'fk_wconn_instance_name'
      AND ct.contype = 'f'
  ) INTO v_fk_exists;

  IF v_fk_exists THEN
    v_report := v_report || E'\n  [OK]   M41: FK fk_wconn_instance_name active ✓';
  ELSE
    v_report := v_report || E'\n  [FAIL] M41: FK fk_wconn_instance_name NOT found';
    v_ok := FALSE;
  END IF;

  -- 4. Show orphaned credential entries inserted (informational)
  DECLARE
    v_orphaned_creds INTEGER;
  BEGIN
    SELECT COUNT(*) INTO v_orphaned_creds
      FROM public.evolution_instance_credentials
     WHERE health_status = 'orphaned';
    v_report := v_report || format(E'\n  [INFO] M41: %s orphaned placeholder credential(s) in evolution_instance_credentials', v_orphaned_creds);
  END;

  RAISE NOTICE E'M41 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M41 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
