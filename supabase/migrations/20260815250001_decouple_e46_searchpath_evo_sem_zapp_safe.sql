-- E46 (PLANO_INDEPENDENCIA_100_ETAPAS_20260815): remove 'zapp' do search_path
-- das funcoes evo.* que so referenciam objetos zapp de forma QUALIFICADA
-- (referencia qualificada nao depende de search_path -> remocao inocua).
-- Funcoes com referencia NAO qualificada a objeto existente em zapp sao
-- puladas: remover o schema do path mudaria a resolucao (E47-E48 tratarao
-- essas apos qualificacao do corpo). Idempotente: recomputa a classificacao.
-- JA APLICADA em producao em 2026-08-15 (19 funcoes: 35 -> 16 restantes).

DO $do$
DECLARE
  r record;
  new_sp text;
  n_alt int := 0;
BEGIN
  FOR r IN
    WITH evo_fns AS (
      SELECT p.oid, p.proname,
             pg_get_function_identity_arguments(p.oid) AS args,
             p.proconfig, p.prosrc
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'evo'
        AND array_to_string(p.proconfig, ',') ~ 'search_path=[^;]*zapp'
    ),
    zapp_rel_names AS (
      SELECT DISTINCT c.relname AS nm FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'zapp' AND c.relkind IN ('r','p','v','m','S')
      UNION
      SELECT DISTINCT p.proname FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'zapp'
    )
    SELECT f.oid, f.proname, f.args, f.proconfig
    FROM evo_fns f
    WHERE NOT EXISTS (
      SELECT 1 FROM zapp_rel_names z
      WHERE f.prosrc ~* ('(^|[^.[:alnum:]_])' || z.nm || '([^[:alnum:]_]|$)')
    )
  LOOP
    SELECT string_agg(trim(x), ', ')
      INTO new_sp
      FROM unnest(string_to_array(
        substring((SELECT c FROM unnest(r.proconfig) c WHERE c LIKE 'search_path=%') FROM 13), ',')) x
      WHERE trim(x) <> 'zapp';
    IF new_sp IS NULL OR new_sp = '' THEN
      RAISE NOTICE 'E46 SKIP (search_path ficaria vazio): evo.%(%)', r.proname, r.args;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER FUNCTION evo.%I(%s) SET search_path = %s', r.proname, r.args, new_sp);
    n_alt := n_alt + 1;
    RAISE NOTICE 'E46: evo.%(%) -> search_path = %', r.proname, r.args, new_sp;
  END LOOP;
  RAISE NOTICE 'E46 concluido: % funcoes alteradas', n_alt;
END
$do$;
