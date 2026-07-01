DO $$ BEGIN
  CREATE TYPE public.ai_provider_type AS ENUM ('lovable_ai', 'openai_compatible', 'google_gemini', 'custom_webhook', 'custom_agent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent', 'special_agent', 'dev', 'manager');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.channel_type AS ENUM ('whatsapp', 'instagram', 'telegram', 'messenger', 'webchat', 'email');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.service_account_type AS ENUM ('google_sheets', 'google_docs', 'google_calendar', 'google_drive', 'dropbox');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
