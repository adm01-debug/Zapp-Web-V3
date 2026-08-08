-- ============================================================================
-- Migration: Auditoria Evolution API — Onda 4 — 2026-08-08
-- Banco: PG14 (evolution) via postgres container (212ef2cbae98)
-- Aplicado via portainer_exec_container / SUPABASE SELF HOSTED MCP
-- ============================================================================

-- A27: Timeouts de sessão para prevenir conexões zumbis futuras
ALTER SYSTEM SET idle_session_timeout = '15min';
ALTER SYSTEM SET idle_in_transaction_session_timeout = '15min';
SELECT pg_reload_conf();

-- A39: Índices BRIN nas tabelas de retenção (DELETEs O(log) em vez de O(n))
CREATE INDEX CONCURRENTLY IF NOT EXISTS brin_audit_trap_occurred
  ON _audit_outbound_trap USING brin (occurred_at) WITH (pages_per_range=32);

CREATE INDEX CONCURRENTLY IF NOT EXISTS brin_evo_webhook_occurred
  ON evolution_webhook_events USING brin (occurred_at) WITH (pages_per_range=32);

CREATE INDEX CONCURRENTLY IF NOT EXISTS brin_baileys_err_observed
  ON _baileys_error_events USING brin (observed_at) WITH (pages_per_range=32);

-- A6: Purge imediato de dados > 30d em _audit_outbound_trap (retenção 90→30d)
-- Executado: 2732 linhas deletadas
DELETE FROM _audit_outbound_trap
WHERE occurred_at < now() - interval '30 days';
VACUUM ANALYZE _audit_outbound_trap;

-- A3: Limpeza de 10 conexões superuser zumbis (10.0.1.6, idle 2139–6972s) — EXECUTADO
-- SELECT count(pg_terminate_backend(pid)) FROM pg_stat_activity
-- WHERE datname='evolution' AND usename='postgres' AND client_addr='10.0.1.6'
-- AND state='idle' AND extract(epoch from (now()-state_change)) > 1800;

-- A9: Deduplicação de labels (3 CUIDs antigos deletados — No lidas/Favoritos/Grupos) — EXECUTADO
-- DELETE FROM "Label"
-- WHERE id IN ('cmsapt1zh0001qp07jhc4rjff','cmsapt1zs0003qp07cr88izav','cmsapt20p0007qp07wpr871l6');
