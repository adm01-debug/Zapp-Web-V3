-- =============================================================================
-- FALHA #8 — Missing view columns, FK relations, and RBAC seed
-- Idempotente: ADD COLUMN IF NOT EXISTS + DO blocks + ON CONFLICT DO NOTHING
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PART 1: Missing columns referenced by the frontend (5 columns)
-- ---------------------------------------------------------------------------

-- email_accounts.token_expiry
-- Frontend uses token_expiry; the base column is named token_expires_at.
-- Add the alias column so both names work.
ALTER TABLE IF EXISTS public.email_accounts
  ADD COLUMN IF NOT EXISTS token_expiry timestamptz;

-- Backfill token_expiry from token_expires_at where it was populated
DO $$ BEGIN
  UPDATE public.email_accounts SET token_expiry = token_expires_at
  WHERE token_expiry IS NULL AND token_expires_at IS NOT NULL;
EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
END $$;

-- email_threads.thread_id
-- Frontend accesses thread_id as a simple text identifier separate from gmail_thread_id.
ALTER TABLE IF EXISTS public.email_threads
  ADD COLUMN IF NOT EXISTS thread_id text;

-- Backfill thread_id from gmail_thread_id for existing rows
DO $$ BEGIN
  UPDATE public.email_threads SET thread_id = gmail_thread_id
  WHERE thread_id IS NULL AND gmail_thread_id IS NOT NULL;
EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
END $$;

-- email_threads.unread_count
-- Frontend wants an integer count; the table only has is_unread (boolean).
ALTER TABLE IF EXISTS public.email_threads
  ADD COLUMN IF NOT EXISTS unread_count integer NOT NULL DEFAULT 0;

-- salespeople.role
-- Add role column for salesperson classification.
ALTER TABLE IF EXISTS public.salespeople
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'salesperson';

-- whisper_messages.whisper_thread_id
-- Groups whisper messages into threads. Nullable (not all whispers are threaded).
ALTER TABLE IF EXISTS public.whisper_messages
  ADD COLUMN IF NOT EXISTS whisper_thread_id uuid;

-- ---------------------------------------------------------------------------
-- PART 2: Missing FK relations (14 pairs from DRIFT_REPORT)
-- All wrapped in DO blocks: EXCEPTION WHEN duplicate_object or undefined_table
-- keeps the migration idempotent and safe if either table is absent.
-- ---------------------------------------------------------------------------

