-- ============================================================================
-- Migration: rb2_glitchtip_cleanup — limpeza nominal pós-exclusão do GlitchTip
-- (06/08/2026): o stack 41 foi removido definitivamente; esta migration remove
-- as referências de NOME/STRING ao GlitchTip em objetos do banco (cron, funções).
-- Nenhuma dependência funcional — objetos renomeados seguem operacionais.
-- ============================================================================

-- 1) Cron: renomear e atualizar referências no command
UPDATE cron.job
   SET jobname = 'evo-401-feed'
 WHERE jobname = 'evo-401-glitchtip-feed';

UPDATE cron.job
   SET command = replace(command, 'glitchtip_401_feed', 'sentry_401_feed')
 WHERE jobname = 'evo-401-feed';

UPDATE cron.job
   SET command = replace(command, 'GlitchTip 401 feed', 'Sentry 401 feed')
 WHERE jobname = 'evo-401-feed';

UPDATE cron.job
   SET command = replace(command, 'fn_get_401_glitchtip_payload', 'fn_get_401_payload')
 WHERE jobname = 'evo-401-feed';

-- 2) Renomear a função (assinatura dinâmica — evita erro se mudar)
DO $$
DECLARE
  r record;
BEGIN
  SELECT p.oid, pg_get_function_identity_arguments(p.oid) AS args
    INTO r
    FROM pg_proc p
   WHERE p.proname = 'fn_get_401_glitchtip_payload'
     AND p.pronamespace = 'evo'::regnamespace;
  IF r.oid IS NOT NULL THEN
    EXECUTE format('ALTER FUNCTION evo.fn_get_401_glitchtip_payload(%s) RENAME TO fn_get_401_payload', r.args);
  END IF;
END $$;

-- 3) Strings 'GlitchTip' em TODAS as funções de app (fn_detect_401_bursts etc.)
--    replace case-insensitive (o prosrc pode ter 'glitchtip' em minúsculo)
DO $$
DECLARE
  r record;
  d text;
BEGIN
  FOR r IN
    SELECT p.oid, n.nspname, p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname IN ('evo','zapp','ops','public')
       AND p.prosrc ILIKE '%glitchtip%'
  LOOP
    SELECT pg_get_functiondef(r.oid) INTO d;
    IF d ~* 'glitchtip' THEN
      d := regexp_replace(d, 'glitchtip', 'sentry', 'gi');
      EXECUTE d;
      RAISE NOTICE 'fn limpa: %.%', r.nspname, r.proname;
    END IF;
  END LOOP;
END $$;
