# MIGRATIONS CLEANUP — DOCUMENTO DE DECISÕES (CP-2)

> Medições ao vivo 2026-08-19: **367 arquivos** repo × **754 registros** schema_migrations (88 pré + 666 pós).
> Sanity: KEEP(75)+ARCHIVE(283)+DELETE(9)=367 ✓ · Órfãos: BACKFILL(94)+TOMBSTONE(206)=300 ✓
> **Este documento congela no CP-2 até aprovação humana explícita do Joaquim.**


## EXCLUSAO DELETE (git rm; git history preserva; db record vira tombstone) (9)

| version | filename | evidence |
|---|---|---|
| 20260806991000 | 20260806991000_drop_duplicate_indexes_evolution_messages.sql | 20260806991000	B4	yes	0	DROP INDEX 50+	TOMBSTONE: drop de índices dupl |
| 20260806992000 | 20260806992000_drop_unused_tsvector_indexes.sql | 20260806992000	B4	yes	0	DROP INDEX 17	TOMBSTONE: drop de índices tsvec |
| 20260806993000 | 20260806993000_drop_model_pricing_v1_orphan.sql | 20260806993000	B4	yes	0	DROP TABLE 4;DROP SEQUENCE 3;DROP VIEW 1	TOMBS |
| 20260806994000 | 20260806994000_drop_pgmq_extension.sql | 20260806994000	B4	yes	0	DROP EXTENSION pgmq	TOMBSTONE: drop extensão p |
| 20260807000001 | 20260807000001_drop_orphan_public_views_33.sql | 20260807000001	B4	yes	0	DROP VIEW 33	TOMBSTONE: drop 33 views órfãs pu |
| 20260807235500 | 20260807235500_drop_sla_policies.sql | 1	20260807235500	20260807235500_drop_sla_policies.sql	B4	DROP sem efei |
| 20260808120001 | 20260808120001_drop_redundant_partition_rjid_indexes.sql | 14	20260808120001	20260808120001_drop_redundant_partition_rjid_indexes |
| 20260815250006 | 20260815250006_decouple_e50_drop_33_fns_mortas.sql | 20260815250006	20260815250006_decouple_e50_drop_33_fns_mortas.sql	B4	D |
| 20260816090000 | 20260816090000_drop_dead_functions_zapp_evo.sql | 16	20260816090000	20260816090000_drop_dead_functions_zapp_evo.sql	B4	G |


## EXCLUSAO ARCHIVE (git mv p/ docs/history/migrations-archive/) (283)