-- 1. automation_executions → automation_rules
DO $$ BEGIN
  ALTER TABLE public.automation_executions
    ADD CONSTRAINT automation_executions_rule_id_fkey
    FOREIGN KEY (rule_id) REFERENCES public.automation_rules(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table  THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

-- 2. chatbot_executions → chatbot_flows (via flow_id)
DO $$ BEGIN
  ALTER TABLE public.chatbot_executions
    ADD CONSTRAINT chatbot_executions_flow_id_fkey
    FOREIGN KEY (flow_id) REFERENCES public.chatbot_flows(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table  THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

-- 3. contact_tags → contacts
DO $$ BEGIN
  ALTER TABLE public.contact_tags
    ADD CONSTRAINT contact_tags_contact_id_fkey
    FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table  THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

-- 4. contact_tags → tags
DO $$ BEGIN
  ALTER TABLE public.contact_tags
    ADD CONSTRAINT contact_tags_tag_id_fkey
    FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table  THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

-- 5. conversation_events → profiles (from_agent_id)
DO $$ BEGIN
  ALTER TABLE public.conversation_events
    ADD CONSTRAINT conversation_events_from_agent_id_fkey
    FOREIGN KEY (from_agent_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table  THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

-- 6. conversation_events → profiles (to_agent_id)
DO $$ BEGIN
  ALTER TABLE public.conversation_events
    ADD CONSTRAINT conversation_events_to_agent_id_fkey
    FOREIGN KEY (to_agent_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table  THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

-- 7. conversation_events → profiles (performed_by)
DO $$ BEGIN
  ALTER TABLE public.conversation_events
    ADD CONSTRAINT conversation_events_performed_by_fkey
    FOREIGN KEY (performed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table  THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

-- 8. conversation_events → queues (from_queue_id)
DO $$ BEGIN
  ALTER TABLE public.conversation_events
    ADD CONSTRAINT conversation_events_from_queue_id_fkey
    FOREIGN KEY (from_queue_id) REFERENCES public.queues(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table  THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

-- 9. conversation_events → queues (to_queue_id)
DO $$ BEGIN
  ALTER TABLE public.conversation_events
    ADD CONSTRAINT conversation_events_to_queue_id_fkey
    FOREIGN KEY (to_queue_id) REFERENCES public.queues(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table  THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

-- 10. conversation_sla → contacts
DO $$ BEGIN
  ALTER TABLE public.conversation_sla
    ADD CONSTRAINT conversation_sla_contact_id_fkey
    FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table  THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

-- 11. followup_executions → followup_sequences
DO $$ BEGIN
  ALTER TABLE public.followup_executions
    ADD CONSTRAINT followup_executions_sequence_id_fkey
    FOREIGN KEY (sequence_id) REFERENCES public.followup_sequences(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table  THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

-- 12. followup_steps → followup_sequences (the child-to-parent FK enabling embed)
DO $$ BEGIN
  ALTER TABLE public.followup_steps
    ADD CONSTRAINT followup_steps_sequence_id_fkey
    FOREIGN KEY (sequence_id) REFERENCES public.followup_sequences(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table  THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

-- 13. sales_deals → contacts
DO $$ BEGIN
  ALTER TABLE public.sales_deals
    ADD CONSTRAINT sales_deals_contact_id_fkey
    FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table  THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

-- 14a. sales_deals → profiles (assigned_to)
DO $$ BEGIN
  ALTER TABLE public.sales_deals
    ADD CONSTRAINT sales_deals_assigned_to_fkey
    FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table  THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

-- 14b. team_conversation_members → profiles
DO $$ BEGIN
  ALTER TABLE public.team_conversation_members
    ADD CONSTRAINT team_conversation_members_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table  THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

-- 14c. team_messages → profiles (sender_id)
DO $$ BEGIN
  ALTER TABLE public.team_messages
    ADD CONSTRAINT team_messages_sender_id_fkey
    FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table  THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

-- 14d. user_roles → profiles (via shared user_id column)
-- Adds a second FK from user_roles.user_id to profiles.user_id so PostgREST
-- can resolve the user_roles(profiles(*)) embed without requiring a separate
-- profile_id column.  profiles.user_id is UNIQUE (enforced by its own FK to
-- auth.users), so this FK is valid.
DO $$ BEGIN
  ALTER TABLE public.user_roles
    ADD CONSTRAINT user_roles_user_id_profiles_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table  THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- PART 3: RBAC seed — permissions catalogue + role_permissions
-- ON CONFLICT DO NOTHING makes this fully idempotent.
-- ---------------------------------------------------------------------------

-- Seed canonical permissions
INSERT INTO public.permissions (name, description, category) VALUES
  -- Contacts
  ('contacts.read',    'View contacts and their details',          'contacts'),
  ('contacts.write',   'Create and update contacts',               'contacts'),
  ('contacts.delete',  'Delete contacts',                          'contacts'),
  -- Messages / Inbox
  ('messages.read',    'View messages and conversations',          'messages'),
  ('messages.write',   'Send messages and reply',                  'messages'),
  -- Queues
  ('queues.read',      'View queues and their assignments',        'queues'),
  ('queues.write',     'Assign and move conversations in queues',  'queues'),
  ('queues.manage',    'Create, edit, and delete queues',          'queues'),
  -- Reports
  ('reports.read',     'View reports and analytics',               'reports'),
  -- Settings
  ('settings.read',    'View system settings',                     'settings'),
  ('settings.write',   'Change system settings',                   'settings'),
  -- Users
  ('users.read',       'View users and roles',                     'users'),
  ('users.manage',     'Create, update, and deactivate users',     'users'),
  -- Automation
  ('automation.read',  'View automation rules',                    'automation'),
  ('automation.write', 'Create and edit automation rules',         'automation'),
  -- Chatbot
  ('chatbot.read',     'View chatbot flows',                       'chatbot'),
  ('chatbot.write',    'Create and edit chatbot flows',            'chatbot'),
  -- Email
  ('email.read',       'View email threads and accounts',          'email'),
  ('email.write',      'Send and manage email threads',            'email'),
  -- API / Integrations
  ('api.access',       'Access the REST/RPC API',                  'api'),
  -- Admin
  ('admin.full_access','Unrestricted access to all features',      'admin')
ON CONFLICT (name) DO NOTHING;

-- Grant all permissions to admin
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'admin'::app_role, id FROM public.permissions
ON CONFLICT (role, permission_id) DO NOTHING;

-- Grant a curated set to supervisor
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'supervisor'::app_role, id FROM public.permissions
WHERE name IN (
  'contacts.read', 'contacts.write',
  'messages.read', 'messages.write',
  'queues.read', 'queues.write', 'queues.manage',
  'reports.read',
  'settings.read',
  'users.read',
  'automation.read', 'automation.write',
  'chatbot.read', 'chatbot.write',
  'email.read', 'email.write',
  'api.access'
)
ON CONFLICT (role, permission_id) DO NOTHING;

-- Grant a basic set to agent
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'agent'::app_role, id FROM public.permissions
WHERE name IN (
  'contacts.read', 'contacts.write',
  'messages.read', 'messages.write',
  'queues.read',
  'email.read', 'email.write',
  'api.access'
)
ON CONFLICT (role, permission_id) DO NOTHING;
