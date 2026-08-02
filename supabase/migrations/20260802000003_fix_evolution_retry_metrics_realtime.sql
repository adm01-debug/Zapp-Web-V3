-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260802000003_fix_evolution_retry_metrics_realtime.sql
-- Purpose  : Fix H-3 — evolution_retry_metrics Realtime subscription was a
--            permanent silent no-op.
--
-- Root cause:
--   zapp.evolution_retry_metrics is a VIEW (relkind='v') created in
--   20260716_zapp_evolution_retry_metrics_view.sql that proxies to
--   public.evolution_retry_metrics (the physical table, relkind='r').
--   The frontend hook useRetryMetrics.ts:127 subscribed to schema:'zapp',
--   table:'evolution_retry_metrics' — since VIEWs never emit CDC events,
--   the channel was a permanent silent no-op regardless of subscription state.
--
-- Fix:
--   1. Add public.evolution_retry_metrics (physical table) to supabase_realtime
--      publication so Realtime emits INSERT events.
--   2. The frontend subscription is updated separately (useRetryMetrics.ts)
--      to use schema:'public', table:'evolution_retry_metrics'.
--
-- Idempotency: safe to re-apply; ADD TABLE is no-op if already in publication.
-- Relkind guard: skips gracefully if the table does not exist on this install.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_relkind "char";
  v_in_pub  BOOLEAN;
BEGIN
  -- Check physical existence and kind
  SELECT c.relkind
    INTO v_relkind
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = 'evolution_retry_metrics';

  IF NOT FOUND THEN
    RAISE NOTICE '[20260802000003] public.evolution_retry_metrics não existe neste banco — ignorando';
    RETURN;
  END IF;

  IF v_relkind NOT IN ('r', 'p') THEN
    RAISE NOTICE '[20260802000003] public.evolution_retry_metrics existe mas relkind=''%'' (não é tabela física) — ignorando', v_relkind;
    RETURN;
  END IF;

  -- Check if already in publication
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_publication_tables
     WHERE pubname    = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'evolution_retry_metrics'
  ) INTO v_in_pub;

  IF v_in_pub THEN
    RAISE NOTICE '[20260802000003] public.evolution_retry_metrics já está em supabase_realtime — no-op';
    RETURN;
  END IF;

  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.evolution_retry_metrics';
  RAISE NOTICE '[20260802000003] public.evolution_retry_metrics adicionada à supabase_realtime';

  -- Post-apply verification
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_publication_tables
     WHERE pubname    = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'evolution_retry_metrics'
  ) INTO v_in_pub;

  IF NOT v_in_pub THEN
    RAISE EXCEPTION '[20260802000003] FALHA: public.evolution_retry_metrics NÃO foi adicionada à publication após ALTER'
      USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE '[20260802000003] Concluído com sucesso.';
END $$;
