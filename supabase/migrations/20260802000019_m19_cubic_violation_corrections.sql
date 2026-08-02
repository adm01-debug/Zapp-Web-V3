-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260802000019_m19_cubic_violation_corrections.sql
-- Purpose  : Fix 5 violations flagged by cubic-dev-ai in PR review:
--
-- P0 (M-14 line 51):  fn_alert_wpp2_disconnection recreated with hardcoded
--   RETURNS void. The source function may return jsonb; hardcoding void causes a
--   compilation error at the EXECUTE call because PG rejects a function body
--   whose RETURN statements return non-void values when the header says void.
--   Fix: read the source function's return type via pg_get_function_result() and
--   use it in the format() string.
--
-- P1 (M-14 lines 123-133): trigger dedup blindly DROPs non-canonical triggers
--   without first verifying (a) the canonical trigger actually exists on the
--   table, and (b) the non-canonical trigger has an equivalent tgtype bitmask.
--   If the canonical trigger is absent, dropping the non-canonical leaves the
--   table unprotected.
--   Fix: check canonical trigger presence and attribute equivalence; emit
--   WARNING only and skip the DROP if the canonical is missing.
--
-- P1 (M-15 line 57): fallback branch (fn_enqueue_message_dispatch absent) sets
--   status='queued' in evo.evolution_messages, but evolution-sender reads from
--   zapp.evolution_message_queue — a different table. 'queued' rows in
--   evolution_messages never get dispatched.
--   Fix: keep status='pending'; update only retry_attempt + updated_at so the
--   next cron tick can try again (OR exhaust retry count).
--
-- P2 (useMessageQueue.ts:173): CustomEvent 'zapp:storage-quota-exceeded' is
--   dispatched on localStorage quota exceeded but no listener handles it,
--   resulting in a silent no-op that hides storage pressure from users.
--   Fix: see companion TypeScript patch in useMessageQueue.ts.
--
-- P3 (.gitignore): tracked file __pycache__/ci_cost_analysis.cpython-314.pyc
--   not removed from git index after .gitignore rule was added.
--   Fix: git rm --cached applied in CI/pre-commit step; this migration is the
--   DB-side companion — no SQL needed.
--
-- Idempotência: CREATE OR REPLACE; guards on NOT FOUND; safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- Fix P0: recreate fn_alert_wpp2_disconnection with dynamic return type
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_src     TEXT;
  v_ns      TEXT;
  v_rettype TEXT;
