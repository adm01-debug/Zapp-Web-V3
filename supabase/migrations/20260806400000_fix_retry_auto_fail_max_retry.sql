-- ============================================================================
-- FIX P2 — Mensagens presas em pending com retry_attempt >= 3 nunca transitam
-- para 'failed' (GAP-OPERACIONAL)
-- ============================================================================
-- Tipo: FIX OPERACIONAL
--
-- PROBLEMA:
--   fn_retry_stuck_messages processa apenas mensagens com retry_attempt < 3.
--   Mensagens que atingem retry_attempt = 3 ficam permanentemente presas em
--   status='pending' — nunca transitam para 'failed'. Em 2026-08-06 foram
--   identificadas 23 mensagens nesse estado (mais antigas: 2026-07-26).
--
-- CAUSA RAIZ:
--   Ausência de uma fase de transição para 'failed' quando o limite de retry
--   é atingido. O WHERE da função exclui corretamente retry_attempt >= 3 do
--   loop de retry, mas não há nenhum mecanismo que marque esse estado como
--   terminal.
--
-- CORREÇÃO:
--   1. Migração imediata: UPDATE direto nas 23 mensagens já presas (status=pending,
--      retry_attempt >= 3, sem atividade há mais de 10 minutos).
--   2. Atualizar fn_retry_stuck_messages: adicionar Fase 1 que auto-falha mensagens
--      com retry_attempt >= 3 a cada execução do cron (a cada 10 min).
--
-- Detectado em: auditoria exaustiva 5 agentes — 2026-08-06
-- ============================================================================

-- ─── Passo 1: Corrigir imediatamente as 23 mensagens já presas ───────────────
UPDATE evo.evolution_messages
SET
  status     = 'failed',
  updated_at = NOW()
WHERE status        = 'pending'
  AND retry_attempt >= 3
  AND updated_at    < NOW() - INTERVAL '10 minutes';

-- ─── Passo 2: Atualizar fn_retry_stuck_messages com fase de auto-fail ────────
CREATE OR REPLACE FUNCTION zapp.fn_retry_stuck_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'zapp, evo, public'
AS $$
DECLARE
  v_count         INTEGER := 0;
  v_failed_count  INTEGER := 0;
  r               RECORD;
  v_has_enq       BOOLEAN;
BEGIN
  -- ── Fase 1: Transicionar para 'failed' mensagens que esgotaram os retries ──
  -- Mensagens pending com retry_attempt >= 3 e paradas há mais de 10 min são
  -- terminais: nunca serão reprocessadas. Marcá-las como 'failed' desbloqueia
  -- o estado e permite que dashboards/alertas as classifiquem corretamente.
  UPDATE evo.evolution_messages
     SET status     = 'failed',
         updated_at = NOW()
   WHERE status        = 'pending'
     AND updated_at    < NOW() - INTERVAL '10 minutes'
     AND retry_attempt >= 3;

  GET DIAGNOSTICS v_failed_count = ROW_COUNT;

  IF v_failed_count > 0 THEN
    RAISE NOTICE '[fn_retry_stuck_messages] % mensagem(ns) transicionada(s) para failed (retry_attempt >= 3)',
      v_failed_count;
  END IF;

  -- ── Fase 2: Verificar existência de fn_enqueue_message_dispatch ───────────
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'fn_enqueue_message_dispatch'
  ) INTO v_has_enq;

  -- ── Fase 3: Retry mensagens ainda elegíveis (retry_attempt < 3) ──────────
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
      RAISE WARNING '[fn_retry_stuck_messages] falha ao retentar mensagem id=%: %',
        r.id, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION zapp.fn_retry_stuck_messages() IS
'Cron a cada 10min: Fase 1 marca como failed mensagens pending com retry_attempt>=3 '
'(estado terminal). Fase 2 retenta mensagens ainda elegíveis (retry_attempt<3). '
'FIX P2 (2026-08-06, GAP-OPERACIONAL): fase de auto-fail adicionada.';
