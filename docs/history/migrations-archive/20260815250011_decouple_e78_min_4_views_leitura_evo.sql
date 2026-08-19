-- ============================================================================
-- REPLAY CONVERGENTE — materializado retroativamente em 2026-08-16 a partir de
-- supabase_migrations.schema_migrations (version=20260815250011), sem arquivo
-- correspondente neste repo. Ver convencao completa em 20260815250008_*.sql.
--
-- Fonte: docs/decouple/CONTRACT_SURFACE_V1.md ("E78 minimo — 4 views de leitura").
-- Definicoes: pg_get_viewdef(oid, true) em producao 2026-08-15 pos-Lote5.
-- Grants: estado ACL atual via information_schema.role_table_grants (o SELECT
-- concedido a dyad_reader/metabase_reader/om_reader/postgres reflete politica
-- de leitura ja padrao do schema public neste banco; nao e especifico do E78).
-- ============================================================================

CREATE OR REPLACE VIEW public.evo_webhook_events_v2
WITH (security_invoker = on) AS
SELECT
  evolution_webhook_events_v2.id,
  evolution_webhook_events_v2.event_type,
  evolution_webhook_events_v2.instance_name,
  evolution_webhook_events_v2.remote_jid,
  evolution_webhook_events_v2.from_me,
  evolution_webhook_events_v2.message_type,
  evolution_webhook_events_v2.push_name,
  evolution_webhook_events_v2.payload,
  evolution_webhook_events_v2.processed,
  evolution_webhook_events_v2.processed_at,
  evolution_webhook_events_v2.error_message,
  evolution_webhook_events_v2.status,
  evolution_webhook_events_v2.retry_count,
  evolution_webhook_events_v2.created_at,
  evolution_webhook_events_v2.source
FROM evo.evolution_webhook_events_v2;

CREATE OR REPLACE VIEW public.evo_connection_history
WITH (security_invoker = on) AS
SELECT
  evolution_connection_history.id,
  evolution_connection_history.instance_name,
  evolution_connection_history.state,
  evolution_connection_history.previous_state,
  evolution_connection_history.duration_seconds,
  evolution_connection_history.metadata,
  evolution_connection_history.created_at
FROM evo.evolution_connection_history;

CREATE OR REPLACE VIEW public.evo_lid_phone_map
WITH (security_invoker = on) AS
SELECT
  lid_phone_map.lid_jid,
  lid_phone_map.instance_name,
  lid_phone_map.phone_jid,
  lid_phone_map.phone_number,
  lid_phone_map.confidence,
  lid_phone_map.source,
  lid_phone_map.raw_signal,
  lid_phone_map.created_at,
  lid_phone_map.updated_at
FROM evo.lid_phone_map;

CREATE OR REPLACE VIEW public.evo_contact_identity
WITH (security_invoker = on) AS
SELECT
  contact_identity.id,
  contact_identity.lid_jid,
  contact_identity.pn_jid,
  contact_identity.phone_number,
  contact_identity.instance_name,
  contact_identity.confidence,
  contact_identity.source,
  contact_identity.first_seen,
  contact_identity.last_seen,
  contact_identity.raw_signal
FROM evo.contact_identity;

REVOKE ALL ON public.evo_webhook_events_v2 FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.evo_connection_history FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.evo_lid_phone_map FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.evo_contact_identity FROM PUBLIC, anon, authenticated, service_role;

-- LACUNA: producao mostra GRANT SELECT adicional a service_role em
-- public.evo_lid_phone_map (necessario para o node n8n "Worker - classifica
-- conversa", corrigido durante a auditoria n8n do Lote 5 — ver LOTE5_LOG.md,
-- secao "Auditoria n8n"). Esse GRANT especifico foi aplicado fora desta
-- migration (sessao de correcao pontual em 2026-08-16), por isso nao entra
-- aqui; replicado por completude:
GRANT SELECT ON public.evo_lid_phone_map TO service_role;