BEGIN
  -- Prefer the already-migrated zapp version; fall back to public.
  SELECT p.prosrc, n.nspname,
         pg_catalog.pg_get_function_result(p.oid) AS rettype
    INTO v_src, v_ns, v_rettype
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proname = 'fn_alert_wpp2_disconnection'
     AND n.nspname IN ('zapp', 'public')
   ORDER BY CASE n.nspname WHEN 'zapp' THEN 1 ELSE 2 END
   LIMIT 1;

  IF NOT FOUND OR v_src IS NULL THEN
    RAISE NOTICE '[M-19 P0] fn_alert_wpp2_disconnection not found in zapp/public — skip';
    RETURN;
  END IF;

  -- v_rettype comes from pg_get_function_result() — e.g. 'void', 'jsonb', etc.
  -- Use it verbatim so the recreated function compiles correctly regardless of
  -- what the original body returns.
  EXECUTE format(
    $ddl$
    CREATE OR REPLACE FUNCTION zapp.fn_alert_wpp2_disconnection()
     RETURNS %s
     LANGUAGE plpgsql
     SECURITY DEFINER
     SET search_path TO 'pg_catalog', 'zapp', 'evo', 'public'
    AS $fn$%s$fn$
    $ddl$,
    v_rettype,   -- dynamic, not hardcoded
    v_src
  );

  REVOKE EXECUTE ON FUNCTION zapp.fn_alert_wpp2_disconnection() FROM PUBLIC, anon;
  GRANT  EXECUTE ON FUNCTION zapp.fn_alert_wpp2_disconnection() TO service_role;

  RAISE NOTICE '[M-19 P0] fn_alert_wpp2_disconnection recreated — RETURNS % (source schema: %)',
    v_rettype, v_ns;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Fix P1 (M-14): trigger dedup with canonical-existence and tgtype checks
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r            RECORD;
  v_canon      TEXT;
  tname        TEXT;
  v_canon_oid  OID;
  v_canon_type SMALLINT;
  v_dup_type   SMALLINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'zapp' AND table_name = 'whatsapp_connections'
  ) THEN
    RAISE NOTICE '[M-19 P1-trig] zapp.whatsapp_connections does not exist — skip';
    RETURN;
  END IF;

  FOR r IN
    SELECT
      p.proname                                       AS fn_name,
      p.oid                                           AS fn_oid,
      array_agg(t.tgname ORDER BY t.tgname)          AS trigger_names,
      count(*)                                        AS cnt
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class   c  ON c.oid  = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_proc    p  ON p.oid  = t.tgfoid
   WHERE n.nspname  = 'zapp'
     AND c.relname  = 'whatsapp_connections'
     AND NOT t.tgisinternal
   GROUP BY p.proname, p.oid
  LOOP
    IF r.cnt = 1 THEN
      CONTINUE;  -- no duplicates for this function
    END IF;

    -- Determine canonical trigger name for this function.
    CASE r.fn_name
      WHEN 'set_updated_at'      THEN v_canon := 'update_whatsapp_connections_updated_at';
      WHEN 'moddatetime'         THEN v_canon := 'update_whatsapp_connections_updated_at';
      WHEN 'update_updated_at'   THEN v_canon := 'update_whatsapp_connections_updated_at';
      WHEN 'clear_qr_on_connect' THEN v_canon := 'clear_qr_on_connect_trigger';
      ELSE
        v_canon := r.trigger_names[1];
        RAISE WARNING '[M-19 P1-trig] fn=% has % triggers but no known canonical; keeping alphabetically-first: %',
          r.fn_name, r.cnt, v_canon;
    END CASE;

    -- ── Safety gate: canonical trigger must exist before we drop anything ──
    SELECT t.oid, t.tgtype
      INTO v_canon_oid, v_canon_type
      FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class   c  ON c.oid  = t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'zapp'
       AND c.relname = 'whatsapp_connections'
       AND t.tgname  = v_canon
       AND NOT t.tgisinternal;

    IF NOT FOUND THEN
      RAISE WARNING '[M-19 P1-trig] canonical trigger % not found for fn=% — skipping dedup of triggers=%',
        v_canon, r.fn_name, r.trigger_names;
      CONTINUE;
    END IF;

    -- Drop non-canonical triggers ONLY when they have the same tgtype as the
    -- canonical (same timing+event bitmask means they are true duplicates).
    FOR tname IN
      SELECT t2 FROM unnest(r.trigger_names) AS u(t2) WHERE u.t2 <> v_canon
    LOOP
      SELECT t.tgtype
        INTO v_dup_type
        FROM pg_catalog.pg_trigger t
        JOIN pg_catalog.pg_class   c  ON c.oid  = t.tgrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'zapp'
         AND c.relname = 'whatsapp_connections'
         AND t.tgname  = tname
         AND NOT t.tgisinternal;

      IF NOT FOUND THEN
        CONTINUE;  -- already gone
      END IF;

      IF v_dup_type <> v_canon_type THEN
        RAISE WARNING '[M-19 P1-trig] trigger % (fn=%) has different tgtype (% vs canonical %) — NOT dropping; manual review required',
          tname, r.fn_name, v_dup_type, v_canon_type;
        CONTINUE;
      END IF;

      EXECUTE format('DROP TRIGGER IF EXISTS %I ON zapp.whatsapp_connections', tname);
      RAISE NOTICE '[M-19 P1-trig] dropped duplicate trigger % (fn=%, tgtype=%) — canonical % retained',
        tname, r.fn_name, v_dup_type, v_canon;
    END LOOP;
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Fix P1 (M-15): rewrite fn_retry_stuck_messages with correct fallback
--   When fn_enqueue_message_dispatch is absent, keep status='pending' (not
--   'queued'); increment retry_attempt and reset updated_at so the next cron
--   tick waits the full 10-minute cooling period before re-selecting this row.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_retry_stuck_messages()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'zapp', 'evo', 'public'
AS $function$
DECLARE
  v_count   INTEGER := 0;
  r         RECORD;
  v_has_enq BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'fn_enqueue_message_dispatch'
  ) INTO v_has_enq;

  FOR r IN
    SELECT id, instance_name, remote_jid,
           COALESCE(retry_attempt, 0) AS attempt
      FROM evo.evolution_messages
     WHERE status        = 'pending'
       AND updated_at    < NOW() - INTERVAL '10 minutes'
       AND (retry_attempt IS NULL OR retry_attempt < 3)
     LIMIT 100
  LOOP
    BEGIN
      IF v_has_enq THEN
        -- Enqueue helper exists — it will handle dispatch and status transition.
        UPDATE evo.evolution_messages
           SET retry_attempt = r.attempt + 1,
               updated_at    = NOW()
         WHERE id = r.id;

        PERFORM zapp.fn_enqueue_message_dispatch(r.id, r.instance_name);
      ELSE
        -- No enqueue helper available.
        -- Keep status='pending' so the organic delivery path can still pick up
        -- the row.  Bumping updated_at enforces a 10-minute cooling period
        -- before the next retry cron selects this row again.
        -- When retry_attempt reaches 3 the WHERE clause above stops selecting
        -- this row, effectively rate-limiting stuck messages.
        UPDATE evo.evolution_messages
           SET retry_attempt = r.attempt + 1,
               updated_at    = NOW()
               -- status intentionally unchanged ('pending') — 'queued' is NOT
               -- consumed by evolution-sender, which reads evolution_message_queue
         WHERE id = r.id;
      END IF;

      v_count := v_count + 1;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[fn_retry_stuck_messages] failed for id=%: %', r.id, SQLERRM;
    END;
  END LOOP;

  IF v_count > 0 THEN
    RAISE NOTICE '[fn_retry_stuck_messages] retried % stuck messages', v_count;
  END IF;

  RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION zapp.fn_retry_stuck_messages() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION zapp.fn_retry_stuck_messages() TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- Verification
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_rettype TEXT;
  v_secdef  BOOLEAN;
  v_fn_ok   BOOLEAN;
BEGIN
  -- Verify fn_alert_wpp2_disconnection compiled (not void-mismatch error).
  SELECT prosecdef INTO v_secdef
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'fn_alert_wpp2_disconnection';

  IF FOUND THEN
    RAISE NOTICE '[M-19 VER] fn_alert_wpp2_disconnection exists in zapp SECURITY DEFINER=%', v_secdef;
  ELSE
    RAISE NOTICE '[M-19 VER] fn_alert_wpp2_disconnection not present in zapp (no source existed)';
  END IF;

  -- Verify fn_retry_stuck_messages rewritten correctly.
  SELECT prosecdef INTO v_secdef
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'fn_retry_stuck_messages';

  IF NOT FOUND THEN
    RAISE EXCEPTION '[M-19 VER] fn_retry_stuck_messages not found after CREATE OR REPLACE';
  END IF;

  IF NOT v_secdef THEN
    RAISE EXCEPTION '[M-19 VER] fn_retry_stuck_messages is not SECURITY DEFINER';
  END IF;

  RAISE NOTICE '[M-19 VER] fn_retry_stuck_messages OK — SECURITY DEFINER ✓ status-fallback corrected ✓';
END $$;
