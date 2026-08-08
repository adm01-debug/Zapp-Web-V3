-- Migration: guard-rails de statement_timeout e idle_in_transaction_session_timeout
-- Aplicado ao postgres:14 (evolution DB) — auditoria 2026-08-08
-- Contexto: A2 - prevenir query runaway e sessões bloqueadas

-- evolution_app: DML sem DDL, sem superuser
-- 60s timeout para queries longas, 60s para transações idle
ALTER ROLE evolution_app SET statement_timeout = '60s';
ALTER ROLE evolution_app SET idle_in_transaction_session_timeout = '60s';

-- n8n_app: leitura/escrita via N8N
-- 30s query, 60s idle
ALTER ROLE n8n_app SET statement_timeout = '30s';
ALTER ROLE n8n_app SET idle_in_transaction_session_timeout = '60s';

-- n8n_ro: read-only
-- 10s query, 10s idle (A2 gap fix: idle_in_transaction estava ausente)
ALTER ROLE n8n_ro SET statement_timeout = '10s';
ALTER ROLE n8n_ro SET idle_in_transaction_session_timeout = '10s';

-- log_min_duration_statement: logar queries >1s
ALTER SYSTEM SET log_min_duration_statement = '1000'; -- ms
SELECT pg_reload_conf();
