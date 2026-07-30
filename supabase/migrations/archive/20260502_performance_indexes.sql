-- Performance indexes for ZAPP-WEB most-accessed tables
-- Created: 2026-05-02

CREATE INDEX IF NOT EXISTS idx_contact_notes_contact ON public.contact_notes(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_notes_created ON public.contact_notes(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_global_settings_key ON public.global_settings(key);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_stats_profile ON public.agent_stats(profile_id);
CREATE INDEX IF NOT EXISTS idx_conversation_sla_contact ON public.conversation_sla(contact_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns(status);
CREATE INDEX IF NOT EXISTS idx_warroom_alerts_created ON public.warroom_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_tags_contact ON public.contact_tags(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON public.contact_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_saved_filters_user ON public.saved_filters(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_settings_user ON public.user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_failed_messages_status ON public.failed_messages(status) WHERE status IN ('pending','retrying');
CREATE INDEX IF NOT EXISTS idx_failed_messages_instance ON public.failed_messages(instance_name);
CREATE INDEX IF NOT EXISTS idx_evo_contacts_remote ON public.evolution_contacts(remote_jid);
CREATE INDEX IF NOT EXISTS idx_evo_contacts_lead ON public.evolution_contacts(lead_status);
