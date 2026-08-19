-- F2-31: fn_sync_messages_to_v2 — ORDER BY para dreno determinístico de backlog
--
-- Contexto (auditoria 2026-08-06):
--   evo.fn_sync_messages_to_v2() roda via pg_cron (jobid 171, a cada 5 min) e sustenta o
--   espelho evo.evolution_webhook_events_v2 (lido pelo frontend admin) a partir de
--   evo.evolution_messages.
--
-- Bug latente encontrado: o INSERT ... SELECT usa LIMIT 500 SEM ORDER BY. O planner
-- escolhe "Index Scan Backward" no índice (instance_name, created_at DESC) — ou seja,
-- pega as mensagens MAIS NOVAS primeiro. Quando há backlog > 500 mensagens na janela
-- (ex.: pico de volume ou janela de indisponibilidade), a primeira leva insere as mais
-- novas, v_last_synced (max(created_at) do v2) avança, e as mensagens mais antigas da
-- janela ficam para sempre ABAIXO do novo window_start — nunca mais espelhadas (gap
-- permanente no espelho, sem erro visível).
--
-- Fix: ORDER BY m.created_at ASC — drena o backlog do mais antigo para o mais novo;
-- v_last_synced só avança quando a fila está zerada (ou <= 500 pendentes). Zero mudança
-- de comportamento no steady-state (janela de ~5 min, query indexada — EXPLAIN ANALYZE
-- 1.3 ms em 2026-08-05).
--
-- Aplicado via psql no supabase_db (user postgres) — idempotente (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION evo.fn_sync_messages_to_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo'
AS $function$
DECLARE
  v_last_synced   timestamptz;
  v_inserted      int := 0;
  v_window_start  timestamptz;
BEGIN
  -- Pegar último evento REAL (não heartbeat, não backfill) em v2
  SELECT max(created_at)
  INTO v_last_synced
  FROM evo.evolution_webhook_events_v2
  WHERE instance_name = 'wpp2'
    AND payload->>'heartbeat' IS NULL
    AND payload->>'backfill_source' IS NULL;

  -- Se não há eventos reais, sincronizar últimas 2h
  v_window_start := COALESCE(v_last_synced, now() - interval '2 hours');

  -- Inserir novas mensagens como eventos messages.upsert
  -- [F2-31 2026-08-06] ORDER BY m.created_at ASC: dreno de backlog determinístico
  -- (mais antigas primeiro). Sem ORDER BY o planner usava index backward (mais novas
  -- primeiro) e, com backlog > LIMIT, o window_start avançava deixando mensagens
  -- órfãs abaixo da janela para sempre.
  INSERT INTO evo.evolution_webhook_events_v2 (
    id, event_type, instance_name, remote_jid, from_me,
    message_type, push_name, payload, processed, processed_at,
    status, retry_count, created_at
  )
  SELECT
    gen_random_uuid(),
    'messages.upsert',
    m.instance_name,
    m.remote_jid,
    m.from_me,
    m.message_type,
    NULL,
    jsonb_build_object(
      'messageId', m.message_id,
      'remoteJid', m.remote_jid,
      'fromMe', m.from_me,
      'messageType', m.message_type,
      'content', m.content,
      'sync_source', 'fn_sync_messages_to_v2',
      'sync_ts', now()
    ),
    true,
    now(),
    'processed',
    0,
    m.created_at
  FROM evo.evolution_messages m
  WHERE m.instance_name = 'wpp2'
    AND m.created_at > v_window_start
    AND NOT EXISTS (
      SELECT 1 FROM evo.evolution_webhook_events_v2 ev
      WHERE ev.instance_name = 'wpp2'
        AND ev.created_at = m.created_at
        AND ev.payload->>'messageId' = m.message_id
    )
  ORDER BY m.created_at ASC
  LIMIT 500;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'window_start', v_window_start,
    'executed_at', now()
  );
END;
$function$;
