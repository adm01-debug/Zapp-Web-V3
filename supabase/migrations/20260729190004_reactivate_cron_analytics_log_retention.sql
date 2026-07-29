-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 20260729190004_reactivate_cron_analytics_log_retention.sql
-- Purpose  : Reativar cron job analytics-log-retention (jobid 100).
--
-- Contexto: audit 2026-07-29 — cron job 'analytics-log-retention' (jobid 100)
-- está active=false. A função ops.fn_analytics_log_retention(14) faz purga
-- de tabelas _analytics.log_events_<uuid> com mais de 14 dias via dblink
-- no banco _supabase. Sem essa retenção, as tabelas de analytics crescem
-- indefinidamente consumindo disco.
--
-- Schedule atual: '20 5 * * *' (diário 05:20 UTC) — mantido.
-- Função: SECURITY DEFINER, search_path=ops,public,pg_catalog (hardenear
--   o 'public' aqui é middle-position, baixo risco — deixar para hardening
--   incremental futuro).
--
-- Fix: UPDATE cron.job SET active=true WHERE jobid=100.
-- Idempotente: UPDATE é reentrante (SET active=true não causa erro se já true).
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE cron.job
SET active = true
WHERE jobid = 100 AND jobname = 'analytics-log-retention';

-- ── VERIFICAÇÃO ─────────────────────────────────────────────────────────────
DO $$
DECLARE v_active boolean;
BEGIN
  SELECT active INTO v_active FROM cron.job WHERE jobid = 100;
  IF v_active IS NULL THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: cron job 100 (analytics-log-retention) não encontrado';
  END IF;
  IF NOT v_active THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: cron job 100 ainda inativo';
  END IF;
  RAISE NOTICE 'OK: cron job analytics-log-retention (jobid 100) reativado';
END $$;
