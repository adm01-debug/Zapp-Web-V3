-- Migration: fix_retry_auto_fail_max_retry
-- Applied: 2026-08-06T11:07:46.845Z
-- Recovery: recriado 2026-08-07 via pg_get_functiondef (C-2 AUDIT_REPORT_2026-08-06.md)
-- fn_retry_stuck_messages nao transicionava mensagens esgotadas para 'failed',
-- causando loop infinito. Fix: Fase 1 = UPDATE para 'failed' com retry_attempt >= 3.
-- Fase 2 = guard de existencia de fn_enqueue_message_dispatch.

CREATE OR REPLACE FUNCTION zapp.fn_retry_stuck_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp, evo, pg_temp'
AS $$
DECLARE
  v_count         INTEGER := 0;
  v_failed_count  INTEGER := 0;
  r               RECORD;
  v_has_enq       BOOLEAN;
BEGIN
  -- Fase 1: Transicionar para 'failed' mensagens que esgotaram retries
  UPDATE evo.evolution_messages
     SET status     = 'failed',
         updated_at = NOW()
   WHERE status        = 'pending'
     AND updated_at    < NOW() - INTERVAL '10 minutes'
     AND retry_attempt >= 3;

  GET DIAGNOSTICS v_failed_count = ROW_COUNT;

  IF v_failed_count > 0 THEN
    RAISE NOTICE '[fn_retry_stuck_messages] % mensagem(ns) -> failed (retry_attempt >= 3)',
      v_failed_count;
  END IF;

  -- Fase 2: Verificar existencia de fn_enqueue_message_dispatch
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'fn_enqueue_message_dispatch'
  ) INTO v_has_enq;

  -- Fase 3: Retry mensagens ainda elegiveis (retry_attempt < 3)
  FOR r IN
    SELECT id, instance_name, remote_jid,
           COALESCE(retry_attempt, 0) AS attempt
      FROM evo.evolution_messages
     WHERE status        = 'pending'
       AND updated_at    < NOW() - INTERVAL '10 minutes'
       AND (retry_attempt IS NULL OR retry_attempt < 3)
     ORDER BY updated_at
     LIMIT 100
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      UPDATE evo.evolution_messages
         SET retry_attempt = r.attempt + 1,
             updated_at    = NOW(),
             status        = 'pending'
       WHERE id = r.id;

      IF v_has_enq THEN
        PERFORM zapp.fn_enqueue_message_dispatch(r.id, r.instance_name);
      END IF;

      v_count := v_count + 1;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[fn_retry_stuck_messages] falha mensagem id=%: %', r.id, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;
