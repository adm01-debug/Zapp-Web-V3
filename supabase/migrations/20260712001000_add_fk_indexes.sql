-- Execution 12 (P1-10): Add missing indexes on foreign key columns
-- Foreign key columns used in JOINs and WHERE clauses MUST have indexes
-- for optimal query performance. PostgreSQL does NOT automatically index
-- foreign key columns; they must be created explicitly.

-- Create indexes for contacts table foreign keys
CREATE INDEX IF NOT EXISTS idx_contacts_queue_id ON public.contacts(queue_id);
CREATE INDEX IF NOT EXISTS idx_contacts_assigned_to ON public.contacts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp_connection_id ON public.contacts(whatsapp_connection_id);
CREATE INDEX IF NOT EXISTS idx_contacts_created_by ON public.contacts(created_by);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON public.contacts(user_id);

-- Create indexes for conversations table foreign keys
CREATE INDEX IF NOT EXISTS idx_conversations_contact_id ON public.conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_agent_id ON public.conversations(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_id ON public.conversations(last_message_id);

-- Create indexes for messages table foreign keys
CREATE INDEX IF NOT EXISTS idx_messages_contact_id ON public.messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_agent_id ON public.messages(agent_id);
CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_connection_id ON public.messages(whatsapp_connection_id);

-- Create indexes for whisper_messages table foreign keys
CREATE INDEX IF NOT EXISTS idx_whisper_messages_contact_id ON public.whisper_messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_whisper_messages_sender_id ON public.whisper_messages(sender_id);

-- Create indexes for team_conversations table foreign keys
CREATE INDEX IF NOT EXISTS idx_team_conversations_contact_id ON public.team_conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_team_conversations_assigned_agent_id ON public.team_conversations(assigned_agent_id);

-- Create indexes for team_messages table foreign keys
CREATE INDEX IF NOT EXISTS idx_team_messages_sender_id ON public.team_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_team_messages_conversation_id ON public.team_messages(conversation_id);

-- Create indexes for user settings table foreign keys
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON public.user_settings(user_id);

-- Create indexes for calls table foreign keys
CREATE INDEX IF NOT EXISTS idx_calls_contact_id ON public.calls(contact_id);
CREATE INDEX IF NOT EXISTS idx_calls_agent_id ON public.calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_calls_whatsapp_connection_id ON public.calls(whatsapp_connection_id);

-- Create indexes for realtime subscriptions table foreign keys
CREATE INDEX IF NOT EXISTS idx_realtime_subscriptions_user_id ON public.realtime_subscriptions(user_id);

-- Create indexes for queues table foreign keys
CREATE INDEX IF NOT EXISTS idx_queues_whatsapp_connection_id ON public.queues(whatsapp_connection_id);

-- Create indexes for queue_assignments table foreign keys
CREATE INDEX IF NOT EXISTS idx_queue_assignments_queue_id ON public.queue_assignments(queue_id);
CREATE INDEX IF NOT EXISTS idx_queue_assignments_profile_id ON public.queue_assignments(profile_id);

-- Create indexes for email tables foreign keys (if they exist)
CREATE INDEX IF NOT EXISTS idx_email_accounts_user_id ON public.email_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_email_folders_account_id ON public.email_folders(account_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_folder_id ON public.email_messages(folder_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_conversation_id ON public.email_messages(conversation_id);

-- Create indexes for SLA tables foreign keys
CREATE INDEX IF NOT EXISTS idx_sla_configurations_queue_id ON public.sla_configurations(queue_id);
CREATE INDEX IF NOT EXISTS idx_sla_metrics_conversation_id ON public.sla_metrics(conversation_id);

-- Create indexes for authentication and user tracking
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_filters_user_id ON public.saved_filters(user_id);
CREATE INDEX IF NOT EXISTS idx_entity_versions_changed_by ON public.entity_versions(changed_by);

-- Create composite indexes for common query patterns
-- Pattern: Filter by contact_id and created_at (message history queries)
CREATE INDEX IF NOT EXISTS idx_messages_contact_created ON public.messages(contact_id, created_at DESC)
  WHERE is_deleted = false;

-- Pattern: Filter by contact_id and created_at (team message queries)
CREATE INDEX IF NOT EXISTS idx_team_messages_conversation_created ON public.team_messages(conversation_id, created_at DESC);

-- Pattern: Find unread messages for a contact
CREATE INDEX IF NOT EXISTS idx_messages_contact_unread ON public.messages(contact_id, is_read, created_at DESC);

-- Pattern: Conversation status queries
CREATE INDEX IF NOT EXISTS idx_conversations_status ON public.conversations(status, updated_at DESC);

-- Composite index for queue assignments (common in agent assignment logic)
CREATE INDEX IF NOT EXISTS idx_queue_assignments_queue_active ON public.queue_assignments(queue_id, is_active)
  WHERE is_active = true;
