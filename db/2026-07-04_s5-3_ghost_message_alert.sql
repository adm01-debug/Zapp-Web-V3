-- S5-3 (sessão 5, 2026-07-04): alerta imediato para mensagens de instância DESCONHECIDA.
-- Contexto: o incidente S5-1 (linha principal re-pareada numa instância fantasma cujo nome era
-- o UUID da wpp2) publicou messages.upsert rejeitados como 'unknown_instance', mas o KPI de
-- ghost events do zapp-health-guard só alerta acima de 20 eventos/hora — o vazamento de baixa
-- frequência passou despercebido por ~20 min. Esta função alerta com QUALQUER messages.upsert
-- de instância fora do registry nos últimos 15 min (anti-flap: 1 alerta/hora).
-- Instâncias de QA ficam registradas com status='test' e são excluídas.
-- Aplicado em produção 2026-07-04 ~11:05 UTC. Cron pg_cron jobid 97:
--   SELECT cron.schedule('alert-ghost-message-events', '*/5 * * * *',
--     'SELECT zapp.fn_alert_ghost_message_events()');

CREATE OR REPLACE FUNCTION zapp.fn_alert_ghost_message_events()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, zapp, public, evo
AS $$
DECLARE v_ghosts jsonb; v_n int;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('instance', g.instance, 'eventos', g.n, 'ultimo', g.ultimo)), count(*)
  INTO v_ghosts, v_n
  FROM (
    SELECT w.instance, count(*) AS n, max(w.created_at) AS ultimo
    FROM public.webhook_audit_log w
    WHERE w.error_message = 'unknown_instance'
      AND w.event_type IN ('messages.upsert','MESSAGES_UPSERT')
      AND w.created_at > now() - interval '15 minutes'
      AND NOT EXISTS (
        SELECT 1 FROM zapp.instance_registry ir
        WHERE ir.instance_name = w.instance AND ir.status = 'test'
      )
    GROUP BY w.instance
  ) g;

  IF v_n IS NULL OR v_n = 0 THEN RETURN 0; END IF;

  -- anti-flap: no máximo 1 alerta por hora
  IF EXISTS (
    SELECT 1 FROM evo.evolution_alerts
    WHERE alert_type = 'ghost_message_events' AND created_at > now() - interval '60 minutes'
  ) THEN
    RETURN 0;
  END IF;

  INSERT INTO evo.evolution_alerts (alert_type, severity, title, message, payload)
  VALUES (
    'ghost_message_events', 'critical',
    'Mensagens de instancia DESCONHECIDA rejeitadas (possivel instancia fantasma)',
    'messages.upsert rejeitados como unknown_instance nos ultimos 15 min: mensagens de negocio NAO estao entrando no zapp. Verificar instancias na Evolution (runbook S5-1). Diferente do KPI de volume (>20/h), este alerta dispara com QUALQUER mensagem perdida.',
    v_ghosts
  );
  RETURN v_n;
END $$;

COMMENT ON FUNCTION zapp.fn_alert_ghost_message_events() IS
  'S5-3 (2026-07-04): alerta critico imediato quando messages.upsert de instancia fora do registry e rejeitado (unknown_instance). O KPI de volume (>20/h) nao pega vazamento de baixa frequencia — foi assim que o S5-1 passou despercebido.';
