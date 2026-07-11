-- GAP-01 (sessão 6, 2026-07-11): corrige ordem do search_path em fn_alert_ghost_message_events.
-- ANTES: SET search_path = zapp, public, evo, pg_catalog
-- DEPOIS: SET search_path = pg_catalog, zapp, public, evo
--
-- Motivação: com pg_catalog no FIM, uma função pg_catalog.now() ou pg_catalog.format()
-- poderia ser shadowed por uma função homônima em 'zapp' ou 'public'.
-- Mover pg_catalog para o INÍCIO garante que built-ins do sistema sempre resolvam antes
-- de qualquer função user-defined, eliminando o risco de shadow-injection.
-- Todas as referências a tabelas já são schema-qualified (zapp.instance_registry,
-- evo.evolution_alerts, public.webhook_audit_log), então a reordenação não quebra nada.

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
  'S5-3 (2026-07-04): alerta critico imediato quando messages.upsert de instancia fora do registry e rejeitado (unknown_instance). O KPI de volume (>20/h) nao pega vazamento de baixa frequencia — foi assim que o S5-1 passou despercebido. search_path corrigido (pg_catalog first) em 2026-07-11.';
