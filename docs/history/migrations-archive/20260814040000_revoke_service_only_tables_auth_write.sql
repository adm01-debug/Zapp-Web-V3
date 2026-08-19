-- Migration: [H2-COMPLEMENT-3] REVOKE INSERT/UPDATE/DELETE authenticated em tabelas service-only
-- Detectado em survey completo de grants em auditoria 2026-08-14 BRT
--
-- Padrão idêntico ao 20260813240000 (views backcompat) e 20260814020000 (instance_credentials):
-- Tabelas com RLS policy service_role_only tinham grants de escrita para authenticated
-- que nunca eram efetivos (RLS bloqueia em runtime), mas violam o princípio do menor privilégio.
--
-- cron_inventory: policy service_only (ALL service_role). Nenhuma RPC/fn usa via authenticated.
-- evolution_settings: policy service_role_all (ALL service_role). fn_set_setting não é SECDEF
--   mas o RLS bloqueia authenticated de qualquer modo (sem policy INSERT para authenticated).
--
-- SELECT preservado em ambas (authenticated pode ler settings e inventory via PostgREST).
-- whatsapp_connections: NÃO incluída — tem policies deliberadas para authenticated (wconn_insert_auth, admin_write).

REVOKE INSERT, UPDATE, DELETE ON zapp.cron_inventory    FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON zapp.evolution_settings FROM authenticated;
