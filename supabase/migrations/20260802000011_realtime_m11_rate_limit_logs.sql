-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260802000011_realtime_m11_rate_limit_logs.sql
-- Purpose  : Adiciona public.rate_limit_logs à publicação supabase_realtime.
--
-- Contexto:
--   src/features/admin/hooks/useRateLimitLogs.ts (linha 175) subscreve:
--     { event: 'INSERT', schema: 'public', table: 'rate_limit_logs' }
--
--   Anteriormente a subscription usava schema:'zapp', table:'rate_limit_logs'.
--   zapp.rate_limit_logs é VIEW proxy (relkind='v') criada em 20260724000050
--   apontando para public.rate_limit_logs (tabela física). VIEWs nunca emitem
--   eventos WAL → subscription era no-op silencioso.
--
--   INV-1 (check-realtime-dead-channels.sh) bloqueia apenas 5 VIEWs específicas
--   em schema 'public' (whisper_messages, team_messages, contacts, messages,
--   evolution_messages). rate_limit_logs com schema:'public' NÃO é bloqueado.
--
-- Alteração cliente:
--   useRateLimitLogs.ts:175 → schema:'public', table:'rate_limit_logs'
--   (commitado junto com esta migração)
--
-- Idempotência: seguro para re-aplicar; verifica relkind e pg_publication_tables.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_relkind "char";
  v_in_pub  BOOLEAN;
BEGIN
  -- Verificar se public.rate_limit_logs existe e é tabela física
  SELECT c.relkind
    INTO v_relkind
    FROM pg_catalog.pg_class     c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = 'rate_limit_logs';

  IF NOT FOUND THEN
    RAISE NOTICE '[M-11] public.rate_limit_logs não existe neste banco — ignorando';
    RETURN;
  END IF;

  IF v_relkind NOT IN ('r', 'p') THEN
    RAISE NOTICE '[M-11] public.rate_limit_logs existe mas relkind=''%'' (não é tabela física) — ignorando',
                 v_relkind;
    RETURN;
  END IF;

  -- Verificar se já está na publication
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_publication_tables
     WHERE pubname    = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'rate_limit_logs'
  ) INTO v_in_pub;

  IF v_in_pub THEN
    RAISE NOTICE '[M-11] public.rate_limit_logs já está em supabase_realtime — no-op';
    RETURN;
  END IF;

  -- Adicionar à publication
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.rate_limit_logs';
  RAISE NOTICE '[M-11] public.rate_limit_logs adicionada à supabase_realtime';

  -- Verificação pós-aplicação
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_publication_tables
     WHERE pubname    = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'rate_limit_logs'
  ) INTO v_in_pub;

  IF NOT v_in_pub THEN
    RAISE EXCEPTION '[M-11] public.rate_limit_logs NÃO está em supabase_realtime após ADD — verifique permissões!'
      USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE '[M-11] Verificação pós-aplicação: public.rate_limit_logs ✓ em supabase_realtime';
END $$;
