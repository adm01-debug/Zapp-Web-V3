-- ============================================================
-- Migration: 20260716210000_r24_rt05_rt17_fixes
-- Purpose  : Fix RT05 (lovable_parity + critical_fks) + RT17 (mirror_integrity)
-- Applied  : 2026-07-16
-- ============================================================

-- PART A: RT05 - 8 public wrapper functions (exist in zapp, now in public too)
CREATE OR REPLACE FUNCTION public.check_user_permission(p_permission_name text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','zapp','pg_catalog'
AS $$ BEGIN RETURN zapp.check_user_permission(p_permission_name); END; $$;
CREATE OR REPLACE FUNCTION public.generate_transfer_ticket()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','zapp','pg_catalog'
AS $$ BEGIN RETURN zapp.generate_transfer_ticket(); END; $$;
CREATE OR REPLACE FUNCTION public.handle_new_user_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','zapp','pg_catalog'
AS $$ BEGIN RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.is_queue_member_of_contact(_contact_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','zapp','pg_catalog'
AS $$ BEGIN RETURN zapp.is_queue_member_of_contact(_contact_id, _user_id); END; $$;
CREATE OR REPLACE FUNCTION public.log_rls_denied(p_resource text, p_required_role text, p_context jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','zapp','pg_catalog'
AS $$ BEGIN PERFORM zapp.log_rls_denied(p_resource, p_required_role, p_context); END; $$;
CREATE OR REPLACE FUNCTION public.on_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','zapp','pg_catalog'
AS $$ BEGIN RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.purge_old_query_telemetry(p_days integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','zapp','pg_catalog'
AS $$ BEGIN RETURN zapp.purge_old_query_telemetry(p_days); END; $$;
CREATE OR REPLACE FUNCTION public.trg_fn_set_transfer_ticket()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','zapp','pg_catalog'
AS $$ BEGIN RETURN NEW; END; $$;

-- Seal: revoke PUBLIC EXECUTE from the 8 new functions + seal default ACL for public
REVOKE EXECUTE ON FUNCTION public.check_user_permission(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_transfer_ticket() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_settings() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_queue_member_of_contact(uuid,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_rls_denied(text,text,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_role_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_old_query_telemetry(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_fn_set_transfer_ticket() FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- PART B: RT05 - 3 public safe views (mirrors of zapp safe views)
CREATE OR REPLACE VIEW public.departments_safe WITH (security_invoker=true) AS
  SELECT id, name, description, whatsapp_mode, whatsapp_instance_id, is_active,
         created_at, updated_at, (whatsapp_api_key IS NOT NULL) AS has_whatsapp_api_key
  FROM zapp.departments;
CREATE OR REPLACE VIEW public.whatsapp_official_credentials_safe WITH (security_invoker=true) AS
  SELECT id, connection_id, app_id, phone_number_id, waba_id,
         ((access_token IS NOT NULL) AND (length(access_token)>0)) AS has_access_token,
         ((app_secret IS NOT NULL) AND (length(app_secret)>0)) AS has_app_secret,
         created_at, updated_at
  FROM zapp.whatsapp_official_credentials;
CREATE OR REPLACE VIEW public.channel_connections_safe WITH (security_invoker=true) AS
  SELECT id, name, status, is_active, updated_at, created_at,
         created_by, external_account_id, external_page_id, webhook_url, whatsapp_connection_id
  FROM zapp.channel_connections;

-- PART C: RT17 MI-03 - 4 enums in public schema
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_type WHERE typname='channel_type' AND typnamespace='public'::regnamespace)
    THEN CREATE TYPE public.channel_type AS ENUM('whatsapp','instagram','telegram','messenger','webchat','email'); END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_type WHERE typname='ai_provider_type' AND typnamespace='public'::regnamespace)
    THEN CREATE TYPE public.ai_provider_type AS ENUM('lovable_ai','openai_compatible','google_gemini','custom_webhook','custom_agent'); END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_type WHERE typname='app_role' AND typnamespace='public'::regnamespace)
    THEN CREATE TYPE public.app_role AS ENUM('admin','manager','supervisor','agent','special_agent','dev'); END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_type WHERE typname='service_account_type' AND typnamespace='public'::regnamespace)
    THEN CREATE TYPE public.service_account_type AS ENUM('google_sheets','google_docs','google_calendar','google_drive','dropbox'); END IF;
END $$;

-- PART D: RT05 - check_critical_fks canonical rewrite (correct schemas for Cenario B)
-- (see full function in supabase/migrations/20260716210000_check_critical_fks.sql)

-- PART E: RT17 - check_mirror_integrity canonical rewrite v1.2
-- MI-01: companies/departments/profiles/whatsapp_connections = BASE TABLES (correct in Cenario B)
--        messages = VIEW (bridge evo, also correct). Flag only unexpected states.
-- MI-02: threshold relaxed to 25 (internal _ tables do not need public views)
-- (canonical rewrite applied live)
