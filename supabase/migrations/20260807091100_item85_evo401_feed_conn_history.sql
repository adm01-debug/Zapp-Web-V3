-- ============================================================================
-- Sentinel de instância evo wpp2: feed de histórico de conexão (item 85)
-- ============================================================================
-- Tipo: DDL + pg_cron
--
-- CONTEXTO (item 85 do checklist de auditoria):
--   Monitoramento da instância evo wpp2 (principal instância WhatsApp).
--   A função evo.fn_update_instance_health verifica o status da instância
--   via Evolution API e registra no histórico de conexão. O cron job executa
--   a cada 15 minutos (a partir do minuto 3 de cada hora).
--
--   O sentinel detecta:
--     - Instância desconectada (status != 'open')
--     - QR code expirado
--     - Falha de autenticação (401)
--   E insere alertas em zapp.warroom_alerts para o dashboard de operações.
--
-- NOTA (correção 2026-08-07): o SELECT cron.schedule(...) ON CONFLICT era
-- sintaxe inválida (ON CONFLICT só existe em INSERT) — o efeito foi aplicado
-- por DDL manual. Padrão idempotente da casa (canonical_squash):
-- unschedule condicional + schedule.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Cron job — verificação de saúde da instância evo a cada 15 min
-- ─────────────────────────────────────────────────────────────────────────────

SELECT cron.unschedule('evo-instance-health-check')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'evo-instance-health-check');

SELECT cron.schedule(
  'evo-instance-health-check',
  '3-59/15 * * * *',
  'SELECT evo.fn_update_instance_health()'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Cron job — guard da partição default de evolution_webhook_events_v2
-- Dispara alerta no warroom se a partição default acumular eventos
-- (indica que o roteamento de partições falhou)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT cron.unschedule('evo-default-partition-guard')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'evo-default-partition-guard');

SELECT cron.schedule(
  'evo-default-partition-guard',
  '*/30 * * * *',
  $g$
  DO $i$
  DECLARE v_count bigint;
  BEGIN
    SELECT COUNT(*) INTO v_count
    FROM evo.evolution_webhook_events_v2_default
    WHERE created_at > now() - interval '1 hour';

    IF v_count > 0 THEN
      INSERT INTO zapp.warroom_alerts
        (alert_type, title, message, source, entity, severity)
      VALUES
        ('warning',
         'Partição default de webhook events acumulando eventos',
         format('Encontrados %s eventos na partição default nas últimas 1h. Verificar particionamento.', v_count),
         'evo-default-partition-guard',
         'evo.evolution_webhook_events_v2_default',
         'high')
      ON CONFLICT DO NOTHING;
    END IF;
  END;
  $i$
  $g$
);
