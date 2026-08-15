-- BUG PRE-EXISTENTE descoberto no smoke de E47-E48: evo.fn_lid_health_report
-- referenciava 'evo.idx_ec_remote_jid_trgm'::regclass, mas o indice mora em
-- zapp (ficou para tras no rename de schema evolution->zapp). A funcao
-- quebrava com "relation evo.idx_ec_remote_jid_trgm does not exist".
-- Fix: literal corrigido para 'zapp.idx_ec_remote_jid_trgm'.
-- JA APLICADA em producao em 2026-08-15 (smoke: retorna jsonb object).

DO $do$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'evo' AND p.proname = 'fn_lid_health_report'
    AND pg_get_function_identity_arguments(p.oid) = '';
  IF v_def IS NULL THEN
    RAISE NOTICE 'fn_lid_health_report nao encontrada - nada a fazer';
    RETURN;
  END IF;
  IF v_def !~ '''evo\.idx_ec_remote_jid_trgm''' THEN
    RAISE NOTICE 'literal ja corrigido - idempotente, nada a fazer';
    RETURN;
  END IF;
  v_def := replace(v_def, '''evo.idx_ec_remote_jid_trgm''', '''zapp.idx_ec_remote_jid_trgm''');
  EXECUTE v_def;
  RAISE NOTICE 'fn_lid_health_report corrigida';
END
$do$;
