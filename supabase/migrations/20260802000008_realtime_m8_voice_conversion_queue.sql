-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260802000008_realtime_m8_voice_conversion_queue.sql
-- Purpose  : Adiciona public.voice_conversion_queue à publicação supabase_realtime.
--
-- Contexto:
--   src/features/inbox/components/useAudioMessagePlayer.ts (linhas 89-96) subscreve:
--     { schema: 'public', table: 'voice_conversion_queue' }
--   Nenhuma migração não-arquivada adiciona esta tabela à publication.
--   Migrações arquivadas (20260724000017, 20260724000024, 20260724000039) tentaram
--   fazê-lo mas foram descartadas — subscription é no-op silencioso em produção.
--
--   O comentário no código-fonte ("added to supabase_realtime via migration")
--   refere-se a uma das migrações arquivadas, que nunca foram aplicadas ao banco.
--
--   public.voice_conversion_queue é tabela física (relkind='r') listada no
--   BUG-37 como uma das 25 tabelas físicas em public acessadas por edge functions.
--   Migration 20260724000050 criou VIEW proxy em zapp para acesso via
--   createZappAdminClient(); a subscription Realtime usa public diretamente
--   (INV-1 exception, juntamente com public.evolution_retry_metrics).
--
-- Idempotência: seguro para re-aplicar; verifica relkind e pg_publication_tables.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_relkind "char";
  v_in_pub  BOOLEAN;
BEGIN
  -- Verificar se public.voice_conversion_queue existe e é tabela física
  SELECT c.relkind
    INTO v_relkind
    FROM pg_catalog.pg_class     c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = 'voice_conversion_queue';

  IF NOT FOUND THEN
    RAISE NOTICE '[M-8] public.voice_conversion_queue não existe neste banco — ignorando';
    RETURN;
  END IF;

  IF v_relkind NOT IN ('r', 'p') THEN
    RAISE NOTICE '[M-8] public.voice_conversion_queue existe mas relkind=''%'' (não é tabela física) — ignorando',
                 v_relkind;
    RETURN;
  END IF;

  -- Verificar se já está na publication
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_publication_tables
     WHERE pubname    = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'voice_conversion_queue'
  ) INTO v_in_pub;

  IF v_in_pub THEN
    RAISE NOTICE '[M-8] public.voice_conversion_queue já está em supabase_realtime — no-op';
    RETURN;
  END IF;

  -- Adicionar à publication
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_conversion_queue';
  RAISE NOTICE '[M-8] public.voice_conversion_queue adicionada à supabase_realtime';

  -- Verificação pós-aplicação
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_publication_tables
     WHERE pubname    = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'voice_conversion_queue'
  ) INTO v_in_pub;

  IF NOT v_in_pub THEN
    RAISE EXCEPTION '[M-8] public.voice_conversion_queue NÃO está em supabase_realtime após ADD — verifique permissões!'
      USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE '[M-8] Verificação pós-aplicação: public.voice_conversion_queue ✓ em supabase_realtime';
END $$;
