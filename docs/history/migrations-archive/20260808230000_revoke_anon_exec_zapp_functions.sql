-- AG-E1 (EVO2-10-03): REVOKE EXECUTE de anon/PUBLIC nas 7 funções SECURITY DEFINER anon-executáveis de zapp
-- Achado: funções SECURITY DEFINER no schema zapp executáveis por anon via grant PUBLIC default.
-- Nenhum caller legítimo de anon (cron/prosrc sem callers das LGPD; RPCs de uso autenticado via service_role/authenticated).
-- Rollback: re-conceder EXECUTE conforme q_grants_backup.json (ver .hermes/auditoria-evo-docker-v2-20260806/evidence/preflight/q_grants_backup.json).

DO $do$
DECLARE sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'zapp.fn_lgpd_anonymize_deleted_contacts(integer)',
    'zapp.fn_lgpd_purge_contact_activity(integer)',
    'zapp.fn_lgpd_purge_message_metadata(integer)',
    'zapp.fn_insert_idempotency_failure_audit(text,text,text,text,text)',
    'zapp.fn_block_internal_sticker_urls()',
    'zapp.pg_stat_database_simple()',
    'zapp.rpc_insert_message(text,text,boolean,text,text,text,text,text,jsonb)',
    'zapp.rpc_insert_message(text,text,text,text,boolean,text,text,text,jsonb)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', sig);
  END LOOP;
END $do$;
