-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 20260729190005_harden_secdef_search_path_remaining.sql
-- Purpose  : Remover 'public' do search_path de 106 funções SECDEF
--            (posições não-first — risco residual baixo mas eliminável).
--
-- Contexto: audit 2026-07-29 — 106 funções SECDEF com 'public' em
-- posição não-first no search_path. Embora CREATE em public esteja
-- revogado (anon_can_create=false, auth_can_create=false), a presença
-- de 'public' no search_path é CWE-1027 latente.
--
-- Fix: ALTER FUNCTION ... SET search_path removendo 'public', '$user',
-- e 'pg_temp' mas preservando a ORDEM relativa dos schemas canônicos.
-- Geração automática via script. Verificação manual pós-aplicação.
-- Idempotente: ALTER FUNCTION SET search_path é reentrante.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER FUNCTION archive.fn_refresh_schema_dependency_map() SET search_path TO archive, pg_catalog;
ALTER FUNCTION archive.fn_schema_migration_readiness(p_schema text) SET search_path TO archive, pg_catalog;
ALTER FUNCTION evo.sync_contact_intelligence() SET search_path TO zapp, evo;
ALTER FUNCTION financeiro.adicionar_parcelas(p_id uuid, p_quantidade integer) SET search_path TO financeiro;
ALTER FUNCTION financeiro.adicionar_valor_emprestimo(p_id uuid, p_valor numeric, p_data date, p_descricao text) SET search_path TO financeiro;
ALTER FUNCTION financeiro.apagar_nota_fiscal(p_nf_id uuid) SET search_path TO financeiro, vendas;
ALTER FUNCTION financeiro.atualizar_colaborador(p_id uuid, p_nome text, p_cpf text, p_cargo text, p_departamento text, p_chave_pix text, p_tipo_chave_pix text, p_cidade text, p_ativo boolean, p_tipo_contrato text) SET search_path TO financeiro;
ALTER FUNCTION financeiro.atualizar_colaborador(p_id uuid, p_nome text, p_cpf text, p_cargo text, p_departamento text, p_chave_pix text, p_tipo_chave_pix text, p_cidade text, p_ativo boolean) SET search_path TO financeiro;
ALTER FUNCTION financeiro.bulk_insert_parcelas(p_payload jsonb) SET search_path TO financeiro;
ALTER FUNCTION financeiro.bulk_sync_parcelas_planilha(p_payload jsonb) SET search_path TO financeiro;
ALTER FUNCTION financeiro.bulk_upsert_vendas(p_payload jsonb) SET search_path TO financeiro;
ALTER FUNCTION financeiro.desfazer_unificacao(p_grupo_id uuid, p_usuario text) SET search_path TO financeiro;
ALTER FUNCTION financeiro.empresas_reativadas_ou_novas_hoje() SET search_path TO financeiro, vendas;
ALTER FUNCTION financeiro.fn_app_role() SET search_path TO financeiro;
ALTER FUNCTION financeiro.fn_atualizar_timestamp() SET search_path TO financeiro;
ALTER FUNCTION financeiro.fn_auto_liquidar_emprestimo() SET search_path TO financeiro;
ALTER FUNCTION financeiro.fn_is_admin() SET search_path TO financeiro;
ALTER FUNCTION financeiro.fn_is_admin_diretor() SET search_path TO financeiro;
ALTER FUNCTION financeiro.fn_sync_nf_para_vendas() SET search_path TO financeiro;
ALTER FUNCTION financeiro.fn_sync_status_ordem() SET search_path TO financeiro, vendas;
ALTER FUNCTION financeiro.fn_sync_status_ordem_delete() SET search_path TO financeiro, vendas;
ALTER FUNCTION financeiro.liquidar_parcela(p_id uuid, p_valor numeric, p_desconto_tipo text, p_data_pagamento date, p_liquidado_por text, p_acao_restante text) SET search_path TO financeiro;
ALTER FUNCTION financeiro.liquidar_vale(p_id uuid, p_valor numeric, p_data date, p_responsavel text, p_obs text) SET search_path TO financeiro;
ALTER FUNCTION financeiro.listar_irmaos_faturaveis(p_pedido_pai text, p_ano integer) SET search_path TO financeiro;
ALTER FUNCTION financeiro.pagar_parcela_emprestimo(p_id uuid, p_liquidado_por text) SET search_path TO financeiro;
ALTER FUNCTION financeiro.prorrogar_parcela(p_id uuid, p_parcela_num integer, p_nova_data date) SET search_path TO financeiro;
ALTER FUNCTION financeiro.ranking_vendas_hoje() SET search_path TO financeiro, vendas;
ALTER FUNCTION financeiro.ranking_vendas_semana() SET search_path TO financeiro, vendas;
ALTER FUNCTION financeiro.remover_parcelas(p_id uuid, p_quantidade integer) SET search_path TO financeiro;
ALTER FUNCTION financeiro.sincronizar_nome_produto_nfs(p_pedido_pai text, p_cod_produto text, p_cor text, p_nome_antigo text, p_novo_nome text) SET search_path TO financeiro;
ALTER FUNCTION financeiro.sync_parcela_planilha(p jsonb) SET search_path TO financeiro;
ALTER FUNCTION financeiro.unificar_pedidos(p_venda_ids uuid[], p_lider_id uuid, p_usuario text) SET search_path TO financeiro;
ALTER FUNCTION financeiro.vendedores_acima_50k_hoje() SET search_path TO financeiro, vendas;
ALTER FUNCTION ops.auth_session_cleanup(p_keep_last integer, p_min_age_hours integer) SET search_path TO auth, ops, pg_catalog;
ALTER FUNCTION ops.check_critical_fks(p_raise boolean) SET search_path TO ops, zapp, evo, email_app, auth, pg_catalog;
ALTER FUNCTION ops.check_host_disk() SET search_path TO ops;
ALTER FUNCTION ops.check_infrastructure() SET search_path TO ops, zapp, evo, extensions;
ALTER FUNCTION ops.check_lovable_parity(p_raise boolean) SET search_path TO ops, zapp, pg_catalog;
ALTER FUNCTION ops.check_marketing_budget() SET search_path TO ops, evo;
ALTER FUNCTION ops.check_mirror_integrity(p_raise boolean) SET search_path TO ops, zapp, pg_catalog;
ALTER FUNCTION ops.check_schema_drift(p_raise boolean) SET search_path TO ops, zapp, pg_catalog;
ALTER FUNCTION ops.check_wal_health() SET search_path TO ops, pg_catalog;
ALTER FUNCTION ops.cloud_parity_report() SET search_path TO ops, pg_catalog;
ALTER FUNCTION ops.fn_alert_consumer_halt() SET search_path TO ops, evo;
ALTER FUNCTION ops.fn_analytics_log_retention(p_days integer) SET search_path TO ops, pg_catalog;
ALTER FUNCTION ops.fn_auth_session_overflow_alert() SET search_path TO auth, ops, pg_catalog;
ALTER FUNCTION ops.fn_auto_update_backup_sentinel() SET search_path TO ops, pg_catalog;
ALTER FUNCTION ops.fn_catalog_sanity_check() SET search_path TO ops, pg_catalog;
ALTER FUNCTION ops.fn_check_cron_health() SET search_path TO ops, pg_catalog, cron;
ALTER FUNCTION ops.fn_check_wal_slots() SET search_path TO ops;
ALTER FUNCTION ops.fn_dashboard() SET search_path TO ops, evo, zapp;
ALTER FUNCTION ops.fn_ddl_audit_drop() SET search_path TO ops, pg_catalog;
ALTER FUNCTION ops.fn_ddl_audit_log() SET search_path TO ops, pg_catalog;
ALTER FUNCTION ops.fn_ddl_drop_alert() SET search_path TO ops, evo, pg_catalog;
ALTER FUNCTION ops.fn_ddl_weekly_summary() SET search_path TO ops, evo, zapp;
ALTER FUNCTION ops.fn_guardrails_check() SET search_path TO ops, evo, zapp;
ALTER FUNCTION ops.fn_monitor_ingestion_persistence_gap(p_window interval, p_min_upserts integer, p_degraded_ratio numeric, p_cooldown interval) SET search_path TO ops, evo, zapp, pg_catalog;
ALTER FUNCTION ops.fn_notify_critical_alerts() SET search_path TO ops, evo;
ALTER FUNCTION ops.fn_payload_retention(p_days integer, p_dry_run boolean) SET search_path TO ops, evo;
ALTER FUNCTION ops.fn_performance_report() SET search_path TO ops, zapp, evo, extensions;
ALTER FUNCTION ops.fn_regression_tests() SET search_path TO ops, pg_catalog;
ALTER FUNCTION ops.fn_regression_tests_backup_check() SET search_path TO ops, zapp;
ALTER FUNCTION ops.fn_update_backup_sentinel(p_file text, p_size_bytes bigint, p_table_count integer, p_offsite_ok boolean, p_dry_run boolean) SET search_path TO ops, pg_catalog;
ALTER FUNCTION ops.fn_verify_alert_delivery(p_lookback interval, p_max_attempts integer, p_grace interval, p_batch integer, p_blackout_win interval) SET search_path TO ops, evo, zapp, net, pg_catalog;
ALTER FUNCTION ops.ingest_host_disk(p_used_pct integer, p_used_h text, p_avail_h text, p_total_h text, p_mount text, p_host text, p_warn integer, p_crit integer, p_cooldown_min integer, p_persist boolean) SET search_path TO ops;
ALTER FUNCTION ops.run_all_checks() SET search_path TO ops, pg_catalog, evo, zapp, cron, monitoring, financeiro, vendas, artes, auth;
ALTER FUNCTION ops.sim_disk_alert_e2e() SET search_path TO ops;
ALTER FUNCTION ops.sim_disk_guard() SET search_path TO ops;
ALTER FUNCTION ops.sim_forensic_battery() SET search_path TO ops, evo;
ALTER FUNCTION ops.sim_wa_budget_guard() SET search_path TO ops, evo;
ALTER FUNCTION public.check_user_permission(p_permission_name text) SET search_path TO zapp, pg_catalog;
ALTER FUNCTION public.generate_transfer_ticket() SET search_path TO zapp, pg_catalog;
ALTER FUNCTION public.get_contact_intelligence_by_phone(p_phone text) SET search_path TO zapp;
ALTER FUNCTION public.handle_new_user_settings() SET search_path TO zapp, pg_catalog;
ALTER FUNCTION public.increment_webhook_rate_limit(p_instance_id text, p_event_type text, p_window_start timestamp with time zone, p_limit integer) SET search_path TO zapp, pg_catalog;
ALTER FUNCTION public.is_queue_member_of_contact(_contact_id uuid, _user_id uuid) SET search_path TO zapp, pg_catalog;
ALTER FUNCTION public.log_rls_denied(p_resource text, p_required_role text, p_context jsonb) SET search_path TO zapp, pg_catalog;
ALTER FUNCTION public.on_role_change() SET search_path TO zapp, pg_catalog;
ALTER FUNCTION public.purge_old_query_telemetry(p_days integer) SET search_path TO zapp, pg_catalog;
ALTER FUNCTION public.rpc_email_cleanup_old_events(p_retention_days integer) SET search_path TO zapp, pg_catalog;
ALTER FUNCTION public.rpc_get_contact(p_contact_id uuid) SET search_path TO evo;
ALTER FUNCTION public.rpc_get_contact(p_remote_jid text, p_instance text) SET search_path TO evo;
ALTER FUNCTION public.trg_fn_set_transfer_ticket() SET search_path TO zapp, pg_catalog;
ALTER FUNCTION vendas.aplicar_envio_cotacao(p_cotacao_id uuid, p_enviado_por_email text, p_enviado_por_nome text, p_itens jsonb) SET search_path TO vendas;
ALTER FUNCTION vendas.eh_admin() SET search_path TO vendas, auth, extensions;
ALTER FUNCTION vendas.fn_listar_bling_tokens() SET search_path TO financeiro;
ALTER FUNCTION vendas.fn_listar_produtos_para_ia_ncm(p_limit integer) SET search_path TO vendas;
ALTER FUNCTION vendas.fn_propagar_ncm_para_ordens_compra() SET search_path TO vendas;
ALTER FUNCTION vendas.fn_registrar_ncm_descoberto(p_cod_produto text, p_ncm text, p_nome_produto text, p_bling_produto_id text, p_fornecedor text, p_origem text) SET search_path TO vendas;
ALTER FUNCTION vendas.fn_trg_ncm_auto() SET search_path TO vendas;
ALTER FUNCTION vendas.fn_trg_ncm_enqueue_n8n() SET search_path TO vendas, net;
ALTER FUNCTION vendas.registrar_acesso() SET search_path TO vendas, auth, extensions;
ALTER FUNCTION vendas.resetar_envios_pedido(p_pedido_pai text) SET search_path TO vendas;
ALTER FUNCTION zapp.fn_evolution_status_unknown(p_instance_name text) SET search_path TO zapp;
ALTER FUNCTION zapp.fn_messages_instead_of_insert() SET search_path TO zapp, evo;
ALTER FUNCTION zapp.fn_messages_view_insert_handler() SET search_path TO zapp, evo;
ALTER FUNCTION zapp.fn_process_whatsapp_message(p_payload jsonb, p_instance text) SET search_path TO zapp, evo;
ALTER FUNCTION zapp.fn_refresh_role_permissions_mv() SET search_path TO zapp;
ALTER FUNCTION zapp.get_connection_id_for_instance(p_instance text) SET search_path TO zapp;
ALTER FUNCTION zapp.get_contact_intelligence_by_phone(p_phone text) SET search_path TO zapp, evo, auth, extensions;
ALTER FUNCTION zapp.get_default_workspace_id() SET search_path TO zapp;
ALTER FUNCTION zapp.is_feature_enabled(p_flag_key text, p_user_id uuid, p_user_role text) SET search_path TO zapp;
ALTER FUNCTION zapp.populate_contact_intelligence_batch(p_batch_size integer, p_offset integer) SET search_path TO zapp, evo;
ALTER FUNCTION zapp.rpc_bulk_repair_dedup_hashes(p_instance_name text, p_batch_size integer, p_dry_run boolean) SET search_path TO zapp, evo, extensions;
ALTER FUNCTION zapp.trg_fn_refresh_role_permissions_mv() SET search_path TO zapp;
ALTER FUNCTION zapp.upsert_contact_intelligence(p_contact_id uuid) SET search_path TO zapp, evo;

-- ── VERIFICAÇÃO ─────────────────────────────────────────────────────────────
-- (count de SECDEF com public deve ser 0 após aplicação)
-- Query: SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   CROSS JOIN LATERAL unnest(p.proconfig) AS cfg
--   WHERE p.prosecdef=true AND n.nspname IN ('zapp','evo','public',...)
--   AND cfg ILIKE 'search_path=%' AND cfg ILIKE '%public%';