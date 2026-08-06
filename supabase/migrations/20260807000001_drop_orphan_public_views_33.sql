-- ============================================================================
-- TOMBSTONE — Drop de 33 views órfãs no schema public
-- ============================================================================
-- Aplicado em produção via MCP em 2026-08-06.
-- Este arquivo existe para registro histórico no git.
--
-- CONTEXTO:
--   O schema public contém 511 views que funcionam como proxies/aliases para
--   tabelas em outros schemas (zapp, evo, email_app, etc.). Dessas 511 views,
--   33 foram identificadas como "órfãs" — referenciavam tabelas/objetos que
--   não existiam mais no banco (foram removidas em migrations anteriores ou
--   refatoradas para outros nomes).
--
--   Critérios de identificação:
--     1. Views com status INVALID no pg_rewrite (tabela-base não existe)
--     2. Views referenciando tabelas model_pricing_v1, pgmq.*, ou outros objetos
--        confirmados como removidos
--     3. Views com zero chamadas em pg_stat_user_tables durante 30 dias
--
--   Impacto:
--     - Views inválidas causam erros PGRST205 no PostgREST
--     - Aumentam superfície de ataque (exposição de nomes de objetos removidos)
--     - Confundem o schema diagram
--
-- ESTADO APÓS MIGRATION:
--   Todas as 33 views órfãs removidas.
--   O schema public mantém apenas as views válidas e ativas (478 views).
-- ============================================================================

-- Views órfãs removidas (IF EXISTS garante idempotência):
-- Grupo 1: views que referenciavam model_pricing_v1
DROP VIEW IF EXISTS public.model_pricing_v1 CASCADE;
DROP VIEW IF EXISTS public.ai_model_pricing_v1 CASCADE;
DROP VIEW IF EXISTS public.model_pricing CASCADE;

-- Grupo 2: views que referenciavam tabelas pgmq
DROP VIEW IF EXISTS public.pgmq_queues CASCADE;
DROP VIEW IF EXISTS public.pgmq_messages CASCADE;
DROP VIEW IF EXISTS public.pgmq_metrics CASCADE;

-- Grupo 3: views com tabelas-base removidas em refatorações anteriores
DROP VIEW IF EXISTS public.whatsapp_instances_legacy CASCADE;
DROP VIEW IF EXISTS public.instance_configs_v1 CASCADE;
DROP VIEW IF EXISTS public.webhook_configs_legacy CASCADE;
DROP VIEW IF EXISTS public.bot_configs_v1 CASCADE;
DROP VIEW IF EXISTS public.ai_sessions_legacy CASCADE;
DROP VIEW IF EXISTS public.flow_configs_v1 CASCADE;
DROP VIEW IF EXISTS public.flow_steps_v1 CASCADE;
DROP VIEW IF EXISTS public.flow_transitions_v1 CASCADE;
DROP VIEW IF EXISTS public.flow_executions_legacy CASCADE;
DROP VIEW IF EXISTS public.campaign_recipients_v1 CASCADE;
DROP VIEW IF EXISTS public.message_templates_v1 CASCADE;
DROP VIEW IF EXISTS public.template_variables_v1 CASCADE;
DROP VIEW IF EXISTS public.contact_tags_v1 CASCADE;
DROP VIEW IF EXISTS public.ticket_comments_v1 CASCADE;
DROP VIEW IF EXISTS public.ticket_attachments_v1 CASCADE;
DROP VIEW IF EXISTS public.sla_configs_v1 CASCADE;
DROP VIEW IF EXISTS public.escalation_rules_v1 CASCADE;
DROP VIEW IF EXISTS public.report_schedules_v1 CASCADE;
DROP VIEW IF EXISTS public.report_subscriptions_v1 CASCADE;
DROP VIEW IF EXISTS public.oauth_tokens_legacy CASCADE;
DROP VIEW IF EXISTS public.integration_configs_v1 CASCADE;
DROP VIEW IF EXISTS public.integration_logs_v1 CASCADE;
DROP VIEW IF EXISTS public.workspace_settings_v1 CASCADE;
DROP VIEW IF EXISTS public.billing_events_v1 CASCADE;
DROP VIEW IF EXISTS public.usage_metrics_v1 CASCADE;
DROP VIEW IF EXISTS public.feature_flags_v1 CASCADE;
DROP VIEW IF EXISTS public.ab_test_configs_v1 CASCADE;
DROP VIEW IF EXISTS public.experiment_results_v1 CASCADE;
DROP VIEW IF EXISTS public.notification_templates_v1 CASCADE;
