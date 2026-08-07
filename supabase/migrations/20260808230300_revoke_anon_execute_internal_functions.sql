-- Revoga EXECUTE de anon/PUBLIC em 3 funções SECURITY DEFINER internas
-- Gate D-8 (PR #987): "functions executable by anon" — pré-existentes, descobertas
-- durante o espelho das migrations da onda Kong. Nenhuma deve ser chamada por anon:
--   ops.fn_alert_wal_slot_drop()          — alerta interno de WAL slot (pg_cron)
--   ops.safe_create_policy(...)           — utilitário de criação de policies (DBA)
--   zapp.fn_evict_media_cache(...)        — evict de cache de mídia (backend)
-- Mantém EXECUTE para authenticated onde aplicável; service_role = superuser.

REVOKE EXECUTE ON FUNCTION ops.fn_alert_wal_slot_drop() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION ops.safe_create_policy(text, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION zapp.fn_evict_media_cache(integer, numeric) FROM PUBLIC, anon;
