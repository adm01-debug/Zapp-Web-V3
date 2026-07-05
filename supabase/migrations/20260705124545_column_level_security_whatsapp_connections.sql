-- Migration: Column-level security for public.whatsapp_connections
--
-- CONTEXT (2026-07-05, Gap A do PR #206):
--   Após o fix do Bug #1 (GRANT SELECT amplo em public.whatsapp_connections
--   para `authenticated`), uma auditoria de segurança identificou que as
--   colunas api_key e qr_code_base64 ficaram legíveis por QUALQUER usuário
--   autenticado — incluindo credenciais sensíveis da Evolution API.
--
--   Auditoria de código confirmou que NENHUM caminho do frontend lê essas
--   duas colunas de public.whatsapp_connections (o api_key real usado pelo
--   app vem de outra tabela: evolution_instance_credentials, consumida via
--   src/integrations/zappweb/evolutionClient.ts). São campos legados/mortos
--   nesta tabela.
--
-- ARMADILHA DESCOBERTA DURANTE A SIMULAÇÃO (documentada para o time):
--   `REVOKE SELECT (col) ON table FROM role` NÃO tem efeito se o role
--   ainda possuir um GRANT SELECT de TABELA inteira (sem lista de colunas).
--   No PostgreSQL, privilégios de tabela e de coluna são ADITIVOS — o
--   REVOKE de coluna específica não "vence" um GRANT de tabela ampla ainda
--   ativo. A simulação em transação de teste (SET LOCAL ROLE + ROLLBACK)
--   provou isso: o REVOKE de coluna sozinho foi um "fix fantasma" — a
--   coluna continuava 100% legível.
--
--   A forma correta de restringir colunas específicas é:
--     1. REVOKE SELECT ON table FROM role;               (remove o grant amplo)
--     2. GRANT SELECT (lista explícita de colunas) ON table TO role;
--
-- VALIDAÇÃO: as 30 queries reais do frontend contra esta tabela foram
-- extraídas do código-fonte e simuladas em transação de teste (SET LOCAL
-- ROLE authenticated + ROLLBACK) antes de aplicar em produção. Todas
-- passaram. UPDATE de colunas não-sensíveis também validado.

REVOKE SELECT ON public.whatsapp_connections FROM authenticated;

GRANT SELECT (
  id, name, phone_number, instance_name, instance_id, api_url, status,
  qr_code, is_active, is_default, webhook_url, settings, last_connected_at,
  connected_at, disconnected_at, created_at, updated_at, api_type,
  battery_level, created_by, degraded_at, farewell_enabled, farewell_message,
  health_reason, health_response_ms, health_status, is_plugged,
  last_health_check, max_retries, owner_jid, retry_count, routing_mode,
  auto_reconnect_enabled, loop_protection_active, max_reconnect_attempts,
  reconnect_interval_seconds, evo_instance_id
) ON public.whatsapp_connections TO authenticated;

-- api_key e qr_code_base64 permanecem acessíveis apenas a: postgres, service_role.
