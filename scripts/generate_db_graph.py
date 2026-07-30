#!/usr/bin/env python3
"""Generate a DB relationship graph from Supabase MCP FK data.
Complements the code-level graph from Graphify with database-level
relationships (foreign keys, views, table sizes).

Usage: python scripts/generate_db_graph.py
Output: graphify-out/db_graph.json
"""

import json
import os
from pathlib import Path

# FK data extracted from Supabase MCP (zapp schema)
FKS = [
    # Core: users -> profiles -> ...
    ("agent_presence", "current_queue_id", "queues", "id"),
    ("agent_presence", "user_id", "users", "id"),
    ("agent_stats", "profile_id", "profiles", "id"),
    ("agent_visibility_grants", "agent_id", "profiles", "id"),
    ("agent_visibility_grants", "can_see_agent_id", "profiles", "id"),
    ("agent_visibility_grants", "granted_by", "profiles", "id"),
    # contacts -> evolution_contacts (central entity!)
    ("ai_conversation_tags", "contact_id", "evolution_contacts", "id"),
    ("allowed_countries", "added_by", "users", "id"),
    ("app_notifications", "user_id", "users", "id"),
    ("audio_meme_favorites", "meme_id", "audio_memes", "id"),
    ("auto_close_config", "updated_by", "profiles", "id"),
    # automations
    ("automation_executions", "department_id", "departments", "id"),
    ("automation_executions", "rule_id", "automation_rules", "id"),
    ("automation_rules", "department_id", "departments", "id"),
    ("automations", "channel_id", "service_channels", "id"),
    ("automations", "department_id", "departments", "id"),
    # security / blocking
    ("blocked_countries", "blocked_by", "users", "id"),
    ("blocked_ips", "blocked_by", "users", "id"),
    # calls
    ("calls", "agent_id", "profiles", "id"),
    ("calls", "contact_id", "evolution_contacts", "id"),
    # campaigns
    ("campaign_ab_variants", "campaign_id", "campaigns", "id"),
    ("campaign_contacts", "campaign_id", "campaigns", "id"),
    ("campaign_contacts", "contact_id", "evolution_contacts", "id"),
    ("campaigns", "whatsapp_connection_id", "whatsapp_connections", "id"),
    # channel routing
    ("channel_connections", "whatsapp_connection_id", "whatsapp_connections", "id"),
    ("channel_provider_routes", "channel_connection_id", "channel_connections", "id"),
    ("channel_provider_routes", "current_provider_id", "provider_configs", "id"),
    ("channel_provider_routes", "fallback_provider_id", "provider_configs", "id"),
    ("channel_provider_routes", "primary_provider_id", "provider_configs", "id"),
    ("channel_provider_routes", "whatsapp_connection_id", "whatsapp_connections", "id"),
    ("channel_routing_rules", "channel_connection_id", "channel_connections", "id"),
    ("channel_routing_rules", "queue_id", "queues", "id"),
    # chatbots
    ("chatbot_executions", "contact_id", "evolution_contacts", "id"),
    ("chatbot_executions", "flow_id", "chatbot_flows", "id"),
    ("chatbot_flows", "whatsapp_connection_id", "whatsapp_connections", "id"),
    # client wallet
    ("client_wallet_rules", "agent_id", "profiles", "id"),
    # connections
    ("connection_health_logs", "connection_id", "whatsapp_connections", "id"),
    # contacts (all point to evolution_contacts)
    ("contact_custom_fields", "contact_id", "evolution_contacts", "id"),
    ("contact_intelligence", "contact_id", "evolution_contacts", "id"),
    ("contact_notes", "author_id", "profiles", "id"),
    ("contact_notes", "contact_id", "evolution_contacts", "id"),
    ("contact_phones", "contact_id", "evolution_contacts", "id"),
    ("contact_purchases", "contact_id", "evolution_contacts", "id"),
    ("contact_purchases", "deal_id", "sales_deals", "id"),
    ("contact_segments", "created_by", "users", "id"),
    ("contact_tags", "contact_id", "evolution_contacts", "id"),
    ("contact_tags", "tag_id", "tags", "id"),
    # conversations
    ("conversation_analyses", "analyzed_by", "profiles", "id"),
    ("conversation_analyses", "contact_id", "evolution_contacts", "id"),
    ("conversation_audit_logs", "actor_id", "users", "id"),
    ("conversation_audit_logs", "conversation_id", "conversation_pins", "id"),
    ("conversation_audit_logs", "performed_by", "users", "id"),
    ("conversation_closures", "closed_by", "profiles", "id"),
    ("conversation_closures", "contact_id", "evolution_contacts", "id"),
    ("conversation_events", "contact_id", "evolution_contacts", "id"),
    ("conversation_events", "from_agent_id", "profiles", "id"),
    ("conversation_events", "from_queue_id", "queues", "id"),
    ("conversation_events", "performed_by", "profiles", "id"),
    ("conversation_events", "to_agent_id", "profiles", "id"),
    ("conversation_events", "to_queue_id", "queues", "id"),
    ("conversation_memory", "contact_id", "evolution_contacts", "id"),
    ("conversation_memory", "updated_by", "profiles", "id"),
    ("conversation_participants", "thread_id", "conversation_threads", "id"),
    ("conversation_sla", "contact_id", "evolution_contacts", "id"),
    ("conversation_sla", "sla_configuration_id", "sla_configurations", "id"),
    ("conversation_snoozes", "contact_id", "evolution_contacts", "id"),
    ("conversation_snoozes", "snoozed_by", "profiles", "id"),
    ("conversation_tasks", "assigned_to", "profiles", "id"),
    ("conversation_tasks", "contact_id", "evolution_contacts", "id"),
    ("conversation_transfers", "contact_id", "evolution_contacts", "id"),
    # crisis / csat
    ("crisis_room_alerts", "acknowledged_by", "profiles", "id"),
    ("csat_auto_config", "updated_by", "profiles", "id"),
    ("csat_auto_config", "whatsapp_connection_id", "whatsapp_connections", "id"),
    ("csat_surveys", "agent_id", "profiles", "id"),
    ("csat_surveys", "contact_id", "evolution_contacts", "id"),
    # deals
    ("deal_activities", "deal_id", "sales_deals", "id"),
    ("deal_activities", "performed_by", "profiles", "id"),
    # departments
    ("department_invitations", "created_by", "users", "id"),
    ("department_invitations", "department_id", "departments", "id"),
    ("department_invitations", "invited_by", "users", "id"),
    # dev / dlq
    ("dev_diagnostic_logs", "user_id", "users", "id"),
    ("dlq_audit_log", "performed_by", "users", "id"),
    # email
    ("email_revalidation_jobs", "account_id", "email_accounts", "id"),
    # extensions
    ("extensions", "tenant_external_id", "tenants", "external_id"),
    # favorites
    ("favorite_contacts", "contact_id", "evolution_contacts", "id"),
    # followups
    ("followup_executions", "contact_id", "evolution_contacts", "id"),
    ("followup_executions", "sequence_id", "followup_sequences", "id"),
    ("followup_sequences", "whatsapp_connection_id", "whatsapp_connections", "id"),
    ("followup_steps", "sequence_id", "followup_sequences", "id"),
    # geo / security
    ("geo_blocking_settings", "updated_by", "users", "id"),
    # instances
    ("instance_processing_pauses", "paused_by", "users", "id"),
    ("instance_registry", "owner_id", "profiles", "id"),
    ("ip_whitelist", "added_by", "users", "id"),
    # media
    ("media_quarantine", "rule_id", "media_security_config", "id"),
    # messages
    ("message_reactions", "contact_id", "evolution_contacts", "id"),
    ("message_reactions", "user_id", "profiles", "id"),
    # mfa
    ("mfa_sessions", "user_id", "users", "id"),
    # outbound queue
    ("outbound_message_queue", "audio_meme_id", "audio_memes", "id"),
    ("outbound_message_queue", "sticker_id", "stickers", "id"),
    # passwords
    ("password_reset_requests", "reviewed_by", "users", "id"),
    ("password_reset_tokens", "request_id", "password_reset_requests", "id"),
    # profiles / users
    ("perfis_usuarios", "id", "users", "id"),
    ("pii_access_log", "accessed_by", "users", "id"),
    ("pinned_conversations", "contact_id", "evolution_contacts", "id"),
    ("pinned_conversations", "pinned_by", "profiles", "id"),
    ("profiles", "department_id", "departments", "id"),
    ("profiles", "user_id", "users", "id"),
    # providers
    ("provider_session_logs", "provider_id", "provider_configs", "id"),
    ("provider_session_logs", "session_id", "provider_sessions", "id"),
    ("provider_sessions", "channel_connection_id", "channel_connections", "id"),
    ("provider_sessions", "provider_id", "provider_configs", "id"),
    ("provider_sessions", "whatsapp_connection_id", "whatsapp_connections", "id"),
    # QR
    ("qr_attempts", "connection_id", "whatsapp_connections", "id"),
    # queues
    ("queue_analytics", "queue_id", "queues", "id"),
    ("queue_members", "profile_id", "profiles", "id"),
    ("queue_members", "queue_id", "queues", "id"),
    ("queue_positions", "contact_id", "evolution_contacts", "id"),
    ("queue_routing_rules", "queue_id", "queues", "id"),
    ("queues", "department_id", "departments", "id"),
    ("queues", "sla_policy_id", "sla_policies", "id"),
    # quick replies
    ("quick_replies", "owner_id", "users", "id"),
    # reconnection
    ("reconnection_logs", "connection_id", "channel_connections", "id"),
    # reminders
    ("reminders", "contact_id", "evolution_contacts", "id"),
    ("reprocess_jobs", "requested_by", "users", "id"),
    # roles
    ("role_permissions", "permission_id", "permissions", "id"),
    # sales
    ("sales_deals", "assigned_to", "profiles", "id"),
    ("sales_deals", "contact_id", "evolution_contacts", "id"),
    ("sales_deals", "stage_id", "sales_pipeline_stages", "id"),
    # scheduled
    ("scheduled_messages", "contact_id", "evolution_contacts", "id"),
    ("scheduled_messages", "whatsapp_connection_id", "whatsapp_connections", "id"),
    # security
    ("security_audit_logs", "user_id", "profiles", "user_id"),
    # sicoob
    ("sicoob_contact_mapping", "contact_id", "evolution_contacts", "id"),
    ("sicoob_contact_mapping", "zappweb_agent_id", "profiles", "id"),
    # SLA
    ("sla_delivery_violations", "resolved_by", "profiles", "id"),
    ("sla_history", "resolved_by", "users", "id"),
    ("sla_history", "sla_config_id", "sla_configurations", "id"),
    ("sla_history", "thread_id", "conversation_threads", "id"),
    ("sla_rules", "agent_id", "profiles", "id"),
    ("sla_rules", "contact_id", "evolution_contacts", "id"),
    ("sla_violations", "sla_policy_id", "sla_policies", "id"),
    # stickers
    ("sticker_favorites", "sticker_id", "stickers", "id"),
    ("stickers", "owner_id", "users", "id"),
    # sticky assignments
    ("sticky_assignments", "agent_profile_id", "profiles", "id"),
    ("sticky_assignments", "channel_connection_id", "channel_connections", "id"),
    ("sticky_assignments", "queue_id", "queues", "id"),
    # system
    ("system_connections", "created_by", "users", "id"),
    ("system_health_incidents", "created_by", "users", "id"),
    # tags
    ("tags", "created_by", "profiles", "id"),
    # talkx
    ("talkx_blacklist", "blocked_by", "profiles", "id"),
    ("talkx_blacklist", "contact_id", "evolution_contacts", "id"),
    ("talkx_campaigns", "whatsapp_connection_id", "whatsapp_connections", "id"),
    ("talkx_recipients", "campaign_id", "talkx_campaigns", "id"),
    ("talkx_recipients", "contact_id", "evolution_contacts", "id"),
    # team
    ("team_conversation_members", "conversation_id", "team_conversations", "id"),
    ("team_conversation_members", "profile_id", "profiles", "id"),
    ("team_conversations", "created_by", "profiles", "id"),
    ("team_conversations", "department_id", "departments", "id"),
    ("team_message_receipts", "message_id", "team_messages", "id"),
    ("team_message_receipts", "profile_id", "profiles", "id"),
    ("team_messages", "conversation_id", "team_conversations", "id"),
    ("team_messages", "reply_to_id", "team_messages", "id"),
    ("team_messages", "sender_id", "profiles", "id"),
    # transfers
    ("transfer_comments", "agent_id", "profiles", "id"),
    ("transfer_comments", "transfer_id", "conversation_transfers", "id"),
    # user roles
    ("user_roles", "user_id", "profiles", "user_id"),
    ("user_roles", "user_id", "users", "id"),
    ("user_sessions", "device_id", "user_devices", "id"),
    # voice
    ("voice_conversion_queue", "requested_by", "users", "id"),
    # war room
    ("warroom_alerts", "dismissed_by", "profiles", "id"),
    # whatsapp
    ("whatsapp_official_credentials", "connection_id", "whatsapp_connections", "id"),
    ("whatsapp_templates", "whatsapp_connection_id", "whatsapp_connections", "id"),
    # whisper
    ("whisper_messages", "contact_id", "evolution_contacts", "id"),
    ("whisper_messages", "target_agent_id", "profiles", "id"),
]

