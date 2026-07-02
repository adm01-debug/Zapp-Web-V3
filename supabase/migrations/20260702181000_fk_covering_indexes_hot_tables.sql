-- =============================================================================
-- Covering indexes for unindexed foreign keys on append-heavy / app-queried
-- tables (performance + cascade-check hygiene).
--
-- Context: a FK-index audit (pg_constraint vs pg_index) found 27 foreign keys in
-- zapp/public whose referencing column has no covering index. ALL 27 tables are
-- currently empty/tiny (<=128 kB), so there is no measurable problem TODAY — the
-- planner would seq-scan them regardless. This migration does NOT index all 27
-- (that would be speculative write overhead on config/static tables).
--
-- It indexes only the subset that is (a) append-heavy (event/audit/execution/
-- message logs and CRM rows that grow with usage) AND (b) demonstrably filtered
-- by these columns in the app. Creating the index now, while the table is empty,
-- is instantaneous and lock-free — versus an expensive CONCURRENTLY build once
-- the table is large. Idempotent (IF NOT EXISTS).
--
-- Deliberately DEFERRED (tiny/static/config — a FK index would add write cost
-- without benefit; add when/if they grow and show up as slow):
--   zapp.channel_routing_rules(channel_connection_id, queue_id), public.role_permissions(permission_id),
--   public.system_health_incidents(created_by), zapp.team_conversations(created_by),
--   zapp.conversation_events(from_agent_id,to_agent_id,from_queue_id), zapp.sla_history(resolved_by),
--   zapp.automation_executions(rule_id), zapp.followup_executions(sequence_id),
--   zapp.followup_steps(sequence_id), zapp.chatbot_executions(flow_id),
--   zapp.talkx_recipients(contact_id), zapp.talkx_blacklist(contact_id).
-- =============================================================================

-- team chat: threads render by sender and reply chain
CREATE INDEX IF NOT EXISTS idx_team_messages_sender_id       ON public.team_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_team_messages_reply_to_id     ON public.team_messages (reply_to_id);

-- SLA panel joins history -> configuration
CREATE INDEX IF NOT EXISTS idx_sla_history_sla_config_id     ON zapp.sla_history (sla_config_id);

-- conversation event log: dashboards filter by acting agent and destination queue
CREATE INDEX IF NOT EXISTS idx_conversation_events_performed_by ON zapp.conversation_events (performed_by);
CREATE INDEX IF NOT EXISTS idx_conversation_events_to_queue_id  ON zapp.conversation_events (to_queue_id);

-- CRM board filters deals by assignee and contact
CREATE INDEX IF NOT EXISTS idx_sales_deals_assigned_to        ON zapp.sales_deals (assigned_to);
CREATE INDEX IF NOT EXISTS idx_sales_deals_contact_id         ON zapp.sales_deals (contact_id);

-- audit trails queried by subject user / actor
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_user_id    ON public.security_audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_audit_logs_actor_id ON public.conversation_audit_logs (actor_id);

-- contact timeline: notes and automation runs by contact
CREATE INDEX IF NOT EXISTS idx_contact_notes_author_id        ON zapp.contact_notes (author_id);
CREATE INDEX IF NOT EXISTS idx_followup_executions_contact_id ON zapp.followup_executions (contact_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_executions_contact_id  ON zapp.chatbot_executions (contact_id);
