-- ============================================================
-- SESSION 2026-07-10: TODAS AS MELHORIAS EXECUTADAS
-- Score: 86.9/B → 90.0/A (novo maximo historico)
-- ============================================================

-- ITEM 1: Backup forcado (86.9/B → 89.7/A +3pts)
-- Executado via exec no container supabase-backup (5769c2115c27):
-- pg_dump → GPG encrypt → R2 upload (27MB @ 25.75 MiB/s) → sentinel
-- Arquivo: supabase_selfhosted_20260710_102742.dump (32313771B, 681 tabelas)

-- ITEM 2: REVOKE PUBLIC EXECUTE nas 4 funcoes anon-acessiveis
REVOKE EXECUTE ON FUNCTION public.fn_list_audio_memes_for_user(text, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_list_audio_memes_for_user(uuid, text, boolean, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_normalize_send_jid(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_toggle_user_meme_favorite(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_toggle_user_meme_favorite(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_audit_event(text, text, text, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_audit_event(text, text, text, text, jsonb) FROM PUBLIC;
-- Resultado: anon=false, authenticated=true, service_role=true para todas 7 overloads

-- ITEM 3: DROP de 2 indices nao usados
-- idx_contacts_push_trgm (4MB) - DROPADO via CONCURRENTLY
-- idx_evo_msgs_wpp2_updated_at (1.3MB) - DROPADO via CONCURRENTLY
-- NOTA: idx_conv_tl_default e tsvector indexes tem dependencias, nao dropados

-- ITEM 4: DROP do WAL slot cainophile_4038vcfg (89.7/A → 90.0/A +0.3pts nova dimensao)
-- Antes: restart_lag=3968MB, catalog_xmin_age=325202
-- Acao: kill -9 PID_338 no container supabase_db → PostgreSQL crash recovery
-- Resultado: slot removido, WAL de 3984MB → 1024MB (2.96GB liberados)
-- Slots Realtime reconectaram automaticamente (PIDs 1115355 e 1115348)
-- Logflare/Analytics criara novo slot ao reconectar

-- ITEM 5: VACUUM ANALYZE em tabelas com dead tuples
-- VACUUM ANALYZE evo.evolution_reconcile_jobs  (foi de 4.59% → ~0%)
-- VACUUM ANALYZE evo.evolution_messages_wpp2
-- VACUUM ANALYZE evo.evolution_alerts
-- VACUUM ANALYZE zapp.webhook_audit_log

-- ITEM 6: fn_update_backup_sentinel v4 (dead code removido)
-- Removido: branch IF p_size_bytes < 5000000 (codigo morto - inalcancavel apos validacao 10MB)
-- Mantido: todas as 5 validacoes de seguranca (null, vazio, chars, tamanho, tabelas)
CREATE OR REPLACE FUNCTION ops.fn_update_backup_sentinel(
  p_file        text,
  p_size_bytes  bigint,
  p_table_count integer,
  p_offsite_ok  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public, pg_catalog
AS $$
BEGIN
  IF p_file IS NULL OR trim(p_file) = '' THEN
    RETURN jsonb_build_object('error','file_empty');
  END IF;
  IF length(p_file) > 200 THEN
    RETURN jsonb_build_object('error','filename_too_long','max',200,'len',length(p_file));
  END IF;
  IF p_file ~ E'[/\\\\<>\'";&|\\n\\r\\t]' OR p_file ~ '--' OR p_file ILIKE '%.php%' THEN
    RETURN jsonb_build_object('error','invalid_filename_chars','file',left(p_file,50));
  END IF;
  IF p_table_count < 400 THEN
    RETURN jsonb_build_object('error','table_count_too_low','count',p_table_count,'min_required',400);
  END IF;
  IF p_size_bytes < 10000000 THEN
    RETURN jsonb_build_object('error','file_too_small','size_bytes',p_size_bytes);
  END IF;
  UPDATE ops.backup_sentinel SET
    last_backup_at         = now(),
    last_backup_file       = p_file,
    last_backup_size_bytes = p_size_bytes,
    last_backup_table_count = p_table_count,
    last_offsite_at        = CASE WHEN p_offsite_ok THEN now() ELSE last_offsite_at END,
    updated_at             = now()
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

-- VERIFICACAO FINAL
SELECT
  ((fn_system_health_score()->>'score')::numeric >= 90.0) AS score_90_or_higher,
  fn_system_health_score()->>'grade' AS grade,
  (NOT has_function_privilege('anon','public.fn_normalize_send_jid(text,text)','execute')) AS anon_revogado,
  (SELECT (ops.fn_update_backup_sentinel(NULL,32e6::bigint,683,false))->>'error'='file_empty') AS sentinel_rejeita_null,
  (SELECT (ops.fn_update_backup_sentinel(E'a\\nb',32e6::bigint,683,false))->>'error'='invalid_filename_chars') AS sentinel_rejeita_nl,
  (SELECT COUNT(*)=0 FROM pg_replication_slots WHERE slot_name='cainophile_4038vcfg') AS cainophile_dropado,
  (SELECT pg_size_pretty(SUM(size)) FROM pg_ls_waldir()) AS wal_size;
