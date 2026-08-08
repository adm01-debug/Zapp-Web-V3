-- ============================================================================
-- Migration: Auditoria Evolution API — Onda 4 — 2026-08-08
-- Banco: Supabase self-hosted PG15 (supabase_db container ef6d3932698c)
-- Aplicado via SUPABASE SELF HOSTED MCP
-- ============================================================================

-- A12: VACUUM FULL em tabelas com bloat (0 linhas, dead pages)
-- Executado: ~38MB liberados total
VACUUM FULL ANALYZE evo.evolution_webhook_events_v2_2026_07;  -- ~27MB
VACUUM FULL ANALYZE evo.evolution_whatsapp_status;             -- ~9MB
VACUUM FULL ANALYZE evo.evolution_notifications;               -- ~2MB

-- A13: Detach de partição defunta (instância 'comercial_03' descontinuada)
-- 5 linhas preservadas em evo como tabela independente
ALTER TABLE evo.evolution_messages
  DETACH PARTITION evo.evolution_messages_comercial_03;

-- A14: Mover tabelas de monitoramento VPS do schema evo → ops
-- (schema evo deve conter apenas dados Evolution/WhatsApp)
ALTER TABLE evo.vps_performance_snapshots SET SCHEMA ops;
ALTER TABLE evo.vps_scenarios SET SCHEMA ops;
ALTER TABLE evo.vps_status_history SET SCHEMA ops;

-- A64: Purge de dados de observabilidade antigos (> 90d)
-- Executado: 998 linhas deletadas
DELETE FROM evo.evolution_connection_history
WHERE created_at < now() - interval '90 days';
