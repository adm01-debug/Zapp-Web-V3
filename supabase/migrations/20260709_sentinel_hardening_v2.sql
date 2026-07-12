-- ============================================================
-- MIGRATION: 20260709_sentinel_hardening_v2.sql
-- fn_update_backup_sentinel v3: hardening completo contra
-- injection, path traversal, DoS via long strings
-- ============================================================

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
  -- VALIDACAO 1: arquivo nao pode ser nulo/vazio/whitespace
  IF p_file IS NULL OR trim(p_file) = '' THEN
    RETURN jsonb_build_object('error','file_empty','message','p_file nao pode ser vazio');
  END IF;

  -- VALIDACAO 2: limite de comprimento (previne DoS)
  IF length(p_file) > 200 THEN
    RETURN jsonb_build_object('error','filename_too_long','max',200,'len',length(p_file));
  END IF;

  -- VALIDACAO 3: chars suspeitos (newline, carriage return, tab,
  -- path separators, quotes, semicolons, SQL special chars)
  -- FIX: adicionado \n \r \t que nao eram capturados na v2
  IF p_file ~ E'[/\\\\<>\'";&|\\n\\r\\t]' OR p_file ~ '--' OR p_file ILIKE '%.php%' THEN
    RETURN jsonb_build_object('error','invalid_filename_chars','file',left(p_file,50));
  END IF;

  -- VALIDACAO 4: contagem de tabelas minima
  IF p_table_count < 400 THEN
    RETURN jsonb_build_object('error','table_count_too_low','count',p_table_count,'min_required',400);
  END IF;

  -- VALIDACAO 5: tamanho minimo do arquivo (10MB)
  IF p_size_bytes < 10000000 THEN
    RETURN jsonb_build_object('error','file_too_small','size_bytes',p_size_bytes);
  END IF;

  -- Atualizar sentinel
  UPDATE ops.backup_sentinel SET
    last_backup_at          = now(),
    last_backup_file        = p_file,
    last_backup_size_bytes  = p_size_bytes,
    last_backup_table_count = p_table_count,
    last_offsite_at         = CASE WHEN p_offsite_ok THEN now() ELSE last_offsite_at END,
    updated_at              = now()
  WHERE id = 1;

  RETURN jsonb_build_object(
    'updated',     true,
    'file',        p_file,
    'size_mb',     round(p_size_bytes/1048576.0, 1),
    'table_count', p_table_count,
    'at',          now()
  );
END;
$$;

-- VERIFICACAO POS-DEPLOY (executar apos aplicar esta migration):
SELECT
  (ops.fn_update_backup_sentinel(NULL,32000000,683,false))->>'error'          = 'file_empty'         AS v1_null,
  (ops.fn_update_backup_sentinel('',32000000,683,false))->>'error'            = 'file_empty'         AS v2_empty,
  (ops.fn_update_backup_sentinel('   ',32000000,683,false))->>'error'         = 'file_empty'         AS v3_whitespace,
  (ops.fn_update_backup_sentinel(E'../etc\\npasswd',32000000,683,false))->>'error' = 'invalid_filename_chars' AS v4_path_newline,
  (ops.fn_update_backup_sentinel($$'; DROP --$$,32000000,683,false))->>'error'= 'invalid_filename_chars' AS v5_sql_injection,
  (ops.fn_update_backup_sentinel(REPEAT('x',201),32000000,683,false))->>'error' = 'filename_too_long' AS v6_too_long,
  (ops.fn_update_backup_sentinel('valid.dump',100,683,false))->>'error'       = 'file_too_small'     AS v7_too_small,
  (ops.fn_update_backup_sentinel('valid.dump',32000000,5,false))->>'error'    = 'table_count_too_low' AS v8_too_few_tables;
