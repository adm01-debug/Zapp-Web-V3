-- Harden SECURITY DEFINER functions against search_path injection.
--
-- Problema: funções SECURITY DEFINER sem `search_path` fixo são vulneráveis a
-- "search_path injection" — um usuário pode criar objetos maliciosos em um schema
-- sob seu controle e fazer a função (que roda com privilégios do owner) resolvê-los.
--
-- Correção: fixar (pin) o search_path de TODA função SECURITY DEFINER do schema
-- `public` que ainda não tenha um. Usamos a lista de schemas efetivamente
-- referenciados pelas funções deste projeto (public, auth_helpers, extensions) +
-- pg_temp, preservando o comportamento atual enquanto elimina a mutabilidade.
--
-- Abordagem idempotente e auto-descobrível: lê pg_proc no momento da aplicação,
-- então não depende de assinaturas hard-coded e pode ser re-executada com segurança.
-- NÃO altera funções de schemas gerenciados pelo Supabase (auth, storage, extensions…).

DO $$
DECLARE
  r record;
  altered_count int := 0;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name,
           p.proname AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef                      -- apenas SECURITY DEFINER
      AND n.nspname = 'public'             -- apenas o nosso schema de aplicação
      AND NOT EXISTS (                     -- que ainda NÃO tenham search_path fixo
        SELECT 1
        FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, auth_helpers, extensions, pg_temp;',
      r.schema_name, r.func_name, r.args
    );
    altered_count := altered_count + 1;
  END LOOP;

  RAISE NOTICE 'search_path fixado em % função(ões) SECURITY DEFINER do schema public.', altered_count;
END $$;

-- Verificação (rodar manualmente após aplicar): a query abaixo deve retornar 0 linhas.
--   SELECT n.nspname, p.proname
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE p.prosecdef AND n.nspname = 'public'
--     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%');