| version | filename | db_name | evidence |
|---|---|---|---|
| 20260804120000 | 20260804120000_enable_rls_missing_tables.sql | enable_rls_missing_tables (aplicada de facto; delta efetivo  | 20260804120000	20260804120000_enable_rls_missing_tables.sql	B3	ARCHIVE |
| 20260804130000 | 20260804130000_fix_rls_critical_gaps.sql | fix_rls_critical_gaps (C-1 corrigido; delta efetivo em 20260 | 20260804130000	20260804130000_fix_rls_critical_gaps.sql	B2	ARCHIVE	LOW |
| 20260804140000 | 20260804140000_fix_rls_delta_corrigido.sql | fix_rls_delta_corrigido | 20260804140000	20260804140000_fix_rls_delta_corrigido.sql	B2	ARCHIVE	L |
| 20260804140100 | 20260804140100_fix_rls_critical_follow_up.sql | fix_rls_critical_follow_up | 20260804140100	20260804140100_fix_rls_critical_follow_up.sql	B2	ARCHIV |
| 20260804150000 | 20260804150000_fix_secdef_revoke_extended_schemas.sql | fix_secdef_revoke_extended_schemas (registro manual) | 20260804150000	20260804150000_fix_secdef_revoke_extended_schemas.sql	B |
| 20260804150001 | 20260804150001_integration_schema_zapp_fixes.sql | integration_schema_zapp_fixes (registro manual) | 20260804150001	20260804150001_integration_schema_zapp_fixes.sql	B2	ARC |
| 20260804160000 | 20260804160000_fix_rls_policy_gaps_agent2.sql | fix_rls_policy_gaps_agent2 (registro manual) | 20260804160000	20260804160000_fix_rls_policy_gaps_agent2.sql	B3	ARCHIV |
| 20260804170000 | 20260804170000_fix_rls_systematic_coverage.sql | fix_rls_systematic_coverage (registro manual) | 20260804170000	20260804170000_fix_rls_systematic_coverage.sql	B2	ARCHI |
| 20260804190316 | 20260804190316_restore_orphaned_rpcs.sql | restore_orphaned_rpcs | 20260804190316	20260804190316_restore_orphaned_rpcs.sql	B2	ARCHIVE	LOW |
| 20260804195000 | 20260804195000_talkx_recipients_write_policies.sql | talkx_recipients_write_policies | 20260804195000	20260804195000_talkx_recipients_write_policies.sql	B2	A |
| 20260804210100 | 20260804210100_fix_rls_wave3_gaps_v2.sql | fix_rls_wave3_gaps_v2 | 20260804210100	20260804210100_fix_rls_wave3_gaps_v2.sql	B2	ARCHIVE	bai |
| 20260804210923 | 20260804210923_restore_edge_idempotency_rpcs.sql | restore_edge_idempotency_rpcs | 20260804210923	20260804210923_restore_edge_idempotency_rpcs.sql	B2	ARC |
| 20260805000000 | 20260805000000_delta_724_orphaned_objects.sql | delta_724_orphaned_objects | 20260805000000	20260805000000_delta_724_orphaned_objects.sql	B2	ARCHIV |
| 20260805000001 | 20260805000001_fix_rls_write_policies.sql | fix_rls_write_policies | 20260805000001	20260805000001_fix_rls_write_policies.sql	B2	ARCHIVE	ba |
| 20260805000008 | 20260805000008_campanhas_nps_cron.sql | campanhas_nps_cron | 20260805000008	20260805000008_campanhas_nps_cron.sql	B2	ARCHIVE	baixo	 |
| 20260805000010 | 20260805000010_cron_scheduler_admin_rpcs.sql | cron_scheduler_admin_rpcs | 20260805000010	20260805000010_cron_scheduler_admin_rpcs.sql	B2	ARCHIVE |
| 20260805093021 | 20260805093021_cleanup_deleted_edge_functions.sql | cleanup_deleted_edge_functions | 20260805093021	20260805093021_cleanup_deleted_edge_functions.sql	B2	AR |
| 20260805103705 | 20260805103705_apply_missing_140100_policies.sql | apply_missing_140100_policies | 20260805103705	20260805103705_apply_missing_140100_policies.sql	B2	ARC |
| 20260805104043 | 20260805104043_harden_evo_insert_policies.sql | harden_evo_insert_policies | 20260805104043	20260805104043_harden_evo_insert_policies.sql	B2	ARCHIV |
| 20260805105924 | 20260805105924_grant_lgpd_auth_rpcs.sql | grant_lgpd_auth_rpcs | 20260805105924	20260805105924_grant_lgpd_auth_rpcs.sql	B2	ARCHIVE	baix |
| 20260805120000 | 20260805120000_fix_update_contact_note_rpc.sql | fix_update_contact_note_rpc | 20260805120000	20260805120000_fix_update_contact_note_rpc.sql	B2	ARCHI |
| 20260805120001 | 20260805120001_leakproof_privileged_check.sql | leakproof_privileged_check | 20260805120001	20260805120001_leakproof_privileged_check.sql	B2	ARCHIV |
| 20260805120407 | 20260805120407_revoke_auth_edge_rpcs.sql | revoke_auth_edge_rpcs | 20260805120407	20260805120407_revoke_auth_edge_rpcs.sql	B2	ARCHIVE	low |
| 20260805120436 | 20260805120436_guard_admin_bulk_rpcs.sql | guard_admin_bulk_rpcs | 20260805120436	20260805120436_guard_admin_bulk_rpcs.sql	B2	ARCHIVE	low |
| 20260805121000 | 20260805121000_wave2_perf_security.sql | wave2_perf_security | 20260805121000	20260805121000_wave2_perf_security.sql	B2	ARCHIVE	mediu |
| 20260805130000 | 20260805130000_harden_audit_tables_rls.sql | harden_audit_tables_rls | 20260805130000	20260805130000_harden_audit_tables_rls.sql	B2	ARCHIVE	l |
| 20260805140000 | 20260805140000_fix_contact_editing_rpcs.sql | fix_contact_editing_rpcs | 20260805140000	20260805140000_fix_contact_editing_rpcs.sql	B2	ARCHIVE	 |
| 20260805150000 | 20260805150000_fix_null_guard_whatsapp_mode.sql | fix_null_guard_whatsapp_mode | 20260805150000	20260805150000_fix_null_guard_whatsapp_mode.sql	B2	ARCH |
| 20260805160000 | 20260805160000_harden_rpc_schema_whitelist.sql | harden_rpc_schema_whitelist | 20260805160000	20260805160000_harden_rpc_schema_whitelist.sql	B2	ARCHI |
| 20260805170000 | 20260805170000_rpc_contract_inventory.sql | rpc_contract_inventory | 20260805170000	20260805170000_rpc_contract_inventory.sql	B2	ARCHIVE	lo |
| 20260805170001 | 20260805170001_email_attachments_unique_constraint.sql | email_attachments_unique_constraint | 20260805170001	20260805170001_email_attachments_unique_constraint.sql	 |
| 20260805170002 | 20260805170002_revoke_anon_contract_inventory.sql | revoke_anon_contract_inventory | 20260805170002	20260805170002_revoke_anon_contract_inventory.sql	B2	AR |
| 20260805180000 | 20260805180000_revoke_meme_favorite_2arg_authenticated.sql | revoke_meme_favorite_2arg_authenticated | 20260805180000	20260805180000_revoke_meme_favorite_2arg_authenticated. |
| 20260805180532 | 20260805180532_fix_pgrst204_agent_id_evolution_messages.sql | fix_pgrst204_agent_id_evolution_messages | 20260805180532	20260805180532_fix_pgrst204_agent_id_evolution_messages |
| 20260805181000 | 20260805181000_fix_fn_edge_fn_staleness_check.sql | fix_fn_edge_fn_staleness_check | 20260805181000	20260805181000_fix_fn_edge_fn_staleness_check.sql	B2	AR |
| 20260805183000 | 20260805183000_grant_health_score_reassign_guarded.sql | grant_health_score_reassign_guarded | 20260805183000	20260805183000_grant_health_score_reassign_guarded.sql	 |
| 20260805190000 | 20260805190000_create_csat_tables.sql | create_csat_tables | 20260805190000	20260805190000_create_csat_tables.sql	B2	ARCHIVE	low	ye |
| 20260805193000 | 20260805193000_realtime_email_health_revalidation.sql | realtime_email_health_revalidation | 20260805193000	20260805193000_realtime_email_health_revalidation.sql	B |
| 20260805220000 | 20260805220000_revive_logpatch_audit_view_trigger.sql | revive_logpatch_audit_view_trigger | 20260805220000	20260805220000_revive_logpatch_audit_view_trigger.sql	B |
| 20260806090000 | 20260806090000_capture_rpc_get_contact_summary_batch.sql | capture_rpc_get_contact_summary_batch | 20260806090000	20260806090000_capture_rpc_get_contact_summary_batch.sq |
| 20260806100001 | 20260806100001_harden_meme_favorite_2arg_guard.sql | harden_meme_favorite_2arg_guard | 20260806100001	20260806100001_harden_meme_favorite_2arg_guard.sql	B2	A |
| 20260806100002 | 20260806100002_fix_retry_stuck_messages_queued_status.sql | fix_retry_stuck_messages_queued_status | 20260806100002	20260806100002_fix_retry_stuck_messages_queued_status.s |
| 20260806110000 | 20260806110000_revoke_anon_public_read_audio_messages.sql | revoke_anon_public_read_audio_messages | 20260806110000	20260806110000_revoke_anon_public_read_audio_messages.s |
| 20260806120000 | 20260806120000_db01_enqueue_message_dispatch.sql | db01_enqueue_message_dispatch | 20260806120000	20260806120000_db01_enqueue_message_dispatch.sql	yes	B2 |
| 20260806121000 | 20260806121000_db02_purge_api_key_logs.sql | db02_purge_api_key_logs | 20260806121000	20260806121000_db02_purge_api_key_logs.sql	yes	B3	ARCHI |
| 20260806121500 | 20260806121500_db02b_fix_return_purge_api_key_logs.sql | db02b_fix_return_purge_api_key_logs | 20260806121500	20260806121500_db02b_fix_return_purge_api_key_logs.sql	 |
| 20260806122000 | 20260806122000_db03_register_instance.sql | db03_register_instance | 20260806122000	20260806122000_db03_register_instance.sql	yes	B2	ARCHIV |
| 20260806123000 | 20260806123000_db04_validate_not_valid_checks.sql | db04_validate_not_valid_checks | 20260806123000	20260806123000_db04_validate_not_valid_checks.sql	yes	B |
| 20260806124000 | 20260806124000_db05_grants_cron_observability.sql | db05_grants_cron_observability | 20260806124000	20260806124000_db05_grants_cron_observability.sql	yes	B |
| 20260806125000 | 20260806125000_fix_evo_percent_format.sql | fix_evo_percent_format | 20260806125000	20260806125000_fix_evo_percent_format.sql	yes	B2	ARCHIV |
| 20260806125500 | 20260806125500_db05b_ops_reference_integrity_guardrail.sql | db05b_ops_reference_integrity_guardrail | 20260806125500	20260806125500_db05b_ops_reference_integrity_guardrail. |
| 20260806130000 | 20260806130000_fix_percent_format_class.sql | fix_percent_format_class | 20260806130000	20260806130000_fix_percent_format_class.sql	yes	B2	ARCH |
| 20260806135729 | 20260806135729_criar_tabela_exclusoes_ranking.sql | criar_tabela_exclusoes_ranking | 20260806135729	20260806135729_criar_tabela_exclusoes_ranking.sql	yes	B |
| 20260806135751 | 20260806135751_atualizar_ranking_vendas_hoje_com_exclusoes.sql | atualizar_ranking_vendas_hoje_com_exclusoes | 20260806135751	20260806135751_atualizar_ranking_vendas_hoje_com_exclus |
| 20260806140000 | 20260806140000_f2_34_retention_webhook_logs.sql | f2_34_retention_webhook_logs | 20260806140000	20260806140000_f2_34_retention_webhook_logs.sql	yes	B2	 |
| 20260806141000 | 20260806141000_f2_31_sync_messages_v2_orderby.sql | f2_31_sync_messages_v2_orderby | 20260806141000	20260806141000_f2_31_sync_messages_v2_orderby.sql	yes	B |
| 20260806150000 | 20260806150000_db05c_guardrail_comment_aware.sql | db05c_guardrail_comment_aware | 20260806150000	20260806150000_db05c_guardrail_comment_aware.sql	yes	B2 |
| 20260806160000 | 20260806160000_revoke_anon_public_read_etiquetas_remessa.sql | revoke_anon_public_read_etiquetas_remessa | 20260806160000	20260806160000_revoke_anon_public_read_etiquetas_remess |
| 20260806170000 | 20260806170000_rb2_c1_policies_pii.sql | rb2_c1_policies_pii | 20260806170000	20260806170000_rb2_c1_policies_pii.sql	yes	B2	ARCHIVE	d |
| 20260806170500 | 20260806170500_rb2_c4_drop_empty_evo_indexes.sql | rb2_c4_drop_empty_evo_indexes | 20260806170500	20260806170500_rb2_c4_drop_empty_evo_indexes.sql	yes	B2 |
| 20260806171000 | 20260806171000_rb2_d1_backups_schema_expiry.sql | rb2_d1_backups_schema_expiry | 20260806171000	20260806171000_rb2_d1_backups_schema_expiry.sql	yes	B2	 |
| 20260806171500 | 20260806171500_rb2_c10_retention_jobs.sql | rb2_c10_retention_jobs | 20260806171500	20260806171500_rb2_c10_retention_jobs.sql	yes	B2	ARCHIV |
| 20260806172000 | 20260806172000_rb2_a4_fix_lid_contamination_format.sql | rb2_a4_fix_lid_contamination_format | 20260806172000	20260806172000_rb2_a4_fix_lid_contamination_format.sql	 |
| 20260806172500 | 20260806172500_rb2_c5_c6_audit_index_autovacuum.sql | rb2_c5_c6_audit_index_autovacuum | 20260806172500	20260806172500_rb2_c5_c6_audit_index_autovacuum.sql	yes |
| 20260806173000 | 20260806173000_rb2_a4b_verify_alert_delivery_sync_skip_locked.sql | rb2_a4b_verify_alert_delivery_sync_skip_locked | 20260806173000	20260806173000_rb2_a4b_verify_alert_delivery_sync_skip_ |
| 20260806173001 | 20260806173001_rb2_a8_logpatch_patch_mode.sql | rb2_a8_logpatch_patch_mode | 20260806173001	20260806173001_rb2_a8_logpatch_patch_mode.sql	yes	evo.e |
| 20260806173500 | 20260806173500_rb2_a4c_stagger_verify_alert_delivery_cron.sql | rb2_a4c_stagger_verify_alert_delivery_cron | 20260806173500	20260806173500_rb2_a4c_stagger_verify_alert_delivery_cr |
| 20260806180000 | 20260806180000_fix_wa_rpc_execute_grants.sql | fix_wa_rpc_execute_grants | 20260806180000	20260806180000_fix_wa_rpc_execute_grants.sql	yes	zapp.g |
| 20260806180001 | 20260806180001_fix_v_logpatch_health_security_invoker.sql | fix_v_logpatch_health_security_invoker | 20260806180001	20260806180001_fix_v_logpatch_health_security_invoker.s |
| 20260806185000 | 20260806185000_rb2_onda3_views_drops.sql | rb2_onda3_views_drops | 20260806185000	20260806185000_rb2_onda3_views_drops.sql	yes	evo.evolut |
| 20260806185500 | 20260806185500_rb2_d9_kpi_overview.sql | rb2_d9_kpi_overview | 20260806185500	20260806185500_rb2_d9_kpi_overview.sql	yes	evo.v_kpi_ov |
| 20260806190000 | 20260806190000_bugfix_fn_verify_alert_delivery_v6.sql | bugfix_fn_verify_alert_delivery_v6 | 20260806190000	20260806190000_bugfix_fn_verify_alert_delivery_v6.sql	y |
| 20260806190500 | 20260806190500_rb2_glitchtip_cleanup.sql | rb2_glitchtip_cleanup | 20260806190500	20260806190500_rb2_glitchtip_cleanup.sql	yes	fn_get_401 |
| 20260806191000 | 20260806191000_bugfix_retention_naming_and_stale_expiry.sql | bugfix_retention_naming_and_stale_expiry | 20260806191000	20260806191000_bugfix_retention_naming_and_stale_expiry |
| 20260806192000 | 20260806192000_bugfix_evolution_logpatch_audit_security_invoker.sql | bugfix_evolution_logpatch_audit_security_invoker | 20260806192000	20260806192000_bugfix_evolution_logpatch_audit_security |
| 20260806193000 | 20260806193000_whatsapp_media_bucket_public.sql | whatsapp_media_bucket_public | 20260806193000	20260806193000_whatsapp_media_bucket_public.sql	yes	aut |
| 20260806194000 | 20260806194000_audio_memes_bucket_public.sql | audio_memes_bucket_public | 20260806194000	20260806194000_audio_memes_bucket_public.sql	yes	auth_w |
| 20260806195000 | 20260806195000_guard_media_buckets_public.sql | guard_media_buckets_public | 20260806195000	20260806195000_guard_media_buckets_public.sql	yes	stora |
| 20260806200000 | 20260806200000_fix_grant_toggle_meme_favorite_2arg.sql | fix_grant_toggle_meme_favorite_2arg | 20260806200000	20260806200000_fix_grant_toggle_meme_favorite_2arg.sql	 |
| 20260806200001 | 20260806200001_bugfix_fn_verify_alert_delivery_v7.sql | bugfix_fn_verify_alert_delivery_v7 | 20260806200001	20260806200001_bugfix_fn_verify_alert_delivery_v7.sql	y |
| 20260806200002 | 20260806200002_revoke_store_reset_token_from_authenticated.sql | revoke_store_reset_token_from_authenticated | 20260806200002	20260806200002_revoke_store_reset_token_from_authentica |
| 20260806200100 | 20260806200100_fix_meme_favorite_race_condition_and_revoke_public.sql | fix_meme_favorite_race_condition_and_revoke_public | 20260806200100	20260806200100_fix_meme_favorite_race_condition_and_rev |
| 20260806203227 | 20260806203227_audit_fix_helper_guarda_app_user.sql | migration_20260806203227 | 20260806203227	20260806203227_audit_fix_helper_guarda_app_user.sql	yes |
| 20260806203257 | 20260806203257_audit_fix_p0_guards_list_messages_global_search.sql | migration_20260806203257 | 20260806203257	20260806203257_audit_fix_p0_guards_list_messages_global |
| 20260806203333 | 20260806203333_audit_fix_guardas_rpc_grupo_p0.sql | migration_20260806203333 | 20260806203333	20260806203333_audit_fix_guardas_rpc_grupo_p0.sql	yes	( |
| 20260806203637 | 20260806203637_audit_fix_guardas_rpc_grupo_p0.sql | migration_20260806203637 | 20260806203637	20260806203637_audit_fix_guardas_rpc_grupo_p0.sql	yes	( |
| 20260806203714 | 20260806203714_audit_fix_guardas_rpc_grupo_p0.sql | migration_20260806203714 | 20260806203714	20260806203714_audit_fix_guardas_rpc_grupo_p0.sql	yes	( |
| 20260806204039 | 20260806204039_audit_fix_guardas_rpc_grupo_p0.sql | migration_20260806204039 | 20260806204039	20260806204039_audit_fix_guardas_rpc_grupo_p0.sql	B2	Ar |
| 20260806204144 | 20260806204144_audit_fix_guardas_rpc_grupo_p0.sql | migration_20260806204144 | 20260806204144	20260806204144_audit_fix_guardas_rpc_grupo_p0.sql	B2	Ar |
| 20260806204214 | 20260806204214_audit_fix_guardas_rpc_grupo_p0.sql | migration_20260806204214 | 20260806204214	20260806204214_audit_fix_guardas_rpc_grupo_p0.sql	B2	Ar |
| 20260806204327 | 20260806204327_audit_fix_guardas_rpc_grupo_p0.sql | migration_20260806204327 | 20260806204327	20260806204327_audit_fix_guardas_rpc_grupo_p0.sql	B2	Ar |
| 20260806204354 | 20260806204354_audit_fix_insert_message_overload2_delete_contact.sql | migration_20260806204354 | 20260806204354	20260806204354_audit_fix_insert_message_overload2_delet |
| 20260806204413 | 20260806204413_audit_fix_policies_p1.sql | migration_20260806204413 | 20260806204413	20260806204413_audit_fix_policies_p1.sql	B2	Arquivo+db_ |
| 20260806204441 | 20260806204441_audit_fix_secdef_search_path.sql | migration_20260806204441 | 20260806204441	20260806204441_audit_fix_secdef_search_path.sql	B2	Arqu |
| 20260806204504 | 20260806204504_audit_fix_orph_refs_v2.sql | migration_20260806204504 | 20260806204504	20260806204504_audit_fix_orph_refs_v2.sql	B2	Arquivo+db |
| 20260806204525 | 20260806204525_audit_fix_funcoes_lgpd.sql | migration_20260806204525 | 20260806204525	20260806204525_audit_fix_funcoes_lgpd.sql	B2	Arquivo+db |
| 20260806204540 | 20260806204540_audit_fix_realtime_views_ops_public.sql | migration_20260806204540 | 20260806204540	20260806204540_audit_fix_realtime_views_ops_public.sql	 |
| 20260806204705 | 20260806204705_audit_fix_secdef_search_path_final.sql | migration_20260806204705 | 20260806204705	20260806204705_audit_fix_secdef_search_path_final.sql	B |
| 20260806210200 | 20260806210200_f12_linkage_realtime_view.sql | f12_linkage_realtime_view | 20260806210200	20260806210200_f12_linkage_realtime_view.sql	B2	Arquivo |
| 20260806300000 | 20260806300000_fix_idor_toggle_meme_favorite.sql | fix_idor_toggle_meme_favorite | 20260806300000	20260806300000_fix_idor_toggle_meme_favorite.sql	B3	Sup |
| 20260806400000 | 20260806400000_fix_retry_auto_fail_max_retry.sql | fix_retry_auto_fail_max_retry | 20260806400000	20260806400000_fix_retry_auto_fail_max_retry.sql	B2	Arq |
| 20260806500000 | 20260806500000_fix_cosmetic_gaps_p3.sql | fix_cosmetic_gaps_p3 | 20260806500000	20260806500000_fix_cosmetic_gaps_p3.sql	B2	Arquivo+db_r |
| 20260806600000 | 20260806600000_fix_sticker_idor_p1.sql | fix_sticker_idor_p1 | 20260806600000	20260806600000_fix_sticker_idor_p1.sql	B2	Arquivo+db_re |
| 20260806700000 | 20260806700000_fix_g1_searchpath_gaps.sql | fix_g1_searchpath_gaps | 20260806700000	20260806700000_fix_g1_searchpath_gaps.sql	B2	Arquivo+db |
| 20260806800000 | 20260806800000_fix_g1b_meme_favorite_searchpath.sql | fix_g1b_meme_favorite_searchpath | 20260806800000	20260806800000_fix_g1b_meme_favorite_searchpath.sql	B3	 |
| 20260806800001 | 20260806800001_fix_g1_meme_favorite_searchpath.sql | fix_g1_meme_favorite_searchpath | 20260806800001	20260806800001_fix_g1_meme_favorite_searchpath.sql	B2	A |
| 20260806800002 | 20260806800002_seed_evo_instance_credentials_wpp2.sql | seed_evo_instance_credentials_wpp2 | 20260806800002	20260806800002_seed_evo_instance_credentials_wpp2.sql	B |
| 20260806850000 | 20260806850000_realtime_presence_connections.sql | realtime_presence_connections | 20260806850000	20260806850000_realtime_presence_connections.sql	B2	Arq |
| 20260806900000 | 20260806900000_fix_rls_sticker_favorites.sql | fix_rls_sticker_favorites | 20260806900000	20260806900000_fix_rls_sticker_favorites.sql	B2	Arquivo |
| 20260806950000 | 20260806950000_fix_sec2_sec3_sec4_guards.sql | fix_sec2_sec3_sec4_guards | 20260806950000	B2	yes	55	zapp.get_visible_agent_ids;zapp.has_role;zapp |
| 20260806960000 | 20260806960000_fix_cotacoes_schema_ref.sql | fix_cotacoes_schema_ref | 20260806960000	B2	yes	4	zapp.apagar_nota_fiscal;financeiro.apagar_nota |
| 20260806970000 | 20260806970000_fix_duplicate_rls_policies.sql | fix_duplicate_rls_policies | 20260806970000	B2	yes	0	DROP POLICY 6x;CREATE POLICY 1x;COMMENT 3x	DRO |
| 20260806970001 | 20260806970001_explicit_rls_audio_meme_favorites.sql | explicit_rls_audio_meme_favorites | 20260806970001	B2	yes	0	ALTER TABLE ENABLE RLS;CREATE POLICY;COMMENT	H |
| 20260806980000 | 20260806980000_fix_fn_toggle_meme_favorite_table_and_guard.sql | fix_fn_toggle_meme_favorite_table_and_guard | 20260806980000	B2	yes	3	zapp.fn_toggle_user_meme_favorite(uuid;uuid)	C |
| 20260806990000 | 20260806990000_rb2_desfasar_evo_401_feed.sql | rb2_desfasar_evo_401_feed | 20260806990000	B2	yes	0	cron.schedule evo-401-feed	Reschedule cron evo |
| 20260806990001 | 20260806990001_rb2_versionar_wrapper_http_post.sql | rb2_versionar_wrapper_http_post | 20260806990001	B2	yes	1	extensions.http_post	CREATE OR REPLACE wrapper |
| 20260806995001 | 20260806995001_autovacuum_bootstrap_log.sql | autovacuum_bootstrap_log | 20260806995001	B2	yes	1	evo.evolution_bootstrap_log;idx_ebl_instance_c |
| 20260806995003 | 20260806995003_autovacuum_disk_actions_queue.sql | autovacuum_disk_actions_queue | 20260806995003	B2	yes	0	ops.disk_actions_queue;idx_daq_pending;uq_disk |
| 20260806995005 | 20260806995005_autovacuum_paused_services.sql | autovacuum_paused_services | 20260806995005	B2	yes	0	ops.paused_services;GRANT;ALTER TABLE	CREATE T |
| 20260806995006 | 20260806995006_autovacuum_alert_cooldown.sql | autovacuum_alert_cooldown | 20260806995006	B2	yes	0	ops.alert_cooldown;GRANT;ALTER TABLE	CREATE TA |
| 20260806995007 | 20260806995007_autovacuum_docker_prune_log.sql | autovacuum_docker_prune_log | 20260806995007	B2	yes	0	ops.docker_prune_log_id_seq;ops.docker_prune_l |
| 20260806995008 | 20260806995008_autovacuum_disk_orphans.sql | autovacuum_disk_orphans | 20260806995008	B2	yes	0	ops.disk_orphans;GRANT;ALTER TABLE	CREATE TABL |
| 20260807083000 | 20260807083000_rpc_get_reactions_batch.sql | rpc_get_reactions_batch_versionada | 20260807083000	B2	yes	1	zapp.rpc_get_reactions_batch(uuid[])	CREATE OR |
| 20260807084000 | 20260807084000_rpc_get_reactions_batch_grants.sql | rpc_get_reactions_batch_grants | 20260807084000	B2	yes	0	REVOKE/GRANT zapp.rpc_get_reactions_batch	REVO |
| 20260807090000 | 20260807090000_item86_health_score_ttl30.sql | item86_health_score_ttl30 | 20260807090000	B2	yes	25	zapp.fn_health_score_cache;zapp.fn_health_sco |
| 20260807091000 | 20260807091000_grant_execute_frontend_rpcs.sql | grant_execute_frontend_rpcs_89_functions | 20260807091000	B2	yes	0	DO GRANT EXECUTE 89 rpc_* TO authenticated	GRA |
| 20260807091100 | 20260807091100_item85_evo401_feed_conn_history.sql | item85_evo401_feed_conn_history | 1	20260807091100_item85_evo401_feed_conn_history.sql	20260807091100	B2 |
| 20260807092000 | 20260807092000_item84_warroom_critical_mirror.sql | item84_warroom_critical_mirror | 2	20260807092000_item84_warroom_critical_mirror.sql	20260807092000	B2	 |
| 20260807093000 | 20260807093000_item89_disk_baseline_collector_guard.sql | item89_disk_baseline_collector_guard | 3	20260807093000_item89_disk_baseline_collector_guard.sql	202608070930 |
| 20260807094000 | 20260807094000_item143_restore_partition_baseline_dynamic.sql | item143_restore_partition_baseline_dynamic | 4	20260807094000_item143_restore_partition_baseline_dynamic.sql	202608 |
| 20260807095000 | 20260807095000_item90_logflare_retention_7d.sql | item90_logflare_retention_7d | 5	20260807095000_item90_logflare_retention_7d.sql	20260807095000	B2	ar |
| 20260807100000 | 20260807100000_item84_fix_mirror_resolved_generated.sql | item84_fix_mirror_resolved_generated | 6	20260807100000_item84_fix_mirror_resolved_generated.sql	202608071000 |
| 20260807101000 | 20260807101000_item85_sentinel_stale_race_fix.sql | item85_sentinel_stale_race_fix | 7	20260807101000_item85_sentinel_stale_race_fix.sql	20260807101000	B2	 |
| 20260807102155 | 20260807102155_onda3_d2_negocio_triggers_evo_contrato_views_rpc.sql | onda3_d2_negocio_triggers_evo_contrato_views_rpc | 8	20260807102155_onda3_d2_negocio_triggers_evo_contrato_views_rpc.sql	 |
| 20260807103602 | 20260807103602_fix_policies_p2_residuais.sql | migration_20260807103602 | 9	20260807103602_fix_policies_p2_residuais.sql	20260807103602	B2	arqui |
| 20260807110000 | 20260807110000_ag_ex19_watchdogs_kpi.sql | ag_ex19_watchdogs_kpi | 10	20260807110000_ag_ex19_watchdogs_kpi.sql	20260807110000	B2	arquivo+ |
| 20260807110001 | 20260807110001_ag_ex19_v2_cron_and_inventory.sql | ag_ex19_v2_cron_and_inventory | 11	20260807110001_ag_ex19_v2_cron_and_inventory.sql	20260807110001	B2	 |
| 20260807110002 | 20260807110002_ag_ex19_kpi_episodio.sql | ag_ex19_kpi_episodio | 12	20260807110002_ag_ex19_kpi_episodio.sql	20260807110002	B2	arquivo+d |
| 20260807110003 | 20260807110003_ag_ex19_kpi_resolved_generated_fix.sql | ag_ex19_kpi_resolved_generated_fix | 13	20260807110003_ag_ex19_kpi_resolved_generated_fix.sql	2026080711000 |
| 20260807110457 | 20260807110457_fix_validacao_f6_f3_f2.sql | migration_20260807110457 | 14	20260807110457_fix_validacao_f6_f3_f2.sql	20260807110457	B2	arquivo |
| 20260807120000 | 20260807120000_revoke_anon_execute_six_functions.sql | revoke_anon_execute_six_functions | 15	20260807120000_revoke_anon_execute_six_functions.sql	20260807120000 |
| 20260807120100 | 20260807120100_vald_email_revalidation_jobs_create.sql | vald_email_revalidation_jobs_create | 16	20260807120100_vald_email_revalidation_jobs_create.sql	202608071201 |
| 20260807120325 | 20260807120325_consolidate_rpc_insert_message.sql | consolidate_rpc_insert_message | 17	20260807120325_consolidate_rpc_insert_message.sql	20260807120325	B2 |
| 20260807130000 | 20260807130000_revoke_anon_execute_fn_require_app_user.sql | revoke_anon_execute_fn_require_app_user | 18	20260807130000_revoke_anon_execute_fn_require_app_user.sql	20260807 |
| 20260807140000 | 20260807140000_create_rpc_e2e_cleanup.sql | create_rpc_e2e_cleanup | 19	20260807140000_create_rpc_e2e_cleanup.sql	20260807140000	B2	arquivo |
| 20260807145000 | 20260807145000_ag04_arq11_searchpath_outliers.sql | ag04_arq11_searchpath_outliers | 20	20260807145000_ag04_arq11_searchpath_outliers.sql	20260807145000	B2 |
| 20260807145100 | 20260807145100_ag04_arq11_searchpath_zapp_rpc_schema.sql | ag04_arq11_searchpath_zapp_rpc_schema | 21	20260807145100_ag04_arq11_searchpath_zapp_rpc_schema.sql	2026080714 |
| 20260807150000 | 20260807150000_e2e_rpc_seed_and_validate.sql | e2e_rpc_seed_and_validate | 22	20260807150000_e2e_rpc_seed_and_validate.sql	20260807150000	B2	arqu |
| 20260807160000 | 20260807160000_vald2_fn_drop_logflare_slot_mirror.sql | fix_ops_analytics_log_retention_dblink_ref | 1	20260807160000	20260807160000_vald2_fn_drop_logflare_slot_mirror.sql |
| 20260807160001 | 20260807160001_ag01_onda2_move_amcheck_to_extensions.sql | ag01_onda2_move_amcheck_to_extensions | 2	20260807160001	20260807160001_ag01_onda2_move_amcheck_to_extensions. |
| 20260807160002 | 20260807160002_ag01_onda2_move_hypopg_to_extensions.sql | ag01_onda2_move_hypopg_to_extensions | 3	20260807160002	20260807160002_ag01_onda2_move_hypopg_to_extensions.s |
| 20260807160003 | 20260807160003_ag01_onda2_move_index_advisor_to_extensions.sql | ag01_onda2_move_index_advisor_to_extensions | 4	20260807160003	20260807160003_ag01_onda2_move_index_advisor_to_exten |
| 20260807160004 | 20260807160004_ag01_onda2_move_pg_buffercache_to_extensions.sql | ag01_onda2_move_pg_buffercache_to_extensions | 5	20260807160004	20260807160004_ag01_onda2_move_pg_buffercache_to_exte |
| 20260807160005 | 20260807160005_ag01_onda2_move_btree_gin_to_extensions.sql | ag01_onda2_move_btree_gin_to_extensions | 6	20260807160005	20260807160005_ag01_onda2_move_btree_gin_to_extension |
| 20260807160006 | 20260807160006_ag01_onda2_move_dblink_to_extensions.sql | ag01_onda2_move_dblink_to_extensions | 7	20260807160006	20260807160006_ag01_onda2_move_dblink_to_extensions.s |
| 20260807160007 | 20260807160007_ag01_onda2_move_pg_trgm_to_extensions.sql | ag01_onda2_move_pg_trgm_to_extensions | 8	20260807160007	20260807160007_ag01_onda2_move_pg_trgm_to_extensions. |
| 20260807160008 | 20260807160008_ag01_onda2_move_unaccent_to_extensions.sql | ag01_onda2_move_unaccent_to_extensions | 9	20260807160008	20260807160008_ag01_onda2_move_unaccent_to_extensions |
| 20260807160009 | 20260807160009_ag01_onda2_move_vector_to_extensions.sql | ag01_onda2_move_vector_to_extensions | 10	20260807160009	20260807160009_ag01_onda2_move_vector_to_extensions. |
| 20260807165000 | 20260807165000_cleanup_evo_contacts_orphans.sql | cleanup_evo_contacts_orphans | 11	20260807165000	20260807165000_cleanup_evo_contacts_orphans.sql	B3	S |
| 20260807170000 | 20260807170000_public_e2e_rpc_wrappers.sql | public_e2e_rpc_wrappers | 12	20260807170000	20260807170000_public_e2e_rpc_wrappers.sql	B2	db_rec |
| 20260807180000 | 20260807180000_seed_user_rpc.sql | seed_user_rpc | 13	20260807180000	20260807180000_seed_user_rpc.sql	B2	db_record=yes; z |
| 20260807190000 | 20260807190000_rpc_e2e_cleanup_v3_trigger_guard.sql | rpc_e2e_cleanup_v3_trigger_guard | 14	20260807190000	20260807190000_rpc_e2e_cleanup_v3_trigger_guard.sql	 |
| 20260807200000 | 20260807200000_ag06_sto_team_chat_files_owner_check.sql | ag06_sto_team_chat_files_owner_check | 15	20260807200000	20260807200000_ag06_sto_team_chat_files_owner_check. |
| 20260807210000 | 20260807210000_ag07_sto_mime_types_restantes.sql | ag07_sto_mime_types_restantes | 16	20260807210000	20260807210000_ag07_sto_mime_types_restantes.sql	B8	 |
| 20260807220000 | 20260807220000_ag05_onda2_qa1005_fn_insert_idempotency_failure_audit.s | ag05_onda2_qa1005_fn_insert_idempotency_failure_audit | 17	20260807220000	20260807220000_ag05_onda2_qa1005_fn_insert_idempoten |
| 20260807220001 | 20260807220001_ag05_onda2_qa1006_pg_stat_database_simple.sql | ag05_onda2_qa1006_pg_stat_database_simple | 18	20260807220001	20260807220001_ag05_onda2_qa1006_pg_stat_database_si |
| 20260807220002 | 20260807220002_ag05_onda2_qa1005_fix_status_check_constraint.sql | ag05_onda2_qa1005_fix_status_check_constraint | 19	20260807220002	20260807220002_ag05_onda2_qa1005_fix_status_check_co |
| 20260807230000 | 20260807230000_vault_rls.sql | vault_rls | 20	20260807230000	20260807230000_vault_rls.sql	B2	db_record=yes; RLS e |
| 20260807230100 | 20260807230100_fix_alert_channels_seq.sql | fix_alert_channels_seq | 21	20260807230100	20260807230100_fix_alert_channels_seq.sql	B2	db_reco |
| 20260807235000 | 20260807235000_bpm_hardening_auth_write_admin_only.sql | bpm_hardening_auth_write_admin_only | 22	20260807235000	20260807235000_bpm_hardening_auth_write_admin_only.s |
| 20260807235800 | 20260807235800_c3_restrict_rls_permissive_policies.sql | c3_restrict_rls_permissive_policies | 2	20260807235800	20260807235800_c3_restrict_rls_permissive_policies.sq |
| 20260807235900 | 20260807235900_drop_empty_pgmq_schema.sql | drop_empty_pgmq_schema | 3	20260807235900	20260807235900_drop_empty_pgmq_schema.sql	B2	Arquivav |
| 20260807236000 | 20260807236000_revoke_excessive_grants_control_tables.sql | revoke_excessive_grants_control_tables | 4	20260807236000	20260807236000_revoke_excessive_grants_control_tables |
| 20260807270000 | 20260807270000_session_backfill_pipeline_hardening.sql | session_backfill_pipeline_hardening | 5	20260807270000	20260807270000_session_backfill_pipeline_hardening.sq |
| 20260808000100 | 20260808000100_oc02_archive_rls.sql | oc02_archive_rls | 6	20260808000100	20260808000100_oc02_archive_rls.sql	B2	Arquivavel (db |
| 20260808000200 | 20260808000200_oc02_pgsodium_key_rls.sql | oc02_pgsodium_key_rls | 7	20260808000200	20260808000200_oc02_pgsodium_key_rls.sql	B2	Arquivave |
| 20260808110000 | 20260808110000_security_guard_canonica.sql | security_guard_canonica | 8	20260808110000	20260808110000_security_guard_canonica.sql	B2	Arquiva |
| 20260808110001 | 20260808110001_rpc_guards_wave.sql | rpc_guards_wave | 9	20260808110001	20260808110001_rpc_guards_wave.sql	B2	Arquivavel (cre |
| 20260808110002 | 20260808110002_mask_resolve_revokes.sql | mask_resolve_revokes | 10	20260808110002	20260808110002_mask_resolve_revokes.sql	B2	Arquivave |
| 20260808110003 | 20260808110003_policies_restriction_wave.sql | policies_restriction_wave | 11	20260808110003	20260808110003_policies_restriction_wave.sql	B2	Arqu |
| 20260808110004 | 20260808110004_cleanup_hygiene_wave.sql | cleanup_hygiene_wave | 12	20260808110004	20260808110004_cleanup_hygiene_wave.sql	B2	Arquivave |
| 20260808120000 | 20260808120000_fix_health_score_cache_seq.sql | fix_health_score_cache_seq | 13	20260808120000	20260808120000_fix_health_score_cache_seq.sql	B2	Arq |
| 20260808121000 | 20260808121000_ag_ex02_audio_memes_rls.sql | ag_ex02_audio_memes_rls | 15	20260808121000	20260808121000_ag_ex02_audio_memes_rls.sql	B2	Arquiv |
| 20260808130000 | 20260808130000_exec_sql_mcp_query_rpc.sql | exec_sql_mcp_query_rpc | 16	20260808130000	20260808130000_exec_sql_mcp_query_rpc.sql	B2	Arquiva |
| 20260808150000 | 20260808150000_hotfix_revoke_exec_sql_anon.sql | hotfix_revoke_exec_sql_anon | 17	20260808150000	20260808150000_hotfix_revoke_exec_sql_anon.sql	B2	Ar |
| 20260808150001 | 20260808150001_rerevoke_re_grants.sql | rerevoke_re_grants | 18	20260808150001	20260808150001_rerevoke_re_grants.sql	B2	Arquivavel  |
| 20260808230000 | 20260808230000_revoke_anon_exec_zapp_functions.sql | revoke_anon_exec_zapp_functions | 19	20260808230000	20260808230000_revoke_anon_exec_zapp_functions.sql	B |
| 20260808240000 | 20260808240000_fix_gap01_search_contacts_gin_expression.sql | fix_gap01_search_contacts_gin_expression | 20	20260808240000	20260808240000_fix_gap01_search_contacts_gin_express |
| 20260808250000 | 20260808250000_fix_gap03_logflare_pub_restrict.sql | fix_gap03_logflare_pub_restrict | 21	20260808250000	20260808250000_fix_gap03_logflare_pub_restrict.sql	B |
| 20260809000000 | 20260809000000_versioned_drops_and_jwt_ref.sql | versioned_drops_and_jwt_ref | 22	20260809000000	20260809000000_versioned_drops_and_jwt_ref.sql	B2	Ar |
| 20260809179000 | 20260809179000_queue_enqueue_dequeue_mechanic.sql | queue_enqueue_dequeue_mechanic | 1	20260809179000_queue_enqueue_dequeue_mechanic.sql	20260809179000	yes |
| 20260809180000 | 20260809180000_queue_autorouter_wiring.sql | audit_v4_neuter_fn_lid_cleanup_convergence_guard | 2	20260809180000_queue_autorouter_wiring.sql	20260809180000	yes	audit_ |
| 20260810120000 | 20260810120000_populate_media_bucket_path.sql | populate_media_bucket_path | 3	20260810120000_populate_media_bucket_path.sql	20260810120000	yes	pop |
| 20260810170000 | 20260810170000_g6_batch_mode_guards_evolution_contacts.sql | g6_batch_mode_guards_evolution_contacts | 4	20260810170000_g6_batch_mode_guards_evolution_contacts.sql	202608101 |
| 20260810200100 | 20260810200100_fix_consumer_stats_fdw_evolution_postgres.sql | fix_consumer_stats_fdw_evolution_postgres | 5	20260810200100_fix_consumer_stats_fdw_evolution_postgres.sql	2026081 |
| 20260810200200 | 20260810200200_fn_process_contacts_batch_all_guards.sql | fix_fn_process_contacts_batch_instance_validation | 6	20260810200200_fn_process_contacts_batch_all_guards.sql	202608102002 |
| 20260810200300 | 20260810200300_fn_delete_test_contacts.sql | evt_privilege_ddl_watch_n8n_app_monitor_and_orphan_cleanup | 7	20260810200300_fn_delete_test_contacts.sql	20260810200300	yes	evt_pr |
| 20260811130000 | 20260811130000_grupos.sql | grupos | 8	20260811130000_grupos.sql	20260811130000	yes	grupos	B2	DDL objects i |
| 20260811140000 | 20260811140000_status_contato.sql | status_contato | 9	20260811140000_status_contato.sql	20260811140000	yes	status_contato	 |
| 20260811150100 | 20260811150100_evo_integridade_fks_limpezas.sql | evo_integridade_fks_limpezas | 10	20260811150100_evo_integridade_fks_limpezas.sql	20260811150100	yes	 |
| 20260811150300 | 20260811150300_notificacoes.sql | notificacoes | 11	20260811150300_notificacoes.sql	20260811150300	yes	notificacoes	B2	 |
| 20260811150400 | 20260811150400_evo_notification_outbox_dispatcher.sql | evo_notification_outbox_dispatcher | 12	20260811150400_evo_notification_outbox_dispatcher.sql	2026081115040 |
| 20260811170000 | 20260811170000_evo_notif_config_get_rpc.sql | evo_notif_config_get_rpc | 13	20260811170000_evo_notif_config_get_rpc.sql	20260811170000	yes	evo_ |
| 20260811203000 | 20260811203000_grupos_admin_phone.sql | grupos_admin_phone | 14	20260811203000_grupos_admin_phone.sql	20260811203000	yes	grupos_adm |
| 20260811220000 | 20260811220000_view_zapp_evolution_messages_54cols.sql | view_zapp_evolution_messages_54cols | 15	20260811220000_view_zapp_evolution_messages_54cols.sql	202608112200 |
| 20260812160000 | 20260812160000_fix_trigger_lead_status.sql | fix_trigger_lead_status | 16	20260812160000_fix_trigger_lead_status.sql	20260812160000	yes	fix_t |
| 20260812170000 | 20260812170000_health_filter_snap_staging.sql | health_filter_snap_staging | 17	20260812170000_health_filter_snap_staging.sql	20260812170000	yes	he |
| 20260813180000 | 20260813180000_rpc_log_evolution_health.sql | rpc_log_evolution_health | 18	20260813180000_rpc_log_evolution_health.sql	20260813180000	yes	rpc_ |
| 20260813220000 | 20260813220000_idx_fk_without_index.sql | 20260813220000_idx_fk_without_index | 19	20260813220000_idx_fk_without_index.sql	20260813220000	yes	20260813 |
| 20260813230000 | 20260813230000_fix_notify_and_analyze_cron.sql | 20260813230000_fix_notify_and_analyze_cron | 20	20260813230000_fix_notify_and_analyze_cron.sql	20260813230000	yes	2 |
| 20260813240000 | 20260813240000_h2_revoke_views_backcompat_grupo_a.sql | 20260813240000_h2_revoke_views_backcompat_grupo_a | 21	20260813240000_h2_revoke_views_backcompat_grupo_a.sql	2026081324000 |
| 20260814010000 | 20260814010000_fix_inbound_silencio_comercial.sql | 20260814010000_fix_inbound_silencio_comercial | 22	20260814010000_fix_inbound_silencio_comercial.sql	20260814010000	ye |
| 20260814020000 | 20260814020000_revoke_credentials_auth_grants.sql | 20260814020000_revoke_credentials_auth_grants | 1	20260814020000	20260814020000_revoke_credentials_auth_grants.sql	B2	 |
| 20260814030000 | 20260814030000_fix_health_score_cron_orphan_join.sql | 20260814030000_fix_health_score_cron_orphan_join | 2	20260814030000	20260814030000_fix_health_score_cron_orphan_join.sql	 |
| 20260814040000 | 20260814040000_revoke_service_only_tables_auth_write.sql | 20260814040000_revoke_service_only_tables_auth_write | 3	20260814040000	20260814040000_revoke_service_only_tables_auth_write. |
| 20260814050000 | 20260814050000_fix_notify_v6_pending_view.sql | 20260814050000_fix_notify_v6_pending_view | 4	20260814050000	20260814050000_fix_notify_v6_pending_view.sql	B2	Crea |
| 20260814060000 | 20260814060000_fix_wpp2_uptime_kpi_warn_resolve.sql | 20260814060000_fix_wpp2_uptime_kpi_warn_resolve | 5	20260814060000	20260814060000_fix_wpp2_uptime_kpi_warn_resolve.sql	B |
| 20260814100000 | 20260814100000_f4_audit_rpc_fixes.sql | 20260814100000_f4_audit_rpc_fixes | 6	20260814100000	20260814100000_f4_audit_rpc_fixes.sql	B2	10 functions |
| 20260814110000 | 20260814110000_f4_security_unread_fixes.sql | f4_security_unread_fixes | 7	20260814110000	20260814110000_f4_security_unread_fixes.sql	B2	REVOKE |
| 20260814120000 | 20260814120000_fix_cron_detect401_bursts_active.sql | 20260814120000_fix_cron_detect401_bursts_active | 8	20260814120000	20260814120000_fix_cron_detect401_bursts_active.sql	B |
| 20260814130000 | 20260814130000_fn_health_preflight_check9_vault_key.sql | 20260814130000_fn_health_preflight_check9_vault_key | 9	20260814130000	20260814130000_fn_health_preflight_check9_vault_key.s |
| 20260814140000 | 20260814140000_rls_policy_evo_reconcile_snapshot.sql | 20260814140000_rls_policy_evo_reconcile_snapshot | 10	20260814140000	20260814140000_rls_policy_evo_reconcile_snapshot.sql |
| 20260814150000 | 20260814150000_fix_fn_detect_401_bursts_dedup.sql | 20260814150000_fix_fn_detect_401_bursts_dedup | 11	20260814150000	20260814150000_fix_fn_detect_401_bursts_dedup.sql	B2 |
| 20260814210000 | 20260814210000_mirror_rpcs_claim_update_followup.sql | mirror_rpcs_claim_update_followup | 12	20260814210000	20260814210000_mirror_rpcs_claim_update_followup.sql |
| 20260814220000 | 20260814220000_mirror_fn_validate_whatsapp_connection.sql | mirror_fn_validate_whatsapp_connection | 13	20260814220000	20260814220000_mirror_fn_validate_whatsapp_connectio |
| 20260814230000 | 20260814230000_mirror_fn_validate_0arg.sql | mirror_fn_validate_0arg | 14	20260814230000	20260814230000_mirror_fn_validate_0arg.sql	B2	Mirror |
| 20260815090000 | 20260815090000_decouple_e31_zapp_check_license_heartbeat.sql | unify_whatsapp_mode | 15	20260815090000	20260815090000_decouple_e31_zapp_check_license_heart |
| 20260815124500 | 20260815124500_unify_whatsapp_mode.sql | unify_whatsapp_mode | 16	20260815124500	20260815124500_unify_whatsapp_mode.sql	B2	Creates rp |
| 20260815130000 | 20260815130000_decouple_e35_zapp_escalate_critical_alerts.sql | decouple_e35_zapp_escalate_critical_alerts | 17	20260815130000	20260815130000_decouple_e35_zapp_escalate_critical_a |
| 20260815160000 | 20260815160000_decouple_e38_multi_functions.sql | decouple_e38_multi_functions | 18	20260815160000	20260815160000_decouple_e38_multi_functions.sql	B2	C |
| 20260815200001 | 20260815200001_decouple_i4_license_heartbeat.sql | decouple_i4_license_heartbeat | 19	20260815200001	20260815200001_decouple_i4_license_heartbeat.sql	B2	 |
| 20260815200002 | 20260815200002_decouple_i4_wa_status_media.sql | decouple_i4_wa_status_media | 20	20260815200002	20260815200002_decouple_i4_wa_status_media.sql	B2	I4 |
| 20260815200003 | 20260815200003_decouple_i4_audio_transcription.sql | decouple_i4_audio_transcription | 21	20260815200003	20260815200003_decouple_i4_audio_transcription.sql	B |
| 20260815200004 | 20260815200004_decouple_i4_instance_recreate.sql | decouple_i4_instance_recreate | 22	20260815200004	20260815200004_decouple_i4_instance_recreate.sql	B2	 |
| 20260815200005 | 20260815200005_decouple_i4_restore_logs.sql | decouple_i4_restore_logs | 20260815200005	20260815200005_decouple_i4_restore_logs.sql	B2	CREATE O |
| 20260815200006 | 20260815200006_decouple_i4_cookie_dispatch.sql | decouple_i4_cookie_dispatch | 20260815200006	20260815200006_decouple_i4_cookie_dispatch.sql	B2	CREAT |
| 20260815200007 | 20260815200007_decouple_i4_cookie_real.sql | decouple_i4_cookie_real | 20260815200007	20260815200007_decouple_i4_cookie_real.sql	B2	CREATE OR |
| 20260815200008 | 20260815200008_decouple_i4_sicoob.sql | decouple_i4_sicoob | 20260815200008	20260815200008_decouple_i4_sicoob.sql	B2	CREATE evo.fn_ |
| 20260815200009 | 20260815200009_decouple_i4_evo_v2.sql | decouple_i4_evo_v2 | 20260815200009	20260815200009_decouple_i4_evo_v2.sql	B2	CREATE ops.fn_ |
| 20260815200010 | 20260815200010_decouple_i4_infra_secrets.sql | decouple_i4_infra_secrets | 20260815200010	20260815200010_decouple_i4_infra_secrets.sql	B2	CREATE  |
| 20260815200011 | 20260815200011_decouple_i4_resend.sql | decouple_i4_resend | 20260815200011	20260815200011_decouple_i4_resend.sql	B2	CREATE OR REPL |
| 20260815200012 | 20260815200012_decouple_i4_purge_storage_cache.sql | decouple_i4_purge_storage_cache | 20260815200012	20260815200012_decouple_i4_purge_storage_cache.sql	B2	C |
| 20260815200013 | 20260815200013_decouple_i4_wal_slots.sql | decouple_i4_wal_slots | 20260815200013	20260815200013_decouple_i4_wal_slots.sql	B2	CREATE OR R |
| 20260815210000 | 20260815210000_decouple_e41_i1_contract_views.sql | decouple_e41_i1_contract_views | 20260815210000	20260815210000_decouple_e41_i1_contract_views.sql	B2	CR |
| 20260815211000 | 20260815211000_decouple_e42_fn_archive_old_wpp2_messages.sql | decouple_e42_fn_archive_old_wpp2_messages | 20260815211000	20260815211000_decouple_e42_fn_archive_old_wpp2_message |
| 20260815240000 | 20260815240000_decouple_fase4_lote1_e55_e57_e48.sql | decouple_fase4_lote1_e55_e57_e48 | 20260815240000	20260815240000_decouple_fase4_lote1_e55_e57_e48.sql	B2	 |
| 20260815250000 | 20260815250000_decouple_e20_fn_boundary_audit_rpc.sql | decouple_e20_fn_boundary_audit_rpc | 20260815250000	20260815250000_decouple_e20_fn_boundary_audit_rpc.sql	B |
| 20260815250001 | 20260815250001_decouple_e46_searchpath_evo_sem_zapp_safe.sql | decouple_e46_searchpath_evo_sem_zapp_safe | 20260815250001	20260815250001_decouple_e46_searchpath_evo_sem_zapp_saf |
| 20260815250002 | 20260815250002_decouple_e20_public_wrapper_fn_boundary_audit.sql | decouple_e20_public_wrapper_fn_boundary_audit | 20260815250002	20260815250002_decouple_e20_public_wrapper_fn_boundary_ |
| 20260815250003 | 20260815250003_decouple_e47_e48_searchpath_evo_sem_zapp_completo.sql | decouple_e47_e48_searchpath_evo_sem_zapp_completo | 20260815250003	20260815250003_decouple_e47_e48_searchpath_evo_sem_zapp |
| 20260815250004 | 20260815250004_fix_lid_health_report_idx_schema.sql | fix_lid_health_report_idx_schema | 20260815250004	20260815250004_fix_lid_health_report_idx_schema.sql	B2	 |
| 20260815250005 | 20260815250005_decouple_e80_revoke_authenticated_evo_views_contrato.sq | decouple_e80_revoke_authenticated_evo_views_contrato | 20260815250005	20260815250005_decouple_e80_revoke_authenticated_evo_vi |
| 20260815250007 | 20260815250007_decouple_e64_e66_drop_fks_cruzadas_reconciliador.sql | decouple_e64_e66_drop_fks_cruzadas_reconciliador | 20260815250007	20260815250007_decouple_e64_e66_drop_fks_cruzadas_recon |
| 20260815250008 | 20260815250008_decouple_e59_e60_lote1_move_8_fns_monitoria.sql | decouple_e59_e60_lote1_move_8_fns_monitoria | 20260815250008	20260815250008_decouple_e59_e60_lote1_move_8_fns_monito |
| 20260815250009 | 20260815250009_decouple_e59_e60_lote2_move_3_fns_monitoria.sql | decouple_e59_e60_lote2_move_3_fns_monitoria | 20260815250009	20260815250009_decouple_e59_e60_lote2_move_3_fns_monito |
| 20260815250010 | 20260815250010_decouple_e53_e85_audit_v2_roles_provider_call_3_bypasse | decouple_e53_e85_audit_v2_roles_provider_call_3_bypasses | 1	20260815250010	20260815250010_decouple_e53_e85_audit_v2_roles_provid |
| 20260815250011 | 20260815250011_decouple_e78_min_4_views_leitura_evo.sql | decouple_e78_min_4_views_leitura_evo | 2	20260815250011	20260815250011_decouple_e78_min_4_views_leitura_evo.s |
| 20260815250012 | 20260815250012_decouple_e51_e52_e54_rpc_boundary_surface_v1_grants_tes | decouple_e51_e52_e54_rpc_boundary_surface_v1_grants_teste_ne | 3	20260815250012	20260815250012_decouple_e51_e52_e54_rpc_boundary_surf |
| 20260815250013 | 20260815250013_decouple_e62_repoint_8_escritoras_lote3_move_5_fns_i8_z | decouple_e62_repoint_8_escritoras_lote3_move_5_fns_i8_zerado | 4	20260815250013	20260815250013_decouple_e62_repoint_8_escritoras_lote |
| 20260815250014 | 20260815250014_decouple_lote4_move_6_fns_views_e78_drops_codigo_morto_ | decouple_lote4_move_6_fns_views_e78_drops_codigo_morto_fase2 | 5	20260815250014	20260815250014_decouple_lote4_move_6_fns_views_e78_dr |
| 20260815250015 | 20260815250015_decouple_fix_metadata_source_table_pos_move_views.sql | decouple_fix_metadata_source_table_pos_move_views | 6	20260815250015	20260815250015_decouple_fix_metadata_source_table_pos |
| 20260815250016 | 20260815250016_decouple_lote5_16_leitoras_i2_views_e78_boundary_rpcs.s | decouple_lote5_16_leitoras_i2_views_e78_boundary_rpcs | 7	20260815250016	20260815250016_decouple_lote5_16_leitoras_i2_views_e7 |
| 20260815250017 | 20260815250017_decouple_move_normalize_jid_triggers_hot_path_evo_para_ | decouple_move_normalize_jid_triggers_hot_path_evo_para_zapp | 8	20260815250017	20260815250017_decouple_move_normalize_jid_triggers_h |
| 20260815250018 | 20260815250018_decouple_lote6_5_moves_boundary_heartbeat_i2_zero_ops_r | decouple_lote6_5_moves_boundary_heartbeat_i2_zero_ops_restor | 9	20260815250018	20260815250018_decouple_lote6_5_moves_boundary_heartb |
| 20260815250019 | 20260815250019_decouple_fix_vitimas_e50_list_storage_purge_health_repo | decouple_fix_vitimas_e50_list_storage_purge_health_report_ca | 10	20260815250019	20260815250019_decouple_fix_vitimas_e50_list_storage |
| 20260815250020 | 20260815250020_decouple_lote7_lote8_12_moves_9_views_e78_repoint_crons | decouple_lote7_lote8_12_moves_9_views_e78_repoint_crons | 11	20260815250020	20260815250020_decouple_lote7_lote8_12_moves_9_views |
| 20260815250021 | 20260815250021_decouple_leitoras_reversas_5_views_zapp_7_fns_evo_e2e_b | decouple_leitoras_reversas_5_views_zapp_7_fns_evo_e2e_bounda | 12	20260815250021	20260815250021_decouple_leitoras_reversas_5_views_za |
| 20260815250022 | 20260815250022_lote9_fase_a_boundaries_triggers_cruzados.sql | lote9_fase_a_boundaries_triggers_cruzados | 13	20260815250022	20260815250022_lote9_fase_a_boundaries_triggers_cruz |
| 20260815250023 | 20260815250023_lote9_fase_b_probe_scrub_backcompat_moves_boundary_pipe | lote9_fase_b_probe_scrub_backcompat_moves_boundary_pipeline_ | 14	20260815250023	20260815250023_lote9_fase_b_probe_scrub_backcompat_m |
| 20260815250024 | 20260815250024_lote9_fase_c_cluster_lid_3_boundaries_wrapper_apply_sui | lote9_fase_c_cluster_lid_3_boundaries_wrapper_apply_suites_v | 15	20260815250024	20260815250024_lote9_fase_c_cluster_lid_3_boundaries |
| 20260816140000 | 20260816140000_decouple_i1_i2_zerar.sql | decouple_i1_i2_zerar | 17	20260816140000	20260816140000_decouple_i1_i2_zerar.sql	B2	Arquivo+d |
| 20260816141000 | 20260816141000_decouple_i1_i2_fix2.sql | decouple_i1_i2_fix2 | 18	20260816141000	20260816141000_decouple_i1_i2_fix2.sql	B2	Arquivo+db |
| 20260816170000 | 20260816170000_decouple_e86_egress_log.sql | decouple_e86_egress_log | 19	20260816170000	20260816170000_decouple_e86_egress_log.sql	B2	Arquiv |
| 20260816220000 | 20260816220000_e90_prereqs_failed_messages_unique_idem_key_cron_reproc | e90_prereqs_failed_messages_unique_idem_key_cron_reprocess | 20	20260816220000	20260816220000_e90_prereqs_failed_messages_unique_id |
| 20260816250001 | 20260816250001_decouple_e86_ops_observabilidade_8_objetos.sql | decouple_e86_ops_observabilidade_8_objetos | 21	20260816250001	20260816250001_decouple_e86_ops_observabilidade_8_ob |
| 20260816250002 | 20260816250002_decouple_preflight_cron_alerta_canary_repoint.sql | decouple_preflight_cron_alerta_canary_repoint | 22	20260816250002	20260816250002_decouple_preflight_cron_alerta_canary |
| 20260816250003 | 20260816250003_decouple_e73_e75_i4_zero.sql | decouple_e73_e75_i4_zero_move_conversations_messages_contact | 1	20260816250003	20260816250003_decouple_e73_e75_i4_zero.sql	B2	applie |
| 20260816250005 | 20260816250005_decouple_fix_rls_grants_views_contrato_i5_redef.sql | decouple_fix_rls_grants_views_contrato_i5_redef | 2	20260816250005	20260816250005_decouple_fix_rls_grants_views_contrato |
| 20260816250006 | 20260816250006_decouple_restaura_wrappers_zapp_vitimas_e50.sql | decouple_restaura_wrappers_zapp_vitimas_e50 | 3	20260816250006	20260816250006_decouple_restaura_wrappers_zapp_vitima |
| 20260816250007 | 20260816250007_decouple_public_views_invoker_true.sql | decouple_public_views_invoker_true | 4	20260816250007	20260816250007_decouple_public_views_invoker_true.sql |
| 20260816250008 | 20260816250008_decouple_realtime_publication_messages_conversations.sq | decouple_realtime_publication_messages_conversations | 5	20260816250008	20260816250008_decouple_realtime_publication_messages |
| 20260816251000 | 20260816251000_ops_evo_reconciler_least_privilege.sql | ops_evo_reconciler_least_privilege | 6	20260816251000	20260816251000_ops_evo_reconciler_least_privilege.sql |
| 20260816260007 | 20260816260007_fix_views_security_invoker_restantes.sql | fix_views_security_invoker_restantes | 7	20260816260007	20260816260007_fix_views_security_invoker_restantes.s |


## ESCRITA BACKFILL-FILE (orfaos vivos; corpo = o que JA roda no DB) (94)

| version | db_name | evidence |
|---|---|---|
| 20260805152318 |  | Vivos no snapshot: FUNCTION:public.rpc_get_contact;FUNCTION:public.rpc |
| 20260805152911 |  | Vivos no snapshot: FUNCTION:zapp.messages_update_trigger |
| 20260806182000 |  | Vivos no snapshot: TYPE:zapp.warroom_alert_type;VIEW:public.warroom_al |
| 20260806221332 |  | Vivos no snapshot: VIEW:zapp.whatsapp_connections;POLICY:evo_creds_ser |
| 20260806221333 |  | Vivos no snapshot: VIEW:zapp.whatsapp_connections;POLICY:evo_creds_ser |
| 20260807193616 |  | Vivos no snapshot: POLICY:auth_secure_70;POLICY:auth_secure_70_select |
| 20260809120000 |  | Vivos no snapshot: FUNCTION:zapp.get_contacts_360_batch |
| 20260809162000 |  | Vivos no snapshot: INDEX:idx_dispatch_errors_created / Mortos: INDEX:i |
| 20260809183000 |  | Vivos no snapshot: FUNCTION:zapp.rpc_backfill_messages_contact_id |
| 20260809186000 |  | Vivos no snapshot: FUNCTION:zapp.fn_set_updated_at;TRIGGER:trg_ |
| 20260809200000 |  | Vivos no snapshot: VIEW:public.evolution_instance_credentials |
| 20260809C15 |  | Vivos no snapshot: INDEX:idx_dispatch_errors_created / Mortos: INDEX:i |
| 20260809C18 |  | Vivos no snapshot: VIEW:zapp.evolution_retry_metrics |
| 20260809FN01 |  | Vivos no snapshot: FUNCTION:zapp.rpc_list_transfers_paginated |
| 20260809FN02 |  | Vivos no snapshot: VIEW:zapp.gmail_accounts;VIEW:zapp.gmail_threads;VI |
| 20260809FN03 |  | Vivos no snapshot: FUNCTION:zapp.fn_collect_restore_logs |
| 20260809FN04 |  | Vivos no snapshot: FUNCTION:zapp.is_instance_paused;FUNCTION:zapp.paus |
| 20260809G19 |  | Vivos no snapshot: VIEW:zapp.evolution_retry_metrics |
| 20260809G20 |  | Vivos no snapshot: INDEX:idx_dispatch_errors_created / Mortos: INDEX:i |
| 20260809G32 |  | Vivos no snapshot: INDEX:idx_webhook_audit_log_processed_at;INDEX:idx_ |
| 20260809O01 |  | Vivos no snapshot: FUNCTION:evo.fn_download_wa_status_media |
| 20260810180000 |  | Vivos no snapshot: INDEX:idx_esa_remote_jid;INDEX:idx_esa_contact_id;I |
| 20260810190000 |  | Vivos no snapshot: INDEX:idx_dispatch_errors_created / Mortos: INDEX:i |
| 20260810200004 |  | Vivos no snapshot: FUNCTION:public.fn_purge_api_key_from_logs / Mortos |
| 20260810210001 |  | VIVO_SNAP:INDEX:public.idx_dispatch_errors_created |
| 20260810M01 |  | VIVO_SNAP:VIEW:public.instance_registry;VIEW:public.conversation_trans |
| 20260810M02 |  | VIVO_SNAP:FUNCTION:evo.fn_download_wa_status_media |
| 20260810M03 |  | VIVO_SNAP:FUNCTION:evo.fn_download_wa_status_media |
| 20260810M07 |  | VIVO_SNAP:FUNCTION:evo.fn_download_wa_status_media |
| 20260810M08 |  | VIVO_SNAP:FUNCTION:evo.fn_download_wa_status_media |
| 20260811100004 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811100005 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811100006 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811100007 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811200004 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811200005 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811200006 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811200007 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811200008 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811300001 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811300002 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811300003 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811300004 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811300005 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811300006 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811300007 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811400003 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811400004 |  | VIVO_SNAP:FUNCTION:public.fn_reconcile_apply;FUNCTION:public.fn_auto_r |
| 20260811500002 |  | VIVO_SNAP:VIEW:zapp.evolution_retry_metrics |
| 20260811500003 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811500005 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811600001 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811600002 |  | VIVO_SNAP:VIEW:evo.v_logpatch_health |
| 20260811600003 |  | VIVO_SNAP:VIEW:evo.v_logpatch_health |
| 20260811600006 |  | VIVO_SNAP:SCHEMA:ops |
| 20260811700001 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811700002 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811700003 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811700006 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811700007 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811800001 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811800002 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811800003 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811800004 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811800005 |  | VIVO_NONZAPP:FUNCTION:evo.fn_sync_lid_from_api;FUNCTION:evo.fn_sync_li |
| 20260811900001 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811900002 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811900003 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811900004 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811900005 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811990003 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811990004 |  | VIVO_NONZAPP:FUNCTION:evo.fn_sync_lid_from_api;FUNCTION:evo.fn_sync_li |
| 20260811990005 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811A10003 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811A10004 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811A10005 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811A10006 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811A20001 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811A20002 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811A20003 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811A20005 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811B30001 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811B30003 |  | VIVO_NONZAPP:FUNCTION:evo.fn_sync_lid_from_api;FUNCTION:evo.fn_sync_li |
| 20260811B40001 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811B40002 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811B40006 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811B50001 |  | VIVO_SNAP:FUNCTION:zapp.bulk_soft_delete_contacts |
| 20260811B50002 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811B50004 |  | VIVO_NONZAPP:FUNCTION:ops.fn_ci_check_cron_health |
| 20260811B70003 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811B70005 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260811B80001 |  | VIVO_SNAP:FUNCTION:zapp.fn_upsert_lid_identity |
| 20260812A00009 |  | VIVO_SNAP:FUNCTION:public.fn_system_health_score |
| 20260816000000 |  | VIVO_SNAP:FUNCTION:zapp.fn_wal_slot_lag_check |


## TOMBSTONE (documentar no catalogo; sem arquivo; registro preservado) (206)

| version | db_name | evidence |
|---|---|---|
| 20260805154132 |  | SEM-ARQUIVO-NO-GIT — sem objeto a backfill |
| 20260805213735 |  | Criados mas nao vivos: POLICY:service_role_bypass;POLICY:authenticated |
| 20260805213957 |  | Operacao de performance — sem objeto a backfill |
| 20260805214019 |  | GRANT — efeito ja aplicado; sem objeto a backfill |
| 20260806100000 |  | Operacao sem criacao de objeto permanente |
| 20260806221335 |  | SEM-ARQUIVO-NO-GIT — sem objeto a backfill |
| 20260806221500 |  | Fix sem arquivo no git — efeito ja aplicado |
| 20260806221825 |  | SEM-ARQUIVO-NO-GIT — sem objeto a backfill |
| 20260806221835 |  | SEM-ARQUIVO-NO-GIT — sem objeto a backfill |
| 20260806222114 |  | SEM-ARQUIVO-NO-GIT — sem objeto a backfill |
| 20260806222209 |  | SEM-ARQUIVO-NO-GIT — sem objeto a backfill |
| 20260806222211 |  | SEM-ARQUIVO-NO-GIT — sem objeto a backfill |
| 20260806222402 |  | Nome generico de ferramenta externa — sem objeto a backfill |
| 20260806235401 |  | SEM-ARQUIVO-NO-GIT — sem objeto a backfill |
| 20260807195552 |  | REVOKE — permissao ja revogada |
| 20260807195847 |  | REVOKE — permissao ja revogada |
| 20260809160000 |  | Snapshot/preparatorio — sem objeto a backfill |
| 20260809161000 |  | Operacao sem criacao de objeto permanente |
| 20260809163000 |  | DELETE — operacao de dados ja executada |
| 20260809164000 |  | Fix sem arquivo no git — efeito ja aplicado |
| 20260809165000 |  | Criados mas nao vivos: FUNCTION:evo.fn_sync_lid_from_api;FUNCTION:evo. |
| 20260809166000 |  | Criados mas nao vivos: FUNCTION:evo.fn_sync_lid_from_api;FUNCTION:evo. |
| 20260809170000 |  | Operacao sem criacao de objeto permanente |
| 20260809171000 |  | Fix sem arquivo no git — efeito ja aplicado |
| 20260809172000 |  | DROP — operacao de limpeza ja aplicada |
| 20260809173000 |  | Operacao emergencial/reversao — ja aplicada |
| 20260809174000 |  | Operacao emergencial/reversao — ja aplicada |
| 20260809175000 |  | Operacao emergencial/reversao — ja aplicada |
| 20260809176000 |  | Operacao emergencial/reversao — ja aplicada |
| 20260809177000 |  | Operacao emergencial/reversao — ja aplicada |
| 20260809178000 |  | Operacao emergencial/reversao — ja aplicada |
| 20260809181000 |  | Operacao emergencial/reversao — ja aplicada |
| 20260809182000 |  | Audit sem arquivo no git — efeito ja aplicado |
| 20260809184000 |  | Operacao emergencial/reversao — ja aplicada |
| 20260809185000 |  | REVOKE — permissao ja revogada |
| 20260809195000 |  | Operacao sem criacao de objeto permanente |
| 20260809201000 |  | SEM-ARQUIVO-NO-GIT — sem objeto a backfill |
| 20260809C01 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809C02 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809C03 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809C04 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809C05 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809C06 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809C07 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809C08 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809C09 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809C10 |  | Criados mas nao vivos: FUNCTION:public.fn_route_failed_webhooks_to_dlq |
| 20260809C11 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809C12 |  | DROP — operacao de limpeza ja aplicada |
| 20260809C13 |  | DROP — operacao de limpeza ja aplicada |
| 20260809C14 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809C16 |  | Criados mas nao vivos: FUNCTION:public.fn_purge_processed_webhook_even |
| 20260809C17 |  | Criados mas nao vivos: FUNCTION:public.fn_purge_processed_webhook_even |
| 20260809C19 |  | DO block — operacao procedural ja aplicada |
| 20260809C20 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809C21 |  | Operacao sem criacao de objeto permanente |
| 20260809E04 |  | Operacao pontual (E-series) — efeito ja aplicado |
| 20260809E12 |  | Operacao pontual (E-series) — efeito ja aplicado |
| 20260809E24 |  | Operacao pontual (E-series) — efeito ja aplicado |
| 20260809E25 |  | Operacao pontual (E-series) — efeito ja aplicado |
| 20260809E28 |  | Operacao pontual (E-series) — efeito ja aplicado |
| 20260809E29a |  | Operacao sem criacao de objeto permanente |
| 20260809E39 |  | Operacao pontual (E-series) — efeito ja aplicado |
| 20260809E44A |  | Operacao pontual (E-series) — efeito ja aplicado |
| 20260809E44B |  | DROP — operacao de limpeza ja aplicada |
| 20260809F03 |  | DROP — operacao de limpeza ja aplicada |
| 20260809F04 |  | Operacao sem criacao de objeto permanente |
| 20260809F07B |  | Operacao sem criacao de objeto permanente |
| 20260809F07C |  | Fix FK (F-series) — efeito ja aplicado |
| 20260809F08 |  | Fix FK (F-series) — efeito ja aplicado |
| 20260809G01 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809G02 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809G03 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809G04 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809G05 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809G06 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809G07 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809G07B |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809G08 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809G08B |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809G09 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809G10 |  | Criados mas nao vivos: FUNCTION:evo.search_contacts_gin |
| 20260809G11 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809G12 |  | Operacao sem criacao de objeto permanente |
| 20260809G12B |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809G13 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809G14 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809G15 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809G15B |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809G16 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809G17 |  | DROP — operacao de limpeza ja aplicada |
| 20260809G18 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809G21 |  | Criados mas nao vivos: FUNCTION:public.fn_purge_processed_webhook_even |
| 20260809G22 |  | Criados mas nao vivos: FUNCTION:public.fn_purge_processed_webhook_even |
| 20260809G23 |  | ALTER TABLE ADD COLUMN — DDL ja aplicado |
| 20260809G24 |  | DROP — operacao de limpeza ja aplicada |
| 20260809G25 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809G26 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809G27 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809G28 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809G29 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809G30 |  | Operacao sem criacao de objeto permanente |
| 20260809G31 |  | COMMENT migration — efeito ja aplicado; sem objeto a backfill |
| 20260809I01 |  | DROP — operacao de limpeza ja aplicada |
| 20260809I02 |  | Criados mas nao vivos: INDEX:idx_ec_instance_phone;INDEX:idx_ec_instan |
| 20260809I03 |  | DROP — operacao de limpeza ja aplicada |
| 20260809I04 |  | DROP — operacao de limpeza ja aplicada |
| 20260809I05 |  | Criados mas nao vivos: INDEX:idx_ec_instance_phone;INDEX:idx_ec_instan |
| 20260809I06 |  | DROP — operacao de limpeza ja aplicada |
| 20260809N01 |  | DROP — objeto ainda no snapshot: evo.evolution_messages_wpp2_archive_c |
| 20260809N02 |  | Criados mas nao vivos: INDEX:idx_ec_instance_phone;INDEX:idx_ec_instan |
| 20260809N03 |  | DROP — operacao de limpeza ja aplicada |
| 20260809N04 |  | Criados mas nao vivos: INDEX:idx_ec_instance_phone;INDEX:idx_ec_instan |
| 20260809N05 |  | CREATE INDEX sem arquivo — indice pode ou nao existir |
| 20260809N06 |  | CREATE INDEX sem arquivo — indice pode ou nao existir |
| 20260809N07 |  | DROP — objeto ainda no snapshot: evo.evolution_messages_wpp2_archive_c |
| 20260809O02 |  | DROP — objeto ainda no snapshot: evo.evolution_messages_wpp2_archive_c |
| 20260809S01 |  | Criados mas nao vivos: POLICY:auth_write_audio_msgs;POLICY:public_read |
| 20260809S02 |  | Storage cleanup — operacao de dados ja aplicada |
| 20260809V01 |  | Validacao (V-series) — sem objeto a backfill |
| 20260809V02 |  | Validacao (V-series) — sem objeto a backfill |
| 20260810133820 |  | SEM-ARQUIVO-NO-GIT — sem objeto a backfill |
| 20260810200000 |  | DROP — operacao de limpeza ja aplicada |
| 20260810200001 |  | Operacao sem criacao de objeto permanente |
| 20260810200002 |  | SEM-ARQUIVO-NO-GIT — sem objeto a backfill |
| 20260810200003 |  | SEM-ARQUIVO-NO-GIT — sem objeto a backfill |
| 20260810200005 |  | SEM_ARQUIVO; operacao externa |
| 20260810200006 |  | SEM_ARQUIVO; operacao externa |
| 20260810200007 |  | OBJ_MORTO:TABLE:zapp.queue_skills (parent obj not in snapshot) |
| 20260810200008 |  | SEM_ARQUIVO; operacao externa |
| 20260810210002 |  | REVOKE (ja no live) |
| 20260810210003 |  | SEM_ARQUIVO; operacao externa |
| 20260810M04 |  | SEM_ARQUIVO; operacao externa |
| 20260810M05 |  | SEM_ARQUIVO; operacao externa |
| 20260810M06 |  | OBJ_MORTO:public_read_audio_messages;auth_write_audio_msgs |
| 20260811100001 |  | SEM_ARQUIVO; operacao externa |
| 20260811100002 |  | SEM_ARQUIVO; operacao externa |
| 20260811100003 |  | SEM_ARQUIVO; operacao externa |
| 20260811100008 |  | SEM_ARQUIVO; operacao externa |
| 20260811100009 |  | SEM_ARQUIVO; operacao externa |
| 20260811200001 |  | SEM_ARQUIVO; operacao externa |
| 20260811200002 |  | ARQUIVO_SOMENTE_COMENTARIOS/DOC |
| 20260811200003 |  | SEM_ARQUIVO; operacao externa |
| 20260811200009 |  | SEM_ARQUIVO; operacao externa |
| 20260811214500 |  | SEM_ARQUIVO; operacao externa |
| 20260811300008 |  | SEM_ARQUIVO; operacao externa |
| 20260811400001 |  | SEM_ARQUIVO; operacao externa |
| 20260811400002 |  | SEM_ARQUIVO; operacao externa |
| 20260811500001 |  | SEM_ARQUIVO; operacao externa |
| 20260811500004 |  | SEM_ARQUIVO; operacao externa |
| 20260811500006 |  | SEM_ARQUIVO; operacao externa |
| 20260811600004 |  | OBJ_MORTO:INDEX:public.idx_ec_instance_phone;INDEX:public.idx_ec_insta |
| 20260811600005 |  | SEM_ARQUIVO; operacao externa |
| 20260811700004 |  | COMMENT; ALTER (ja no live) |
| 20260811700005 |  | COMMENT; ALTER (ja no live) |
| 20260811990001 |  | SEM_ARQUIVO; operacao externa |
| 20260811990002 |  | SEM_ARQUIVO; operacao externa |
| 20260811990006 |  | REVOKE; ALTER; UPDATE (ja no live) |
| 20260811A10001 |  | SEM_ARQUIVO; operacao externa |
| 20260811A10002 |  | OBJ_MORTO:INDEX:public.idx_ec_instance_phone;INDEX:public.idx_ec_insta |
| 20260811A20004 |  | SEM_ARQUIVO; operacao externa |
| 20260811A20006 |  | OBJ_MORTO:INDEX:public.idx_ec_instance_phone;INDEX:public.idx_ec_insta |
| 20260811B30002 |  | DROP; ALTER (ja no live) |
| 20260811B30004 |  | SEM_ARQUIVO; operacao externa |
| 20260811B30005 |  | SEM_ARQUIVO; operacao externa |
| 20260811B30006 |  | SEM_ARQUIVO; operacao externa |
| 20260811B40003 |  | SEM_ARQUIVO; operacao externa |
| 20260811B40004 |  | SEM_ARQUIVO; operacao externa |
| 20260811B40005 |  | SEM_ARQUIVO; operacao externa |
| 20260811B40007 |  | SEM_ARQUIVO; operacao externa |
| 20260811B40008 |  | SEM_ARQUIVO; operacao externa |
| 20260811B40009 |  | ARQUIVO_SOMENTE_COMENTARIOS/DOC |
| 20260811B50003 |  | OBJ_MORTO:INDEX:public.idx_ec_instance_phone;INDEX:public.idx_ec_insta |
| 20260811B50005 |  | ARQUIVO_SOMENTE_COMENTARIOS/DOC |
| 20260811B60001 |  | SEM_ARQUIVO; operacao externa |
| 20260811B60002 |  | SEM_ARQUIVO; operacao externa |
| 20260811B60003 |  | SEM_ARQUIVO; operacao externa |
| 20260811B70001 |  | SEM_ARQUIVO; operacao externa |
| 20260811B70002 |  | SEM_ARQUIVO; operacao externa |
| 20260811B70004 |  | SEM_ARQUIVO; operacao externa |
| 20260811B80002 |  | SEM_ARQUIVO; operacao externa |
| 20260811B80003 |  | SEM_ARQUIVO; operacao externa |
| 20260811B80004 |  | SEM_ARQUIVO; operacao externa |
| 20260811B90001 |  | REVOKE; ALTER; UPDATE (ja no live) |
| 20260811B90002 |  | REVOKE; GRANT (ja no live) |
| 20260811B90003 |  | SEM_ARQUIVO; operacao externa |
| 20260812163000 |  | SEM_ARQUIVO; operacao externa |
| 20260812700001 |  | ARQUIVO_SOMENTE_COMENTARIOS/DOC |
| 20260812700002 |  | SEM_ARQUIVO; operacao externa |
| 20260812700003 |  | SEM_ARQUIVO; operacao externa |
| 20260812800001 |  | SEM_ARQUIVO; operacao externa |
| 20260812A00001 |  | REVOKE; ALTER; UPDATE (ja no live) |
| 20260812A00002 |  | SEM_OPERACOES (ja no live) |
| 20260812A00003 |  | REVOKE; ALTER; UPDATE (ja no live) |
| 20260812A00004 |  | SEM_ARQUIVO; operacao externa |
| 20260812A00005 |  | SEM_ARQUIVO; operacao externa |
| 20260812A00006 |  | COMMENT; ALTER (ja no live) |
| 20260812A00007 |  | SEM_ARQUIVO; operacao externa |
| 20260812A00008 |  | SEM_ARQUIVO; operacao externa |
| 20260812A00010 |  | SEM_ARQUIVO; operacao externa |
| 20260812B00001 |  | SEM_ARQUIVO; operacao externa |
| 20260816160000 |  | SEM_ARQUIVO; operacao externa |
| 20260816230000 |  | REVOKE (ja no live) |
| 20260817193000 |  | SEM_ARQUIVO; operacao externa |
| 20260817200001 |  | SEM_ARQUIVO; operacao externa |
| 20260818160000 |  | UPDATE (ja no live) |


## KEEP (1 B0 canonico + 74 B1 >= baseline; intocaveis) (75)

| version | filename |
|---|---|
| 20260804000000 | 20260804000000_canonical_schema_squash_133_migrations.sql |
| 20260817000000 | 20260817000000_p23_ingest_ledger_rejected.sql |
| 20260817110000 | 20260817110000_realtime_message_fanout_mirror.sql |
| 20260817120000 | 20260817120000_rpc_boundary_alerts_fronteira.sql |
| 20260817125000 | 20260817125000_decouple_revoke_contact_phones_write_public_vector.sql |
| 20260817125500 | 20260817125500_decouple_fanout_v2_columns_trigger_parent.sql |
| 20260817130000 | 20260817130000_webhook_events_authenticated_read_admin_only.sql |
| 20260817130500 | 20260817130500_decouple_pii_conversations_role_guard.sql |
| 20260817140000 | 20260817140000_fix_autofix_invoker_filter.sql |
| 20260817150000 | 20260817150000_etapa44_favorite_messages.sql |
| 20260817160000 | 20260817160000_etapa44_pinned_messages.sql |
| 20260817170000 | 20260817170000_etapa44_message_reports.sql |
| 20260817180000 | 20260817180000_etapa66_coins_achievements.sql |
| 20260817190000 | 20260817190000_etapa66_dashboard_metrics_rpcs.sql |
| 20260817190001 | 20260817190001_auth_sessions_rpc.sql |
| 20260817190002 | 20260817190002_sessions_owner_rpc.sql |
| 20260817200000 | 20260817200000_etapa66_csat_surveys_hardening.sql |
| 20260817210000 | 20260817210000_etapa66_csat_dispatch_cron.sql |
| 20260817210001 | 20260817210001_lid_resolve_contacts_batch.sql |
| 20260817220000 | 20260817220000_followup_complete_rpc_status_check.sql |
| 20260817220001 | 20260817220001_etapa66_fn_capture_csat_replies.sql |
| 20260817230000 | 20260817230000_etapa66_latest_analysis_rpc.sql |
| 20260817240000 | 20260817240000_etapa65_scheduled_messages_rls.sql |
| 20260817250000 | 20260817250000_etapa65_scheduled_dispatch_cron.sql |
| 20260817260001 | 20260817260001_fix_cron_206_monitor_ingestion_persistence_gap_versiona |
| 20260817260002 | 20260817260002_fix_cron_334_backfill_contact_id_guard.sql |
| 20260817260003 | 20260817260003_fix_cron_311_wal_slot_lag_alert.sql |
| 20260817260004 | 20260817260004_fix_cron_84_notify_critical_alerts_v8.sql |
| 20260817260010 | 20260817260010_google_calendar_config.sql |
| 20260817260011 | 20260817260011_n8n_config_contract.sql |
| 20260817260012 | 20260817260012_voip_profile_credentials.sql |
| 20260817260013 | 20260817260013_zapp_emails_table_rls.sql |
| 20260817260014 | 20260817260014_auto_export_jobs.sql |
| 20260817260015 | 20260817260015_sentry_config.sql |
| 20260817260016 | 20260817260016_team_chat_rls_membership_admin_delete.sql |
| 20260817270000 | 20260817270000_etapa66_crm_sync_config.sql |
| 20260817270001 | 20260817270001_fix_cron_27_reconcile_dispatch_lote_janela.sql |
| 20260817280000 | 20260817280000_etapa66_scheduled_reports.sql |
| 20260817290000 | 20260817290000_etapa66_fn_run_scheduled_reports.sql |
| 20260817300000 | 20260817300000_pg14_message_hourly_fdw_delta_rpc.sql |
| 20260818000000 | 20260818000000_etapa65_scheduled_messages_contrato.sql |
| 20260818010000 | 20260818010000_fix_febesync_baseline.sql |
| 20260818100000 | 20260818100000_etapa38_media_queue_stalled_alert_retry_purge.sql |
| 20260818120000 | 20260818120000_fix_ambiguous_out_cols_contact_summary_avatar.sql |
| 20260818120001 | 20260818120001_regularize_public_ingest_ledger_view.sql |
| 20260818130000 | 20260818130000_drop_orphan_can_see_pii.sql |
| 20260818130001 | 20260818130001_realtime_password_reset_requests.sql |
| 20260818140000 | 20260818140000_etapa57_invite_user.sql |
| 20260818170000 | 20260818170000_rls_hardening_batch.sql |
| 20260818180000 | 20260818180000_warroom_dismiss_rpc.sql |
| 20260818190000 | 20260818190000_etapa67_gamification_atomic_xp.sql |
| 20260818190001 | 20260818190001_etapa67_sla_consolidacao_queries.sql |
| 20260818190002 | 20260818190002_etapa70_gamification_xp_transactions.sql |
| 20260818190003 | 20260818190003_invite_user_rpc.sql |
| 20260818200000 | 20260818200000_warroom_dismiss_rpc_fix.sql |
| 20260818210000 | 20260818210000_privatize_media_buckets.sql |
| 20260818210002 | 20260818210002_etapa62_campanhas_rls_escrita.sql |
| 20260818210100 | 20260818210100_fix_perf_companies_batch_index_alignment.sql |
| 20260818210101 | 20260818210101_fix_realtime_publication_whisper_calls.sql |
| 20260818210102 | 20260818210102_fix_perf_rpc_list_messages_lite_or_generic.sql |
| 20260818210103 | 20260818210103_capture_get_avatars_by_jids_batch_fixed.sql |
| 20260818210104 | 20260818210104_capture_get_contact_360_by_phone.sql |
| 20260818210105 | 20260818210105_fix_summary_batch_dedupe_ids.sql |
| 20260818220000 | 20260818220000_zapp_notifications_dispatch_executor.sql |
| 20260818220002 | 20260818220002_etapa62_dedup_atomico_recipients.sql |
| 20260818221000 | 20260818221000_fix_rls_whisper_tasks_insert.sql |
| 20260818230000 | 20260818230000_etapa62_engine_ab_variantes.sql |
| 20260818230100 | 20260818230100_debug_lid_helpers.sql |
| 20260818235900 | 20260818235900_drop_unused_idempotency_key_constraint.sql |
| 20260818235901 | 20260818235901_fix_public_wrapper_fn_media_queue_health_check.sql |
| 20260818235902 | 20260818235902_fix_rls_csat_surveys_update.sql |
| 20260819000000 | 20260819000000_login_attempts_atomic_counter.sql |
| 20260819010000 | 20260819010000_rpc_sla_timeline_aggregate.sql |
| 20260819020000 | 20260819020000_login_attempts_table.sql |
| 20260819170000 | 20260819170000_align_app_notifications_autovacuum.sql |

