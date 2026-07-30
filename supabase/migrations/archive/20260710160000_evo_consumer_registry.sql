-- ============================================================================
-- Evolution API Consumer Registry (E3-07)
-- Auditoria 2026-07-10
--
-- Problema: blast radius da API key (`evolution_api_key_v4_20260704`) era
-- desconhecido — nenhuma lista de consumidores, impossível saber quais
-- serviços precisam ser atualizados em uma rotação ou compromisso.
--
-- Solução: tabela `evo.evolution_api_consumers` com todos os consumidores
-- conhecidos, tipo (interno/externo), criticidade, flag de rotação
-- necessária, e referência ao segredo (nunca o valor do segredo em si).
--
-- Consumidores identificados (2026-07-10):
--   critical/rotation: n8n, painel-compras, painel-financeiro, evo-mcp-server
--   não-HTTP (sem exposure): supabase-pg-cron, webhook-receiver
--
-- Aplicada ao vivo via MCP em 2026-07-10 e verificada (6 registros).
-- Idempotente: CREATE TABLE IF NOT EXISTS + ON CONFLICT DO UPDATE.
-- ============================================================================

CREATE TABLE IF NOT EXISTS evo.evolution_api_consumers (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  consumer_type     TEXT NOT NULL CHECK (consumer_type IN ('internal','external')),
  description       TEXT,
  api_key_secret_ref TEXT,
  endpoints_called  TEXT[],
  criticality       TEXT NOT NULL DEFAULT 'high'
                    CHECK (criticality IN ('critical','high','medium','low')),
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','inactive','unknown')),
  rotation_needed   BOOLEAN NOT NULL DEFAULT false,
  last_verified_at  TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE evo.evolution_api_consumers IS
  'Registry of all consumers of the Evolution API key — blast radius on rotation or compromise.';

INSERT INTO evo.evolution_api_consumers
  (id, name, consumer_type, description, api_key_secret_ref,
   endpoints_called, criticality, status, rotation_needed, last_verified_at, notes)
VALUES
  ('n8n-internal',
   'n8n Workflow Automation',
   'internal',
   'Internal n8n instance — orchestrates Evolution webhooks, message routing and automation flows.',
   'n8n credential store (evolution_api_key_v4_20260704)',
   ARRAY['/message/sendText/{instance}','/message/sendMedia/{instance}','/instance/fetchInstances'],
   'critical', 'active', true,
   NOW(),
   'P1: credential store entry must be updated on key rotation. Confirm credential name in n8n settings.'),

  ('painel-compras',
   'Painel Compras (Dashboard)',
   'external',
   'External dashboard for the Compras department. Calls Evolution API directly to send/read messages.',
   'app config or env var — not in Docker secrets',
   ARRAY['/message/sendText/{instance}','/chat/findMessages/{instance}'],
   'critical', 'active', true,
   NOW(),
   'P1: key stored outside Docker secrets. Must be updated on rotation. Coordinate with Compras team.'),

  ('painel-financeiro',
   'Painel Financeiro (Dashboard)',
   'external',
   'External dashboard for the Financeiro department. Same pattern as painel-compras.',
   'app config or env var — not in Docker secrets',
   ARRAY['/message/sendText/{instance}','/chat/findMessages/{instance}'],
   'critical', 'active', true,
   NOW(),
   'P1: key stored outside Docker secrets. Must be updated on rotation. Coordinate with Financeiro team.'),

  ('evo-mcp-server',
   'Evolution MCP Server (Claude Agent)',
   'internal',
   'MCP tool server providing Evolution API tools to Claude Code agents. Configured in MCP settings with API key.',
   'MCP server config (references evolution_api_key_v4_20260704)',
   ARRAY['*'],
   'high', 'active', true,
   NOW(),
   'P1: MCP server config must be updated on key rotation. Key stored in MCP environment config.'),

  ('supabase-pg-cron',
   'Supabase pg_cron internal probes',
   'internal',
   'pg_cron jobs call evo.fn_pipeline_health_probe() and other internal DB functions — do NOT use the Evolution API HTTP key.',
   NULL,
   ARRAY['DB-internal only'],
   'low', 'active', false,
   NOW(),
   'Not an HTTP consumer — no API key exposure. Listed for completeness.'),

  ('webhook-receiver',
   'Evolution Webhook → Supabase Edge Function',
   'internal',
   'Evolution API posts webhook events to a Supabase Edge Function. Uses WEBHOOK_VERIFY_TOKEN, not the API key.',
   'wa_business_verify_token_v1 (Docker secret)',
   ARRAY['/webhook/set/{instance}'],
   'medium', 'active', false,
   NOW(),
   'Uses verify token, not API key. Separate rotation concern (wa_business_verify_token_v1).')
ON CONFLICT (id) DO UPDATE SET
  updated_at       = now(),
  last_verified_at = EXCLUDED.last_verified_at,
  notes            = EXCLUDED.notes;
