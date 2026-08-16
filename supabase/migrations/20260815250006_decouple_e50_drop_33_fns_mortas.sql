-- E50 (PLANO_INDEPENDENCIA_100_ETAPAS_20260815): DROP das 33 fns evo do balde
-- c_morta da classificacao E49 (docs/decouple/E49_CLASSIFICACAO_FNS_20260815.json).
-- Criterio quintuplo verificado em 2026-08-15: zero cron + zero trigger + zero
-- chamador SQL + zero uso em codigo (zapp-web-v3 + evolution-stack, excluindo
-- types.ts gerado) + zero uso em workflows N8N (workflow_entity.nodes).
-- rpc_complete_media_download NAO esta aqui (2 workflows N8N ativos a usam).
-- RECUPERACAO: definicoes completas em docs/decouple/graveyard_E50_20260815.sql.
-- Extra: evo.v_upgrade_status (view interna, zero uso em codigo e N8N) dropada
-- por travar o DROP de fn_lid_upgrade_readiness_check.
-- JA APLICADA em producao. I1: 97 -> 65.

DROP FUNCTION IF EXISTS evo.fn_audit_rmq_durability_risk(interval);
DROP FUNCTION IF EXISTS evo.fn_burnin_critical_alert_check();
DROP FUNCTION IF EXISTS evo.fn_burnin_disconnection_check();
DROP FUNCTION IF EXISTS evo.fn_canonical_route_decision(integer, numeric);
DROP FUNCTION IF EXISTS evo.fn_check_unknown_contact_health();
DROP FUNCTION IF EXISTS evo.fn_cleanup_test_artifacts(boolean, integer);
DROP FUNCTION IF EXISTS evo.fn_delete_test_contacts(text);
DROP FUNCTION IF EXISTS evo.fn_get_incident_runbook(text);
DROP VIEW IF EXISTS evo.v_upgrade_status;
DROP FUNCTION IF EXISTS evo.fn_lid_upgrade_readiness_check();
DROP FUNCTION IF EXISTS evo.fn_list_storage_cache_for_purge(integer);
DROP FUNCTION IF EXISTS evo.fn_logpatch_verify();
DROP FUNCTION IF EXISTS evo.fn_mark_status_viewed(text, text);
DROP FUNCTION IF EXISTS evo.fn_migrate_media_urls_to_r2(boolean, integer);
DROP FUNCTION IF EXISTS evo.fn_post_upgrade_verify(integer);
DROP FUNCTION IF EXISTS evo.fn_pre_upgrade_final_check();
DROP FUNCTION IF EXISTS evo.fn_prepare_lid_dedup(boolean, text, integer);
DROP FUNCTION IF EXISTS evo.fn_purge_lid_orphan_messages_batch(integer);
DROP FUNCTION IF EXISTS evo.fn_record_runbook_drill(text);
DROP FUNCTION IF EXISTS evo.fn_resolve_alert(uuid, text, uuid[]);
DROP FUNCTION IF EXISTS evo.fn_resolve_contact_id_by_jid(text);
DROP FUNCTION IF EXISTS evo.fn_shadow_source_measurement(integer);
DROP FUNCTION IF EXISTS evo.fn_test_normalizer_deep();
DROP FUNCTION IF EXISTS evo.fn_touch_contact_presence(text, text, text);
DROP FUNCTION IF EXISTS evo.fn_upsert_group_from_event(uuid, text, text, text, text[], text);
DROP FUNCTION IF EXISTS evo.fn_upsert_group_from_event(uuid, text, text, text, text, text[]);
DROP FUNCTION IF EXISTS evo.fn_upsert_group_from_event(uuid, text, text, text, text[], text, text[]);
DROP FUNCTION IF EXISTS evo.fn_upsert_group_participants(uuid, text[], text, text);
DROP FUNCTION IF EXISTS evo.fn_upsert_group_participants(uuid, text[], text, text, text[]);
DROP FUNCTION IF EXISTS evo.fn_v2_mirror_health();
DROP FUNCTION IF EXISTS evo.list_media_to_mirror(integer, integer);
DROP PROCEDURE IF EXISTS evo.pr_link_msgs_to_conversations(integer);
DROP FUNCTION IF EXISTS evo.search_contacts_gin(text, integer, integer, double precision);
DROP FUNCTION IF EXISTS evo.update_status_media_url(uuid, text);
