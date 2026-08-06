-- =====================================================================
-- AG-EX-18 (item 52) — DROP de 33 views public 100% órfãs
-- Data: 2026-08-07 · Auditoria infra (itens 51/52/55/98)
-- Critério de orfandade (todas as condições simultâneas):
--   1. NÃO referenciadas por outras views/matviews (pg_depend: 0 refs)
--   2. NENHUM match em prosrc de funções (regex word-boundary, 477 nomes)
--   3. NENHUM match em cron.job.command
--   4. NENHUM match em src/ (app zapp-web-v3, excl. types.ts)
--   5. NENHUM match em supabase/functions (edge fns)
--   6. NENHUM match em bundles dos painéis externos (financeiro/compras/cotacoes/artes)
--   7. NENHUM match em workflows n8n (workflow_entity.nodes)
--   8. pg_stat_statements pós-reset: apenas COPY (pg_dump diário) — sem consumo real
--   9. NÃO são evolution_* (recriadas pelo cron 138 ensure-evolution-backcompat-views)
--  10. NÃO são bpm_* (schema bpm MANTIDO — item 51, dependências RPC reais)
-- EXCLUÍDAS por consumidor real: supplier_pix_keys (n8n "PIX - Validacao",
--   node Postgres schema 'public'), parabens_enviados (n8n "Parabenizar Vendedor")
-- EXCLUÍDA: pg_buffercache (view da extensão pg_buffercache — DROP bloqueado pela extensão)
-- Backup completo dos viewdefs: .hermes/auditoria-infra/_ag-ex18/viewdefs_backup_20260807.sql
-- Rollback: recriar com o viewdef do arquivo de backup (espelhos simples SELECT * FROM <schema>.<tabela>)
-- =====================================================================

DROP VIEW IF EXISTS public.agent_memories;
DROP VIEW IF EXISTS public.agent_permissions;
DROP VIEW IF EXISTS public.agent_templates;
DROP VIEW IF EXISTS public.agent_traces;
DROP VIEW IF EXISTS public.agent_usage;
DROP VIEW IF EXISTS public.agent_versions;
DROP VIEW IF EXISTS public.alert_dispatch_state;
DROP VIEW IF EXISTS public.api_keys;
DROP VIEW IF EXISTS public.consent_records;
DROP VIEW IF EXISTS public.conversation_participants;
DROP VIEW IF EXISTS public.credential_audit_logs;
DROP VIEW IF EXISTS public.dashboard_queries;
DROP VIEW IF EXISTS public.deploy_connections;
DROP VIEW IF EXISTS public.embedding_configs;
DROP VIEW IF EXISTS public.engineering_principles;
DROP VIEW IF EXISTS public.evaluation_datasets;
DROP VIEW IF EXISTS public.evaluation_runs;
DROP VIEW IF EXISTS public.finetune_jobs;
DROP VIEW IF EXISTS public.forensic_snapshots;
DROP VIEW IF EXISTS public.forwarded_messages;
DROP VIEW IF EXISTS public.installed_templates;
DROP VIEW IF EXISTS public.integration_registry;
DROP VIEW IF EXISTS public.media_storage_config;
DROP VIEW IF EXISTS public.queue_items;
DROP VIEW IF EXISTS public.security_events;
DROP VIEW IF EXISTS public.sla_policies;
DROP VIEW IF EXISTS public.supabase_projects;
DROP VIEW IF EXISTS public.system_settings;
DROP VIEW IF EXISTS public.tenants;
DROP VIEW IF EXISTS public.test_cases;
DROP VIEW IF EXISTS public.webhook_endpoints;
DROP VIEW IF EXISTS public.webhook_idempotency;
DROP VIEW IF EXISTS public.webhook_reprocess_queue;