# Table sizes from DB overview
TABLE_SIZES = {
    "webhook_events_processed": "96 MB",
    "webhook_audit_log": "85 MB",
    "evolution_messages_wpp2": "64 MB",
    "evolution_contacts": "31 MB",
    "evolution_webhook_events": "22 MB",
    "app_notifications": "9 MB",
}

# Build graph
nodes = {}
edges = []

for from_tbl, from_col, to_tbl, to_col in FKS:
    nodes[from_tbl] = nodes.get(from_tbl, {"id": from_tbl, "type": "table", "fk_count_out": 0, "fk_count_in": 0})
    nodes[to_tbl] = nodes.get(to_tbl, {"id": to_tbl, "type": "table", "fk_count_out": 0, "fk_count_in": 0})
    nodes[from_tbl]["fk_count_out"] += 1
    nodes[to_tbl]["fk_count_in"] += 1
    edges.append({
        "from": from_tbl,
        "from_column": from_col,
        "to": to_tbl,
        "to_column": to_col,
        "relation": "foreign_key",
        "provenance": "EXTRACTED",
    })

# Add size info
for tbl, size in TABLE_SIZES.items():
    if tbl in nodes:
        nodes[tbl]["size"] = size

# Calculate centrality (in-degree)
centrality = sorted(nodes.values(), key=lambda n: -n["fk_count_in"])

graph = {
    "type": "database_relationship_graph",
    "schema": "zapp",
    "node_count": len(nodes),
    "edge_count": len(edges),
    "nodes": list(nodes.values()),
    "edges": edges,
    "centrality": [{"table": n["id"], "referenced_by": n["fk_count_in"], "references": n["fk_count_out"]} for n in centrality[:20]],
}

out_path = Path("graphify-out/db_graph.json")
out_path.parent.mkdir(parents=True, exist_ok=True)
out_path.write_text(json.dumps(graph, indent=2, ensure_ascii=False), encoding="utf-8")

print(f"DB Graph: {len(nodes)} tables, {len(edges)} FKs")
print(f"Top 5 most referenced:")
for n in centrality[:5]:
    print(f"  {n['id']}: referenced by {n['fk_count_in']} tables, references {n['fk_count_out']} tables")
