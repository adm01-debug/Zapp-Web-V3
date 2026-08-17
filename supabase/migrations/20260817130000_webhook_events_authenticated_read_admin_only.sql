-- ============================================================================
-- Migration: 20260817130000_webhook_events_authenticated_read_admin_only
-- Hardening (rodada 4): a policy authenticated_read de evo.evolution_webhook_events_v2
-- era so por instancia (wpp2/wppmkt) — QUALQUER authenticated via payloads de
-- WhatsApp (PII). Agora exige is_admin_or_supervisor(). Consumidores reais
-- (AdminWebhookEventsPage, AdminWebhookOverviewPage) sao rotas admin.
-- Canario: admin 43.471 linhas; user sem papel 0. APLICADA + registrada em prod.
-- ============================================================================

DROP POLICY IF EXISTS authenticated_read ON evo.evolution_webhook_events_v2;
CREATE POLICY authenticated_read
  ON evo.evolution_webhook_events_v2
  FOR SELECT TO authenticated
  USING ((instance_name = ANY (ARRAY['wpp2'::text, 'wppmkt'::text])) AND zapp.is_admin_or_supervisor());
