-- ============================================================================
-- Etapa 66-CSAT — Cron jobs pg_cron do pipeline CSAT (SIM-CSAT E2-7/E3)
-- 2026-08-17 | DB-as-source: aplicado via MCP (supabase_apply_migration /
-- role postgres); este arquivo é o espelho versionado. Idempotente
-- (unschedule condicional + schedule).
--
-- Jobs:
--   1. csat-dispatch-tick  — a cada 1 min: http_post na edge csat-dispatch
--      (service_role do vault — padrão dos crons prod: nps-daily-trigger 261,
--      reprocess-failed-messages-15m). Implementa "após X da resolução" de
--      forma confiável: o delay vira send_at no banco (não scheduled_at de
--      fila órfã — F2).
--   2. csat-reply-capture-tick — a cada 2 min: chama zapp.fn_capture_csat_replies()
--      direto no banco (padrão AGENTS.md: comando de cron sempre qualificado
--      com schema.função). Fecha o loop: resposta "1-5" do contato → rating.
--
-- Rollback:
--   SELECT cron.unschedule('csat-dispatch-tick');
--   SELECT cron.unschedule('csat-reply-capture-tick');
-- ============================================================================

-- ── 1. csat-dispatch-tick (a cada 1 min) ────────────────────────────────────
SELECT cron.unschedule('csat-dispatch-tick')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'csat-dispatch-tick');

SELECT cron.schedule(
  'csat-dispatch-tick', '* * * * *',
  $cmd$
    SELECT extensions.http_post(
      url     := 'https://supabase.atomicabr.com.br/functions/v1/csat-dispatch',
      body    := '{}',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key')
      )
    );
  $cmd$
);

-- ── 2. csat-reply-capture-tick (a cada 2 min) ────────────────────────────────
SELECT cron.unschedule('csat-reply-capture-tick')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'csat-reply-capture-tick');

SELECT cron.schedule(
  'csat-reply-capture-tick', '*/2 * * * *',
  $cmd$
    SELECT zapp.fn_capture_csat_replies();
  $cmd$
);
