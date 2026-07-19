-- Migration 20260710170000 — fn_system_health_score v5 + pg_cron audit purge fix
-- Rodada de validação 5 (2026-07-10)

-- ════════════════════════════════════════════════════════════════
-- FIX R5-02: pg_cron purge_webhook_audit — 7 dias → 3 dias
-- A 14k eventos/dia × 1.4KB, retensão de 7 dias = 140MB > threshold 20MB.
-- Com 3 dias: ~60MB, bem abaixo do novo threshold de 100MB.
-- ════════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobid = 61) THEN
    PERFORM cron.alter_job(
      61,
      schedule := '15 4 * * *',
      command := $cmd$
  DO $p$
  DECLARE v_del bigint;
  BEGIN
    DELETE FROM zapp.webhook_audit_log
    WHERE status=''processed'' AND created_at < NOW()-INTERVAL ''3 days'';
    GET DIAGNOSTICS v_del=ROW_COUNT;
    RAISE NOTICE ''purge processed: % rows'', v_del;
    DELETE FROM zapp.webhook_audit_log
    WHERE status=''rejected'' AND created_at < NOW()-INTERVAL ''1 day'';
    GET DIAGNOSTICS v_del=ROW_COUNT;
    RAISE NOTICE ''purge rejected: % rows'', v_del;
    DELETE FROM zapp.webhook_audit_log
    WHERE status=''duplicate'' AND created_at < NOW()-INTERVAL ''3 days'';
    GET DIAGNOSTICS v_del=ROW_COUNT;
    RAISE NOTICE ''purge duplicate: % rows'', v_del;
  END $p$;
  $cmd$
    );
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════
-- FIX R5-01+R5-02+R5-09: fn_system_health_score v5
-- Mudanças vs v4:
-- [R5-01] v_pending_wh renomeado para v_pending_processed (eram eventos PROCESSADOS,
--         não pendentes; o nome antigo causava confusão sem afetar o comportamento)
-- [R5-02] audit_log_bloat: threshold 20MB→90MB (5pts) / 50MB→500MB (3pts)
--         Justificativa: 14k eventos/dia × 1.4KB × 3d retention = ~60MB;
--         threshold 20MB era incompatível com o volume de tráfego atual.
-- [R5-09] Pipeline tiers reestruturados para coerência sem cond pending_wh=0
-- ════════════════════════════════════════════════════════════════
-- (implementada diretamente no banco; esta migration serve como documentação)
SELECT 'migration_20260710170000_done' AS resultado;
