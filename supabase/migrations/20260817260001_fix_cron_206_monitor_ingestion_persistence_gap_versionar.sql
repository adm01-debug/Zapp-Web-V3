-- =============================================================================
-- FIX CRON 206 — monitor-ingestion-persistence-gap (idempotente)
-- 2026-08-17 | audit 20260816 | SIM-4
--
-- PROBLEMA (CRON_FAILURES_7D §3.2, 15 falhas 08-13):
--   relation "evo.evolution_audit_log" does not exist — a tabela migrou para
--   zapp no Lote 6; a função ops.fn_monitor_ingestion_persistence_gap
--   referenciava evo.* (drift de schema A6/A9).
--
-- FIX JÁ APLICADO EM PROD (PREFLIGHT_CHECKLIST GAP-2) VIA CREATE OR REPLACE
--   DIRETO NO BANCO, MAS NÃO VERSIONADO: esta migration versiona o corpo
--   CORRIGIDO (tabela real zapp.evolution_audit_log) + CREATE TABLE guard
--   para DB fresco (DDL da tabela também só existe em prod — A8) + guard
--   idempotente do comando (padrão A: UPDATE por jobid, re-run = UPDATE 0).
--
-- CORPO FONTE: pg_get_functiondef() de prod em 2026-08-17 17:40Z (idêntico,
--   única mudança já embutida: evo.evolution_audit_log -> zapp.evolution_audit_log).
-- COMANDO VIVO EM PROD: SELECT ops.fn_monitor_ingestion_persistence_gap()
--   (sem args — usa os defaults abaixo; conferido via cron.job em 17:40Z).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PASSO 0: DDL da tabela real (gap A8 — só existe em prod; guard p/ DB fresco)
-- Colunas extraídas de information_schema em prod (14 colunas, 17:40Z).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zapp.evolution_audit_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action            varchar NOT NULL,
  entity_type       varchar NOT NULL,
  entity_id         uuid,
  performed_by      varchar NOT NULL,
  performed_by_type varchar,
  old_values        jsonb,
  new_values        jsonb,
  changes           jsonb,
  ip_address        varchar,
  user_agent        text,
  session_id        varchar,
  metadata          jsonb,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE zapp.evolution_audit_log ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- PASSO 1: versionar o corpo corrigido (CREATE OR REPLACE — idempotente)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ops.fn_monitor_ingestion_persistence_gap(
  p_window interval DEFAULT '00:30:00'::interval,
  p_min_upserts integer DEFAULT 5,
  p_degraded_ratio numeric DEFAULT 0.05,
  p_cooldown interval DEFAULT '01:00:00'::interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ops', 'evo', 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_upserts       bigint;
  v_persisted     bigint;
  v_canary        bigint;
  v_canary_new    bigint;
  v_esperado      bigint;
  v_ratio         numeric;
  v_estado        text;
  v_msg           text;
  v_ja_alertou    boolean := false;
  v_cooldown_efetivo interval;
  v_reconectou_recente boolean := false;
  v_ultima_reconexao timestamptz;
BEGIN
  v_cooldown_efetivo := GREATEST(coalesce(p_cooldown, '1 hour'::interval), '1 minute'::interval);

  -- Guard de reconexão (evolution_connection_history = Grupo A → permanece em evo)
  SELECT MAX(created_at) INTO v_ultima_reconexao
  FROM evo.evolution_connection_history
  WHERE state IN ('connecting','connecting_timeout','disconnected')
    AND instance_name = 'wpp2'
    AND created_at > now() - (p_window + '30 minutes'::interval);

  IF v_ultima_reconexao IS NOT NULL THEN
    v_reconectou_recente := true;
  END IF;

  SELECT count(*) INTO v_upserts
  FROM zapp.webhook_events_processed
  WHERE event_type = 'messages.upsert'
    AND processed_at > now() - p_window;

  SELECT count(*) INTO v_persisted
  FROM zapp.evolution_messages_wpp2
  WHERE created_at > now() - p_window;

  -- Canary original: evolution_audit_log migrado para zapp no Lote 6
  SELECT count(*) INTO v_canary
  FROM zapp.evolution_audit_log
  WHERE action = 'canary_filtered'
    AND created_at > now() - p_window;

  SELECT count(*) INTO v_canary_new
  FROM zapp.evolution_messages_wpp2
  WHERE message_id LIKE 'pg-cron-canary-%'
    AND created_at > now() - p_window;

  v_persisted := GREATEST(0, v_persisted - v_canary_new);
  v_esperado  := GREATEST(0, v_upserts - v_canary - v_canary_new);

  v_ratio := CASE WHEN v_esperado = 0 THEN NULL
                  ELSE round(v_persisted::numeric / v_esperado::numeric, 4) END;

  IF v_esperado < p_min_upserts THEN
    v_estado := 'sem_volume_suficiente';
  ELSIF v_reconectou_recente THEN
    v_estado := 'reconexao_recente_skip';
  ELSIF v_persisted = 0 THEN
    v_estado := 'ROMPIDO';
  ELSIF v_ratio < p_degraded_ratio THEN
    v_estado := 'DEGRADADO';
  ELSE
    v_estado := 'ok';
  END IF;

  IF v_estado IN ('ROMPIDO','DEGRADADO') THEN
    SELECT EXISTS (
      SELECT 1 FROM zapp.evolution_alerts
      WHERE alert_type = 'ingestion_persistence_gap'
        AND created_at > now() - v_cooldown_efetivo
    ) INTO v_ja_alertou;

    v_msg := format(
      'Ingestao viva, persistencia %s. Janela %s: %s webhooks messages.upsert ingeridos'
      ' (%s canary descontados), %s mensagens persistidas em zapp.evolution_messages_wpp2'
      ' (ratio %s). Perda silenciosa de mensagens de cliente.',
      lower(v_estado), p_window::text, v_upserts, (v_canary + v_canary_new),
      v_persisted, coalesce(v_ratio::text,'n/a'));

    IF NOT v_ja_alertou THEN
      INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message, payload)
      VALUES ('ingestion_persistence_gap','critical',
        format('Perda silenciosa de mensagens — persistencia %s', lower(v_estado)),
        v_msg,
        jsonb_build_object(
          'upserts', v_upserts, 'canary_descontados', (v_canary + v_canary_new),
          'esperado', v_esperado, 'persistidas', v_persisted, 'ratio', v_ratio,
          'janela', p_window::text, 'estado', v_estado,
          'cooldown_aplicado', v_cooldown_efetivo::text, 'detectado_em', now()));

      INSERT INTO zapp.warroom_alerts (alert_type, title, message, source, entity)
      VALUES ('critical',
        format('Perda silenciosa de mensagens — persistencia %s', lower(v_estado)),
        v_msg, 'fn_monitor_ingestion_persistence_gap', 'evolution_messages_wpp2');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'estado', v_estado, 'janela', p_window::text,
    'upserts_ingeridos', v_upserts,
    'canary_old_descontados', v_canary,
    'canary_new_descontados', v_canary_new,
    'esperado', v_esperado, 'persistidas', v_persisted, 'ratio', v_ratio,
    'reconectou_recente', v_reconectou_recente,
    'ultima_reconexao', v_ultima_reconexao,
    'cooldown_efetivo', v_cooldown_efetivo::text,
    'alerta_emitido', (v_estado IN ('ROMPIDO','DEGRADADO') AND NOT v_ja_alertou)
  );
END $function$;

REVOKE EXECUTE ON FUNCTION ops.fn_monitor_ingestion_persistence_gap(interval, integer, numeric, interval) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- PASSO 2: guard idempotente do comando (padrão A — preserva jobid 206)
--   Em prod o comando JÁ é o alvo (conferido 17:40Z) -> re-run = UPDATE 0.
-- ---------------------------------------------------------------------------
UPDATE cron.job
SET command = 'SELECT ops.fn_monitor_ingestion_persistence_gap()'
WHERE jobid = 206
  AND command NOT LIKE 'SELECT ops.fn_monitor_ingestion_persistence_gap()';
