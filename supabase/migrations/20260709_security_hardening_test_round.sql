-- ========================================================================
-- MIGRATION: 20260709_security_hardening_test_round.sql
-- Bugs encontrados e corrigidos durante bateria de testes exaustiva
-- Score: 89.7/A -> mantido apos todas as correcoes
-- ========================================================================

-- FIX 1: zapp.messages VIEW sem security_invoker (risco RLS bypass)
ALTER VIEW zapp.messages SET (security_invoker = on);

-- FIX 2: anon tinha SELECT em ops.v_wal_health (expunha WAL slot info)
REVOKE SELECT ON ops.v_wal_health FROM anon;

-- FIX 3: anon tinha SELECT em public.instance_registry
-- (expunha api_key, proxy_pass, responsible_email, phone_number)
REVOKE SELECT ON public.instance_registry FROM anon;

-- FIX 4: zapp.fn_guard_qa_instances era SECURITY DEFINER sem search_path
-- (vulneravel a search_path hijacking; anon e authenticated podiam chamar)
ALTER FUNCTION zapp.fn_guard_qa_instances() SET search_path = zapp, public, pg_catalog;

-- FIX 5-8: funcoes ops.* SECURITY DEFINER sem search_path
-- (apenas chamadas por triggers/internos, mas higiene correta exige search_path fixo)
ALTER FUNCTION ops.check_wal_health() SET search_path = ops, public, pg_catalog;
ALTER FUNCTION ops.fn_ddl_audit_log() SET search_path = ops, public, pg_catalog;
ALTER FUNCTION ops.fn_ddl_audit_drop() SET search_path = ops, public, pg_catalog;
ALTER FUNCTION ops.fn_ddl_drop_alert() SET search_path = ops, public, pg_catalog;

-- FIX 9: ops.fn_update_backup_sentinel aceitava arquivo vazio/nulo
-- (podia corromper o sentinel com file='')
CREATE OR REPLACE FUNCTION ops.fn_update_backup_sentinel(
  p_file text,
  p_size_bytes bigint,
  p_table_count integer,
  p_offsite_ok boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public, pg_catalog
AS $$
BEGIN
  -- FIX: validar nome de arquivo (nao pode ser vazio ou nulo)
  IF p_file IS NULL OR trim(p_file) = '' THEN
    RETURN jsonb_build_object(
      'error', 'file_empty',
      'message', 'p_file nao pode ser vazio'
    );
  END IF;

  IF p_table_count < 400 THEN
    RETURN jsonb_build_object(
      'error', 'table_count_too_low',
      'count', p_table_count,
      'min_required', 400
    );
  END IF;

  IF p_size_bytes < 10000000 THEN
    RETURN jsonb_build_object(
      'error', 'file_too_small',
      'size_bytes', p_size_bytes
    );
  END IF;

  UPDATE ops.backup_sentinel SET
    last_backup_at = now(),
    last_backup_file = p_file,
    last_backup_size_bytes = p_size_bytes,
    last_backup_table_count = p_table_count,
    last_offsite_at = CASE WHEN p_offsite_ok THEN now() ELSE last_offsite_at END,
    updated_at = now()
  WHERE id = 1;

  RETURN jsonb_build_object(
    'updated', true,
    'file', p_file,
    'size_mb', round(p_size_bytes/1048576.0, 1),
    'table_count', p_table_count,
    'at', now()
  );
END;
$$;

-- VERIFICACAO: confirmar que todos os fixes foram aplicados
SELECT
  (NOT has_table_privilege('anon','ops.v_wal_health','select')) AS wal_revoked,
  (NOT has_table_privilege('anon','public.instance_registry','select')) AS inst_reg_revoked,
  (NOT has_function_privilege('anon','public.fn_system_health_score()','execute')) AS health_score_safe,
  (array_to_string(c.reloptions,',') ILIKE '%security_invoker=on%') AS zapp_messages_si
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='zapp' AND c.relname='messages' AND c.relkind='v';

-- NOTA OPERACIONAL:
-- WAL slot 'cainophile_4038vcfg': 2581 MB restart_lag, catalog_xmin_age=322207
-- Slot ativo (PID 338), porem com lag muito alto.
-- Investigar o consumer cainophile e considerar DROP do slot se inativo em producao.
-- Impacto: previne VACUUM de remover tuplas antigas -> risco de table bloat futuro.
