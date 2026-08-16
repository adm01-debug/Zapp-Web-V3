-- E47-E48 (PLANO_INDEPENDENCIA_100_ETAPAS_20260815): remove 'zapp' do
-- search_path das 16 funcoes evo.* restantes.
-- Diagnostico que autorizou sem tocar os corpos: todas as mencoes nao
-- qualificadas a nomes de objetos zapp sao strings de alerta/log, comentarios
-- ou chaves jsonb (25 matches revisados linha a linha; zero refs SQL reais
-- por regex de contexto FROM/JOIN/INTO/UPDATE/TRUNCATE e chamada de funcao).
-- Duas fns (fn_feed_401_disconnect_alerts, fn_wpp2_uptime_kpi) resolviam
-- evolution_connection_history para evo (que precede zapp no path) - inocuo.
-- JA APLICADA em producao em 2026-08-15 (16 fns: 16 -> 0 restantes; RPC
-- ops.fn_boundary_audit confirma aux_searchpath_evo_com_zapp=0).
-- Smoke: evo.fn_wpp2_uptime_kpi('wpp2','1h',false) OK.

DO $do$
DECLARE
  r record;
  new_sp text;
  n_alt int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.proconfig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'evo'
      AND array_to_string(p.proconfig, ',') ~ 'search_path=[^;]*zapp'
  LOOP
    SELECT string_agg(trim(x), ', ')
      INTO new_sp
      FROM unnest(string_to_array(
        substring((SELECT c FROM unnest(r.proconfig) c WHERE c LIKE 'search_path=%') FROM 13), ',')) x
      WHERE trim(x) <> 'zapp';
    IF new_sp IS NULL OR new_sp = '' THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER FUNCTION evo.%I(%s) SET search_path = %s', r.proname, r.args, new_sp);
    n_alt := n_alt + 1;
  END LOOP;
  RAISE NOTICE 'E47-E48: % funcoes alteradas', n_alt;
END
$do$;
