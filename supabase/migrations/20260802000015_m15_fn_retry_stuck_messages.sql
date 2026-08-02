-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260802000015_m15_fn_retry_stuck_messages.sql
-- Purpose  : F4-23 CRÍTICO — rewrite zapp.fn_retry_stuck_messages() to operate
--            on evo.evolution_messages instead of the empty outbound_message_queue.
--
-- Root cause: the original function queried zapp.outbound_message_queue which
--   never receives rows (messages are written to evo.evolution_messages). The
--   retry cron therefore ran every minute and retried zero messages.
--
-- Fix: query evo.evolution_messages for rows with:
--   status = 'pending'
--   updated_at < NOW() - INTERVAL '10 minutes'
--   retry_attempt IS NULL OR retry_attempt < 3
-- For each stuck row: increment retry_attempt, update updated_at, call
--   zapp.fn_enqueue_message_dispatch() if it exists; fall back to direct
--   status → 'queued' update so the polling worker can pick it up.
--
-- SECURITY DEFINER + SET search_path so the cron invocation (service_role)
-- can write across schemas without privilege escalation.
-- Idempotência: CREATE OR REPLACE — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

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
  -- Check whether the dispatch enqueue helper exists.
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
     LIMIT 100                        -- bounded batch per cron tick
  LOOP
    BEGIN
      -- Increment retry counter and reset timestamp to avoid tight loops.
      UPDATE evo.evolution_messages
         SET retry_attempt = r.attempt + 1,
             updated_at    = NOW(),
             status        = CASE
                               WHEN v_has_enq THEN 'pending'   -- enqueue fn takes over
                               ELSE 'queued'                   -- polling worker picks up
                             END
       WHERE id = r.id;

      IF v_has_enq THEN
        PERFORM zapp.fn_enqueue_message_dispatch(r.id, r.instance_name);
      END IF;

      v_count := v_count + 1;

    EXCEPTION WHEN OTHERS THEN
      -- Log per-row failures; continue processing remaining rows.
      RAISE WARNING '[fn_retry_stuck_messages] failed to retry message id=%: %', r.id, SQLERRM;
    END;
  END LOOP;

  IF v_count > 0 THEN
    RAISE NOTICE '[fn_retry_stuck_messages] retried % stuck messages', v_count;
  END IF;

  RETURN v_count;
END;
$function$;

-- Permissions: only service_role (cron) should call this.
REVOKE EXECUTE ON FUNCTION zapp.fn_retry_stuck_messages() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION zapp.fn_retry_stuck_messages() TO service_role;

-- Verification
DO $$
DECLARE
  v_secdef  BOOLEAN;
  v_lang    TEXT;
BEGIN
  SELECT prosecdef, l.lanname
    INTO v_secdef, v_lang
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_language l  ON l.oid = p.prolang
   WHERE n.nspname = 'zapp' AND p.proname = 'fn_retry_stuck_messages';

  IF NOT FOUND THEN
    RAISE EXCEPTION '[M-15 VER] fn_retry_stuck_messages não encontrada após criação';
  END IF;

  IF NOT v_secdef THEN
    RAISE EXCEPTION '[M-15 VER] fn_retry_stuck_messages não é SECURITY DEFINER';
  END IF;

  RAISE NOTICE '[M-15 VER] fn_retry_stuck_messages OK — lang=% SECURITY DEFINER ✓ (F4-23 aplicado)', v_lang;
END $$;
