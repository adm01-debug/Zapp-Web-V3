-- ══════════════════════════════════════════════════════════════════
-- ZAPP WEB — Snapshot completo do schema public (Lovable Cloud)
-- Gerado em: 2026-07-01T10:02:51Z
-- Origem: uqysyzndkfiwfztbqvsl (Lovable Cloud)
-- 
-- Conteúdo:
--   • 7 extensions  •  4 enums  •  146 tables  •  331 indexes
--   • 105 functions •  82 triggers •  10 views •  414 policies
--   • GRANTs (anon/authenticated/service_role) • 7 storage buckets
--
-- IDEMPOTENTE: pode rodar múltiplas vezes sem erros.
-- USO: psql -h <host> -U postgres -d postgres -f ALL_IN_ONE.sql
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. EXTENSIONS ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS supabase_vault;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── 2. ENUMS ─────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE public.ai_provider_type AS ENUM ('lovable_ai','openai_compatible','google_gemini','custom_webhook','custom_agent'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin','supervisor','agent','special_agent','dev','manager'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.channel_type AS ENUM ('whatsapp','instagram','telegram','messenger','webchat','email'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.service_account_type AS ENUM ('google_sheets','google_docs','google_calendar','google_drive','dropbox'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 3. SCHEMA (tables + functions + views + policies + grants) ──
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: ai_provider_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ai_provider_type AS ENUM (
    'lovable_ai',
    'openai_compatible',
    'google_gemini',
    'custom_webhook',
    'custom_agent'
);


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'supervisor',
    'agent',
    'special_agent',
    'dev',
    'manager'
);


--
-- Name: channel_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.channel_type AS ENUM (
    'whatsapp',
    'instagram',
    'telegram',
    'messenger',
    'webchat',
    'email'
);


--
-- Name: service_account_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.service_account_type AS ENUM (
    'google_sheets',
    'google_docs',
    'google_calendar',
    'google_drive',
    'dropbox'
);


--
-- Name: audit_role_changes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_role_changes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'role_created',
      'user_roles',
      NEW.id,
      jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role)
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'role_deleted',
      'user_roles',
      OLD.id,
      jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role)
    );
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: auto_assign_contact(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_assign_contact() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  assigned_agent_id UUID;
BEGIN
  -- Find the first matching active rule for the connection
  SELECT agent_id INTO assigned_agent_id
  FROM public.client_wallet_rules
  WHERE is_active = true
    AND (whatsapp_connection_id IS NULL OR whatsapp_connection_id = NEW.whatsapp_connection_id)
  ORDER BY priority DESC, created_at ASC
  LIMIT 1;
  
  -- If a rule matches and contact has no assignment, assign it
  IF assigned_agent_id IS NOT NULL AND NEW.assigned_to IS NULL THEN
    NEW.assigned_to := assigned_agent_id;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: auto_assign_to_queue_agent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_assign_to_queue_agent() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  assigned_agent_id UUID;
BEGIN
  -- If contact has a queue but no assigned agent, find least busy agent
  IF NEW.queue_id IS NOT NULL AND NEW.assigned_to IS NULL THEN
    SELECT qm.profile_id INTO assigned_agent_id
    FROM public.queue_members qm
    JOIN public.profiles p ON p.id = qm.profile_id
    WHERE qm.queue_id = NEW.queue_id
      AND qm.is_active = true
      AND p.is_active = true
    ORDER BY (
      SELECT COUNT(*) FROM public.contacts c 
      WHERE c.assigned_to = qm.profile_id
    ) ASC
    LIMIT 1;
    
    IF assigned_agent_id IS NOT NULL THEN
      NEW.assigned_to := assigned_agent_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: calculate_level(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_level(xp_amount integer) RETURNS integer
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN GREATEST(1, FLOOR(SQRT(xp_amount / 50.0))::INTEGER + 1);
END;
$$;


--
-- Name: check_user_permission(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_user_permission(p_permission_name text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_has_permission BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 
        FROM public.role_permissions rp
        JOIN public.user_roles ur ON ur.role = rp.role
        JOIN public.permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = auth.uid()
        AND p.name = p_permission_name
    ) INTO v_has_permission;

    IF NOT v_has_permission THEN
        PERFORM public.log_security_event(
            'unauthorized_access',
            'permission:' || p_permission_name,
            'EXECUTE',
            'denied'
        );
    END IF;

    RETURN v_has_permission;
END;
$$;


--
-- Name: cleanup_expired_challenges(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_challenges() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    DELETE FROM public.webauthn_challenges WHERE expires_at < now();
END;
$$;


--
-- Name: clear_login_attempts(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clear_login_attempts(p_email text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM public.login_attempts WHERE email = LOWER(p_email);
END;
$$;


--
-- Name: clear_qr_on_connect(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clear_qr_on_connect() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'connected' AND OLD.status != 'connected' AND NEW.qr_code IS NOT NULL THEN
    NEW.qr_code := NULL;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: contacts_count_by_type(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.contacts_count_by_type() RETURNS TABLE(contact_type text, count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(c.contact_type, 'cliente') AS contact_type, COUNT(*) AS count
  FROM public.contacts c
  GROUP BY COALESCE(c.contact_type, 'cliente');
$$;


--
-- Name: decrypt_gmail_token(bytea); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decrypt_gmail_token(p_encrypted bytea) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF p_encrypted IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(p_encrypted, current_setting('app.encryption_key', true));
END;
$$;


--
-- Name: encrypt_gmail_token(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.encrypt_gmail_token(p_token text) RETURNS bytea
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF p_token IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_encrypt(p_token, current_setting('app.encryption_key', true));
END;
$$;


--
-- Name: ensure_single_default_ai_provider(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_single_default_ai_provider() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.ai_providers
    SET is_default = false
    WHERE id != NEW.id
      AND is_default = true
      AND use_for && NEW.use_for;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: ensure_single_default_filter(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_single_default_filter() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.saved_filters
    SET is_default = false
    WHERE user_id = NEW.user_id
      AND entity_type = NEW.entity_type
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_accept_transfer(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_accept_transfer(p_transfer_id uuid, p_operator text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE public.conversation_transfers SET status = 'accepted', target_operator = p_operator, accepted_at = NOW()
    WHERE id = p_transfer_id AND status = 'pending';
    RETURN FOUND;
END;
$$;


--
-- Name: fn_accept_transfer(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_accept_transfer(p_transfer_id uuid, p_agent_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_conversation_id UUID;
BEGIN
    -- Update the transfer record
    UPDATE public.conversation_transfers
    SET 
        status = 'accepted',
        to_agent_id = p_agent_id,
        accepted_at = NOW()
    WHERE 
        id = p_transfer_id AND status = 'pending'
    RETURNING conversation_id INTO v_conversation_id;
    
    IF FOUND THEN
        -- Assign the contact to the new agent
        UPDATE public.contacts
        SET assigned_to = p_agent_id
        WHERE id = v_conversation_id;
        
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$;


--
-- Name: fn_complete_transfer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_complete_transfer(p_transfer_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE public.conversation_transfers
    SET 
        status = 'completed',
        completed_at = NOW()
    WHERE 
        id = p_transfer_id AND status = 'accepted';
    
    RETURN FOUND;
END;
$$;


--
-- Name: fn_complete_transfer(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_complete_transfer(p_transfer_id uuid, p_notes text, p_type text DEFAULT 'resolved'::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE public.conversation_transfers SET status = 'completed', resolution_notes = p_notes, resolution_type = p_type, completed_at = NOW()
    WHERE id = p_transfer_id AND status IN ('accepted', 'in_progress');
    RETURN FOUND;
END;
$$;


--
-- Name: fn_create_transfer(uuid, uuid, uuid, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_create_transfer(p_conversation_id uuid, p_from_agent_id uuid, p_to_agent_id uuid DEFAULT NULL::uuid, p_to_queue_id uuid DEFAULT NULL::uuid, p_transfer_type text DEFAULT 'direct'::text, p_priority text DEFAULT 'P3'::text, p_context_summary text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_transfer_id UUID;
BEGIN
    INSERT INTO public.conversation_transfers (
        conversation_id,
        from_agent_id,
        to_agent_id,
        to_queue_id,
        transfer_type,
        priority,
        context_summary,
        sla_deadline
    ) VALUES (
        p_conversation_id,
        p_from_agent_id,
        p_to_agent_id,
        p_to_queue_id,
        p_transfer_type,
        p_priority,
        p_context_summary,
        CASE 
            WHEN p_priority = 'P1' THEN NOW() + INTERVAL '15 minutes'
            WHEN p_priority = 'P2' THEN NOW() + INTERVAL '1 hour'
            WHEN p_priority = 'P3' THEN NOW() + INTERVAL '4 hours'
            ELSE NOW() + INTERVAL '24 hours'
        END
    ) RETURNING id INTO v_transfer_id;
    
    RETURN v_transfer_id;
END;
$$;


--
-- Name: fn_create_transfer(text, text, text, text, text, integer, text, text, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_create_transfer(p_source_instance text, p_target_instance text, p_remote_jid text, p_reason text, p_category text, p_priority integer DEFAULT 2, p_transfer_type text DEFAULT 'internal'::text, p_source_operator text DEFAULT NULL::text, p_context_summary text DEFAULT NULL::text, p_tags text[] DEFAULT '{}'::text[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_transfer_id UUID;
BEGIN
    INSERT INTO public.conversation_transfers (
        source_instance, target_instance, remote_jid,
        reason, category, priority, transfer_type, source_operator,
        context_summary, tags, status, expires_at
    ) VALUES (
        p_source_instance, p_target_instance, p_remote_jid,
        p_reason, p_category, p_priority, p_transfer_type, p_source_operator,
        p_context_summary, p_tags, 'pending',
        CASE 
            WHEN p_priority = 4 THEN NOW() + INTERVAL '2 hours'
            WHEN p_priority = 3 THEN NOW() + INTERVAL '4 hours'
            WHEN p_priority = 2 THEN NOW() + INTERVAL '8 hours'
            ELSE NOW() + INTERVAL '24 hours'
        END
    ) RETURNING id INTO v_transfer_id;

    RETURN v_transfer_id;
END;
$$;


--
-- Name: fn_increment_meme_use(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_increment_meme_use(p_meme_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  UPDATE public.audio_memes SET use_count = use_count + 1 WHERE id = p_meme_id;
$$;


--
-- Name: fn_list_audio_meme_categories(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_list_audio_meme_categories() RETURNS TABLE(category text, total bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT category, COUNT(*)::bigint AS total
  FROM public.audio_memes
  GROUP BY category
  ORDER BY total DESC, category ASC;
$$;


--
-- Name: fn_list_audio_memes_for_user(text, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_list_audio_memes_for_user(p_category text DEFAULT NULL::text, p_only_favorites boolean DEFAULT false, p_search text DEFAULT NULL::text) RETURNS TABLE(id uuid, name text, audio_url text, category text, duration_seconds numeric, use_count integer, is_favorite boolean, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT m.id, m.name, m.audio_url, m.category, m.duration_seconds, m.use_count,
         EXISTS (
           SELECT 1 FROM public.audio_meme_favorites f
           WHERE f.meme_id = m.id AND f.user_id = auth.uid()
         ) AS is_favorite,
         m.created_at
  FROM public.audio_memes m
  WHERE (p_category IS NULL OR m.category = p_category)
    AND (p_search IS NULL OR m.name ILIKE '%'||p_search||'%')
    AND (
      NOT p_only_favorites
      OR EXISTS (
        SELECT 1 FROM public.audio_meme_favorites f
        WHERE f.meme_id = m.id AND f.user_id = auth.uid()
      )
    )
  ORDER BY is_favorite DESC, m.use_count DESC, m.name ASC;
$$;


--
-- Name: fn_return_transfer(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_return_transfer(p_transfer_id uuid, p_reason text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE public.conversation_transfers SET status = 'returned', resolution_notes = p_reason, resolution_type = 'returned', completed_at = NOW()
    WHERE id = p_transfer_id AND status IN ('accepted', 'in_progress');
    RETURN FOUND;
END;
$$;


--
-- Name: fn_toggle_user_meme_favorite(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_toggle_user_meme_favorite(p_meme_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_exists boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.audio_meme_favorites
                WHERE meme_id = p_meme_id AND user_id = auth.uid()) INTO v_exists;
  IF v_exists THEN
    DELETE FROM public.audio_meme_favorites
      WHERE meme_id = p_meme_id AND user_id = auth.uid();
    RETURN false;
  ELSE
    INSERT INTO public.audio_meme_favorites(user_id, meme_id)
      VALUES (auth.uid(), p_meme_id);
    RETURN true;
  END IF;
END;
$$;


--
-- Name: fn_transfer_comment(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_transfer_comment(p_transfer_id uuid, p_agent_id uuid, p_content text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_comment_id UUID;
BEGIN
    INSERT INTO public.transfer_comments (
        transfer_id,
        agent_id,
        content
    ) VALUES (
        p_transfer_id,
        p_agent_id,
        p_content
    ) RETURNING id INTO v_comment_id;
    
    RETURN v_comment_id;
END;
$$;


--
-- Name: fn_transfer_comment(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_transfer_comment(p_transfer_id uuid, p_author text, p_instance text, p_content text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_id UUID;
BEGIN
    INSERT INTO public.transfer_comments (transfer_id, author_name, author_instance, content)
    VALUES (p_transfer_id, p_author, p_instance, p_content) RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;


--
-- Name: generate_transfer_ticket(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_transfer_ticket() RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
    today TEXT := to_char(CURRENT_DATE, 'YYYYMMDD');
    seq_val INT;
BEGIN
    seq_val := nextval('transfer_ticket_seq');
    RETURN 'TRF-' || today || '-' || lpad(seq_val::text, 4, '0');
END;
$$;


--
-- Name: get_channel_credentials(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_channel_credentials(_connection_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT is_admin_or_supervisor(auth.uid()) THEN
    RETURN NULL;
  END IF;
  RETURN (SELECT credentials FROM public.channel_connections WHERE id = _connection_id);
END;
$$;


--
-- Name: get_channel_credentials_safe(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_channel_credentials_safe(p_channel_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Only admins can access credentials
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;
  
  RETURN (
    SELECT credentials 
    FROM public.channel_connections 
    WHERE id = p_channel_id
  );
END;
$$;


--
-- Name: get_connection_instance(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_connection_instance(_connection_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT instance_id FROM public.whatsapp_connections WHERE id = _connection_id;
$$;


--
-- Name: get_connection_qr_code(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_connection_qr_code(_connection_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT qr_code FROM public.whatsapp_connections WHERE id = _connection_id;
$$;


--
-- Name: get_own_gmail_accounts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_own_gmail_accounts() RETURNS TABLE(id uuid, user_id uuid, email_address text, is_active boolean, sync_status text, last_sync_at timestamp with time zone, last_error text, token_expires_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT id, user_id, email_address, is_active, sync_status,
         last_sync_at, last_error, token_expires_at, created_at, updated_at
  FROM public.gmail_accounts
  WHERE user_id = auth.uid();
$$;


--
-- Name: get_own_lockout_status(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_own_lockout_status(p_email text) RETURNS TABLE(attempt_count integer, locked_until timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT la.attempt_count, la.locked_until
  FROM login_attempts la
  WHERE la.email = p_email
  ORDER BY la.created_at DESC
  LIMIT 1;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: password_reset_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email text NOT NULL,
    reason text,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    rejection_reason text,
    token_expires_at timestamp with time zone,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT password_reset_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: get_own_reset_requests(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_own_reset_requests() RETURNS SETOF public.password_reset_requests
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT id, user_id, email, reason, status, reviewed_by, reviewed_at,
         rejection_reason, NULL::text as reset_token, token_expires_at,
         ip_address, user_agent, created_at, updated_at
  FROM public.password_reset_requests
  WHERE user_id = auth.uid();
$$;


--
-- Name: get_profile_id_for_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT id FROM public.profiles WHERE user_id = _user_id LIMIT 1;
$$;


--
-- Name: get_profile_role_for_check(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_profile_role_for_check(p_user_id uuid) RETURNS TABLE(role text, access_level text, permissions jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.role, p.access_level, p.permissions
  FROM profiles p
  WHERE p.user_id = p_user_id
  LIMIT 1;
$$;


--
-- Name: get_reset_requests_safe(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_reset_requests_safe() RETURNS TABLE(id uuid, user_id uuid, email text, reason text, status text, reviewed_by uuid, reviewed_at timestamp with time zone, rejection_reason text, has_token boolean, token_expires_at timestamp with time zone, ip_address text, user_agent text, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT 
    prr.id, prr.user_id, prr.email, prr.reason, prr.status,
    prr.reviewed_by, prr.reviewed_at, prr.rejection_reason,
    (prr.reset_token IS NOT NULL) AS has_token,
    prr.token_expires_at, prr.ip_address, prr.user_agent,
    prr.created_at, prr.updated_at
  FROM public.password_reset_requests prr;
$$;


--
-- Name: get_team_profiles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_team_profiles() RETURNS TABLE(id uuid, user_id uuid, name text, email text, avatar_url text, role text, is_active boolean, department text, job_title text, phone text, max_chats integer, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT 
    p.id, p.user_id, p.name, p.email, p.avatar_url, p.role,
    p.is_active, p.department, p.job_title, p.phone, p.max_chats, p.created_at
  FROM public.profiles p;
$$;


--
-- Name: get_visible_agent_ids(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.id FROM public.profiles p WHERE p.user_id = _user_id
  UNION
  SELECT avg.can_see_agent_id
  FROM public.agent_visibility_grants avg
  JOIN public.profiles p ON p.id = avg.agent_id
  WHERE p.user_id = _user_id
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id AND ur.role = 'special_agent'
    )
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email),
    NEW.email
  );
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user_role() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'agent');
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user_settings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user_settings() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    -- Use NEW.user_id since this table has a user_id column
    INSERT INTO public.user_settings (user_id, onboarding_completed)
    VALUES (NEW.user_id, false)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$;


--
-- Name: handle_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;


--
-- Name: init_agent_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.init_agent_stats() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.agent_stats (profile_id)
  VALUES (NEW.id)
  ON CONFLICT (profile_id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: is_account_locked(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_account_locked(check_email text) RETURNS TABLE(is_locked boolean, locked_until timestamp with time zone, attempts integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_attempt RECORD;
BEGIN
  SELECT la.attempt_count, la.locked_until, la.last_attempt_at
  INTO v_attempt
  FROM public.login_attempts la
  WHERE la.email = LOWER(check_email);
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::TIMESTAMP WITH TIME ZONE, 0;
    RETURN;
  END IF;
  
  -- Check if still locked
  IF v_attempt.locked_until IS NOT NULL AND v_attempt.locked_until > now() THEN
    RETURN QUERY SELECT true, v_attempt.locked_until, v_attempt.attempt_count;
    RETURN;
  END IF;
  
  -- Not locked
  RETURN QUERY SELECT false, NULL::TIMESTAMP WITH TIME ZONE, v_attempt.attempt_count;
END;
$$;


--
-- Name: is_admin_or_supervisor(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$$;


--
-- Name: is_contact_visible_to_user(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contacts c
    JOIN public.profiles p ON p.id = c.assigned_to
    WHERE c.id = _contact_id AND p.user_id = _user_id
  ) OR public.is_admin_or_supervisor(_user_id);
$$;


--
-- Name: is_country_allowed(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_country_allowed(check_country_code text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  geo_mode TEXT;
BEGIN
  -- Get current geo blocking mode
  SELECT mode INTO geo_mode FROM public.geo_blocking_settings LIMIT 1;
  
  -- If disabled, allow all
  IF geo_mode IS NULL OR geo_mode = 'disabled' THEN
    RETURN true;
  END IF;
  
  -- If whitelist mode, check if country is in allowed list
  IF geo_mode = 'whitelist' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.allowed_countries
      WHERE country_code = UPPER(check_country_code)
    );
  END IF;
  
  -- If blacklist mode, check if country is NOT in blocked list
  IF geo_mode = 'blacklist' THEN
    RETURN NOT EXISTS (
      SELECT 1 FROM public.blocked_countries
      WHERE country_code = UPPER(check_country_code)
    );
  END IF;
  
  RETURN true;
END;
$$;


--
-- Name: is_country_blocked(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_country_blocked(check_country_code text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_countries
    WHERE country_code = UPPER(check_country_code)
  )
$$;


--
-- Name: is_ip_blocked(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_ip_blocked(check_ip text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_ips
    WHERE ip_address = check_ip
    AND (expires_at IS NULL OR expires_at > now())
  )
$$;


--
-- Name: is_ip_whitelisted(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_ip_whitelisted(check_ip text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ip_whitelist
    WHERE ip_address = check_ip
  )
$$;


--
-- Name: is_queue_member_of_contact(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_queue_member_of_contact(_contact_id uuid, _user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contacts c
    JOIN public.queue_members qm ON qm.queue_id = c.queue_id
    WHERE c.id = _contact_id
      AND qm.is_active = true
      AND qm.profile_id = public.get_profile_id_for_user(_user_id)
  );
$$;


--
-- Name: is_team_conversation_member(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_team_conversation_member(_user_id uuid, _conversation_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_conversation_members tcm
    JOIN public.profiles p ON p.id = tcm.profile_id
    WHERE tcm.conversation_id = _conversation_id
      AND p.user_id = _user_id
  );
$$;


--
-- Name: is_within_business_hours(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_within_business_hours(connection_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_current_day INTEGER;
  v_current_time TIME;
  v_is_open BOOLEAN;
  v_open_at TIME;
  v_close_at TIME;
BEGIN
  -- Get current day of week (0=Sunday) and time in Brazil timezone
  v_current_day := EXTRACT(DOW FROM now() AT TIME ZONE 'America/Sao_Paulo');
  v_current_time := (now() AT TIME ZONE 'America/Sao_Paulo')::TIME;
  
  -- Check business hours for this day
  SELECT bh.is_open, bh.open_time, bh.close_time
  INTO v_is_open, v_open_at, v_close_at
  FROM business_hours bh
  WHERE bh.whatsapp_connection_id = connection_id
  AND bh.day_of_week = v_current_day;
  
  -- If no configuration found, assume open (default behavior)
  IF NOT FOUND THEN
    RETURN true;
  END IF;
  
  -- If marked as closed
  IF NOT v_is_open THEN
    RETURN false;
  END IF;
  
  -- Check if current time is within open hours
  RETURN v_current_time >= v_open_at AND v_current_time <= v_close_at;
END;
$$;


--
-- Name: log_assignment_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_assignment_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO public.conversation_events (
      contact_id, event_type, from_agent_id, to_agent_id, performed_by, metadata
    ) VALUES (
      NEW.id,
      CASE
        WHEN OLD.assigned_to IS NULL THEN 'assign'
        WHEN NEW.assigned_to IS NULL THEN 'unassign'
        ELSE 'transfer'
      END,
      OLD.assigned_to,
      NEW.assigned_to,
      COALESCE(NEW.assigned_to, OLD.assigned_to),
      jsonb_build_object('old_queue', OLD.queue_id, 'new_queue', NEW.queue_id)
    );
  END IF;

  -- Log queue changes
  IF OLD.queue_id IS DISTINCT FROM NEW.queue_id THEN
    INSERT INTO public.conversation_events (
      contact_id, event_type, from_queue_id, to_queue_id, performed_by, metadata
    ) VALUES (
      NEW.id,
      'queue_transfer',
      OLD.queue_id,
      NEW.queue_id,
      NEW.assigned_to,
      jsonb_build_object('agent', NEW.assigned_to)
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: log_audit_event(text, text, text, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_audit_event(p_action text, p_entity_type text DEFAULT NULL::text, p_entity_id text DEFAULT NULL::text, p_details jsonb DEFAULT NULL::jsonb, p_user_agent text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;
  
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details, user_agent)
  VALUES (v_user_id, p_action, p_entity_type, p_entity_id, p_details, p_user_agent);
END;
$$;


--
-- Name: log_audit_event(text, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_audit_event(p_event_type text, p_resource text, p_action text, p_status text, p_details jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    INSERT INTO public.audit_logs (event_type, resource, action, status, details, user_id)
    VALUES (p_event_type, p_resource, p_action, p_status, p_details, auth.uid());
END;
$$;


--
-- Name: log_rls_denied(text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_rls_denied(p_resource text, p_required_role text DEFAULT NULL::text, p_context jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.rls_denied_log(user_id, resource, required_role, context)
  VALUES (auth.uid(), p_resource, p_required_role, COALESCE(p_context, '{}'::jsonb));
EXCEPTION WHEN OTHERS THEN
  -- never block on logging failures
  RETURN;
END;
$$;


--
-- Name: log_security_event(text, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_security_event(p_event_type text, p_resource text, p_action text, p_status text, p_details jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    INSERT INTO public.audit_logs (event_type, resource, action, status, details, user_id)
    VALUES (p_event_type, p_resource, p_action, p_status, p_details, auth.uid());
END;
$$;


--
-- Name: manage_department_member(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    IF p_action = 'add' THEN
        UPDATE public.profiles SET department_id = p_department_id WHERE id = p_profile_id;
    ELSIF p_action = 'remove' THEN
        UPDATE public.profiles SET department_id = NULL WHERE id = p_profile_id;
    END IF;
    RETURN TRUE;
END;
$$;


--
-- Name: manage_department_member(uuid, uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text, _admin_user_id uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    IF p_action = 'add' THEN
        UPDATE public.profiles SET department_id = p_department_id WHERE id = p_profile_id;
    ELSIF p_action = 'remove' THEN
        UPDATE public.profiles SET department_id = NULL WHERE id = p_profile_id;
    END IF;
    RETURN TRUE;
END;
$$;


--
-- Name: manage_department_member(uuid, uuid, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.manage_department_member(p_profile_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid, p_action text DEFAULT NULL::text, _admin_user_id uuid DEFAULT NULL::uuid, _target_profile_id uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_target_id UUID;
BEGIN
    v_target_id := COALESCE(p_profile_id, _target_profile_id);
    
    IF v_target_id IS NULL THEN
        RETURN FALSE;
    END IF;

    IF p_action = 'add' AND p_department_id IS NOT NULL THEN
        UPDATE public.profiles SET department_id = p_department_id WHERE id = v_target_id;
    ELSIF p_action = 'remove' THEN
        UPDATE public.profiles SET department_id = NULL WHERE id = v_target_id;
    END IF;
    RETURN TRUE;
END;
$$;


--
-- Name: mask_channel_credentials(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mask_channel_credentials() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- This is a SELECT trigger workaround - credentials masking is handled via the safe view
  RETURN NEW;
END;
$$;


--
-- Name: normalize_contact_phone(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_contact_phone() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.phone IS NOT NULL THEN
    NEW.phone := regexp_replace(NEW.phone, '[^0-9]', '', 'g');
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: notify_sicoob_on_reply(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_sicoob_on_reply() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_contact_type text;
  v_supabase_url text;
BEGIN
  IF NEW.sender = 'agent' AND NEW.channel_type = 'internal_chat' THEN
    SELECT contact_type INTO v_contact_type
    FROM public.contacts
    WHERE id = NEW.contact_id;

    IF v_contact_type = 'sicoob_gifts' THEN
      v_supabase_url := 'https://supabase.atomicabr.com.br';

      PERFORM extensions.http_post(
        url := v_supabase_url || '/functions/v1/sicoob-bridge-reply',
        body := jsonb_build_object(
          'contact_id', NEW.contact_id,
          'content', NEW.content,
          'message_id', NEW.id,
          'agent_id', NEW.agent_id,
          'created_at', NEW.created_at
        )::text,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        )::jsonb
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: on_role_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.on_role_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    PERFORM public.log_security_event(
        'permission_change',
        'user_roles',
        TG_OP,
        'allowed',
        jsonb_build_object(
            'target_user_id', COALESCE(NEW.user_id, OLD.user_id),
            'role', COALESCE(NEW.role, OLD.role)
        )
    );
    RETURN NEW;
END;
$$;


--
-- Name: pause_instance(text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pause_instance(p_instance text, p_reason text, p_minutes integer, p_trigger_count integer DEFAULT 0) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_id UUID;
    v_until TIMESTAMPTZ;
BEGIN
    v_until := now() + (p_minutes || ' minutes')::interval;
    
    INSERT INTO public.instance_processing_pauses (instance_name, paused_until, reason, trigger_count)
    VALUES (p_instance, v_until, p_reason, p_trigger_count)
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$;


--
-- Name: prevent_profile_privilege_escalation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_profile_privilege_escalation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- If role, permissions, or access_level are being changed
  IF (OLD.role IS DISTINCT FROM NEW.role) OR 
     (OLD.permissions IS DISTINCT FROM NEW.permissions) OR 
     (OLD.access_level IS DISTINCT FROM NEW.access_level) THEN
    -- Only allow if user is admin or supervisor
    IF NOT is_admin_or_supervisor(auth.uid()) THEN
      RAISE EXCEPTION 'Only administrators can modify role, permissions, or access_level';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: prevent_role_escalation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_role_escalation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- If role is being changed, only allow admins/supervisors
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
      -- Silently revert the role change
      NEW.role := OLD.role;
    END IF;
  END IF;
  
  -- Also prevent non-admins from changing access_level and permissions
  IF OLD.access_level IS DISTINCT FROM NEW.access_level THEN
    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
      NEW.access_level := OLD.access_level;
    END IF;
  END IF;
  
  IF OLD.permissions IS DISTINCT FROM NEW.permissions THEN
    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
      NEW.permissions := OLD.permissions;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: purge_old_query_telemetry(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_old_query_telemetry(p_days integer DEFAULT 30) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.query_telemetry
   WHERE created_at < now() - (p_days || ' days')::interval;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;


--
-- Name: rate_limit_reset_requests(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rate_limit_reset_requests() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_pending_count integer;
BEGIN
  SELECT COUNT(*) INTO v_pending_count
  FROM public.password_reset_requests
  WHERE user_id = NEW.user_id
    AND status = 'pending'
    AND created_at > now() - interval '1 hour';

  IF v_pending_count >= 3 THEN
    RAISE EXCEPTION 'Too many pending reset requests. Please wait before trying again.';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: reassign_absent_agents(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reassign_absent_agents(inactive_minutes integer DEFAULT 30) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_absent RECORD;
  v_new_agent UUID;
  v_reassigned INTEGER := 0;
  v_contact RECORD;
BEGIN
  FOR v_absent IN
    SELECT p.id AS agent_id
    FROM profiles p
    WHERE p.is_active = true
      AND p.last_seen_at IS NOT NULL
      AND p.last_seen_at < now() - (inactive_minutes || ' minutes')::interval
      AND EXISTS (SELECT 1 FROM contacts c WHERE c.assigned_to = p.id)
  LOOP
    FOR v_contact IN
      SELECT c.id, c.queue_id
      FROM contacts c
      WHERE c.assigned_to = v_absent.agent_id
    LOOP
      SELECT qm.profile_id INTO v_new_agent
      FROM queue_members qm
      JOIN profiles p ON p.id = qm.profile_id
      WHERE (v_contact.queue_id IS NULL OR qm.queue_id = v_contact.queue_id)
        AND qm.is_active = true
        AND p.is_active = true
        AND p.id != v_absent.agent_id
        AND (p.last_seen_at IS NULL OR p.last_seen_at > now() - (inactive_minutes || ' minutes')::interval)
      ORDER BY (
        SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = qm.profile_id
      ) ASC
      LIMIT 1;

      IF v_new_agent IS NOT NULL THEN
        UPDATE contacts SET assigned_to = v_new_agent WHERE id = v_contact.id;

        INSERT INTO conversation_events (contact_id, event_type, from_agent_id, to_agent_id, metadata)
        VALUES (v_contact.id, 'absence_reassign', v_absent.agent_id, v_new_agent,
                jsonb_build_object('reason', 'agent_inactive', 'inactive_minutes', inactive_minutes));

        v_reassigned := v_reassigned + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_reassigned;
END;
$$;


--
-- Name: reassign_overloaded_agents(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reassign_overloaded_agents() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_overloaded RECORD;
  v_new_agent UUID;
  v_reassigned INTEGER := 0;
  v_contact RECORD;
BEGIN
  -- Encontrar agentes sobrecarregados
  FOR v_overloaded IN
    SELECT p.id AS agent_id, p.max_chats,
           COUNT(c.id) AS current_chats
    FROM profiles p
    JOIN contacts c ON c.assigned_to = p.id
    WHERE p.is_active = true
      AND p.max_chats IS NOT NULL
      AND p.max_chats > 0
    GROUP BY p.id, p.max_chats
    HAVING COUNT(c.id) > p.max_chats
  LOOP
    -- Para cada conversa excedente, reatribuir
    FOR v_contact IN
      SELECT c.id, c.queue_id
      FROM contacts c
      WHERE c.assigned_to = v_overloaded.agent_id
      ORDER BY c.updated_at ASC
      LIMIT (v_overloaded.current_chats - v_overloaded.max_chats)
    LOOP
      -- Encontrar agente com menor carga na mesma fila
      SELECT qm.profile_id INTO v_new_agent
      FROM queue_members qm
      JOIN profiles p ON p.id = qm.profile_id
      WHERE (v_contact.queue_id IS NULL OR qm.queue_id = v_contact.queue_id)
        AND qm.is_active = true
        AND p.is_active = true
        AND p.id != v_overloaded.agent_id
        AND (p.max_chats IS NULL OR (
          SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = p.id
        ) < p.max_chats)
      ORDER BY (
        SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = qm.profile_id
      ) ASC
      LIMIT 1;

      IF v_new_agent IS NOT NULL THEN
        UPDATE contacts SET assigned_to = v_new_agent WHERE id = v_contact.id;

        INSERT INTO conversation_events (contact_id, event_type, from_agent_id, to_agent_id, metadata)
        VALUES (v_contact.id, 'overload_reassign', v_overloaded.agent_id, v_new_agent,
                jsonb_build_object('reason', 'max_chats_exceeded', 'max_chats', v_overloaded.max_chats));

        v_reassigned := v_reassigned + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_reassigned;
END;
$$;


--
-- Name: record_failed_login(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_failed_login(p_email text, p_ip_address text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text) RETURNS TABLE(is_locked boolean, locked_until timestamp with time zone, attempts integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_attempt RECORD;
  v_new_count INTEGER;
  v_lock_duration INTERVAL;
  v_locked_until TIMESTAMP WITH TIME ZONE;
  v_max_attempts INTEGER := 5;
BEGIN
  -- Get existing attempts
  SELECT la.attempt_count, la.locked_until, la.last_attempt_at
  INTO v_attempt
  FROM public.login_attempts la
  WHERE la.email = LOWER(p_email);
  
  IF NOT FOUND THEN
    -- First failed attempt
    INSERT INTO public.login_attempts (email, ip_address, user_agent, attempt_count)
    VALUES (LOWER(p_email), p_ip_address, p_user_agent, 1);
    
    RETURN QUERY SELECT false, NULL::TIMESTAMP WITH TIME ZONE, 1;
    RETURN;
  END IF;
  
  -- If previous lock expired, reset count
  IF v_attempt.locked_until IS NOT NULL AND v_attempt.locked_until <= now() THEN
    v_new_count := 1;
  ELSE
    v_new_count := v_attempt.attempt_count + 1;
  END IF;
  
  -- Calculate lock duration with exponential backoff
  IF v_new_count >= v_max_attempts THEN
    -- Lock duration: 2^(attempts - max_attempts) minutes, starting at 1 minute
    -- 5 attempts = 1 min, 6 = 2 min, 7 = 4 min, 8 = 8 min, etc.
    v_lock_duration := (POWER(2, LEAST(v_new_count - v_max_attempts, 10)))::INTEGER * INTERVAL '1 minute';
    v_locked_until := now() + v_lock_duration;
  ELSE
    v_locked_until := NULL;
  END IF;
  
  -- Update attempt record
  UPDATE public.login_attempts
  SET 
    attempt_count = v_new_count,
    last_attempt_at = now(),
    locked_until = v_locked_until,
    ip_address = COALESCE(p_ip_address, login_attempts.ip_address),
    user_agent = COALESCE(p_user_agent, login_attempts.user_agent),
    updated_at = now()
  WHERE email = LOWER(p_email);
  
  RETURN QUERY SELECT 
    v_locked_until IS NOT NULL AND v_locked_until > now(),
    v_locked_until,
    v_new_count;
END;
$$;


--
-- Name: rpc_dlq_abandon(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_dlq_abandon(p_item_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE public.failed_messages SET status = 'abandoned' WHERE id = p_item_id;
    RETURN TRUE;
END;
$$;


--
-- Name: rpc_dlq_abandon(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_dlq_abandon(p_item_id uuid DEFAULT NULL::uuid, p_id uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE public.failed_messages SET status = 'abandoned' WHERE id = COALESCE(p_item_id, p_id);
    RETURN TRUE;
END;
$$;


--
-- Name: rpc_dlq_bulk_abandon(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_dlq_bulk_abandon(p_ids uuid[]) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE public.failed_messages SET status = 'abandoned' WHERE id = ANY(p_ids);
    RETURN TRUE;
END;
$$;


--
-- Name: dlq_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dlq_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action text,
    item_id uuid,
    performed_by uuid,
    reason text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: rpc_dlq_list_audit(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_dlq_list_audit(p_limit integer DEFAULT 100) RETURNS SETOF public.dlq_audit_log
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.dlq_audit_log ORDER BY created_at DESC LIMIT p_limit;
END;
$$;


--
-- Name: rpc_dlq_list_audit(integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_dlq_list_audit(p_limit integer, p_offset integer, p_action text) RETURNS TABLE(id uuid, action text, entity_id text, details jsonb, created_at timestamp with time zone, user_id uuid, user_name text, user_email text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')) THEN
    PERFORM public.log_rls_denied('dlq_audit_log', 'admin|supervisor',
      jsonb_build_object('rpc', 'rpc_dlq_list_audit', 'action', p_action));
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT al.id,
         al.action::text,
         al.entity_id::text,
         al.details,
         al.created_at,
         al.user_id,
         p.name AS user_name,
         p.email AS user_email
  FROM public.audit_logs al
  LEFT JOIN public.profiles p ON p.user_id = al.user_id
  WHERE al.entity_type = 'failed_messages'
    AND (p_action IS NULL OR p_action = 'all' OR al.action = p_action)
  ORDER BY al.created_at DESC
  LIMIT COALESCE(p_limit, 30)
  OFFSET COALESCE(p_offset, 0);
END;
$$;


--
-- Name: rpc_dlq_log_item_action(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_dlq_log_item_action(p_item_id uuid, p_action text, p_reason text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    INSERT INTO public.dlq_audit_log (item_id, action, reason, performed_by)
    VALUES (p_item_id, p_action, p_reason, auth.uid());
    
    IF p_action = 'delete' THEN
        DELETE FROM public.failed_messages WHERE id = p_item_id;
    END IF;
    
    RETURN TRUE;
END;
$$;


--
-- Name: rpc_dlq_log_item_action(uuid, text, text, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_dlq_log_item_action(p_item_id uuid DEFAULT NULL::uuid, p_action text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_ids uuid[] DEFAULT NULL::uuid[]) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    IF p_ids IS NOT NULL THEN
        INSERT INTO public.dlq_audit_log (item_id, action, reason, performed_by)
        SELECT id, p_action, p_reason, auth.uid() FROM unnest(p_ids) as id;
    ELSIF p_item_id IS NOT NULL THEN
        INSERT INTO public.dlq_audit_log (item_id, action, reason, performed_by)
        VALUES (p_item_id, p_action, p_reason, auth.uid());
    END IF;
    RETURN TRUE;
END;
$$;


--
-- Name: rpc_dlq_retry_now(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_dlq_retry_now(p_item_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE public.failed_messages 
    SET next_retry_at = now(), status = 'pending' 
    WHERE id = p_item_id;
    RETURN TRUE;
END;
$$;


--
-- Name: rpc_dlq_retry_now(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_dlq_retry_now(p_item_id uuid DEFAULT NULL::uuid, p_id uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE public.failed_messages SET next_retry_at = now(), status = 'pending' WHERE id = COALESCE(p_item_id, p_id);
    RETURN TRUE;
END;
$$;


--
-- Name: rpc_instance_auth_event_summary(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_instance_auth_event_summary(p_instance text) RETURNS TABLE(event_type text, total bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT instance_auth_events.event_type, count(*) as total
    FROM public.instance_auth_events
    WHERE (p_instance IS NULL OR instance_name = p_instance)
    GROUP BY 1;
END;
$$;


--
-- Name: rpc_instance_auth_event_trend(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_instance_auth_event_trend(p_instance text, p_hours integer DEFAULT 24) RETURNS TABLE(bucket timestamp with time zone, instance_name text, success_count bigint, failure_count bigint, invalid_signature bigint, auth_401 bigint, auth_403 bigint, total bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        date_trunc('hour', created_at) as bucket,
        COALESCE(instance_auth_events.instance_name, 'all'),
        count(*) FILTER (WHERE event_type = 'auth.success') as success_count,
        count(*) FILTER (WHERE event_type = 'auth.failure') as failure_count,
        count(*) FILTER (WHERE event_type = 'auth.invalid_signature') as invalid_signature,
        count(*) FILTER (WHERE event_type = 'auth.401') as auth_401,
        count(*) FILTER (WHERE event_type = 'auth.403') as auth_403,
        count(*) as total
    FROM public.instance_auth_events
    WHERE (p_instance IS NULL OR instance_auth_events.instance_name = p_instance)
      AND created_at > now() - (p_hours || ' hours')::interval
    GROUP BY 1, 2 ORDER BY 1;
END;
$$;


--
-- Name: dispatch_error_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dispatch_error_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_name text,
    error_type text,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: rpc_list_dispatch_error_logs(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_list_dispatch_error_logs(p_limit integer DEFAULT 100) RETURNS SETOF public.dispatch_error_logs
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN QUERY SELECT * FROM public.dispatch_error_logs ORDER BY created_at DESC LIMIT p_limit;
END;
$$;


--
-- Name: failed_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.failed_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_name text,
    message_id text,
    error_message text,
    retry_count integer DEFAULT 0,
    next_retry_at timestamp with time zone,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: rpc_list_failed_messages(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_list_failed_messages(p_limit integer DEFAULT 100) RETURNS SETOF public.failed_messages
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.failed_messages ORDER BY created_at DESC LIMIT p_limit;
END;
$$;


--
-- Name: rpc_list_failed_messages(text[], text, text, timestamp with time zone, timestamp with time zone, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_list_failed_messages(p_status text[], p_instance text, p_search text, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer, p_offset integer) RETURNS TABLE(id uuid, instance_name text, message_id text, error_message text, retry_count integer, next_retry_at timestamp with time zone, status text, created_at timestamp with time zone, total_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')) THEN
    PERFORM public.log_rls_denied('failed_messages', 'admin|supervisor',
      jsonb_build_object('rpc', 'rpc_list_failed_messages', 'filters',
        jsonb_build_object('status', p_status, 'instance', p_instance, 'search', p_search)));
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT fm.id, fm.instance_name, fm.message_id, fm.error_message,
         fm.retry_count, fm.next_retry_at, fm.status, fm.created_at,
         COUNT(*) OVER()::bigint AS total_count
  FROM public.failed_messages fm
  WHERE (p_status IS NULL OR fm.status = ANY(p_status))
    AND (p_instance IS NULL OR fm.instance_name = p_instance)
    AND (p_search IS NULL OR fm.error_message ILIKE '%'||p_search||'%' OR fm.message_id ILIKE '%'||p_search||'%')
    AND (p_from IS NULL OR fm.created_at >= p_from)
    AND (p_to IS NULL OR fm.created_at <= p_to)
  ORDER BY fm.created_at DESC
  LIMIT COALESCE(p_limit, 50)
  OFFSET COALESCE(p_offset, 0);
END;
$$;


--
-- Name: rpc_list_transfers_paginated(text, integer, timestamp with time zone, timestamp with time zone, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_list_transfers_paginated(p_status text DEFAULT NULL::text, p_priority integer DEFAULT NULL::integer, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS TABLE(id uuid, source_instance text, target_instance text, remote_jid text, contact_name text, status text, priority integer, transfer_type text, category text, reason text, from_agent_id uuid, to_agent_id uuid, sla_deadline timestamp with time zone, created_at timestamp with time zone, accepted_at timestamp with time zone, completed_at timestamp with time zone, total_count bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT t.id, t.source_instance, t.target_instance, t.remote_jid, t.contact_name,
         t.status, t.priority, t.transfer_type, t.category, t.reason,
         t.from_agent_id, t.to_agent_id, t.sla_deadline,
         t.created_at, t.accepted_at, t.completed_at,
         COUNT(*) OVER()::bigint AS total_count
  FROM public.conversation_transfers t
  WHERE (p_status IS NULL OR t.status = p_status)
    AND (p_priority IS NULL OR t.priority = p_priority)
    AND (p_from IS NULL OR t.created_at >= p_from)
    AND (p_to IS NULL OR t.created_at <= p_to)
  ORDER BY t.created_at DESC
  LIMIT COALESCE(p_limit, 50)
  OFFSET COALESCE(p_offset, 0);
$$;


--
-- Name: rpc_migrate_whatsapp_integration(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_migrate_whatsapp_integration() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN jsonb_build_object('success', true, 'message', 'Migration stub executed');
END;
$$;


--
-- Name: rpc_upsert_contact(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_upsert_contact(p_remote_jid text, p_instance text, p_push_name text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.contacts (remote_jid, push_name, instance, updated_at)
    VALUES (p_remote_jid, p_push_name, p_instance, now())
    ON CONFLICT (remote_jid) DO UPDATE 
    SET push_name = EXCLUDED.push_name,
        instance = EXCLUDED.instance,
        updated_at = now()
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$;


--
-- Name: sanitize_reset_request(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sanitize_reset_request() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Authenticated users cannot set their own tokens - only server/service role can
  IF auth.uid() IS NOT NULL THEN
    NEW.reset_token := NULL;
    NEW.token_expires_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: search_contacts(text, text, text, text, text, timestamp with time zone, text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_contacts(search_term text DEFAULT ''::text, contact_type_filter text DEFAULT NULL::text, company_filter text DEFAULT NULL::text, job_title_filter text DEFAULT NULL::text, tag_filter text DEFAULT NULL::text, date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, sort_field text DEFAULT 'name'::text, sort_direction text DEFAULT 'asc'::text, page_size integer DEFAULT 50, page_offset integer DEFAULT 0) RETURNS TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text, email text, avatar_url text, tags text[], notes text, contact_type text, created_at timestamp with time zone, updated_at timestamp with time zone, total_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_total bigint;
  v_search text;
BEGIN
  v_search := COALESCE(NULLIF(TRIM(search_term), ''), NULL);
  
  -- Get total count first
  SELECT COUNT(*) INTO v_total
  FROM public.contacts c
  WHERE
    (v_search IS NULL OR (
      c.name ILIKE '%' || v_search || '%' OR
      c.nickname ILIKE '%' || v_search || '%' OR
      c.surname ILIKE '%' || v_search || '%' OR
      c.phone ILIKE '%' || v_search || '%' OR
      c.email ILIKE '%' || v_search || '%' OR
      c.company ILIKE '%' || v_search || '%' OR
      c.job_title ILIKE '%' || v_search || '%'
    ))
    AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
    AND (company_filter IS NULL OR c.company = company_filter)
    AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
    AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
    AND (date_from IS NULL OR c.created_at >= date_from);

  RETURN QUERY
  SELECT
    c.id, c.name, c.nickname, c.surname, c.job_title, c.company,
    c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type,
    c.created_at, c.updated_at,
    v_total AS total_count
  FROM public.contacts c
  WHERE
    (v_search IS NULL OR (
      c.name ILIKE '%' || v_search || '%' OR
      c.nickname ILIKE '%' || v_search || '%' OR
      c.surname ILIKE '%' || v_search || '%' OR
      c.phone ILIKE '%' || v_search || '%' OR
      c.email ILIKE '%' || v_search || '%' OR
      c.company ILIKE '%' || v_search || '%' OR
      c.job_title ILIKE '%' || v_search || '%'
    ))
    AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
    AND (company_filter IS NULL OR c.company = company_filter)
    AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
    AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
    AND (date_from IS NULL OR c.created_at >= date_from)
  ORDER BY
    CASE WHEN sort_field = 'name' AND sort_direction = 'asc' THEN c.name END ASC,
    CASE WHEN sort_field = 'name' AND sort_direction = 'desc' THEN c.name END DESC,
    CASE WHEN sort_field = 'created_at' AND sort_direction = 'asc' THEN c.created_at END ASC,
    CASE WHEN sort_field = 'created_at' AND sort_direction = 'desc' THEN c.created_at END DESC,
    CASE WHEN sort_field = 'updated_at' AND sort_direction = 'desc' THEN c.updated_at END DESC,
    c.name ASC
  LIMIT page_size
  OFFSET page_offset;
END;
$$;


--
-- Name: search_knowledge_base(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_knowledge_base(search_query text, max_results integer DEFAULT 5) RETURNS TABLE(id uuid, title text, content text, category text, tags text[], rank real)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        kba.id,
        kba.title,
        kba.content,
        kba.category,
        kba.tags,
        ts_rank_cd(to_tsvector('portuguese', kba.title || ' ' || kba.content), plainto_tsquery('portuguese', search_query)) as rank
    FROM public.knowledge_base_articles kba
    WHERE to_tsvector('portuguese', kba.title || ' ' || kba.content) @@ plainto_tsquery('portuguese', search_query)
    ORDER BY rank DESC
    LIMIT max_results;
END;
$$;


--
-- Name: skill_based_assign(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.skill_based_assign(p_queue_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_agent_id UUID;
BEGIN
  SELECT qm.profile_id INTO v_agent_id
  FROM public.queue_members qm
  JOIN public.profiles p ON p.id = qm.profile_id
  WHERE qm.queue_id = p_queue_id
    AND qm.is_active = true
    AND p.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.queue_skill_requirements qsr
      WHERE qsr.queue_id = p_queue_id
      AND NOT EXISTS (
        SELECT 1 FROM public.agent_skills ags
        WHERE ags.profile_id = qm.profile_id
        AND ags.skill_name = qsr.skill_name
        AND ags.skill_level >= qsr.min_level
      )
    )
  ORDER BY (
    SELECT COUNT(*) FROM public.contacts c 
    WHERE c.assigned_to = qm.profile_id
  ) ASC
  LIMIT 1;
  
  IF v_agent_id IS NULL THEN
    SELECT qm.profile_id INTO v_agent_id
    FROM public.queue_members qm
    JOIN public.profiles p ON p.id = qm.profile_id
    WHERE qm.queue_id = p_queue_id
      AND qm.is_active = true
      AND p.is_active = true
    ORDER BY (
      SELECT COUNT(*) FROM public.contacts c 
      WHERE c.assigned_to = qm.profile_id
    ) ASC
    LIMIT 1;
  END IF;
  
  RETURN v_agent_id;
END;
$$;


--
-- Name: trg_fn_set_transfer_ticket(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_set_transfer_ticket() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    IF NEW.ticket_number IS NULL THEN
        NEW.ticket_number := generate_transfer_ticket();
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: unpause_instance(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unpause_instance(p_instance text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.instance_processing_pauses
    SET paused_until = now()
    WHERE instance_name = p_instance AND paused_until > now();
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;


--
-- Name: update_agent_level(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_agent_level() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.level := calculate_level(NEW.xp);
  RETURN NEW;
END;
$$;


--
-- Name: update_device_last_seen(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_device_last_seen() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    NEW.last_seen_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: update_global_settings_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_global_settings_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_own_profile(text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_own_profile(p_display_name text DEFAULT NULL::text, p_avatar_url text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_signature text DEFAULT NULL::text, p_birthday text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE profiles SET
    display_name = COALESCE(p_display_name, display_name),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    phone = COALESCE(p_phone, phone),
    email = COALESCE(p_email, email),
    signature = COALESCE(p_signature, signature),
    birthday = COALESCE(p_birthday, birthday),
    updated_at = now()
  WHERE id = v_profile_id;

  RETURN TRUE;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: user_has_permission(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_has_permission(_user_id uuid, _permission_name text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = _user_id AND p.name = _permission_name
  )
$$;


--
-- Name: validate_reset_token(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_reset_token(p_token text) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id uuid;
  v_hashed text;
BEGIN
  v_hashed := encode(extensions.digest(p_token::bytea, 'sha256'), 'hex');
  
  SELECT user_id INTO v_user_id
  FROM public.password_reset_requests
  WHERE reset_token = v_hashed
    AND status = 'pending'
    AND token_expires_at > now()
  LIMIT 1;
  
  RETURN v_user_id;
END;
$$;


--
-- Name: agent_achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_achievements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    achievement_type text NOT NULL,
    achievement_name text NOT NULL,
    achievement_description text,
    xp_earned integer DEFAULT 0 NOT NULL,
    earned_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    skill_name text NOT NULL,
    skill_level integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_stats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    xp integer DEFAULT 0 NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    achievements_count integer DEFAULT 0 NOT NULL,
    messages_sent integer DEFAULT 0 NOT NULL,
    messages_received integer DEFAULT 0 NOT NULL,
    conversations_resolved integer DEFAULT 0 NOT NULL,
    avg_response_time_seconds integer DEFAULT 0,
    customer_satisfaction_score numeric(3,2) DEFAULT 0,
    current_streak integer DEFAULT 0 NOT NULL,
    best_streak integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_visibility_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_visibility_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid NOT NULL,
    can_see_agent_id uuid NOT NULL,
    granted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_conversation_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_conversation_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    tag_name text NOT NULL,
    confidence numeric DEFAULT 0.0,
    source text DEFAULT 'ai'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: ai_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    provider_type public.ai_provider_type DEFAULT 'lovable_ai'::public.ai_provider_type NOT NULL,
    api_endpoint text,
    api_key_secret_name text,
    model text,
    system_prompt text,
    config jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    use_for text[] DEFAULT ARRAY['copilot'::text] NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_usage_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_usage_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    profile_id uuid,
    function_name text NOT NULL,
    model text,
    input_tokens integer DEFAULT 0,
    output_tokens integer DEFAULT 0,
    total_tokens integer GENERATED ALWAYS AS ((input_tokens + output_tokens)) STORED,
    duration_ms integer,
    status text DEFAULT 'success'::text NOT NULL,
    error_message text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: allowed_countries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.allowed_countries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_code text NOT NULL,
    country_name text NOT NULL,
    added_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audio_meme_favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audio_meme_favorites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    meme_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audio_memes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audio_memes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    audio_url text NOT NULL,
    category text DEFAULT 'outros'::text NOT NULL,
    duration_seconds numeric(6,2),
    is_favorite boolean DEFAULT false NOT NULL,
    use_count integer DEFAULT 0 NOT NULL,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action text NOT NULL,
    entity_type text,
    entity_id uuid,
    details jsonb DEFAULT '{}'::jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.audit_logs REPLICA IDENTITY FULL;


--
-- Name: auto_close_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auto_close_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inactivity_hours integer DEFAULT 24 NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    close_message text DEFAULT 'Conversa encerrada automaticamente por inatividade.'::text,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: automations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text,
    is_active boolean DEFAULT true NOT NULL,
    trigger_type text DEFAULT 'new_message'::text NOT NULL,
    trigger_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    actions jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by uuid,
    last_triggered_at timestamp with time zone,
    trigger_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: away_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.away_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    whatsapp_connection_id uuid NOT NULL,
    content text DEFAULT 'Estamos fora do horário de atendimento. Retornaremos em breve!'::text,
    is_enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blocked_countries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocked_countries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_code text NOT NULL,
    country_name text NOT NULL,
    reason text,
    blocked_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blocked_ips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocked_ips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ip_address text NOT NULL,
    reason text NOT NULL,
    blocked_by uuid,
    blocked_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    is_permanent boolean DEFAULT false,
    request_count integer DEFAULT 0,
    last_attempt_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: business_hours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_hours (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    whatsapp_connection_id uuid NOT NULL,
    day_of_week integer NOT NULL,
    is_open boolean DEFAULT true,
    open_time time without time zone DEFAULT '09:00:00'::time without time zone,
    close_time time without time zone DEFAULT '18:00:00'::time without time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT business_hours_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))
);


--
-- Name: calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid,
    agent_id uuid,
    whatsapp_connection_id uuid,
    direction text NOT NULL,
    status text DEFAULT 'ringing'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    answered_at timestamp with time zone,
    ended_at timestamp with time zone,
    duration_seconds integer,
    recording_url text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT calls_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))),
    CONSTRAINT calls_status_check CHECK ((status = ANY (ARRAY['ringing'::text, 'answered'::text, 'ended'::text, 'missed'::text, 'busy'::text, 'failed'::text])))
);


--
-- Name: campaign_ab_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_ab_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    variant_name text DEFAULT 'A'::text NOT NULL,
    message_content text NOT NULL,
    media_url text,
    send_count integer DEFAULT 0,
    delivered_count integer DEFAULT 0,
    read_count integer DEFAULT 0,
    response_count integer DEFAULT 0,
    is_winner boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: campaign_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    sent_at timestamp with time zone,
    error_message text,
    external_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT campaign_contacts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text])))
);


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    message_content text NOT NULL,
    message_type text DEFAULT 'text'::text NOT NULL,
    media_url text,
    status text DEFAULT 'draft'::text NOT NULL,
    scheduled_at timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    total_contacts integer DEFAULT 0 NOT NULL,
    sent_count integer DEFAULT 0 NOT NULL,
    delivered_count integer DEFAULT 0 NOT NULL,
    read_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    whatsapp_connection_id uuid,
    created_by uuid,
    target_type text DEFAULT 'all'::text NOT NULL,
    target_filter jsonb DEFAULT '{}'::jsonb,
    send_interval_seconds integer DEFAULT 5,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'sending'::text, 'completed'::text, 'cancelled'::text, 'paused'::text]))),
    CONSTRAINT campaigns_target_type_check CHECK ((target_type = ANY (ARRAY['all'::text, 'tag'::text, 'queue'::text, 'custom'::text])))
);


--
-- Name: channel_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_type public.channel_type NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'disconnected'::text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb,
    credentials jsonb DEFAULT '{}'::jsonb,
    webhook_url text,
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    whatsapp_connection_id uuid,
    external_account_id text,
    external_page_id text
);


--
-- Name: channel_connections_safe; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.channel_connections_safe WITH (security_invoker='true') AS
 SELECT id,
    channel_type,
    name,
    status,
    is_active,
    external_account_id,
    external_page_id,
    webhook_url,
    whatsapp_connection_id,
    created_at,
    updated_at,
    created_by
   FROM public.channel_connections;


--
-- Name: channel_routing_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_routing_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_type public.channel_type NOT NULL,
    channel_connection_id uuid,
    queue_id uuid,
    priority integer DEFAULT 0,
    conditions jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chatbot_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_executions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    flow_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    current_node_id text,
    status text DEFAULT 'running'::text NOT NULL,
    variables jsonb DEFAULT '{}'::jsonb,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chatbot_executions_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'paused'::text, 'cancelled'::text])))
);


--
-- Name: chatbot_flows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_flows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT false,
    trigger_type text DEFAULT 'keyword'::text NOT NULL,
    trigger_value text,
    nodes jsonb DEFAULT '[]'::jsonb NOT NULL,
    edges jsonb DEFAULT '[]'::jsonb NOT NULL,
    variables jsonb DEFAULT '{}'::jsonb,
    whatsapp_connection_id uuid,
    created_by uuid,
    execution_count integer DEFAULT 0,
    last_executed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chatbot_flows_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['keyword'::text, 'first_message'::text, 'menu'::text, 'webhook'::text, 'schedule'::text])))
);


--
-- Name: client_wallet_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_wallet_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    agent_id uuid NOT NULL,
    whatsapp_connection_id uuid,
    priority integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: connection_alert_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connection_alert_preferences (
    user_id uuid NOT NULL,
    push_enabled boolean DEFAULT true,
    email_enabled boolean DEFAULT true,
    alert_on_degraded boolean DEFAULT true,
    alert_on_disconnected boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: connection_health_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connection_health_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid NOT NULL,
    instance_id text NOT NULL,
    status text DEFAULT 'unknown'::text NOT NULL,
    response_time_ms integer,
    error_message text,
    checked_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_custom_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_custom_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    field_name text NOT NULL,
    field_value text,
    field_type text DEFAULT 'text'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    author_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_purchases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    amount numeric(12,2),
    currency text DEFAULT 'BRL'::text,
    status text DEFAULT 'pending'::text,
    purchase_type text DEFAULT 'purchase'::text,
    deal_id uuid,
    created_by uuid,
    purchased_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    email text,
    avatar_url text,
    assigned_to uuid,
    whatsapp_connection_id uuid,
    tags text[] DEFAULT '{}'::text[],
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    nickname text,
    surname text,
    job_title text,
    company text,
    queue_id uuid,
    contact_type text DEFAULT 'cliente'::text,
    ai_priority text DEFAULT 'normal'::text,
    ai_sentiment text DEFAULT 'neutral'::text,
    channel_type text DEFAULT 'whatsapp'::text,
    channel_connection_id uuid,
    group_category text,
    lead_score integer DEFAULT 0,
    risk_score integer DEFAULT 0,
    lead_origin text,
    consent_status text DEFAULT 'unknown'::text
);


--
-- Name: conversation_analyses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_analyses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    analyzed_by uuid,
    summary text NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    key_points text[] DEFAULT '{}'::text[],
    next_steps text[] DEFAULT '{}'::text[],
    sentiment text DEFAULT 'neutro'::text NOT NULL,
    sentiment_score integer DEFAULT 50,
    topics text[] DEFAULT '{}'::text[],
    urgency text DEFAULT 'media'::text,
    customer_satisfaction integer DEFAULT 3,
    message_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    department text DEFAULT 'outros'::text,
    relationship_type text
);


--
-- Name: conversation_closures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_closures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    closed_by uuid,
    close_reason text NOT NULL,
    outcome text,
    classification text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversation_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    event_type text NOT NULL,
    from_agent_id uuid,
    to_agent_id uuid,
    from_queue_id uuid,
    to_queue_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    performed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversation_memory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_memory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    facts jsonb DEFAULT '[]'::jsonb,
    objections_handled jsonb DEFAULT '[]'::jsonb,
    promises_made jsonb DEFAULT '[]'::jsonb,
    pending_items jsonb DEFAULT '[]'::jsonb,
    commercial_summary text,
    cumulative_summary text,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversation_sla; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_sla (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid,
    sla_configuration_id uuid,
    first_message_at timestamp with time zone DEFAULT now() NOT NULL,
    first_response_at timestamp with time zone,
    resolved_at timestamp with time zone,
    first_response_breached boolean DEFAULT false,
    resolution_breached boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversation_snoozes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_snoozes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    snoozed_by uuid NOT NULL,
    snooze_until timestamp with time zone NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversation_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid,
    title text NOT NULL,
    description text,
    assigned_to uuid,
    created_by uuid,
    due_date timestamp with time zone,
    priority text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversation_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_transfers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_conversation_id uuid NOT NULL,
    from_agent_id uuid,
    to_agent_id uuid,
    from_queue_id uuid,
    to_queue_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    transfer_type text DEFAULT 'direct'::text NOT NULL,
    priority integer DEFAULT 2,
    sla_deadline timestamp with time zone,
    context_summary text,
    return_reason text,
    ticket_number text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    accepted_at timestamp with time zone,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now(),
    source_instance text,
    source_message_id uuid,
    source_operator text,
    target_instance text,
    target_conversation_id uuid,
    target_operator text,
    contact_id uuid,
    remote_jid text,
    contact_name text,
    category text,
    reason text,
    context_messages jsonb DEFAULT '[]'::jsonb,
    tags text[] DEFAULT '{}'::text[],
    expires_at timestamp with time zone,
    resolution_notes text,
    resolution_type text,
    CONSTRAINT conversation_transfers_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'completed'::text, 'returned'::text, 'canceled'::text]))),
    CONSTRAINT conversation_transfers_transfer_type_check CHECK ((transfer_type = ANY (ARRAY['direct'::text, 'queue'::text, 'internal'::text])))
);


--
-- Name: crisis_room_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crisis_room_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    severity text DEFAULT 'warning'::text NOT NULL,
    metric_name text NOT NULL,
    metric_value numeric,
    threshold numeric,
    message text NOT NULL,
    is_active boolean DEFAULT true,
    acknowledged_by uuid,
    acknowledged_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: csat_auto_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.csat_auto_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    is_enabled boolean DEFAULT false,
    delay_minutes integer DEFAULT 5,
    message_template text DEFAULT 'Olá {name}! Como foi seu atendimento? Avalie de 1 a 5 ⭐'::text,
    whatsapp_connection_id uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: csat_surveys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.csat_surveys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    rating integer NOT NULL,
    feedback text,
    conversation_resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: custom_emojis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_emojis (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    image_url text NOT NULL,
    category text DEFAULT 'outros'::text,
    is_favorite boolean DEFAULT false,
    use_count integer DEFAULT 0,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: deal_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid NOT NULL,
    activity_type text NOT NULL,
    description text,
    performed_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: department_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.department_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    department_id uuid,
    email text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    status text DEFAULT 'pending'::text,
    invited_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    code text,
    expires_at timestamp with time zone
);


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    whatsapp_mode text DEFAULT 'standard'::text,
    whatsapp_api_key text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    whatsapp_instance_id text,
    is_active boolean DEFAULT true
);


--
-- Name: departments_safe; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.departments_safe WITH (security_invoker='on') AS
 SELECT id,
    name,
    description,
    whatsapp_mode,
    whatsapp_instance_id,
    is_active,
    created_at,
    updated_at,
    (whatsapp_api_key IS NOT NULL) AS has_whatsapp_api_key
   FROM public.departments;


--
-- Name: email_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email_address text NOT NULL,
    display_name text,
    picture_url text,
    token_expires_at timestamp with time zone,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_labels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gmail_account_id uuid NOT NULL,
    gmail_label_id text NOT NULL,
    name text NOT NULL,
    label_type text DEFAULT 'user'::text NOT NULL,
    color text,
    message_count integer DEFAULT 0 NOT NULL,
    unread_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    gmail_message_id text NOT NULL,
    gmail_account_id uuid NOT NULL,
    from_address text DEFAULT ''::text NOT NULL,
    from_name text,
    to_addresses text[] DEFAULT '{}'::text[] NOT NULL,
    cc_addresses text[] DEFAULT '{}'::text[] NOT NULL,
    bcc_addresses text[] DEFAULT '{}'::text[] NOT NULL,
    reply_to_address text,
    subject text DEFAULT ''::text NOT NULL,
    body_text text DEFAULT ''::text NOT NULL,
    body_html text DEFAULT ''::text NOT NULL,
    snippet text DEFAULT ''::text NOT NULL,
    label_ids text[] DEFAULT '{}'::text[] NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    is_starred boolean DEFAULT false NOT NULL,
    has_attachments boolean DEFAULT false NOT NULL,
    in_reply_to text,
    references_header text,
    internal_date timestamp with time zone DEFAULT now() NOT NULL,
    direction text DEFAULT 'inbound'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gmail_account_id uuid NOT NULL,
    gmail_thread_id text NOT NULL,
    contact_id uuid,
    subject text DEFAULT ''::text NOT NULL,
    snippet text DEFAULT ''::text NOT NULL,
    label_ids text[] DEFAULT '{}'::text[] NOT NULL,
    message_count integer DEFAULT 0 NOT NULL,
    is_unread boolean DEFAULT true NOT NULL,
    is_starred boolean DEFAULT false NOT NULL,
    is_important boolean DEFAULT false NOT NULL,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_to uuid,
    status text DEFAULT 'open'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: entity_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    version_number integer NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    changed_by uuid,
    change_summary text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: evolution_health_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evolution_health_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid,
    instance_name text,
    status text,
    response_time_ms integer,
    error_count integer DEFAULT 0,
    success_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    error_message text,
    online_instances integer DEFAULT 0,
    total_instances integer DEFAULT 0,
    performed_at timestamp with time zone DEFAULT now()
);


--
-- Name: evolution_instance_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evolution_instance_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid,
    instance_name text NOT NULL,
    instance_token text,
    webhook_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    api_url text,
    api_key text,
    is_active boolean DEFAULT true,
    health_status text DEFAULT 'unknown'::text,
    last_health_check timestamp with time zone
);


--
-- Name: evolution_retry_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evolution_retry_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action text NOT NULL,
    method text,
    instance_name text,
    idempotency_key text,
    attempt_count integer DEFAULT 1,
    final_status text,
    final_http_status integer,
    retry_reasons jsonb DEFAULT '[]'::jsonb,
    total_duration_ms integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: favorite_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favorite_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: followup_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.followup_executions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sequence_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    current_step integer DEFAULT 0,
    status text DEFAULT 'pending'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now(),
    next_step_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: followup_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.followup_sequences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    trigger_event text DEFAULT 'ticket_resolved'::text NOT NULL,
    is_active boolean DEFAULT true,
    whatsapp_connection_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: followup_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.followup_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sequence_id uuid NOT NULL,
    step_order integer DEFAULT 1 NOT NULL,
    delay_hours integer DEFAULT 24 NOT NULL,
    message_template text NOT NULL,
    message_type text DEFAULT 'text'::text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: geo_blocking_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.geo_blocking_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mode text DEFAULT 'disabled'::text NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT geo_blocking_settings_mode_check CHECK ((mode = ANY (ARRAY['disabled'::text, 'whitelist'::text, 'blacklist'::text])))
);


--
-- Name: global_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.global_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value text,
    description text,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gmail_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gmail_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email_address text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sync_status text DEFAULT 'pending'::text NOT NULL,
    last_sync_at timestamp with time zone,
    last_error text,
    token_expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    access_token_encrypted bytea,
    refresh_token_encrypted bytea
);


--
-- Name: gmail_accounts_safe; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.gmail_accounts_safe WITH (security_invoker='true') AS
 SELECT id,
    user_id,
    email_address,
    is_active,
    sync_status,
    last_sync_at,
    last_error,
    token_expires_at,
    created_at,
    updated_at
   FROM public.gmail_accounts;


--
-- Name: goals_configurations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goals_configurations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid,
    queue_id uuid,
    goal_type text NOT NULL,
    daily_target integer DEFAULT 0 NOT NULL,
    weekly_target integer DEFAULT 0 NOT NULL,
    monthly_target integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT goal_owner_check CHECK ((((profile_id IS NOT NULL) AND (queue_id IS NULL)) OR ((profile_id IS NULL) AND (queue_id IS NOT NULL))))
);


--
-- Name: inbox_custom_scopes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbox_custom_scopes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    label text NOT NULL,
    description text,
    icon text,
    filter_criteria jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instance_auth_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instance_auth_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_name text NOT NULL,
    event_type text NOT NULL,
    status_code integer,
    meta jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: instance_processing_pauses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instance_processing_pauses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_name text NOT NULL,
    paused_until timestamp with time zone NOT NULL,
    reason text,
    trigger_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: instance_registry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instance_registry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_name character varying NOT NULL,
    display_name character varying,
    owner_id uuid,
    status text DEFAULT 'inactive'::text,
    connection_status text DEFAULT 'disconnected'::text,
    api_key text,
    api_url text,
    webhook_url text,
    webhook_enabled boolean DEFAULT true,
    phone_number character varying,
    profile_picture text,
    is_master boolean DEFAULT false,
    proxy_host text,
    proxy_port text,
    proxy_user text,
    proxy_pass text,
    settings jsonb DEFAULT '{}'::jsonb,
    last_connected_at timestamp with time zone,
    message_count_sent integer DEFAULT 0,
    message_count_received integer DEFAULT 0,
    error_logs text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    slot_name character varying,
    department character varying,
    usage_type character varying,
    operator_name character varying,
    operator_email character varying,
    operator_since timestamp with time zone,
    operator_phone character varying,
    is_active boolean DEFAULT true,
    max_concurrent_chats integer DEFAULT 50,
    sla_first_response_minutes integer DEFAULT 30,
    sla_resolution_hours integer DEFAULT 24,
    auto_reply_enabled boolean DEFAULT false,
    auto_reply_message text,
    business_hours_enabled boolean DEFAULT false,
    bitrix_integration jsonb DEFAULT '{}'::jsonb,
    n8n_workflows jsonb DEFAULT '{}'::jsonb,
    config jsonb DEFAULT '{}'::jsonb,
    notes text,
    CONSTRAINT check_department CHECK (((department)::text = ANY ((ARRAY['comercial'::character varying, 'financeiro'::character varying, 'compras'::character varying, 'logistica'::character varying, 'artes'::character varying, 'gravacao'::character varying, 'marketing'::character varying, 'ti'::character varying, 'sistema'::character varying])::text[]))),
    CONSTRAINT check_usage_type CHECK (((usage_type)::text = ANY ((ARRAY['individual'::character varying, 'shared'::character varying])::text[])))
);


--
-- Name: ip_whitelist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ip_whitelist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ip_address text NOT NULL,
    description text,
    added_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_base_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_base_articles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    category text DEFAULT 'general'::text,
    tags text[] DEFAULT '{}'::text[],
    is_published boolean DEFAULT true,
    embedding_status text DEFAULT 'pending'::text,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    search_vector tsvector GENERATED ALWAYS AS (((setweight(to_tsvector('portuguese'::regconfig, COALESCE(title, ''::text)), 'A'::"char") || setweight(to_tsvector('portuguese'::regconfig, COALESCE(category, ''::text)), 'B'::"char")) || setweight(to_tsvector('portuguese'::regconfig, COALESCE(content, ''::text)), 'C'::"char"))) STORED
);


--
-- Name: knowledge_base_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_base_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    article_id uuid,
    file_name text NOT NULL,
    file_url text NOT NULL,
    file_type text,
    file_size integer,
    processing_status text DEFAULT 'pending'::text,
    extracted_text text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: login_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    ip_address text,
    user_agent text,
    attempt_count integer DEFAULT 1 NOT NULL,
    last_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    locked_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: message_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    user_id uuid,
    contact_id uuid,
    emoji text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reaction_author_check CHECK (((user_id IS NOT NULL) OR (contact_id IS NOT NULL)))
);


--
-- Name: message_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    shortcut text,
    category text DEFAULT 'general'::text,
    is_global boolean DEFAULT false,
    use_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid,
    whatsapp_connection_id uuid,
    sender text NOT NULL,
    content text NOT NULL,
    message_type text DEFAULT 'text'::text NOT NULL,
    media_url text,
    is_read boolean DEFAULT false,
    agent_id uuid,
    external_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    transcription text,
    transcription_status text DEFAULT 'pending'::text,
    status text DEFAULT 'sent'::text,
    status_updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean DEFAULT false,
    channel_type text DEFAULT 'whatsapp'::text,
    channel_connection_id uuid,
    is_edited boolean DEFAULT false NOT NULL,
    media_meta jsonb,
    media_type text,
    media_mimetype text,
    link_preview jsonb,
    reply_to_id uuid,
    deleted_at timestamp with time zone,
    CONSTRAINT messages_message_type_check CHECK ((message_type = ANY (ARRAY['text'::text, 'image'::text, 'audio'::text, 'video'::text, 'document'::text, 'sticker'::text, 'location'::text, 'contact'::text, 'poll'::text, 'button'::text, 'list'::text, 'reaction'::text, 'vcard'::text, 'ptt'::text, 'link'::text, 'template'::text, 'interactive'::text, 'order'::text, 'product'::text, 'catalog'::text]))),
    CONSTRAINT messages_sender_check CHECK ((sender = ANY (ARRAY['agent'::text, 'contact'::text])))
);

ALTER TABLE ONLY public.messages REPLICA IDENTITY FULL;


--
-- Name: meta_capi_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_capi_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_name text NOT NULL,
    event_time timestamp with time zone DEFAULT now(),
    contact_id uuid,
    pixel_id text,
    event_source_url text,
    action_source text DEFAULT 'chat'::text,
    custom_data jsonb DEFAULT '{}'::jsonb,
    sent_to_meta boolean DEFAULT false,
    meta_response jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: mfa_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mfa_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    factor_id text NOT NULL,
    verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:05:00'::interval) NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    type text DEFAULT 'info'::text NOT NULL,
    is_read boolean DEFAULT false,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone
);


--
-- Name: nps_surveys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nps_surveys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    agent_id uuid,
    score integer NOT NULL,
    feedback text,
    survey_type text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT nps_surveys_score_check CHECK (((score >= 0) AND (score <= 10))),
    CONSTRAINT nps_surveys_survey_type_check CHECK ((survey_type = ANY (ARRAY['periodic'::text, 'post_resolution'::text, 'manual'::text])))
);


--
-- Name: number_reputation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.number_reputation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    whatsapp_connection_id uuid NOT NULL,
    health_score integer DEFAULT 100 NOT NULL,
    messages_sent_today integer DEFAULT 0 NOT NULL,
    failures_today integer DEFAULT 0 NOT NULL,
    complaints_count integer DEFAULT 0 NOT NULL,
    warmup_status text DEFAULT 'none'::text NOT NULL,
    warmup_day integer DEFAULT 0,
    daily_limit integer DEFAULT 200,
    last_reset_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: passkey_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.passkey_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    credential_id text NOT NULL,
    public_key text NOT NULL,
    counter bigint DEFAULT 0 NOT NULL,
    device_type text,
    backed_up boolean DEFAULT false,
    transports text[],
    friendly_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);


--
-- Name: password_reset_requests_safe; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.password_reset_requests_safe WITH (security_invoker='true') AS
 SELECT id,
    user_id,
    email,
    reason,
    status,
    reviewed_by,
    reviewed_at,
    rejection_reason,
    token_expires_at,
    ip_address,
    user_agent,
    created_at,
    updated_at
   FROM public.password_reset_requests;


--
-- Name: payment_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    amount numeric(12,2) NOT NULL,
    currency text DEFAULT 'BRL'::text,
    status text DEFAULT 'active'::text,
    payment_method text DEFAULT 'pix'::text,
    payment_url text,
    external_id text,
    contact_id uuid,
    deal_id uuid,
    created_by uuid,
    paid_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: performance_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.performance_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    fcp integer DEFAULT 0,
    page_load integer DEFAULT 0,
    dom_ready integer DEFAULT 0,
    ttfb integer DEFAULT 0,
    memory_used integer DEFAULT 0,
    memory_total integer DEFAULT 0,
    dom_nodes integer DEFAULT 0,
    network_type text DEFAULT '4g'::text,
    rtt integer DEFAULT 0,
    overall_score integer DEFAULT 0,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    category text DEFAULT 'general'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pinned_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pinned_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    pinned_by uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: playbooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playbooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    category text DEFAULT 'general'::text NOT NULL,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: processed_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.processed_webhook_events (
    event_id text NOT NULL,
    instance text,
    event_type text,
    processed_at timestamp with time zone DEFAULT now()
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    price numeric(10,2) NOT NULL,
    currency text DEFAULT 'BRL'::text NOT NULL,
    image_url text,
    category text,
    sku text,
    stock_quantity integer DEFAULT 0,
    is_active boolean DEFAULT true,
    retailer_id text,
    whatsapp_connection_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    email text,
    avatar_url text,
    role text DEFAULT 'agent'::text,
    max_chats integer DEFAULT 5,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    job_title text,
    department text,
    phone text,
    access_level text DEFAULT 'basic'::text,
    permissions jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    session_invalidated_at timestamp with time zone,
    birthday date,
    nickname text,
    signature text,
    can_download boolean DEFAULT false NOT NULL,
    department_id uuid,
    _admin_user_id uuid,
    last_seen timestamp with time zone,
    online_status text DEFAULT 'offline'::text,
    CONSTRAINT profiles_online_status_check CHECK ((online_status = ANY (ARRAY['online'::text, 'offline'::text, 'busy'::text]))),
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'supervisor'::text, 'agent'::text])))
);


--
-- Name: profiles_public; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.profiles_public WITH (security_invoker='true') AS
 SELECT id,
    user_id,
    name,
    avatar_url,
    is_active,
    department,
    job_title
   FROM public.profiles;


--
-- Name: qr_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qr_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid,
    status text,
    error_code text,
    metadata jsonb DEFAULT '{}'::jsonb,
    connected_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    expired_at timestamp with time zone,
    error_message text,
    instance_id text,
    connection_name text,
    requested_by uuid
);


--
-- Name: query_telemetry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.query_telemetry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operation text DEFAULT 'select'::text NOT NULL,
    table_name text,
    rpc_name text,
    duration_ms integer DEFAULT 0 NOT NULL,
    record_count integer,
    query_limit integer,
    query_offset integer,
    count_mode text,
    severity text DEFAULT 'normal'::text NOT NULL,
    error_message text,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: queue_goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.queue_goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    queue_id uuid NOT NULL,
    max_waiting_contacts integer DEFAULT 10,
    max_avg_wait_minutes integer DEFAULT 15,
    min_assignment_rate integer DEFAULT 80,
    max_messages_pending integer DEFAULT 50,
    alerts_enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: queue_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.queue_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    queue_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: queue_positions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.queue_positions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    queue_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    estimated_wait_minutes integer,
    entered_at timestamp with time zone DEFAULT now(),
    notified boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: queue_skill_requirements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.queue_skill_requirements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    queue_id uuid NOT NULL,
    skill_name text NOT NULL,
    min_level integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: queues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.queues (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    color text DEFAULT '#3B82F6'::text NOT NULL,
    is_active boolean DEFAULT true,
    max_wait_time_minutes integer DEFAULT 30,
    priority integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rate_limit_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limit_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    endpoint_pattern text NOT NULL,
    max_requests integer DEFAULT 100 NOT NULL,
    window_seconds integer DEFAULT 60 NOT NULL,
    block_duration_minutes integer DEFAULT 15 NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rate_limit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ip_address text NOT NULL,
    endpoint text NOT NULL,
    user_id uuid,
    request_count integer DEFAULT 1 NOT NULL,
    blocked boolean DEFAULT false,
    user_agent text,
    country text,
    city text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reconnection_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reconnection_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid,
    attempt_number integer,
    status text,
    error_message text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid,
    profile_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    remind_at timestamp with time zone NOT NULL,
    is_dismissed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rls_denied_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rls_denied_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    resource text NOT NULL,
    required_role text,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role public.app_role NOT NULL,
    permission_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: route_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.route_permissions (
    path text NOT NULL,
    allowed_roles text[] DEFAULT '{}'::text[] NOT NULL,
    description text,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: sales_deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_deals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    value numeric(12,2) DEFAULT 0,
    currency text DEFAULT 'BRL'::text,
    stage_id uuid,
    contact_id uuid,
    assigned_to uuid,
    priority text DEFAULT 'medium'::text,
    expected_close_date date,
    notes text,
    tags text[] DEFAULT '{}'::text[],
    status text DEFAULT 'open'::text,
    won_at timestamp with time zone,
    lost_at timestamp with time zone,
    lost_reason text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: sales_pipeline_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_pipeline_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#3b82f6'::text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: saved_filters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_filters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    entity_type text NOT NULL,
    name text NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_shared boolean DEFAULT false
);


--
-- Name: scheduled_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    content text NOT NULL,
    message_type text DEFAULT 'text'::text NOT NULL,
    media_url text,
    scheduled_at timestamp with time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    sent_at timestamp with time zone,
    error_message text,
    created_by uuid,
    whatsapp_connection_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: scheduled_report_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_report_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    report_type text DEFAULT 'dashboard'::text NOT NULL,
    frequency text DEFAULT 'weekly'::text NOT NULL,
    recipients text[] DEFAULT '{}'::text[] NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_sent_at timestamp with time zone,
    next_send_at timestamp with time zone,
    created_by uuid,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: scheduled_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    report_type text DEFAULT 'dashboard_summary'::text NOT NULL,
    frequency text DEFAULT 'weekly'::text NOT NULL,
    recipients text[] DEFAULT '{}'::text[] NOT NULL,
    format text DEFAULT 'pdf'::text NOT NULL,
    is_active boolean DEFAULT true,
    next_send_at timestamp with time zone,
    last_sent_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: security_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    alert_type text NOT NULL,
    severity text DEFAULT 'medium'::text NOT NULL,
    title text NOT NULL,
    description text,
    ip_address text,
    user_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    is_resolved boolean DEFAULT false,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: security_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    event_type text NOT NULL,
    resource text,
    action text,
    status text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: sicoob_contact_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sicoob_contact_mapping (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    sicoob_user_id text NOT NULL,
    sicoob_vendedor_id text NOT NULL,
    sicoob_singular_id text NOT NULL,
    zappweb_agent_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: sla_configurations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sla_configurations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    first_response_minutes integer DEFAULT 5 NOT NULL,
    resolution_minutes integer DEFAULT 60 NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    is_default boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sla_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sla_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    first_response_minutes integer DEFAULT 5 NOT NULL,
    resolution_minutes integer DEFAULT 60 NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    contact_id uuid,
    company text,
    job_title text,
    contact_type text,
    queue_id uuid,
    agent_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: stickers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stickers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text,
    image_url text NOT NULL,
    category text DEFAULT 'geral'::text,
    uploaded_by text,
    is_favorite boolean DEFAULT false,
    use_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    owner_id uuid
);


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#3b82f6'::text NOT NULL,
    description text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: talkx_blacklist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.talkx_blacklist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    reason text DEFAULT 'Solicitação do cliente'::text,
    blocked_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: talkx_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.talkx_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    message_template text NOT NULL,
    variables_config jsonb DEFAULT '["nome", "apelido", "empresa", "saudacao"]'::jsonb NOT NULL,
    typing_delay_min integer DEFAULT 1500 NOT NULL,
    typing_delay_max integer DEFAULT 4000 NOT NULL,
    send_interval_min integer DEFAULT 5000 NOT NULL,
    send_interval_max integer DEFAULT 15000 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    total_recipients integer DEFAULT 0 NOT NULL,
    sent_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    delivered_count integer DEFAULT 0 NOT NULL,
    whatsapp_connection_id uuid,
    created_by uuid,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    media_url text,
    media_type text,
    scheduled_at timestamp with time zone,
    CONSTRAINT talkx_campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sending'::text, 'paused'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: talkx_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.talkx_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    personalized_message text,
    status text DEFAULT 'pending'::text NOT NULL,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT talkx_recipients_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'delivered'::text, 'failed'::text, 'skipped'::text])))
);


--
-- Name: team_conversation_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_conversation_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    last_read_at timestamp with time zone DEFAULT now(),
    is_muted boolean DEFAULT false
);


--
-- Name: team_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text DEFAULT 'direct'::text NOT NULL,
    name text,
    avatar_url text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT team_conversations_type_check CHECK ((type = ANY (ARRAY['direct'::text, 'group'::text])))
);


--
-- Name: team_message_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_message_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid,
    profile_id uuid,
    read_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: team_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    content text NOT NULL,
    message_type text DEFAULT 'text'::text NOT NULL,
    reply_to_id uuid,
    is_edited boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    media_url text,
    media_type text
);


--
-- Name: training_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    scenario_name text NOT NULL,
    scenario_type text DEFAULT 'general'::text,
    messages jsonb DEFAULT '[]'::jsonb,
    score integer,
    feedback text,
    status text DEFAULT 'in_progress'::text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transfer_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transfer_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transfer_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    content text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    author_name text,
    author_instance text
);


--
-- Name: transfer_ticket_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transfer_ticket_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_devices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    device_fingerprint text NOT NULL,
    device_name text,
    browser text,
    os text,
    ip_address text,
    city text,
    country text,
    is_trusted boolean DEFAULT false,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role DEFAULT 'agent'::public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_service_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_service_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    service_type public.service_account_type NOT NULL,
    account_email text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    device_id uuid,
    ip_address text,
    user_agent text,
    is_active boolean DEFAULT true,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    last_activity_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL,
    ended_at timestamp with time zone
);


--
-- Name: user_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    business_hours_enabled boolean DEFAULT true,
    business_hours_start text DEFAULT '09:00'::text,
    business_hours_end text DEFAULT '18:00'::text,
    work_days integer[] DEFAULT '{1,2,3,4,5}'::integer[],
    welcome_message text DEFAULT ''::text,
    away_message text DEFAULT ''::text,
    closing_message text DEFAULT ''::text,
    auto_assignment_enabled boolean DEFAULT true,
    auto_assignment_method text DEFAULT 'roundrobin'::text,
    inactivity_timeout integer DEFAULT 30,
    sound_enabled boolean DEFAULT true,
    browser_notifications_enabled boolean DEFAULT true,
    quiet_hours_enabled boolean DEFAULT false,
    quiet_hours_start text DEFAULT '22:00'::text,
    quiet_hours_end text DEFAULT '07:00'::text,
    theme text DEFAULT 'system'::text,
    language text DEFAULT 'pt-BR'::text,
    compact_mode boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sentiment_alert_threshold integer DEFAULT 30,
    sentiment_alert_enabled boolean DEFAULT true,
    sentiment_consecutive_count integer DEFAULT 2,
    tts_voice_id text DEFAULT 'EXAVITQu4vr4xnSDxMaL'::text,
    tts_speed numeric DEFAULT 1.0,
    auto_transcription_enabled boolean DEFAULT true,
    transcription_notification_enabled boolean DEFAULT true,
    message_sound_type text DEFAULT 'chime'::text,
    mention_sound_type text DEFAULT 'bell'::text,
    sla_sound_type text DEFAULT 'alert'::text,
    goal_sound_type text DEFAULT 'chime'::text,
    transcription_sound_type text DEFAULT 'soft'::text,
    onboarding_completed boolean DEFAULT false
);


--
-- Name: v_pending_transfers; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_pending_transfers WITH (security_invoker='true') AS
 SELECT target_instance,
    count(*) FILTER (WHERE (status = 'pending'::text)) AS pending,
    count(*) FILTER (WHERE ((status = 'pending'::text) AND (priority = 4))) AS urgente,
    count(*) FILTER (WHERE ((status = 'pending'::text) AND (priority = 3))) AS alta,
    count(*) FILTER (WHERE ((status = 'pending'::text) AND (expires_at < now()))) AS sla_estourado,
    min(created_at) AS mais_antiga
   FROM public.conversation_transfers
  GROUP BY target_instance;


--
-- Name: voice_command_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voice_command_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    transcript text NOT NULL,
    action text NOT NULL,
    response text,
    data jsonb DEFAULT '{}'::jsonb,
    duration_ms integer,
    success boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: warroom_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warroom_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    alert_type text DEFAULT 'warning'::text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    source text,
    is_read boolean DEFAULT false,
    dismissed_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: webauthn_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webauthn_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    challenge text NOT NULL,
    type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:05:00'::interval) NOT NULL,
    CONSTRAINT webauthn_challenges_type_check CHECK ((type = ANY (ARRAY['registration'::text, 'authentication'::text])))
);


--
-- Name: webhook_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_rate_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_id text NOT NULL,
    event_type text NOT NULL,
    event_count integer DEFAULT 1 NOT NULL,
    window_start timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: whatsapp_cloud_webhook_pings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_cloud_webhook_pings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: whatsapp_connection_queues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_connection_queues (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    whatsapp_connection_id uuid NOT NULL,
    queue_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: whatsapp_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone_number text NOT NULL,
    instance_id text,
    status text DEFAULT 'disconnected'::text,
    qr_code text,
    is_default boolean DEFAULT false,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    farewell_message text,
    farewell_enabled boolean DEFAULT false,
    battery_level integer,
    is_plugged boolean,
    retry_count integer DEFAULT 0,
    max_retries integer DEFAULT 5,
    last_health_check timestamp with time zone,
    health_status text DEFAULT 'unknown'::text,
    health_response_ms integer,
    auto_reconnect_enabled boolean DEFAULT true,
    reconnect_interval_seconds integer DEFAULT 30,
    max_reconnect_attempts integer DEFAULT 5,
    loop_protection_active boolean DEFAULT false,
    CONSTRAINT whatsapp_connections_status_check CHECK ((status = ANY (ARRAY['connected'::text, 'disconnected'::text, 'connecting'::text, 'qr_pending'::text])))
);


--
-- Name: whatsapp_connections_agent; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.whatsapp_connections_agent WITH (security_invoker='true') AS
 SELECT id,
    name,
    status,
    phone_number,
    is_default
   FROM public.whatsapp_connections;


--
-- Name: whatsapp_connections_public; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.whatsapp_connections_public WITH (security_invoker='true') AS
 SELECT id,
    name,
    status,
    is_default
   FROM public.whatsapp_connections;


--
-- Name: whatsapp_connections_safe; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.whatsapp_connections_safe WITH (security_invoker='on') AS
 SELECT id,
    name,
    phone_number,
    instance_id,
    status,
    (qr_code IS NOT NULL) AS has_qr_code,
    is_default,
    created_by,
    created_at,
    updated_at,
    farewell_message,
    farewell_enabled,
    battery_level,
    is_plugged,
    retry_count,
    max_retries,
    last_health_check,
    health_status,
    health_response_ms,
    auto_reconnect_enabled,
    reconnect_interval_seconds,
    max_reconnect_attempts,
    loop_protection_active
   FROM public.whatsapp_connections;


--
-- Name: whatsapp_flows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_flows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    flow_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    screens jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'draft'::text,
    whatsapp_flow_id text,
    whatsapp_connection_id uuid,
    created_by uuid,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: whatsapp_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    whatsapp_connection_id uuid,
    group_id text NOT NULL,
    name text NOT NULL,
    description text,
    participant_count integer DEFAULT 0,
    avatar_url text,
    is_admin boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    category text
);


--
-- Name: whatsapp_official_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_official_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid,
    app_id text,
    app_secret text,
    access_token text,
    phone_number_id text,
    waba_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: whatsapp_official_credentials_safe; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.whatsapp_official_credentials_safe WITH (security_invoker='on') AS
 SELECT id,
    connection_id,
    app_id,
    phone_number_id,
    waba_id,
    ((access_token IS NOT NULL) AND (length(access_token) > 0)) AS has_access_token,
    ((app_secret IS NOT NULL) AND (length(app_secret) > 0)) AS has_app_secret,
    created_at,
    updated_at
   FROM public.whatsapp_official_credentials;


--
-- Name: whatsapp_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'utility'::text NOT NULL,
    language text DEFAULT 'pt_BR'::text NOT NULL,
    content text NOT NULL,
    header_text text,
    footer_text text,
    buttons jsonb DEFAULT '[]'::jsonb,
    variables text[] DEFAULT '{}'::text[],
    status text DEFAULT 'draft'::text NOT NULL,
    whatsapp_connection_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: whisper_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whisper_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    target_agent_id uuid NOT NULL,
    content text NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_achievements agent_achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_achievements
    ADD CONSTRAINT agent_achievements_pkey PRIMARY KEY (id);


--
-- Name: agent_skills agent_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_skills
    ADD CONSTRAINT agent_skills_pkey PRIMARY KEY (id);


--
-- Name: agent_skills agent_skills_profile_id_skill_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_skills
    ADD CONSTRAINT agent_skills_profile_id_skill_name_key UNIQUE (profile_id, skill_name);


--
-- Name: agent_stats agent_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_stats
    ADD CONSTRAINT agent_stats_pkey PRIMARY KEY (id);


--
-- Name: agent_stats agent_stats_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_stats
    ADD CONSTRAINT agent_stats_profile_id_key UNIQUE (profile_id);


--
-- Name: agent_visibility_grants agent_visibility_grants_agent_id_can_see_agent_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_visibility_grants
    ADD CONSTRAINT agent_visibility_grants_agent_id_can_see_agent_id_key UNIQUE (agent_id, can_see_agent_id);


--
-- Name: agent_visibility_grants agent_visibility_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_visibility_grants
    ADD CONSTRAINT agent_visibility_grants_pkey PRIMARY KEY (id);


--
-- Name: ai_conversation_tags ai_conversation_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_conversation_tags
    ADD CONSTRAINT ai_conversation_tags_pkey PRIMARY KEY (id);


--
-- Name: ai_providers ai_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_providers
    ADD CONSTRAINT ai_providers_pkey PRIMARY KEY (id);


--
-- Name: ai_usage_logs ai_usage_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT ai_usage_logs_pkey PRIMARY KEY (id);


--
-- Name: allowed_countries allowed_countries_country_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allowed_countries
    ADD CONSTRAINT allowed_countries_country_code_key UNIQUE (country_code);


--
-- Name: allowed_countries allowed_countries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allowed_countries
    ADD CONSTRAINT allowed_countries_pkey PRIMARY KEY (id);


--
-- Name: audio_meme_favorites audio_meme_favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_meme_favorites
    ADD CONSTRAINT audio_meme_favorites_pkey PRIMARY KEY (id);


--
-- Name: audio_meme_favorites audio_meme_favorites_user_id_meme_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_meme_favorites
    ADD CONSTRAINT audio_meme_favorites_user_id_meme_id_key UNIQUE (user_id, meme_id);


--
-- Name: audio_memes audio_memes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_memes
    ADD CONSTRAINT audio_memes_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: auto_close_config auto_close_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_close_config
    ADD CONSTRAINT auto_close_config_pkey PRIMARY KEY (id);


--
-- Name: automations automations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automations
    ADD CONSTRAINT automations_pkey PRIMARY KEY (id);


--
-- Name: away_messages away_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.away_messages
    ADD CONSTRAINT away_messages_pkey PRIMARY KEY (id);


--
-- Name: away_messages away_messages_whatsapp_connection_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.away_messages
    ADD CONSTRAINT away_messages_whatsapp_connection_id_key UNIQUE (whatsapp_connection_id);


--
-- Name: blocked_countries blocked_countries_country_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_countries
    ADD CONSTRAINT blocked_countries_country_code_key UNIQUE (country_code);


--
-- Name: blocked_countries blocked_countries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_countries
    ADD CONSTRAINT blocked_countries_pkey PRIMARY KEY (id);


--
-- Name: blocked_ips blocked_ips_ip_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_ips
    ADD CONSTRAINT blocked_ips_ip_address_key UNIQUE (ip_address);


--
-- Name: blocked_ips blocked_ips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_ips
    ADD CONSTRAINT blocked_ips_pkey PRIMARY KEY (id);


--
-- Name: business_hours business_hours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_hours
    ADD CONSTRAINT business_hours_pkey PRIMARY KEY (id);


--
-- Name: business_hours business_hours_whatsapp_connection_id_day_of_week_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_hours
    ADD CONSTRAINT business_hours_whatsapp_connection_id_day_of_week_key UNIQUE (whatsapp_connection_id, day_of_week);


--
-- Name: calls calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_pkey PRIMARY KEY (id);


--
-- Name: campaign_ab_variants campaign_ab_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_ab_variants
    ADD CONSTRAINT campaign_ab_variants_pkey PRIMARY KEY (id);


--
-- Name: campaign_contacts campaign_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_contacts
    ADD CONSTRAINT campaign_contacts_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: channel_connections channel_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_connections
    ADD CONSTRAINT channel_connections_pkey PRIMARY KEY (id);


--
-- Name: channel_routing_rules channel_routing_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_routing_rules
    ADD CONSTRAINT channel_routing_rules_pkey PRIMARY KEY (id);


--
-- Name: chatbot_executions chatbot_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_executions
    ADD CONSTRAINT chatbot_executions_pkey PRIMARY KEY (id);


--
-- Name: chatbot_flows chatbot_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_flows
    ADD CONSTRAINT chatbot_flows_pkey PRIMARY KEY (id);


--
-- Name: client_wallet_rules client_wallet_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_wallet_rules
    ADD CONSTRAINT client_wallet_rules_pkey PRIMARY KEY (id);


--
-- Name: connection_alert_preferences connection_alert_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connection_alert_preferences
    ADD CONSTRAINT connection_alert_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: connection_health_logs connection_health_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connection_health_logs
    ADD CONSTRAINT connection_health_logs_pkey PRIMARY KEY (id);


--
-- Name: contact_custom_fields contact_custom_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_custom_fields
    ADD CONSTRAINT contact_custom_fields_pkey PRIMARY KEY (id);


--
-- Name: contact_notes contact_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_notes
    ADD CONSTRAINT contact_notes_pkey PRIMARY KEY (id);


--
-- Name: contact_purchases contact_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_purchases
    ADD CONSTRAINT contact_purchases_pkey PRIMARY KEY (id);


--
-- Name: contact_tags contact_tags_contact_id_tag_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tags
    ADD CONSTRAINT contact_tags_contact_id_tag_id_key UNIQUE (contact_id, tag_id);


--
-- Name: contact_tags contact_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tags
    ADD CONSTRAINT contact_tags_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_phone_key UNIQUE (phone);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: conversation_analyses conversation_analyses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_analyses
    ADD CONSTRAINT conversation_analyses_pkey PRIMARY KEY (id);


--
-- Name: conversation_closures conversation_closures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_closures
    ADD CONSTRAINT conversation_closures_pkey PRIMARY KEY (id);


--
-- Name: conversation_events conversation_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_events
    ADD CONSTRAINT conversation_events_pkey PRIMARY KEY (id);


--
-- Name: conversation_memory conversation_memory_contact_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_memory
    ADD CONSTRAINT conversation_memory_contact_id_key UNIQUE (contact_id);


--
-- Name: conversation_memory conversation_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_memory
    ADD CONSTRAINT conversation_memory_pkey PRIMARY KEY (id);


--
-- Name: conversation_sla conversation_sla_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_sla
    ADD CONSTRAINT conversation_sla_pkey PRIMARY KEY (id);


--
-- Name: conversation_snoozes conversation_snoozes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_snoozes
    ADD CONSTRAINT conversation_snoozes_pkey PRIMARY KEY (id);


--
-- Name: conversation_tasks conversation_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_tasks
    ADD CONSTRAINT conversation_tasks_pkey PRIMARY KEY (id);


--
-- Name: conversation_transfers conversation_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_transfers
    ADD CONSTRAINT conversation_transfers_pkey PRIMARY KEY (id);


--
-- Name: conversation_transfers conversation_transfers_ticket_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_transfers
    ADD CONSTRAINT conversation_transfers_ticket_number_key UNIQUE (ticket_number);


--
-- Name: crisis_room_alerts crisis_room_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crisis_room_alerts
    ADD CONSTRAINT crisis_room_alerts_pkey PRIMARY KEY (id);


--
-- Name: csat_auto_config csat_auto_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.csat_auto_config
    ADD CONSTRAINT csat_auto_config_pkey PRIMARY KEY (id);


--
-- Name: csat_surveys csat_surveys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.csat_surveys
    ADD CONSTRAINT csat_surveys_pkey PRIMARY KEY (id);


--
-- Name: custom_emojis custom_emojis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_emojis
    ADD CONSTRAINT custom_emojis_pkey PRIMARY KEY (id);


--
-- Name: deal_activities deal_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_activities
    ADD CONSTRAINT deal_activities_pkey PRIMARY KEY (id);


--
-- Name: department_invitations department_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_invitations
    ADD CONSTRAINT department_invitations_pkey PRIMARY KEY (id);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: dispatch_error_logs dispatch_error_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispatch_error_logs
    ADD CONSTRAINT dispatch_error_logs_pkey PRIMARY KEY (id);


--
-- Name: dlq_audit_log dlq_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dlq_audit_log
    ADD CONSTRAINT dlq_audit_log_pkey PRIMARY KEY (id);


--
-- Name: email_accounts email_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_accounts
    ADD CONSTRAINT email_accounts_pkey PRIMARY KEY (id);


--
-- Name: email_labels email_labels_gmail_account_id_gmail_label_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_labels
    ADD CONSTRAINT email_labels_gmail_account_id_gmail_label_id_key UNIQUE (gmail_account_id, gmail_label_id);


--
-- Name: email_labels email_labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_labels
    ADD CONSTRAINT email_labels_pkey PRIMARY KEY (id);


--
-- Name: email_messages email_messages_gmail_account_id_gmail_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_gmail_account_id_gmail_message_id_key UNIQUE (gmail_account_id, gmail_message_id);


--
-- Name: email_messages email_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_pkey PRIMARY KEY (id);


--
-- Name: email_threads email_threads_gmail_account_id_gmail_thread_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_threads
    ADD CONSTRAINT email_threads_gmail_account_id_gmail_thread_id_key UNIQUE (gmail_account_id, gmail_thread_id);


--
-- Name: email_threads email_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_threads
    ADD CONSTRAINT email_threads_pkey PRIMARY KEY (id);


--
-- Name: entity_versions entity_versions_entity_type_entity_id_version_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_versions
    ADD CONSTRAINT entity_versions_entity_type_entity_id_version_number_key UNIQUE (entity_type, entity_id, version_number);


--
-- Name: entity_versions entity_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_versions
    ADD CONSTRAINT entity_versions_pkey PRIMARY KEY (id);


--
-- Name: evolution_health_logs evolution_health_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evolution_health_logs
    ADD CONSTRAINT evolution_health_logs_pkey PRIMARY KEY (id);


--
-- Name: evolution_instance_credentials evolution_instance_credentials_connection_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evolution_instance_credentials
    ADD CONSTRAINT evolution_instance_credentials_connection_id_key UNIQUE (connection_id);


--
-- Name: evolution_instance_credentials evolution_instance_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evolution_instance_credentials
    ADD CONSTRAINT evolution_instance_credentials_pkey PRIMARY KEY (id);


--
-- Name: evolution_retry_metrics evolution_retry_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evolution_retry_metrics
    ADD CONSTRAINT evolution_retry_metrics_pkey PRIMARY KEY (id);


--
-- Name: failed_messages failed_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.failed_messages
    ADD CONSTRAINT failed_messages_pkey PRIMARY KEY (id);


--
-- Name: favorite_contacts favorite_contacts_contact_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_contacts
    ADD CONSTRAINT favorite_contacts_contact_id_user_id_key UNIQUE (contact_id, user_id);


--
-- Name: favorite_contacts favorite_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_contacts
    ADD CONSTRAINT favorite_contacts_pkey PRIMARY KEY (id);


--
-- Name: followup_executions followup_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followup_executions
    ADD CONSTRAINT followup_executions_pkey PRIMARY KEY (id);


--
-- Name: followup_sequences followup_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followup_sequences
    ADD CONSTRAINT followup_sequences_pkey PRIMARY KEY (id);


--
-- Name: followup_steps followup_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followup_steps
    ADD CONSTRAINT followup_steps_pkey PRIMARY KEY (id);


--
-- Name: geo_blocking_settings geo_blocking_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geo_blocking_settings
    ADD CONSTRAINT geo_blocking_settings_pkey PRIMARY KEY (id);


--
-- Name: global_settings global_settings_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_settings
    ADD CONSTRAINT global_settings_key_key UNIQUE (key);


--
-- Name: global_settings global_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_settings
    ADD CONSTRAINT global_settings_pkey PRIMARY KEY (id);


--
-- Name: gmail_accounts gmail_accounts_email_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gmail_accounts
    ADD CONSTRAINT gmail_accounts_email_address_key UNIQUE (email_address);


--
-- Name: gmail_accounts gmail_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gmail_accounts
    ADD CONSTRAINT gmail_accounts_pkey PRIMARY KEY (id);


--
-- Name: goals_configurations goals_configurations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals_configurations
    ADD CONSTRAINT goals_configurations_pkey PRIMARY KEY (id);


--
-- Name: goals_configurations goals_configurations_profile_id_goal_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals_configurations
    ADD CONSTRAINT goals_configurations_profile_id_goal_type_key UNIQUE (profile_id, goal_type);


--
-- Name: goals_configurations goals_configurations_queue_id_goal_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals_configurations
    ADD CONSTRAINT goals_configurations_queue_id_goal_type_key UNIQUE (queue_id, goal_type);


--
-- Name: inbox_custom_scopes inbox_custom_scopes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_custom_scopes
    ADD CONSTRAINT inbox_custom_scopes_pkey PRIMARY KEY (id);


--
-- Name: instance_auth_events instance_auth_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instance_auth_events
    ADD CONSTRAINT instance_auth_events_pkey PRIMARY KEY (id);


--
-- Name: instance_processing_pauses instance_processing_pauses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instance_processing_pauses
    ADD CONSTRAINT instance_processing_pauses_pkey PRIMARY KEY (id);


--
-- Name: instance_registry instance_registry_instance_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instance_registry
    ADD CONSTRAINT instance_registry_instance_name_key UNIQUE (instance_name);


--
-- Name: instance_registry instance_registry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instance_registry
    ADD CONSTRAINT instance_registry_pkey PRIMARY KEY (id);


--
-- Name: ip_whitelist ip_whitelist_ip_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_whitelist
    ADD CONSTRAINT ip_whitelist_ip_address_key UNIQUE (ip_address);


--
-- Name: ip_whitelist ip_whitelist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_whitelist
    ADD CONSTRAINT ip_whitelist_pkey PRIMARY KEY (id);


--
-- Name: knowledge_base_articles knowledge_base_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_base_articles
    ADD CONSTRAINT knowledge_base_articles_pkey PRIMARY KEY (id);


--
-- Name: knowledge_base_files knowledge_base_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_base_files
    ADD CONSTRAINT knowledge_base_files_pkey PRIMARY KEY (id);


--
-- Name: login_attempts login_attempts_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_attempts
    ADD CONSTRAINT login_attempts_email_key UNIQUE (email);


--
-- Name: login_attempts login_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_attempts
    ADD CONSTRAINT login_attempts_pkey PRIMARY KEY (id);


--
-- Name: message_reactions message_reactions_message_id_contact_id_emoji_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_message_id_contact_id_emoji_key UNIQUE (message_id, contact_id, emoji);


--
-- Name: message_reactions message_reactions_message_id_user_id_emoji_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_message_id_user_id_emoji_key UNIQUE (message_id, user_id, emoji);


--
-- Name: message_reactions message_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_pkey PRIMARY KEY (id);


--
-- Name: message_templates message_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_templates
    ADD CONSTRAINT message_templates_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: meta_capi_events meta_capi_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_capi_events
    ADD CONSTRAINT meta_capi_events_pkey PRIMARY KEY (id);


--
-- Name: mfa_sessions mfa_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfa_sessions
    ADD CONSTRAINT mfa_sessions_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: nps_surveys nps_surveys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nps_surveys
    ADD CONSTRAINT nps_surveys_pkey PRIMARY KEY (id);


--
-- Name: number_reputation number_reputation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.number_reputation
    ADD CONSTRAINT number_reputation_pkey PRIMARY KEY (id);


--
-- Name: number_reputation number_reputation_whatsapp_connection_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.number_reputation
    ADD CONSTRAINT number_reputation_whatsapp_connection_id_key UNIQUE (whatsapp_connection_id);


--
-- Name: passkey_credentials passkey_credentials_credential_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passkey_credentials
    ADD CONSTRAINT passkey_credentials_credential_id_key UNIQUE (credential_id);


--
-- Name: passkey_credentials passkey_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passkey_credentials
    ADD CONSTRAINT passkey_credentials_pkey PRIMARY KEY (id);


--
-- Name: password_reset_requests password_reset_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_requests
    ADD CONSTRAINT password_reset_requests_pkey PRIMARY KEY (id);


--
-- Name: payment_links payment_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_links
    ADD CONSTRAINT payment_links_pkey PRIMARY KEY (id);


--
-- Name: performance_snapshots performance_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_snapshots
    ADD CONSTRAINT performance_snapshots_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_name_key UNIQUE (name);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: pinned_conversations pinned_conversations_contact_id_pinned_by_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pinned_conversations
    ADD CONSTRAINT pinned_conversations_contact_id_pinned_by_key UNIQUE (contact_id, pinned_by);


--
-- Name: pinned_conversations pinned_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pinned_conversations
    ADD CONSTRAINT pinned_conversations_pkey PRIMARY KEY (id);


--
-- Name: playbooks playbooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playbooks
    ADD CONSTRAINT playbooks_pkey PRIMARY KEY (id);


--
-- Name: processed_webhook_events processed_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processed_webhook_events
    ADD CONSTRAINT processed_webhook_events_pkey PRIMARY KEY (event_id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_sku_key UNIQUE (sku);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);


--
-- Name: qr_attempts qr_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_attempts
    ADD CONSTRAINT qr_attempts_pkey PRIMARY KEY (id);


--
-- Name: query_telemetry query_telemetry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.query_telemetry
    ADD CONSTRAINT query_telemetry_pkey PRIMARY KEY (id);


--
-- Name: queue_goals queue_goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_goals
    ADD CONSTRAINT queue_goals_pkey PRIMARY KEY (id);


--
-- Name: queue_goals queue_goals_queue_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_goals
    ADD CONSTRAINT queue_goals_queue_id_key UNIQUE (queue_id);


--
-- Name: queue_members queue_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_members
    ADD CONSTRAINT queue_members_pkey PRIMARY KEY (id);


--
-- Name: queue_members queue_members_queue_id_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_members
    ADD CONSTRAINT queue_members_queue_id_profile_id_key UNIQUE (queue_id, profile_id);


--
-- Name: queue_positions queue_positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_positions
    ADD CONSTRAINT queue_positions_pkey PRIMARY KEY (id);


--
-- Name: queue_skill_requirements queue_skill_requirements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_skill_requirements
    ADD CONSTRAINT queue_skill_requirements_pkey PRIMARY KEY (id);


--
-- Name: queue_skill_requirements queue_skill_requirements_queue_id_skill_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_skill_requirements
    ADD CONSTRAINT queue_skill_requirements_queue_id_skill_name_key UNIQUE (queue_id, skill_name);


--
-- Name: queues queues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queues
    ADD CONSTRAINT queues_pkey PRIMARY KEY (id);


--
-- Name: rate_limit_configs rate_limit_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit_configs
    ADD CONSTRAINT rate_limit_configs_pkey PRIMARY KEY (id);


--
-- Name: rate_limit_logs rate_limit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit_logs
    ADD CONSTRAINT rate_limit_logs_pkey PRIMARY KEY (id);


--
-- Name: reconnection_logs reconnection_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconnection_logs
    ADD CONSTRAINT reconnection_logs_pkey PRIMARY KEY (id);


--
-- Name: reminders reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);


--
-- Name: rls_denied_log rls_denied_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rls_denied_log
    ADD CONSTRAINT rls_denied_log_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_role_permission_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_permission_id_key UNIQUE (role, permission_id);


--
-- Name: route_permissions route_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_permissions
    ADD CONSTRAINT route_permissions_pkey PRIMARY KEY (path);


--
-- Name: sales_deals sales_deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_deals
    ADD CONSTRAINT sales_deals_pkey PRIMARY KEY (id);


--
-- Name: sales_pipeline_stages sales_pipeline_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_pipeline_stages
    ADD CONSTRAINT sales_pipeline_stages_pkey PRIMARY KEY (id);


--
-- Name: saved_filters saved_filters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_filters
    ADD CONSTRAINT saved_filters_pkey PRIMARY KEY (id);


--
-- Name: scheduled_messages scheduled_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_messages
    ADD CONSTRAINT scheduled_messages_pkey PRIMARY KEY (id);


--
-- Name: scheduled_report_configs scheduled_report_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_report_configs
    ADD CONSTRAINT scheduled_report_configs_pkey PRIMARY KEY (id);


--
-- Name: scheduled_reports scheduled_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_reports
    ADD CONSTRAINT scheduled_reports_pkey PRIMARY KEY (id);


--
-- Name: security_alerts security_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_alerts
    ADD CONSTRAINT security_alerts_pkey PRIMARY KEY (id);


--
-- Name: security_audit_logs security_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_audit_logs
    ADD CONSTRAINT security_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: sicoob_contact_mapping sicoob_contact_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sicoob_contact_mapping
    ADD CONSTRAINT sicoob_contact_mapping_pkey PRIMARY KEY (id);


--
-- Name: sicoob_contact_mapping sicoob_contact_mapping_sicoob_user_id_sicoob_singular_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sicoob_contact_mapping
    ADD CONSTRAINT sicoob_contact_mapping_sicoob_user_id_sicoob_singular_id_key UNIQUE (sicoob_user_id, sicoob_singular_id);


--
-- Name: sla_configurations sla_configurations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sla_configurations
    ADD CONSTRAINT sla_configurations_pkey PRIMARY KEY (id);


--
-- Name: sla_rules sla_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sla_rules
    ADD CONSTRAINT sla_rules_pkey PRIMARY KEY (id);


--
-- Name: stickers stickers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stickers
    ADD CONSTRAINT stickers_pkey PRIMARY KEY (id);


--
-- Name: tags tags_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_name_key UNIQUE (name);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: talkx_blacklist talkx_blacklist_contact_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.talkx_blacklist
    ADD CONSTRAINT talkx_blacklist_contact_id_key UNIQUE (contact_id);


--
-- Name: talkx_blacklist talkx_blacklist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.talkx_blacklist
    ADD CONSTRAINT talkx_blacklist_pkey PRIMARY KEY (id);


--
-- Name: talkx_campaigns talkx_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.talkx_campaigns
    ADD CONSTRAINT talkx_campaigns_pkey PRIMARY KEY (id);


--
-- Name: talkx_recipients talkx_recipients_campaign_id_contact_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.talkx_recipients
    ADD CONSTRAINT talkx_recipients_campaign_id_contact_id_key UNIQUE (campaign_id, contact_id);


--
-- Name: talkx_recipients talkx_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.talkx_recipients
    ADD CONSTRAINT talkx_recipients_pkey PRIMARY KEY (id);


--
-- Name: team_conversation_members team_conversation_members_conversation_id_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_conversation_members
    ADD CONSTRAINT team_conversation_members_conversation_id_profile_id_key UNIQUE (conversation_id, profile_id);


--
-- Name: team_conversation_members team_conversation_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_conversation_members
    ADD CONSTRAINT team_conversation_members_pkey PRIMARY KEY (id);


--
-- Name: team_conversations team_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_conversations
    ADD CONSTRAINT team_conversations_pkey PRIMARY KEY (id);


--
-- Name: team_message_receipts team_message_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_message_receipts
    ADD CONSTRAINT team_message_receipts_pkey PRIMARY KEY (id);


--
-- Name: team_messages team_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_messages
    ADD CONSTRAINT team_messages_pkey PRIMARY KEY (id);


--
-- Name: training_sessions training_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_sessions
    ADD CONSTRAINT training_sessions_pkey PRIMARY KEY (id);


--
-- Name: transfer_comments transfer_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_comments
    ADD CONSTRAINT transfer_comments_pkey PRIMARY KEY (id);


--
-- Name: user_devices user_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_devices
    ADD CONSTRAINT user_devices_pkey PRIMARY KEY (id);


--
-- Name: user_devices user_devices_user_id_device_fingerprint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_devices
    ADD CONSTRAINT user_devices_user_id_device_fingerprint_key UNIQUE (user_id, device_fingerprint);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: user_service_accounts user_service_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_service_accounts
    ADD CONSTRAINT user_service_accounts_pkey PRIMARY KEY (id);


--
-- Name: user_service_accounts user_service_accounts_user_id_service_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_service_accounts
    ADD CONSTRAINT user_service_accounts_user_id_service_type_key UNIQUE (user_id, service_type);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_settings user_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (id);


--
-- Name: user_settings user_settings_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_user_id_key UNIQUE (user_id);


--
-- Name: voice_command_logs voice_command_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_command_logs
    ADD CONSTRAINT voice_command_logs_pkey PRIMARY KEY (id);


--
-- Name: warroom_alerts warroom_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warroom_alerts
    ADD CONSTRAINT warroom_alerts_pkey PRIMARY KEY (id);


--
-- Name: webauthn_challenges webauthn_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_pkey PRIMARY KEY (id);


--
-- Name: webhook_rate_limits webhook_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_rate_limits
    ADD CONSTRAINT webhook_rate_limits_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_cloud_webhook_pings whatsapp_cloud_webhook_pings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_cloud_webhook_pings
    ADD CONSTRAINT whatsapp_cloud_webhook_pings_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_connection_queues whatsapp_connection_queues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_connection_queues
    ADD CONSTRAINT whatsapp_connection_queues_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_connection_queues whatsapp_connection_queues_whatsapp_connection_id_queue_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_connection_queues
    ADD CONSTRAINT whatsapp_connection_queues_whatsapp_connection_id_queue_id_key UNIQUE (whatsapp_connection_id, queue_id);


--
-- Name: whatsapp_connections whatsapp_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_connections
    ADD CONSTRAINT whatsapp_connections_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_flows whatsapp_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_flows
    ADD CONSTRAINT whatsapp_flows_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_groups whatsapp_groups_group_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_groups
    ADD CONSTRAINT whatsapp_groups_group_id_key UNIQUE (group_id);


--
-- Name: whatsapp_groups whatsapp_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_groups
    ADD CONSTRAINT whatsapp_groups_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_official_credentials whatsapp_official_credentials_connection_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_official_credentials
    ADD CONSTRAINT whatsapp_official_credentials_connection_id_key UNIQUE (connection_id);


--
-- Name: whatsapp_official_credentials whatsapp_official_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_official_credentials
    ADD CONSTRAINT whatsapp_official_credentials_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_templates whatsapp_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_pkey PRIMARY KEY (id);


--
-- Name: whisper_messages whisper_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whisper_messages
    ADD CONSTRAINT whisper_messages_pkey PRIMARY KEY (id);


--
-- Name: idx_agent_achievements_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_achievements_profile ON public.agent_achievements USING btree (profile_id);


--
-- Name: idx_agent_stats_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_stats_level ON public.agent_stats USING btree (level DESC);


--
-- Name: idx_agent_stats_xp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_stats_xp ON public.agent_stats USING btree (xp DESC);


--
-- Name: idx_ai_usage_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_logs_created_at ON public.ai_usage_logs USING btree (created_at DESC);


--
-- Name: idx_ai_usage_logs_function_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_logs_function_name ON public.ai_usage_logs USING btree (function_name);


--
-- Name: idx_ai_usage_logs_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_logs_profile_id ON public.ai_usage_logs USING btree (profile_id);


--
-- Name: idx_ai_usage_logs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_logs_status ON public.ai_usage_logs USING btree (status);


--
-- Name: idx_ai_usage_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_logs_user_id ON public.ai_usage_logs USING btree (user_id);


--
-- Name: idx_allowed_countries_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_allowed_countries_code ON public.allowed_countries USING btree (country_code);


--
-- Name: idx_audio_memes_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audio_memes_category ON public.audio_memes USING btree (category);


--
-- Name: idx_audit_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_logs_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user_created ON public.audit_logs USING btree (user_id, created_at DESC);


--
-- Name: idx_audit_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);


--
-- Name: idx_blocked_countries_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocked_countries_code ON public.blocked_countries USING btree (country_code);


--
-- Name: idx_blocked_ips_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocked_ips_expires ON public.blocked_ips USING btree (expires_at);


--
-- Name: idx_blocked_ips_ip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocked_ips_ip ON public.blocked_ips USING btree (ip_address);


--
-- Name: idx_business_hours_connection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_hours_connection ON public.business_hours USING btree (whatsapp_connection_id);


--
-- Name: idx_campaign_contacts_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_contacts_campaign ON public.campaign_contacts USING btree (campaign_id, status);


--
-- Name: idx_campaign_contacts_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_contacts_campaign_id ON public.campaign_contacts USING btree (campaign_id);


--
-- Name: idx_campaign_contacts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_contacts_status ON public.campaign_contacts USING btree (status);


--
-- Name: idx_campaigns_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_created_by ON public.campaigns USING btree (created_by);


--
-- Name: idx_campaigns_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_status ON public.campaigns USING btree (status);


--
-- Name: idx_chatbot_executions_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_executions_contact_id ON public.chatbot_executions USING btree (contact_id);


--
-- Name: idx_chatbot_executions_flow_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_executions_flow_id ON public.chatbot_executions USING btree (flow_id);


--
-- Name: idx_chatbot_executions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_executions_status ON public.chatbot_executions USING btree (status);


--
-- Name: idx_chatbot_flows_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_flows_active ON public.chatbot_flows USING btree (is_active);


--
-- Name: idx_closures_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_closures_contact ON public.conversation_closures USING btree (contact_id);


--
-- Name: idx_closures_reason; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_closures_reason ON public.conversation_closures USING btree (close_reason);


--
-- Name: idx_contact_custom_fields_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_custom_fields_contact ON public.contact_custom_fields USING btree (contact_id);


--
-- Name: idx_contact_custom_fields_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_contact_custom_fields_unique ON public.contact_custom_fields USING btree (contact_id, field_name);


--
-- Name: idx_contact_notes_author_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_notes_author_id ON public.contact_notes USING btree (author_id);


--
-- Name: idx_contact_notes_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_notes_contact_id ON public.contact_notes USING btree (contact_id);


--
-- Name: idx_contacts_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_assigned_to ON public.contacts USING btree (assigned_to);


--
-- Name: idx_contacts_company_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_company_trgm ON public.contacts USING gin (company extensions.gin_trgm_ops);


--
-- Name: idx_contacts_contact_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_contact_type ON public.contacts USING btree (contact_type);


--
-- Name: idx_contacts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_created_at ON public.contacts USING btree (created_at DESC);


--
-- Name: idx_contacts_email_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_email_trgm ON public.contacts USING gin (email extensions.gin_trgm_ops);


--
-- Name: idx_contacts_job_title_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_job_title_trgm ON public.contacts USING gin (job_title extensions.gin_trgm_ops);


--
-- Name: idx_contacts_name_asc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_name_asc ON public.contacts USING btree (name);


--
-- Name: idx_contacts_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_name_trgm ON public.contacts USING gin (name extensions.gin_trgm_ops);


--
-- Name: idx_contacts_nickname_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_nickname_trgm ON public.contacts USING gin (nickname extensions.gin_trgm_ops);


--
-- Name: idx_contacts_phone_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_phone_trgm ON public.contacts USING gin (phone extensions.gin_trgm_ops);


--
-- Name: idx_contacts_queue_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_queue_id ON public.contacts USING btree (queue_id);


--
-- Name: idx_contacts_surname_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_surname_trgm ON public.contacts USING gin (surname extensions.gin_trgm_ops);


--
-- Name: idx_conversation_analyses_contact_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_analyses_contact_department ON public.conversation_analyses USING btree (contact_id, department);


--
-- Name: idx_conversation_analyses_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_analyses_contact_id ON public.conversation_analyses USING btree (contact_id);


--
-- Name: idx_conversation_analyses_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_analyses_created_at ON public.conversation_analyses USING btree (created_at DESC);


--
-- Name: idx_conversation_analyses_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_analyses_department ON public.conversation_analyses USING btree (department);


--
-- Name: idx_conversation_events_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_events_contact ON public.conversation_events USING btree (contact_id, created_at DESC);


--
-- Name: idx_conversation_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_events_type ON public.conversation_events USING btree (event_type);


--
-- Name: idx_email_labels_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_labels_account ON public.email_labels USING btree (gmail_account_id);


--
-- Name: idx_email_messages_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_account ON public.email_messages USING btree (gmail_account_id);


--
-- Name: idx_email_messages_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_date ON public.email_messages USING btree (internal_date DESC);


--
-- Name: idx_email_messages_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_thread ON public.email_messages USING btree (thread_id);


--
-- Name: idx_email_threads_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_threads_account ON public.email_threads USING btree (gmail_account_id);


--
-- Name: idx_email_threads_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_threads_contact ON public.email_threads USING btree (contact_id);


--
-- Name: idx_email_threads_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_threads_last_message ON public.email_threads USING btree (last_message_at DESC);


--
-- Name: idx_health_logs_checked_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_health_logs_checked_at ON public.connection_health_logs USING btree (checked_at DESC);


--
-- Name: idx_health_logs_connection_checked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_health_logs_connection_checked ON public.connection_health_logs USING btree (connection_id, checked_at DESC);


--
-- Name: idx_kb_articles_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_articles_search ON public.knowledge_base_articles USING gin (search_vector);


--
-- Name: idx_login_attempts_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_attempts_email ON public.login_attempts USING btree (email);


--
-- Name: idx_login_attempts_locked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_attempts_locked ON public.login_attempts USING btree (locked_until) WHERE (locked_until IS NOT NULL);


--
-- Name: idx_meme_favorites_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meme_favorites_user ON public.audio_meme_favorites USING btree (user_id);


--
-- Name: idx_message_reactions_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_reactions_message ON public.message_reactions USING btree (message_id);


--
-- Name: idx_messages_contact_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_contact_created ON public.messages USING btree (contact_id, created_at DESC);


--
-- Name: idx_messages_contact_created_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_contact_created_active ON public.messages USING btree (contact_id, created_at DESC) WHERE (is_deleted = false);


--
-- Name: idx_messages_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_contact_id ON public.messages USING btree (contact_id);


--
-- Name: idx_messages_content_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_content_search ON public.messages USING gin (to_tsvector('portuguese'::regconfig, content));


--
-- Name: idx_messages_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_created_at ON public.messages USING btree (created_at DESC);


--
-- Name: idx_messages_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_deleted_at ON public.messages USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_messages_external_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_external_id ON public.messages USING btree (external_id);


--
-- Name: idx_messages_reply_to_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_reply_to_id ON public.messages USING btree (reply_to_id) WHERE (reply_to_id IS NOT NULL);


--
-- Name: idx_mfa_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mfa_sessions_user ON public.mfa_sessions USING btree (user_id);


--
-- Name: idx_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_is_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: idx_nps_surveys_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nps_surveys_contact ON public.nps_surveys USING btree (contact_id);


--
-- Name: idx_nps_surveys_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nps_surveys_created ON public.nps_surveys USING btree (created_at DESC);


--
-- Name: idx_passkey_credentials_credential_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_passkey_credentials_credential_id ON public.passkey_credentials USING btree (credential_id);


--
-- Name: idx_passkey_credentials_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_passkey_credentials_user_id ON public.passkey_credentials USING btree (user_id);


--
-- Name: idx_password_reset_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_requests_status ON public.password_reset_requests USING btree (status);


--
-- Name: idx_password_reset_requests_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_requests_user ON public.password_reset_requests USING btree (user_id);


--
-- Name: idx_performance_snapshots_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_performance_snapshots_created_at ON public.performance_snapshots USING btree (created_at DESC);


--
-- Name: idx_performance_snapshots_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_performance_snapshots_profile ON public.performance_snapshots USING btree (profile_id);


--
-- Name: idx_products_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_active ON public.products USING btree (is_active);


--
-- Name: idx_products_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_category ON public.products USING btree (category);


--
-- Name: idx_profiles_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_is_active ON public.profiles USING btree (is_active);


--
-- Name: idx_profiles_last_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_last_seen ON public.profiles USING btree (last_seen);


--
-- Name: idx_query_telemetry_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_query_telemetry_created_at ON public.query_telemetry USING btree (created_at DESC);


--
-- Name: idx_query_telemetry_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_query_telemetry_severity ON public.query_telemetry USING btree (severity);


--
-- Name: idx_rate_limit_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_limit_logs_created ON public.rate_limit_logs USING btree (created_at);


--
-- Name: idx_rate_limit_logs_ip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_limit_logs_ip ON public.rate_limit_logs USING btree (ip_address);


--
-- Name: idx_rate_limit_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_limit_logs_user ON public.rate_limit_logs USING btree (user_id);


--
-- Name: idx_rate_limits_instance_window; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_limits_instance_window ON public.webhook_rate_limits USING btree (instance_id, window_start DESC);


--
-- Name: idx_reminders_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminders_profile ON public.reminders USING btree (profile_id);


--
-- Name: idx_reminders_remind_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminders_remind_at ON public.reminders USING btree (remind_at);


--
-- Name: idx_reputation_connection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reputation_connection ON public.number_reputation USING btree (whatsapp_connection_id);


--
-- Name: idx_rls_denied_resource_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rls_denied_resource_created ON public.rls_denied_log USING btree (resource, created_at DESC);


--
-- Name: idx_rls_denied_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rls_denied_user_created ON public.rls_denied_log USING btree (user_id, created_at DESC);


--
-- Name: idx_saved_filters_user_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_filters_user_entity ON public.saved_filters USING btree (user_id, entity_type);


--
-- Name: idx_scheduled_messages_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_messages_pending ON public.scheduled_messages USING btree (scheduled_at) WHERE (status = 'pending'::text);


--
-- Name: idx_security_alerts_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_security_alerts_created ON public.security_alerts USING btree (created_at);


--
-- Name: idx_security_alerts_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_security_alerts_type ON public.security_alerts USING btree (alert_type);


--
-- Name: idx_sla_rules_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sla_rules_active ON public.sla_rules USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_sla_rules_active_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sla_rules_active_priority ON public.sla_rules USING btree (is_active, priority DESC);


--
-- Name: idx_sla_rules_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sla_rules_agent_id ON public.sla_rules USING btree (agent_id) WHERE (agent_id IS NOT NULL);


--
-- Name: idx_sla_rules_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sla_rules_company ON public.sla_rules USING btree (company) WHERE (company IS NOT NULL);


--
-- Name: idx_sla_rules_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sla_rules_contact_id ON public.sla_rules USING btree (contact_id) WHERE (contact_id IS NOT NULL);


--
-- Name: idx_sla_rules_queue_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sla_rules_queue_id ON public.sla_rules USING btree (queue_id) WHERE (queue_id IS NOT NULL);


--
-- Name: idx_snoozes_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_snoozes_contact ON public.conversation_snoozes USING btree (contact_id);


--
-- Name: idx_snoozes_until; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_snoozes_until ON public.conversation_snoozes USING btree (snooze_until);


--
-- Name: idx_stickers_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stickers_owner_id ON public.stickers USING btree (owner_id) WHERE (owner_id IS NOT NULL);


--
-- Name: idx_talkx_blacklist_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_talkx_blacklist_contact ON public.talkx_blacklist USING btree (contact_id);


--
-- Name: idx_talkx_campaigns_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_talkx_campaigns_created_by ON public.talkx_campaigns USING btree (created_by);


--
-- Name: idx_talkx_campaigns_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_talkx_campaigns_status ON public.talkx_campaigns USING btree (status);


--
-- Name: idx_talkx_recipients_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_talkx_recipients_campaign ON public.talkx_recipients USING btree (campaign_id);


--
-- Name: idx_talkx_recipients_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_talkx_recipients_status ON public.talkx_recipients USING btree (status);


--
-- Name: idx_tasks_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_assigned ON public.conversation_tasks USING btree (assigned_to);


--
-- Name: idx_tasks_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_contact ON public.conversation_tasks USING btree (contact_id);


--
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_status ON public.conversation_tasks USING btree (status);


--
-- Name: idx_team_members_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_members_conversation ON public.team_conversation_members USING btree (conversation_id);


--
-- Name: idx_team_members_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_members_profile ON public.team_conversation_members USING btree (profile_id);


--
-- Name: idx_team_messages_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_messages_conversation ON public.team_messages USING btree (conversation_id, created_at DESC);


--
-- Name: idx_user_devices_fingerprint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_devices_fingerprint ON public.user_devices USING btree (device_fingerprint);


--
-- Name: idx_user_devices_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_devices_user_id ON public.user_devices USING btree (user_id);


--
-- Name: idx_user_roles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_user_id ON public.user_roles USING btree (user_id);


--
-- Name: idx_user_sessions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_sessions_active ON public.user_sessions USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_user_sessions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_sessions_user_id ON public.user_sessions USING btree (user_id);


--
-- Name: idx_versions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_versions_date ON public.entity_versions USING btree (created_at DESC);


--
-- Name: idx_versions_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_versions_entity ON public.entity_versions USING btree (entity_type, entity_id);


--
-- Name: idx_voice_command_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voice_command_logs_created_at ON public.voice_command_logs USING btree (created_at DESC);


--
-- Name: idx_voice_command_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voice_command_logs_user_id ON public.voice_command_logs USING btree (user_id);


--
-- Name: idx_webauthn_challenges_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webauthn_challenges_expires ON public.webauthn_challenges USING btree (expires_at);


--
-- Name: idx_whatsapp_groups_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_groups_category ON public.whatsapp_groups USING btree (category);


--
-- Name: user_roles audit_user_role_changes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_user_role_changes AFTER INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.audit_role_changes();


--
-- Name: whatsapp_connections clear_qr_on_connect_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clear_qr_on_connect_trigger BEFORE UPDATE OF status ON public.whatsapp_connections FOR EACH ROW EXECUTE FUNCTION public.clear_qr_on_connect();


--
-- Name: ai_providers ensure_single_default_ai_provider; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ensure_single_default_ai_provider BEFORE INSERT OR UPDATE ON public.ai_providers FOR EACH ROW EXECUTE FUNCTION public.ensure_single_default_ai_provider();


--
-- Name: saved_filters ensure_single_default_filter_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ensure_single_default_filter_trigger BEFORE INSERT OR UPDATE ON public.saved_filters FOR EACH ROW EXECUTE FUNCTION public.ensure_single_default_filter();


--
-- Name: agent_stats on_agent_stats_update_level; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_agent_stats_update_level BEFORE UPDATE OF xp ON public.agent_stats FOR EACH ROW EXECUTE FUNCTION public.update_agent_level();


--
-- Name: contacts on_contact_created_auto_assign; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_contact_created_auto_assign BEFORE INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.auto_assign_contact();


--
-- Name: contacts on_contact_queue_auto_assign; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_contact_queue_auto_assign BEFORE INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.auto_assign_to_queue_agent();


--
-- Name: user_devices on_device_update_last_seen; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_device_update_last_seen BEFORE UPDATE ON public.user_devices FOR EACH ROW EXECUTE FUNCTION public.update_device_last_seen();


--
-- Name: profiles on_profile_created_init_stats; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_profile_created_init_stats AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.init_agent_stats();


--
-- Name: profiles on_profile_created_settings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_profile_created_settings AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_settings();


--
-- Name: profiles on_profile_update_prevent_escalation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_profile_update_prevent_escalation BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();


--
-- Name: profiles prevent_privilege_escalation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prevent_privilege_escalation BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();


--
-- Name: password_reset_requests sanitize_reset_request_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sanitize_reset_request_trigger BEFORE INSERT ON public.password_reset_requests FOR EACH ROW EXECUTE FUNCTION public.sanitize_reset_request();


--
-- Name: user_roles tr_log_role_changes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_log_role_changes AFTER INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.on_role_change();


--
-- Name: conversation_transfers trg_conversation_transfers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_conversation_transfers_updated_at BEFORE UPDATE ON public.conversation_transfers FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: instance_registry trg_instance_registry_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_instance_registry_updated_at BEFORE UPDATE ON public.instance_registry FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: contacts trg_log_assignment_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_log_assignment_change AFTER UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.log_assignment_change();


--
-- Name: contacts trg_normalize_contact_phone; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_normalize_contact_phone BEFORE INSERT OR UPDATE OF phone ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.normalize_contact_phone();


--
-- Name: password_reset_requests trg_rate_limit_reset; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_rate_limit_reset BEFORE INSERT ON public.password_reset_requests FOR EACH ROW EXECUTE FUNCTION public.rate_limit_reset_requests();


--
-- Name: conversation_transfers trg_set_transfer_ticket; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_transfer_ticket BEFORE INSERT ON public.conversation_transfers FOR EACH ROW EXECUTE FUNCTION public.trg_fn_set_transfer_ticket();


--
-- Name: messages trg_sicoob_reply; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sicoob_reply AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.notify_sicoob_on_reply();


--
-- Name: global_settings trigger_global_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_global_settings_updated_at BEFORE UPDATE ON public.global_settings FOR EACH ROW EXECUTE FUNCTION public.update_global_settings_updated_at();


--
-- Name: agent_stats update_agent_stats_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_agent_stats_updated_at BEFORE UPDATE ON public.agent_stats FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ai_providers update_ai_providers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_ai_providers_updated_at BEFORE UPDATE ON public.ai_providers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: auto_close_config update_auto_close_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_auto_close_config_updated_at BEFORE UPDATE ON public.auto_close_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: automations update_automations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_automations_updated_at BEFORE UPDATE ON public.automations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: away_messages update_away_messages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_away_messages_updated_at BEFORE UPDATE ON public.away_messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: business_hours update_business_hours_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_business_hours_updated_at BEFORE UPDATE ON public.business_hours FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: campaigns update_campaigns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: channel_connections update_channel_connections_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_channel_connections_updated_at BEFORE UPDATE ON public.channel_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: chatbot_flows update_chatbot_flows_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_chatbot_flows_updated_at BEFORE UPDATE ON public.chatbot_flows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: contact_custom_fields update_contact_custom_fields_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_contact_custom_fields_updated_at BEFORE UPDATE ON public.contact_custom_fields FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: contact_notes update_contact_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_contact_notes_updated_at BEFORE UPDATE ON public.contact_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: contact_purchases update_contact_purchases_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_contact_purchases_updated_at BEFORE UPDATE ON public.contact_purchases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: contacts update_contacts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: conversation_memory update_conversation_memory_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_conversation_memory_updated_at BEFORE UPDATE ON public.conversation_memory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: conversation_sla update_conversation_sla_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_conversation_sla_updated_at BEFORE UPDATE ON public.conversation_sla FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: conversation_tasks update_conversation_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_conversation_tasks_updated_at BEFORE UPDATE ON public.conversation_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_threads update_email_threads_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_email_threads_updated_at BEFORE UPDATE ON public.email_threads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: geo_blocking_settings update_geo_blocking_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_geo_blocking_settings_updated_at BEFORE UPDATE ON public.geo_blocking_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: gmail_accounts update_gmail_accounts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_gmail_accounts_updated_at BEFORE UPDATE ON public.gmail_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: goals_configurations update_goals_configurations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_goals_configurations_updated_at BEFORE UPDATE ON public.goals_configurations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: knowledge_base_articles update_kb_articles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_kb_articles_updated_at BEFORE UPDATE ON public.knowledge_base_articles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: agent_stats update_level_on_xp_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_level_on_xp_change BEFORE INSERT OR UPDATE OF xp ON public.agent_stats FOR EACH ROW EXECUTE FUNCTION public.update_agent_level();


--
-- Name: message_templates update_message_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_message_templates_updated_at BEFORE UPDATE ON public.message_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: messages update_messages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: number_reputation update_number_reputation_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_number_reputation_updated_at BEFORE UPDATE ON public.number_reputation FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payment_links update_payment_links_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_payment_links_updated_at BEFORE UPDATE ON public.payment_links FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sales_pipeline_stages update_pipeline_stages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_pipeline_stages_updated_at BEFORE UPDATE ON public.sales_pipeline_stages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: playbooks update_playbooks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_playbooks_updated_at BEFORE UPDATE ON public.playbooks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: products update_products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: queue_goals update_queue_goals_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_queue_goals_updated_at BEFORE UPDATE ON public.queue_goals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: queues update_queues_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_queues_updated_at BEFORE UPDATE ON public.queues FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: rate_limit_configs update_rate_limit_configs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_rate_limit_configs_updated_at BEFORE UPDATE ON public.rate_limit_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sales_deals update_sales_deals_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_sales_deals_updated_at BEFORE UPDATE ON public.sales_deals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: saved_filters update_saved_filters_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_saved_filters_updated_at BEFORE UPDATE ON public.saved_filters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: scheduled_messages update_scheduled_messages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_scheduled_messages_updated_at BEFORE UPDATE ON public.scheduled_messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: scheduled_report_configs update_scheduled_report_configs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_scheduled_report_configs_updated_at BEFORE UPDATE ON public.scheduled_report_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: scheduled_reports update_scheduled_reports_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_scheduled_reports_updated_at BEFORE UPDATE ON public.scheduled_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sla_configurations update_sla_configurations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_sla_configurations_updated_at BEFORE UPDATE ON public.sla_configurations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sla_rules update_sla_rules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_sla_rules_updated_at BEFORE UPDATE ON public.sla_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tags update_tags_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON public.tags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: talkx_campaigns update_talkx_campaigns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_talkx_campaigns_updated_at BEFORE UPDATE ON public.talkx_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: talkx_recipients update_talkx_recipients_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_talkx_recipients_updated_at BEFORE UPDATE ON public.talkx_recipients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: team_conversations update_team_conversations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_team_conversations_updated_at BEFORE UPDATE ON public.team_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: team_messages update_team_messages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_team_messages_updated_at BEFORE UPDATE ON public.team_messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_devices update_user_devices_last_seen; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_devices_last_seen BEFORE UPDATE ON public.user_devices FOR EACH ROW EXECUTE FUNCTION public.update_device_last_seen();


--
-- Name: user_service_accounts update_user_service_accounts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_service_accounts_updated_at BEFORE UPDATE ON public.user_service_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_settings update_user_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: whatsapp_connections update_whatsapp_connections_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_whatsapp_connections_updated_at BEFORE UPDATE ON public.whatsapp_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: whatsapp_flows update_whatsapp_flows_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_whatsapp_flows_updated_at BEFORE UPDATE ON public.whatsapp_flows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: whatsapp_groups update_whatsapp_groups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_whatsapp_groups_updated_at BEFORE UPDATE ON public.whatsapp_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: whatsapp_templates update_whatsapp_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_whatsapp_templates_updated_at BEFORE UPDATE ON public.whatsapp_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: agent_achievements agent_achievements_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_achievements
    ADD CONSTRAINT agent_achievements_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: agent_skills agent_skills_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_skills
    ADD CONSTRAINT agent_skills_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: agent_stats agent_stats_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_stats
    ADD CONSTRAINT agent_stats_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: agent_visibility_grants agent_visibility_grants_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_visibility_grants
    ADD CONSTRAINT agent_visibility_grants_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: agent_visibility_grants agent_visibility_grants_can_see_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_visibility_grants
    ADD CONSTRAINT agent_visibility_grants_can_see_agent_id_fkey FOREIGN KEY (can_see_agent_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: agent_visibility_grants agent_visibility_grants_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_visibility_grants
    ADD CONSTRAINT agent_visibility_grants_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: ai_conversation_tags ai_conversation_tags_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_conversation_tags
    ADD CONSTRAINT ai_conversation_tags_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: ai_providers ai_providers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_providers
    ADD CONSTRAINT ai_providers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: ai_usage_logs ai_usage_logs_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT ai_usage_logs_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- Name: allowed_countries allowed_countries_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allowed_countries
    ADD CONSTRAINT allowed_countries_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id);


--
-- Name: audio_meme_favorites audio_meme_favorites_meme_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_meme_favorites
    ADD CONSTRAINT audio_meme_favorites_meme_id_fkey FOREIGN KEY (meme_id) REFERENCES public.audio_memes(id) ON DELETE CASCADE;


--
-- Name: audio_meme_favorites audio_meme_favorites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_meme_favorites
    ADD CONSTRAINT audio_meme_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: audio_memes audio_memes_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_memes
    ADD CONSTRAINT audio_memes_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: auto_close_config auto_close_config_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_close_config
    ADD CONSTRAINT auto_close_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: automations automations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automations
    ADD CONSTRAINT automations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: away_messages away_messages_whatsapp_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.away_messages
    ADD CONSTRAINT away_messages_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE;


--
-- Name: blocked_countries blocked_countries_blocked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_countries
    ADD CONSTRAINT blocked_countries_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES auth.users(id);


--
-- Name: blocked_ips blocked_ips_blocked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_ips
    ADD CONSTRAINT blocked_ips_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: business_hours business_hours_whatsapp_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_hours
    ADD CONSTRAINT business_hours_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE;


--
-- Name: calls calls_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: calls calls_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: calls calls_whatsapp_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL;


--
-- Name: campaign_ab_variants campaign_ab_variants_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_ab_variants
    ADD CONSTRAINT campaign_ab_variants_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_contacts campaign_contacts_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_contacts
    ADD CONSTRAINT campaign_contacts_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_contacts campaign_contacts_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_contacts
    ADD CONSTRAINT campaign_contacts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: campaigns campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: campaigns campaigns_whatsapp_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id);


--
-- Name: channel_connections channel_connections_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_connections
    ADD CONSTRAINT channel_connections_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: channel_connections channel_connections_whatsapp_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_connections
    ADD CONSTRAINT channel_connections_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id);


--
-- Name: channel_routing_rules channel_routing_rules_channel_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_routing_rules
    ADD CONSTRAINT channel_routing_rules_channel_connection_id_fkey FOREIGN KEY (channel_connection_id) REFERENCES public.channel_connections(id);


--
-- Name: channel_routing_rules channel_routing_rules_queue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_routing_rules
    ADD CONSTRAINT channel_routing_rules_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.queues(id);


--
-- Name: chatbot_executions chatbot_executions_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_executions
    ADD CONSTRAINT chatbot_executions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: chatbot_executions chatbot_executions_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_executions
    ADD CONSTRAINT chatbot_executions_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.chatbot_flows(id) ON DELETE CASCADE;


--
-- Name: chatbot_flows chatbot_flows_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_flows
    ADD CONSTRAINT chatbot_flows_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: chatbot_flows chatbot_flows_whatsapp_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_flows
    ADD CONSTRAINT chatbot_flows_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id);


--
-- Name: client_wallet_rules client_wallet_rules_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_wallet_rules
    ADD CONSTRAINT client_wallet_rules_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: client_wallet_rules client_wallet_rules_whatsapp_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_wallet_rules
    ADD CONSTRAINT client_wallet_rules_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE;


--
-- Name: connection_alert_preferences connection_alert_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connection_alert_preferences
    ADD CONSTRAINT connection_alert_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: connection_health_logs connection_health_logs_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connection_health_logs
    ADD CONSTRAINT connection_health_logs_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE;


--
-- Name: contact_custom_fields contact_custom_fields_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_custom_fields
    ADD CONSTRAINT contact_custom_fields_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_notes contact_notes_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_notes
    ADD CONSTRAINT contact_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: contact_notes contact_notes_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_notes
    ADD CONSTRAINT contact_notes_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_purchases contact_purchases_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_purchases
    ADD CONSTRAINT contact_purchases_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_purchases contact_purchases_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_purchases
    ADD CONSTRAINT contact_purchases_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: contact_purchases contact_purchases_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_purchases
    ADD CONSTRAINT contact_purchases_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.sales_deals(id);


--
-- Name: contact_tags contact_tags_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tags
    ADD CONSTRAINT contact_tags_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_tags contact_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tags
    ADD CONSTRAINT contact_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_channel_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_channel_connection_id_fkey FOREIGN KEY (channel_connection_id) REFERENCES public.channel_connections(id);


--
-- Name: contacts contacts_queue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.queues(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_whatsapp_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL;


--
-- Name: conversation_analyses conversation_analyses_analyzed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_analyses
    ADD CONSTRAINT conversation_analyses_analyzed_by_fkey FOREIGN KEY (analyzed_by) REFERENCES public.profiles(id);


--
-- Name: conversation_analyses conversation_analyses_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_analyses
    ADD CONSTRAINT conversation_analyses_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: conversation_closures conversation_closures_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_closures
    ADD CONSTRAINT conversation_closures_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: conversation_closures conversation_closures_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_closures
    ADD CONSTRAINT conversation_closures_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: conversation_events conversation_events_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_events
    ADD CONSTRAINT conversation_events_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: conversation_events conversation_events_from_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_events
    ADD CONSTRAINT conversation_events_from_agent_id_fkey FOREIGN KEY (from_agent_id) REFERENCES public.profiles(id);


--
-- Name: conversation_events conversation_events_from_queue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_events
    ADD CONSTRAINT conversation_events_from_queue_id_fkey FOREIGN KEY (from_queue_id) REFERENCES public.queues(id);


--
-- Name: conversation_events conversation_events_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_events
    ADD CONSTRAINT conversation_events_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.profiles(id);


--
-- Name: conversation_events conversation_events_to_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_events
    ADD CONSTRAINT conversation_events_to_agent_id_fkey FOREIGN KEY (to_agent_id) REFERENCES public.profiles(id);


--
-- Name: conversation_events conversation_events_to_queue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_events
    ADD CONSTRAINT conversation_events_to_queue_id_fkey FOREIGN KEY (to_queue_id) REFERENCES public.queues(id);


--
-- Name: conversation_memory conversation_memory_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_memory
    ADD CONSTRAINT conversation_memory_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: conversation_memory conversation_memory_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_memory
    ADD CONSTRAINT conversation_memory_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: conversation_sla conversation_sla_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_sla
    ADD CONSTRAINT conversation_sla_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: conversation_sla conversation_sla_sla_configuration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_sla
    ADD CONSTRAINT conversation_sla_sla_configuration_id_fkey FOREIGN KEY (sla_configuration_id) REFERENCES public.sla_configurations(id);


--
-- Name: conversation_snoozes conversation_snoozes_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_snoozes
    ADD CONSTRAINT conversation_snoozes_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: conversation_snoozes conversation_snoozes_snoozed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_snoozes
    ADD CONSTRAINT conversation_snoozes_snoozed_by_fkey FOREIGN KEY (snoozed_by) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: conversation_tasks conversation_tasks_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_tasks
    ADD CONSTRAINT conversation_tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: conversation_tasks conversation_tasks_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_tasks
    ADD CONSTRAINT conversation_tasks_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: conversation_tasks conversation_tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_tasks
    ADD CONSTRAINT conversation_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: conversation_transfers conversation_transfers_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_transfers
    ADD CONSTRAINT conversation_transfers_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: conversation_transfers conversation_transfers_from_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_transfers
    ADD CONSTRAINT conversation_transfers_from_agent_id_fkey FOREIGN KEY (from_agent_id) REFERENCES public.profiles(id);


--
-- Name: conversation_transfers conversation_transfers_to_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_transfers
    ADD CONSTRAINT conversation_transfers_to_agent_id_fkey FOREIGN KEY (to_agent_id) REFERENCES public.profiles(id);


--
-- Name: crisis_room_alerts crisis_room_alerts_acknowledged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crisis_room_alerts
    ADD CONSTRAINT crisis_room_alerts_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES public.profiles(id);


--
-- Name: csat_auto_config csat_auto_config_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.csat_auto_config
    ADD CONSTRAINT csat_auto_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);


--
-- Name: csat_auto_config csat_auto_config_whatsapp_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.csat_auto_config
    ADD CONSTRAINT csat_auto_config_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id);


--
-- Name: csat_surveys csat_surveys_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.csat_surveys
    ADD CONSTRAINT csat_surveys_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: csat_surveys csat_surveys_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.csat_surveys
    ADD CONSTRAINT csat_surveys_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: deal_activities deal_activities_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_activities
    ADD CONSTRAINT deal_activities_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.sales_deals(id) ON DELETE CASCADE;


--
-- Name: deal_activities deal_activities_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_activities
    ADD CONSTRAINT deal_activities_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: department_invitations department_invitations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_invitations
    ADD CONSTRAINT department_invitations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: department_invitations department_invitations_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_invitations
    ADD CONSTRAINT department_invitations_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: department_invitations department_invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_invitations
    ADD CONSTRAINT department_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);


--
-- Name: dlq_audit_log dlq_audit_log_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dlq_audit_log
    ADD CONSTRAINT dlq_audit_log_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES auth.users(id);


--
-- Name: email_accounts email_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_accounts
    ADD CONSTRAINT email_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: email_labels email_labels_gmail_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_labels
    ADD CONSTRAINT email_labels_gmail_account_id_fkey FOREIGN KEY (gmail_account_id) REFERENCES public.gmail_accounts(id) ON DELETE CASCADE;


--
-- Name: email_messages email_messages_gmail_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_gmail_account_id_fkey FOREIGN KEY (gmail_account_id) REFERENCES public.gmail_accounts(id) ON DELETE CASCADE;


--
-- Name: email_messages email_messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.email_threads(id) ON DELETE CASCADE;


--
-- Name: email_threads email_threads_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_threads
    ADD CONSTRAINT email_threads_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: email_threads email_threads_gmail_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_threads
    ADD CONSTRAINT email_threads_gmail_account_id_fkey FOREIGN KEY (gmail_account_id) REFERENCES public.gmail_accounts(id) ON DELETE CASCADE;


--
-- Name: evolution_health_logs evolution_health_logs_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evolution_health_logs
    ADD CONSTRAINT evolution_health_logs_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE;


--
-- Name: evolution_instance_credentials evolution_instance_credentials_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evolution_instance_credentials
    ADD CONSTRAINT evolution_instance_credentials_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE;


--
-- Name: favorite_contacts favorite_contacts_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_contacts
    ADD CONSTRAINT favorite_contacts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: favorite_contacts favorite_contacts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_contacts
    ADD CONSTRAINT favorite_contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: followup_executions followup_executions_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followup_executions
    ADD CONSTRAINT followup_executions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: followup_executions followup_executions_sequence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followup_executions
    ADD CONSTRAINT followup_executions_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES public.followup_sequences(id);


--
-- Name: followup_sequences followup_sequences_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followup_sequences
    ADD CONSTRAINT followup_sequences_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: followup_sequences followup_sequences_whatsapp_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followup_sequences
    ADD CONSTRAINT followup_sequences_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id);


--
-- Name: followup_steps followup_steps_sequence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followup_steps
    ADD CONSTRAINT followup_steps_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES public.followup_sequences(id) ON DELETE CASCADE;


--
-- Name: geo_blocking_settings geo_blocking_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geo_blocking_settings
    ADD CONSTRAINT geo_blocking_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: goals_configurations goals_configurations_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals_configurations
    ADD CONSTRAINT goals_configurations_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: goals_configurations goals_configurations_queue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals_configurations
    ADD CONSTRAINT goals_configurations_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.queues(id) ON DELETE CASCADE;


--
-- Name: instance_registry instance_registry_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instance_registry
    ADD CONSTRAINT instance_registry_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id);


--
-- Name: ip_whitelist ip_whitelist_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_whitelist
    ADD CONSTRAINT ip_whitelist_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: knowledge_base_articles knowledge_base_articles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_base_articles
    ADD CONSTRAINT knowledge_base_articles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: knowledge_base_files knowledge_base_files_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_base_files
    ADD CONSTRAINT knowledge_base_files_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.knowledge_base_articles(id) ON DELETE CASCADE;


--
-- Name: message_reactions message_reactions_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: message_reactions message_reactions_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;


--
-- Name: message_reactions message_reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: messages messages_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: messages messages_channel_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_channel_connection_id_fkey FOREIGN KEY (channel_connection_id) REFERENCES public.channel_connections(id);


--
-- Name: messages messages_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: messages messages_reply_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: messages messages_whatsapp_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL;


--
-- Name: meta_capi_events meta_capi_events_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_capi_events
    ADD CONSTRAINT meta_capi_events_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: mfa_sessions mfa_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfa_sessions
    ADD CONSTRAINT mfa_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: nps_surveys nps_surveys_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nps_surveys
    ADD CONSTRAINT nps_surveys_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id);


--
-- Name: nps_surveys nps_surveys_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nps_surveys
    ADD CONSTRAINT nps_surveys_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: number_reputation number_reputation_whatsapp_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.number_reputation
    ADD CONSTRAINT number_reputation_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE;


--
-- Name: passkey_credentials passkey_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passkey_credentials
    ADD CONSTRAINT passkey_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: password_reset_requests password_reset_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_requests
    ADD CONSTRAINT password_reset_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);


--
-- Name: password_reset_requests password_reset_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_requests
    ADD CONSTRAINT password_reset_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: payment_links payment_links_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_links
    ADD CONSTRAINT payment_links_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: payment_links payment_links_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_links
    ADD CONSTRAINT payment_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: payment_links payment_links_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_links
    ADD CONSTRAINT payment_links_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.sales_deals(id) ON DELETE SET NULL;


--
-- Name: pinned_conversations pinned_conversations_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pinned_conversations
    ADD CONSTRAINT pinned_conversations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: pinned_conversations pinned_conversations_pinned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pinned_conversations
    ADD CONSTRAINT pinned_conversations_pinned_by_fkey FOREIGN KEY (pinned_by) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: playbooks playbooks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playbooks
    ADD CONSTRAINT playbooks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: products products_whatsapp_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: qr_attempts qr_attempts_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_attempts
    ADD CONSTRAINT qr_attempts_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE;


--
-- Name: qr_attempts qr_attempts_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_attempts
    ADD CONSTRAINT qr_attempts_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id);


--
-- Name: queue_goals queue_goals_queue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_goals
    ADD CONSTRAINT queue_goals_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.queues(id) ON DELETE CASCADE;


--
-- Name: queue_members queue_members_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_members
    ADD CONSTRAINT queue_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: queue_members queue_members_queue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_members
    ADD CONSTRAINT queue_members_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.queues(id) ON DELETE CASCADE;


--
-- Name: queue_positions queue_positions_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_positions
    ADD CONSTRAINT queue_positions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: queue_positions queue_positions_queue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_positions
    ADD CONSTRAINT queue_positions_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.queues(id);


--
-- Name: queue_skill_requirements queue_skill_requirements_queue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_skill_requirements
    ADD CONSTRAINT queue_skill_requirements_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.queues(id) ON DELETE CASCADE;


--
-- Name: rate_limit_logs rate_limit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit_logs
    ADD CONSTRAINT rate_limit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: reconnection_logs reconnection_logs_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconnection_logs
    ADD CONSTRAINT reconnection_logs_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE;


--
-- Name: reminders reminders_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: reminders reminders_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: sales_deals sales_deals_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_deals
    ADD CONSTRAINT sales_deals_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: sales_deals sales_deals_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_deals
    ADD CONSTRAINT sales_deals_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: sales_deals sales_deals_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_deals
    ADD CONSTRAINT sales_deals_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.sales_pipeline_stages(id) ON DELETE SET NULL;


--
-- Name: scheduled_messages scheduled_messages_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_messages
    ADD CONSTRAINT scheduled_messages_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: scheduled_messages scheduled_messages_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_messages
    ADD CONSTRAINT scheduled_messages_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: scheduled_messages scheduled_messages_whatsapp_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_messages
    ADD CONSTRAINT scheduled_messages_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id);


--
-- Name: scheduled_report_configs scheduled_report_configs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_report_configs
    ADD CONSTRAINT scheduled_report_configs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: security_alerts security_alerts_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_alerts
    ADD CONSTRAINT security_alerts_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: security_alerts security_alerts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_alerts
    ADD CONSTRAINT security_alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: security_audit_logs security_audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_audit_logs
    ADD CONSTRAINT security_audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: sicoob_contact_mapping sicoob_contact_mapping_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sicoob_contact_mapping
    ADD CONSTRAINT sicoob_contact_mapping_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: sicoob_contact_mapping sicoob_contact_mapping_zappweb_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sicoob_contact_mapping
    ADD CONSTRAINT sicoob_contact_mapping_zappweb_agent_id_fkey FOREIGN KEY (zappweb_agent_id) REFERENCES public.profiles(id);


--
-- Name: sla_rules sla_rules_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sla_rules
    ADD CONSTRAINT sla_rules_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: sla_rules sla_rules_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sla_rules
    ADD CONSTRAINT sla_rules_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: sla_rules sla_rules_queue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sla_rules
    ADD CONSTRAINT sla_rules_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.queues(id) ON DELETE CASCADE;


--
-- Name: stickers stickers_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stickers
    ADD CONSTRAINT stickers_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: tags tags_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: talkx_blacklist talkx_blacklist_blocked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.talkx_blacklist
    ADD CONSTRAINT talkx_blacklist_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: talkx_blacklist talkx_blacklist_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.talkx_blacklist
    ADD CONSTRAINT talkx_blacklist_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: talkx_campaigns talkx_campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.talkx_campaigns
    ADD CONSTRAINT talkx_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: talkx_campaigns talkx_campaigns_whatsapp_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.talkx_campaigns
    ADD CONSTRAINT talkx_campaigns_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id);


--
-- Name: talkx_recipients talkx_recipients_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.talkx_recipients
    ADD CONSTRAINT talkx_recipients_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE;


--
-- Name: talkx_recipients talkx_recipients_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.talkx_recipients
    ADD CONSTRAINT talkx_recipients_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: team_conversation_members team_conversation_members_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_conversation_members
    ADD CONSTRAINT team_conversation_members_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.team_conversations(id) ON DELETE CASCADE;


--
-- Name: team_conversation_members team_conversation_members_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_conversation_members
    ADD CONSTRAINT team_conversation_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: team_conversations team_conversations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_conversations
    ADD CONSTRAINT team_conversations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: team_message_receipts team_message_receipts_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_message_receipts
    ADD CONSTRAINT team_message_receipts_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.team_messages(id) ON DELETE CASCADE;


--
-- Name: team_message_receipts team_message_receipts_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_message_receipts
    ADD CONSTRAINT team_message_receipts_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: team_messages team_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_messages
    ADD CONSTRAINT team_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.team_conversations(id) ON DELETE CASCADE;


--
-- Name: team_messages team_messages_reply_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_messages
    ADD CONSTRAINT team_messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.team_messages(id);


--
-- Name: team_messages team_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_messages
    ADD CONSTRAINT team_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id);


--
-- Name: training_sessions training_sessions_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_sessions
    ADD CONSTRAINT training_sessions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: transfer_comments transfer_comments_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_comments
    ADD CONSTRAINT transfer_comments_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id);


--
-- Name: transfer_comments transfer_comments_transfer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_comments
    ADD CONSTRAINT transfer_comments_transfer_id_fkey FOREIGN KEY (transfer_id) REFERENCES public.conversation_transfers(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.user_devices(id) ON DELETE SET NULL;


--
-- Name: user_settings user_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: warroom_alerts warroom_alerts_dismissed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warroom_alerts
    ADD CONSTRAINT warroom_alerts_dismissed_by_fkey FOREIGN KEY (dismissed_by) REFERENCES public.profiles(id);


--
-- Name: whatsapp_connection_queues whatsapp_connection_queues_queue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_connection_queues
    ADD CONSTRAINT whatsapp_connection_queues_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.queues(id) ON DELETE CASCADE;


--
-- Name: whatsapp_connection_queues whatsapp_connection_queues_whatsapp_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_connection_queues
    ADD CONSTRAINT whatsapp_connection_queues_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE;


--
-- Name: whatsapp_connections whatsapp_connections_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_connections
    ADD CONSTRAINT whatsapp_connections_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: whatsapp_flows whatsapp_flows_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_flows
    ADD CONSTRAINT whatsapp_flows_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: whatsapp_flows whatsapp_flows_whatsapp_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_flows
    ADD CONSTRAINT whatsapp_flows_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL;


--
-- Name: whatsapp_groups whatsapp_groups_whatsapp_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_groups
    ADD CONSTRAINT whatsapp_groups_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE;


--
-- Name: whatsapp_official_credentials whatsapp_official_credentials_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_official_credentials
    ADD CONSTRAINT whatsapp_official_credentials_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE;


--
-- Name: whatsapp_templates whatsapp_templates_whatsapp_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id);


--
-- Name: whisper_messages whisper_messages_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whisper_messages
    ADD CONSTRAINT whisper_messages_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: whisper_messages whisper_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whisper_messages
    ADD CONSTRAINT whisper_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id);


--
-- Name: whisper_messages whisper_messages_target_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whisper_messages
    ADD CONSTRAINT whisper_messages_target_agent_id_fkey FOREIGN KEY (target_agent_id) REFERENCES public.profiles(id);


--
-- Name: messages Access control for messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Access control for messages" ON public.messages FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['dev'::public.app_role, 'admin'::public.app_role, 'manager'::public.app_role]))))) OR (EXISTS ( SELECT 1
   FROM (public.queue_members qm
     JOIN public.contacts c ON ((c.queue_id = qm.queue_id)))
  WHERE ((qm.profile_id = ( SELECT profiles.id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid())
         LIMIT 1)) AND (EXISTS ( SELECT 1
           FROM public.user_roles
          WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'supervisor'::public.app_role)))) AND (c.id = messages.contact_id)))) OR (EXISTS ( SELECT 1
   FROM public.contacts
  WHERE ((contacts.id = messages.contact_id) AND (contacts.assigned_to = auth.uid()))))));


--
-- Name: profiles Admin supervisor can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin supervisor can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: whatsapp_connections Admin supervisor view connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin supervisor view connections" ON public.whatsapp_connections FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: automations Admin/supervisor can create automations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/supervisor can create automations" ON public.automations FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: automations Admin/supervisor can delete automations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/supervisor can delete automations" ON public.automations FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: scheduled_report_configs Admin/supervisor can delete report configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/supervisor can delete report configs" ON public.scheduled_report_configs FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: scheduled_report_configs Admin/supervisor can insert report configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/supervisor can insert report configs" ON public.scheduled_report_configs FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: automations Admin/supervisor can update automations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/supervisor can update automations" ON public.automations FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: scheduled_report_configs Admin/supervisor can update report configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/supervisor can update report configs" ON public.scheduled_report_configs FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: nps_surveys Admins and own agents can view NPS surveys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and own agents can view NPS surveys" ON public.nps_surveys FOR SELECT TO authenticated USING ((public.is_admin_or_supervisor(auth.uid()) OR (agent_id = ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1))));


--
-- Name: sla_rules Admins and supervisors can delete SLA rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and supervisors can delete SLA rules" ON public.sla_rules FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: sla_rules Admins and supervisors can insert SLA rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and supervisors can insert SLA rules" ON public.sla_rules FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: agent_visibility_grants Admins and supervisors can manage visibility grants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and supervisors can manage visibility grants" ON public.agent_visibility_grants TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: sla_rules Admins and supervisors can update SLA rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and supervisors can update SLA rules" ON public.sla_rules FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: departments Admins and supervisors can view departments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and supervisors can view departments" ON public.departments FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: talkx_blacklist Admins can add to blacklist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can add to blacklist" ON public.talkx_blacklist FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: ai_providers Admins can delete AI providers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete AI providers" ON public.ai_providers FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: nps_surveys Admins can delete NPS surveys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete NPS surveys" ON public.nps_surveys FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: ai_conversation_tags Admins can delete ai tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete ai tags" ON public.ai_conversation_tags FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: allowed_countries Admins can delete allowed countries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete allowed countries" ON public.allowed_countries FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: blocked_ips Admins can delete blocked IPs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete blocked IPs" ON public.blocked_ips FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: blocked_countries Admins can delete blocked countries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete blocked countries" ON public.blocked_countries FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: whatsapp_connections Admins can delete connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete connections" ON public.whatsapp_connections FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: crisis_room_alerts Admins can delete crisis alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete crisis alerts" ON public.crisis_room_alerts FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: sales_deals Admins can delete deals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete deals" ON public.sales_deals FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: connection_health_logs Admins can delete health logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete health logs" ON public.connection_health_logs FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: whatsapp_official_credentials Admins can delete official credentials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete official credentials" ON public.whatsapp_official_credentials FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: password_reset_requests Admins can delete password reset requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete password reset requests" ON public.password_reset_requests FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: payment_links Admins can delete payment links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete payment links" ON public.payment_links FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: performance_snapshots Admins can delete performance snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete performance snapshots" ON public.performance_snapshots FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: playbooks Admins can delete playbooks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete playbooks" ON public.playbooks FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: webhook_rate_limits Admins can delete rate limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete rate limits" ON public.webhook_rate_limits FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: query_telemetry Admins can delete telemetry; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete telemetry" ON public.query_telemetry FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: warroom_alerts Admins can delete warroom alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete warroom alerts" ON public.warroom_alerts FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: ai_providers Admins can insert AI providers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert AI providers" ON public.ai_providers FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: conversation_sla Admins can insert SLA; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert SLA" ON public.conversation_sla FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: warroom_alerts Admins can insert alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert alerts" ON public.warroom_alerts FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: allowed_countries Admins can insert allowed countries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert allowed countries" ON public.allowed_countries FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: blocked_ips Admins can insert blocked IPs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert blocked IPs" ON public.blocked_ips FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: blocked_countries Admins can insert blocked countries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert blocked countries" ON public.blocked_countries FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: campaign_contacts Admins can insert campaign contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert campaign contacts" ON public.campaign_contacts FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: campaigns Admins can insert campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert campaigns" ON public.campaigns FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: chatbot_flows Admins can insert chatbot flows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert chatbot flows" ON public.chatbot_flows FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: whatsapp_connections Admins can insert connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert connections" ON public.whatsapp_connections FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: crisis_room_alerts Admins can insert crisis alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert crisis alerts" ON public.crisis_room_alerts FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: connection_health_logs Admins can insert health logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert health logs" ON public.connection_health_logs FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: whatsapp_official_credentials Admins can insert official credentials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert official credentials" ON public.whatsapp_official_credentials FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: products Admins can insert products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert products" ON public.products FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: rate_limit_logs Admins can insert rate limit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert rate limit logs" ON public.rate_limit_logs FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: webhook_rate_limits Admins can insert rate limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert rate limits" ON public.webhook_rate_limits FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: number_reputation Admins can insert reputation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert reputation" ON public.number_reputation FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: scheduled_reports Admins can insert scheduled reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert scheduled reports" ON public.scheduled_reports FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: security_alerts Admins can insert security alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert security alerts" ON public.security_alerts FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: whatsapp_templates Admins can insert templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert templates" ON public.whatsapp_templates FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: ip_whitelist Admins can manage IP whitelist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage IP whitelist" ON public.ip_whitelist TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: sla_configurations Admins can manage SLA configurations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage SLA configurations" ON public.sla_configurations TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: auto_close_config Admins can manage auto-close config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage auto-close config" ON public.auto_close_config TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: away_messages Admins can manage away messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage away messages" ON public.away_messages TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: business_hours Admins can manage business hours; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage business hours" ON public.business_hours TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: campaign_contacts Admins can manage campaign contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage campaign contacts" ON public.campaign_contacts TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: campaigns Admins can manage campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage campaigns" ON public.campaigns TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: meta_capi_events Admins can manage capi events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage capi events" ON public.meta_capi_events TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: chatbot_executions Admins can manage chatbot executions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage chatbot executions" ON public.chatbot_executions TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: chatbot_flows Admins can manage chatbot flows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage chatbot flows" ON public.chatbot_flows TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: whatsapp_connection_queues Admins can manage connection queues; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage connection queues" ON public.whatsapp_connection_queues TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: csat_auto_config Admins can manage csat config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage csat config" ON public.csat_auto_config TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: departments Admins can manage departments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage departments" ON public.departments TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'supervisor'::public.app_role]))))));


--
-- Name: followup_executions Admins can manage followup executions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage followup executions" ON public.followup_executions TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: followup_sequences Admins can manage followup sequences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage followup sequences" ON public.followup_sequences TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: followup_steps Admins can manage followup steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage followup steps" ON public.followup_steps TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: geo_blocking_settings Admins can manage geo settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage geo settings" ON public.geo_blocking_settings TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: global_settings Admins can manage global settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage global settings" ON public.global_settings TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: knowledge_base_files Admins can manage kb files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage kb files" ON public.knowledge_base_files TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: knowledge_base_articles Admins can manage knowledge base; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage knowledge base" ON public.knowledge_base_articles TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: instance_processing_pauses Admins can manage pauses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage pauses" ON public.instance_processing_pauses TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'supervisor'::public.app_role]))))));


--
-- Name: permissions Admins can manage permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage permissions" ON public.permissions TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: sales_pipeline_stages Admins can manage pipeline stages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage pipeline stages" ON public.sales_pipeline_stages TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: playbooks Admins can manage playbooks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage playbooks" ON public.playbooks FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: products Admins can manage products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage products" ON public.products TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: queue_goals Admins can manage queue goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage queue goals" ON public.queue_goals TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: queue_members Admins can manage queue members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage queue members" ON public.queue_members TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: queue_positions Admins can manage queue positions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage queue positions" ON public.queue_positions TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: queue_skill_requirements Admins can manage queue skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage queue skills" ON public.queue_skill_requirements TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: queues Admins can manage queues; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage queues" ON public.queues TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: rate_limit_configs Admins can manage rate limit configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage rate limit configs" ON public.rate_limit_configs TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: role_permissions Admins can manage role permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage role permissions" ON public.role_permissions TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: channel_routing_rules Admins can manage routing rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage routing rules" ON public.channel_routing_rules TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: scheduled_reports Admins can manage scheduled reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage scheduled reports" ON public.scheduled_reports TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: security_alerts Admins can manage security alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage security alerts" ON public.security_alerts TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: agent_skills Admins can manage skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage skills" ON public.agent_skills TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: tags Admins can manage tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage tags" ON public.tags TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: whatsapp_templates Admins can manage templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage templates" ON public.whatsapp_templates TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: client_wallet_rules Admins can manage wallet rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage wallet rules" ON public.client_wallet_rules TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: whatsapp_flows Admins can manage whatsapp flows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage whatsapp flows" ON public.whatsapp_flows TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: whatsapp_groups Admins can manage whatsapp groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage whatsapp groups" ON public.whatsapp_groups TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: whatsapp_official_credentials Admins can read non-secret metadata; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read non-secret metadata" ON public.whatsapp_official_credentials FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: rate_limit_configs Admins can read rate limit configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read rate limit configs" ON public.rate_limit_configs FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: scheduled_report_configs Admins can read report configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read report configs" ON public.scheduled_report_configs FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: talkx_blacklist Admins can remove from blacklist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can remove from blacklist" ON public.talkx_blacklist FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: ai_providers Admins can update AI providers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update AI providers" ON public.ai_providers FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: nps_surveys Admins can update NPS surveys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update NPS surveys" ON public.nps_surveys FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: conversation_sla Admins can update SLA; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update SLA" ON public.conversation_sla FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: ai_conversation_tags Admins can update ai tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update ai tags" ON public.ai_conversation_tags FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: warroom_alerts Admins can update alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update alerts" ON public.warroom_alerts FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: profiles Admins can update any profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: blocked_ips Admins can update blocked IPs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update blocked IPs" ON public.blocked_ips FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: whatsapp_connections Admins can update connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update connections" ON public.whatsapp_connections FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: team_conversation_members Admins can update conversation members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update conversation members" ON public.team_conversation_members FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: crisis_room_alerts Admins can update crisis alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update crisis alerts" ON public.crisis_room_alerts FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: whatsapp_official_credentials Admins can update official credentials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update official credentials" ON public.whatsapp_official_credentials FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: playbooks Admins can update playbooks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update playbooks" ON public.playbooks FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: webhook_rate_limits Admins can update rate limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update rate limits" ON public.webhook_rate_limits FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: number_reputation Admins can update reputation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update reputation" ON public.number_reputation FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: password_reset_requests Admins can update reset requests without token access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update reset requests without token access" ON public.password_reset_requests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: ai_providers Admins can view AI providers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view AI providers" ON public.ai_providers FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: ip_whitelist Admins can view IP whitelist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view IP whitelist" ON public.ip_whitelist FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: ai_usage_logs Admins can view all AI usage logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all AI usage logs" ON public.ai_usage_logs FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: talkx_campaigns Admins can view all campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all campaigns" ON public.talkx_campaigns FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: performance_snapshots Admins can view all performance snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all performance snapshots" ON public.performance_snapshots FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: user_service_accounts Admins can view all service accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all service accounts" ON public.user_service_accounts FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: user_devices Admins can view all user devices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all user devices" ON public.user_devices FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: allowed_countries Admins can view allowed countries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view allowed countries" ON public.allowed_countries FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: blocked_countries Admins can view blocked countries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view blocked countries" ON public.blocked_countries FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: campaign_contacts Admins can view campaign contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view campaign contacts" ON public.campaign_contacts FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: meta_capi_events Admins can view capi events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view capi events" ON public.meta_capi_events FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: reconnection_logs Admins can view connection logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view connection logs" ON public.reconnection_logs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'supervisor'::public.app_role]))))));


--
-- Name: deal_activities Admins can view deal activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view deal activities" ON public.deal_activities FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: entity_versions Admins can view entity versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view entity versions" ON public.entity_versions FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: followup_sequences Admins can view followup sequences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view followup sequences" ON public.followup_sequences FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: followup_steps Admins can view followup steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view followup steps" ON public.followup_steps FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: global_settings Admins can view global settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view global settings" ON public.global_settings FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: connection_health_logs Admins can view health logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view health logs" ON public.connection_health_logs FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: evolution_health_logs Admins can view health logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view health logs" ON public.evolution_health_logs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'supervisor'::public.app_role]))))));


--
-- Name: evolution_retry_metrics Admins can view metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view metrics" ON public.evolution_retry_metrics FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'supervisor'::public.app_role]))))));


--
-- Name: qr_attempts Admins can view qr attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view qr attempts" ON public.qr_attempts FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'supervisor'::public.app_role]))))));


--
-- Name: rate_limit_logs Admins can view rate limit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view rate limit logs" ON public.rate_limit_logs FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: webhook_rate_limits Admins can view rate limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view rate limits" ON public.webhook_rate_limits FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: password_reset_requests Admins can view reset requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view reset requests" ON public.password_reset_requests FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: scheduled_reports Admins can view scheduled reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view scheduled reports" ON public.scheduled_reports FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: warroom_alerts Admins can view warroom alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view warroom alerts" ON public.warroom_alerts FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: channel_connections Admins full access to channels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins full access to channels" ON public.channel_connections TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: department_invitations Admins manage invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage invitations" ON public.department_invitations TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'supervisor'::public.app_role]))))));


--
-- Name: audit_logs Admins view all audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins view all audit logs" ON public.audit_logs FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'dev'::public.app_role)));


--
-- Name: security_audit_logs Admins view all security audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins view all security audit logs" ON public.security_audit_logs FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'dev'::public.app_role)));


--
-- Name: failed_messages Admins view audit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins view audit" ON public.failed_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'supervisor'::public.app_role]))))));


--
-- Name: dlq_audit_log Admins view dlq; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins view dlq" ON public.dlq_audit_log FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'supervisor'::public.app_role]))))));


--
-- Name: dispatch_error_logs Admins view logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins view logs" ON public.dispatch_error_logs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'supervisor'::public.app_role]))))));


--
-- Name: rls_denied_log Admins view rls_denied_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins view rls_denied_log" ON public.rls_denied_log FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'supervisor'::public.app_role)));


--
-- Name: conversation_closures Agents can create closures for their contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can create closures for their contacts" ON public.conversation_closures FOR INSERT TO authenticated WITH CHECK (public.is_contact_visible_to_user(contact_id, auth.uid()));


--
-- Name: conversation_tasks Agents can create tasks for their contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can create tasks for their contacts" ON public.conversation_tasks FOR INSERT TO authenticated WITH CHECK (public.is_contact_visible_to_user(contact_id, auth.uid()));


--
-- Name: contact_purchases Agents can delete purchases for assigned contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can delete purchases for assigned contacts" ON public.contact_purchases FOR DELETE TO authenticated USING ((public.is_contact_visible_to_user(contact_id, auth.uid()) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: ai_conversation_tags Agents can delete tags on assigned contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can delete tags on assigned contacts" ON public.ai_conversation_tags FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM (public.contacts c
     JOIN public.profiles p ON ((p.id = c.assigned_to)))
  WHERE ((c.id = ai_conversation_tags.contact_id) AND (p.user_id = auth.uid())))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: conversation_memory Agents can insert memory for their contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can insert memory for their contacts" ON public.conversation_memory FOR INSERT TO authenticated WITH CHECK (public.is_contact_visible_to_user(contact_id, auth.uid()));


--
-- Name: contact_purchases Agents can insert purchases for assigned contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can insert purchases for assigned contacts" ON public.contact_purchases FOR INSERT TO authenticated WITH CHECK ((public.is_contact_visible_to_user(contact_id, auth.uid()) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: conversation_memory Agents can update memory for their contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can update memory for their contacts" ON public.conversation_memory FOR UPDATE TO authenticated USING (public.is_contact_visible_to_user(contact_id, auth.uid()));


--
-- Name: conversation_tasks Agents can update own or assigned tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can update own or assigned tasks" ON public.conversation_tasks FOR UPDATE TO authenticated USING (((assigned_to = public.get_profile_id_for_user(auth.uid())) OR (created_by = public.get_profile_id_for_user(auth.uid())) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: contact_purchases Agents can update purchases for assigned contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can update purchases for assigned contacts" ON public.contact_purchases FOR UPDATE TO authenticated USING ((public.is_contact_visible_to_user(contact_id, auth.uid()) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: deal_activities Agents can view activities on their deals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can view activities on their deals" ON public.deal_activities FOR SELECT TO authenticated USING ((public.is_admin_or_supervisor(auth.uid()) OR (performed_by = public.get_profile_id_for_user(auth.uid())) OR (deal_id IN ( SELECT sd.id
   FROM public.sales_deals sd
  WHERE (sd.assigned_to = public.get_profile_id_for_user(auth.uid()))))));


--
-- Name: contact_purchases Agents can view purchases for assigned contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can view purchases for assigned contacts" ON public.contact_purchases FOR SELECT TO authenticated USING ((public.is_contact_visible_to_user(contact_id, auth.uid()) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: conversation_transfers Agents can view their own transfers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can view their own transfers" ON public.conversation_transfers FOR SELECT TO authenticated USING ((public.is_admin_or_supervisor(auth.uid()) OR (from_agent_id = public.get_profile_id_for_user(auth.uid())) OR (to_agent_id = public.get_profile_id_for_user(auth.uid()))));


--
-- Name: conversation_closures Agents or admins can view closures; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents or admins can view closures" ON public.conversation_closures FOR SELECT TO authenticated USING ((public.is_contact_visible_to_user(contact_id, auth.uid()) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: conversation_events Agents or admins can view conversation events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents or admins can view conversation events" ON public.conversation_events FOR SELECT TO authenticated USING ((public.is_contact_visible_to_user(contact_id, auth.uid()) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: conversation_memory Agents or admins can view memory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents or admins can view memory" ON public.conversation_memory FOR SELECT TO authenticated USING ((public.is_contact_visible_to_user(contact_id, auth.uid()) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: conversation_tasks Agents or admins can view tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents or admins can view tasks" ON public.conversation_tasks FOR SELECT TO authenticated USING ((public.is_contact_visible_to_user(contact_id, auth.uid()) OR (assigned_to = public.get_profile_id_for_user(auth.uid())) OR (created_by = public.get_profile_id_for_user(auth.uid())) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: evolution_health_logs Allow service role all access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow service role all access" ON public.evolution_health_logs TO service_role USING (true);


--
-- Name: evolution_instance_credentials Allow service role all access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow service role all access" ON public.evolution_instance_credentials TO service_role USING (true);


--
-- Name: evolution_retry_metrics Allow service role all access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow service role all access" ON public.evolution_retry_metrics TO service_role USING (true);


--
-- Name: instance_auth_events Allow service role all access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow service role all access" ON public.instance_auth_events TO service_role USING (true);


--
-- Name: instance_processing_pauses Allow service role all access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow service role all access" ON public.instance_processing_pauses TO service_role USING (true);


--
-- Name: processed_webhook_events Allow service role all access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow service role all access" ON public.processed_webhook_events TO service_role USING (true);


--
-- Name: qr_attempts Allow service role all access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow service role all access" ON public.qr_attempts TO service_role USING (true);


--
-- Name: reconnection_logs Allow service role all access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow service role all access" ON public.reconnection_logs TO service_role USING (true);


--
-- Name: whatsapp_cloud_webhook_pings Allow service role all access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow service role all access" ON public.whatsapp_cloud_webhook_pings TO service_role USING (true);


--
-- Name: whatsapp_official_credentials Allow service role all access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow service role all access" ON public.whatsapp_official_credentials TO service_role USING (true);


--
-- Name: permissions Anyone authenticated can view permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone authenticated can view permissions" ON public.permissions FOR SELECT TO authenticated USING (true);


--
-- Name: role_permissions Anyone authenticated can view role_permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone authenticated can view role_permissions" ON public.role_permissions FOR SELECT TO authenticated USING (true);


--
-- Name: contact_tags Authenticated can delete contact tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can delete contact tags" ON public.contact_tags FOR DELETE TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM public.contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid()))))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: contact_custom_fields Authenticated can delete own custom fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can delete own custom fields" ON public.contact_custom_fields FOR DELETE TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM public.contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid()))))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: deal_activities Authenticated can insert deal activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can insert deal activities" ON public.deal_activities FOR INSERT TO authenticated WITH CHECK (((performed_by IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: user_sessions Authenticated can insert own sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can insert own sessions" ON public.user_sessions FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: payment_links Authenticated can insert payment links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can insert payment links" ON public.payment_links FOR INSERT TO authenticated WITH CHECK (((created_by IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: contact_custom_fields Authenticated can update own custom fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can update own custom fields" ON public.contact_custom_fields FOR UPDATE TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM public.contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid()))))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: campaign_ab_variants Authenticated can view AB variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view AB variants" ON public.campaign_ab_variants FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));


--
-- Name: ai_conversation_tags Authenticated can view ai tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view ai tags" ON public.ai_conversation_tags FOR SELECT TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM public.contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM public.profiles p
          WHERE (p.user_id = auth.uid()))))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: chatbot_executions Authenticated can view chatbot executions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view chatbot executions" ON public.chatbot_executions FOR SELECT TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM public.contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM public.profiles p
          WHERE (p.user_id = auth.uid()))))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: chatbot_flows Authenticated can view chatbot flows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view chatbot flows" ON public.chatbot_flows FOR SELECT TO authenticated USING (true);


--
-- Name: whatsapp_connection_queues Authenticated can view connection queues; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view connection queues" ON public.whatsapp_connection_queues FOR SELECT TO authenticated USING (true);


--
-- Name: crisis_room_alerts Authenticated can view crisis alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view crisis alerts" ON public.crisis_room_alerts FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));


--
-- Name: csat_auto_config Authenticated can view csat config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view csat config" ON public.csat_auto_config FOR SELECT TO authenticated USING (true);


--
-- Name: contact_custom_fields Authenticated can view custom fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view custom fields" ON public.contact_custom_fields FOR SELECT TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM public.contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM public.profiles p
          WHERE (p.user_id = auth.uid()))))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: followup_executions Authenticated can view followup executions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view followup executions" ON public.followup_executions FOR SELECT TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM public.contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM public.profiles p
          WHERE (p.user_id = auth.uid()))))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: knowledge_base_articles Authenticated can view knowledge base; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view knowledge base" ON public.knowledge_base_articles FOR SELECT TO authenticated USING (((is_published = true) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: permissions Authenticated can view permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view permissions" ON public.permissions FOR SELECT TO authenticated USING (true);


--
-- Name: sales_pipeline_stages Authenticated can view pipeline stages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view pipeline stages" ON public.sales_pipeline_stages FOR SELECT TO authenticated USING (true);


--
-- Name: playbooks Authenticated can view playbooks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view playbooks" ON public.playbooks FOR SELECT TO authenticated USING (true);


--
-- Name: queue_skill_requirements Authenticated can view queue skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view queue skills" ON public.queue_skill_requirements FOR SELECT TO authenticated USING (true);


--
-- Name: number_reputation Authenticated can view reputation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view reputation" ON public.number_reputation FOR SELECT TO authenticated USING (true);


--
-- Name: role_permissions Authenticated can view role permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view role permissions" ON public.role_permissions FOR SELECT TO authenticated USING (true);


--
-- Name: channel_routing_rules Authenticated can view routing rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view routing rules" ON public.channel_routing_rules FOR SELECT TO authenticated USING (true);


--
-- Name: whatsapp_flows Authenticated can view whatsapp flows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view whatsapp flows" ON public.whatsapp_flows FOR SELECT TO authenticated USING (true);


--
-- Name: team_conversations Authenticated users can create conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create conversations" ON public.team_conversations FOR INSERT TO authenticated WITH CHECK ((created_by = ( SELECT p.id
   FROM public.profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1)));


--
-- Name: audio_memes Authenticated users can insert audio memes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert audio memes" ON public.audio_memes FOR INSERT TO authenticated WITH CHECK ((uploaded_by = auth.uid()));


--
-- Name: custom_emojis Authenticated users can insert custom emojis; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert custom emojis" ON public.custom_emojis FOR INSERT TO authenticated WITH CHECK ((uploaded_by = auth.uid()));


--
-- Name: contact_notes Authenticated users can insert notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert notes" ON public.contact_notes FOR INSERT TO authenticated WITH CHECK ((author_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: sicoob_contact_mapping Authenticated users can insert sicoob mappings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert sicoob mappings" ON public.sicoob_contact_mapping FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: conversation_transfers Authenticated users can insert transfers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert transfers" ON public.conversation_transfers FOR INSERT TO authenticated WITH CHECK ((public.is_admin_or_supervisor(auth.uid()) OR (from_agent_id = public.get_profile_id_for_user(auth.uid()))));


--
-- Name: audio_memes Authenticated users can read audio memes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read audio memes" ON public.audio_memes FOR SELECT TO authenticated USING (true);


--
-- Name: audio_memes Authenticated users can update audio memes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update audio memes" ON public.audio_memes FOR UPDATE TO authenticated USING (((uploaded_by = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()))) WITH CHECK (((uploaded_by = auth.uid()) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: custom_emojis Authenticated users can update custom emojis; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update custom emojis" ON public.custom_emojis FOR UPDATE TO authenticated USING (((uploaded_by = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()))) WITH CHECK (((uploaded_by = auth.uid()) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: sla_configurations Authenticated users can view SLA configurations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view SLA configurations" ON public.sla_configurations FOR SELECT TO authenticated USING (true);


--
-- Name: conversation_sla Authenticated users can view SLA data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view SLA data" ON public.conversation_sla FOR SELECT TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM public.contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM public.profiles p
          WHERE (p.user_id = auth.uid()))))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: conversation_analyses Authenticated users can view analyses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view analyses" ON public.conversation_analyses FOR SELECT TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM public.contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM public.profiles p
          WHERE (p.user_id = auth.uid()))))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: auto_close_config Authenticated users can view auto-close config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view auto-close config" ON public.auto_close_config FOR SELECT TO authenticated USING (true);


--
-- Name: away_messages Authenticated users can view away messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view away messages" ON public.away_messages FOR SELECT TO authenticated USING (true);


--
-- Name: business_hours Authenticated users can view business hours; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view business hours" ON public.business_hours FOR SELECT TO authenticated USING (true);


--
-- Name: custom_emojis Authenticated users can view custom emojis; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view custom emojis" ON public.custom_emojis FOR SELECT TO authenticated USING (true);


--
-- Name: products Authenticated users can view products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view products" ON public.products FOR SELECT TO authenticated USING (true);


--
-- Name: queue_goals Authenticated users can view queue goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view queue goals" ON public.queue_goals FOR SELECT TO authenticated USING (true);


--
-- Name: queues Authenticated users can view queues; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view queues" ON public.queues FOR SELECT TO authenticated USING (true);


--
-- Name: stickers Authenticated users can view stickers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view stickers" ON public.stickers FOR SELECT TO authenticated USING (true);


--
-- Name: tags Authenticated users can view tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view tags" ON public.tags FOR SELECT TO authenticated USING (true);


--
-- Name: whatsapp_templates Authenticated users can view templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view templates" ON public.whatsapp_templates FOR SELECT TO authenticated USING (true);


--
-- Name: whatsapp_groups Authenticated users can view whatsapp groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view whatsapp groups" ON public.whatsapp_groups FOR SELECT TO authenticated USING (true);


--
-- Name: conversation_events Authorized users can insert events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized users can insert events" ON public.conversation_events FOR INSERT TO authenticated WITH CHECK ((((performed_by IS NULL) OR (performed_by = ( SELECT p.id
   FROM public.profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1))) AND (public.is_admin_or_supervisor(auth.uid()) OR (contact_id IN ( SELECT c.id
   FROM public.contacts c
  WHERE (c.assigned_to = ( SELECT p.id
           FROM public.profiles p
          WHERE (p.user_id = auth.uid())
         LIMIT 1)))))));


--
-- Name: automations Automations visible to admins only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Automations visible to admins only" ON public.automations FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: webauthn_challenges Block anon access to webauthn challenges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Block anon access to webauthn challenges" ON public.webauthn_challenges TO anon USING (false) WITH CHECK (false);


--
-- Name: audit_logs Block authenticated deletes on audit_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Block authenticated deletes on audit_logs" ON public.audit_logs FOR DELETE TO authenticated USING (false);


--
-- Name: security_audit_logs Block authenticated deletes on security audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Block authenticated deletes on security audit logs" ON public.security_audit_logs FOR DELETE TO authenticated USING (false);


--
-- Name: gmail_accounts Block authenticated gmail deletes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Block authenticated gmail deletes" ON public.gmail_accounts FOR DELETE TO authenticated USING (false);


--
-- Name: gmail_accounts Block authenticated gmail inserts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Block authenticated gmail inserts" ON public.gmail_accounts FOR INSERT TO authenticated WITH CHECK (false);


--
-- Name: gmail_accounts Block authenticated gmail updates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Block authenticated gmail updates" ON public.gmail_accounts FOR UPDATE TO authenticated USING (false);


--
-- Name: login_attempts Block authenticated inserts on login_attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Block authenticated inserts on login_attempts" ON public.login_attempts FOR INSERT TO authenticated WITH CHECK (false);


--
-- Name: notifications Block authenticated notification inserts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Block authenticated notification inserts" ON public.notifications FOR INSERT TO authenticated WITH CHECK (false);


--
-- Name: audit_logs Block authenticated updates on audit_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Block authenticated updates on audit_logs" ON public.audit_logs FOR UPDATE TO authenticated USING (false);


--
-- Name: login_attempts Block authenticated updates on login_attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Block authenticated updates on login_attempts" ON public.login_attempts FOR UPDATE TO authenticated USING (false);


--
-- Name: security_audit_logs Block authenticated updates on security audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Block authenticated updates on security audit logs" ON public.security_audit_logs FOR UPDATE TO authenticated USING (false);


--
-- Name: entity_versions Block authenticated version inserts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Block authenticated version inserts" ON public.entity_versions FOR INSERT TO authenticated WITH CHECK (false);


--
-- Name: profiles Block sensitive field changes by non-admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Block sensitive field changes by non-admins" ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated USING (true) WITH CHECK ((public.is_admin_or_supervisor(auth.uid()) OR ((NOT (role IS DISTINCT FROM ( SELECT p.role
   FROM public.profiles p
  WHERE (p.user_id = auth.uid())))) AND (NOT (access_level IS DISTINCT FROM ( SELECT p.access_level
   FROM public.profiles p
  WHERE (p.user_id = auth.uid())))) AND (NOT (permissions IS DISTINCT FROM ( SELECT p.permissions
   FROM public.profiles p
  WHERE (p.user_id = auth.uid())))) AND (NOT (is_active IS DISTINCT FROM ( SELECT p.is_active
   FROM public.profiles p
  WHERE (p.user_id = auth.uid())))))));


--
-- Name: campaign_ab_variants Campaign owners or admins can delete AB variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Campaign owners or admins can delete AB variants" ON public.campaign_ab_variants FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.campaigns c
  WHERE ((c.id = campaign_ab_variants.campaign_id) AND ((c.created_by = public.get_profile_id_for_user(auth.uid())) OR public.is_admin_or_supervisor(auth.uid()))))));


--
-- Name: campaign_ab_variants Campaign owners or admins can insert AB variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Campaign owners or admins can insert AB variants" ON public.campaign_ab_variants FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.campaigns c
  WHERE ((c.id = campaign_ab_variants.campaign_id) AND ((c.created_by = public.get_profile_id_for_user(auth.uid())) OR public.is_admin_or_supervisor(auth.uid()))))));


--
-- Name: campaign_ab_variants Campaign owners or admins can update AB variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Campaign owners or admins can update AB variants" ON public.campaign_ab_variants FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.campaigns c
  WHERE ((c.id = campaign_ab_variants.campaign_id) AND ((c.created_by = public.get_profile_id_for_user(auth.uid())) OR public.is_admin_or_supervisor(auth.uid()))))));


--
-- Name: campaigns Campaigns visible to admins or creator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Campaigns visible to admins or creator" ON public.campaigns FOR SELECT TO authenticated USING ((public.is_admin_or_supervisor(auth.uid()) OR (created_by = ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1))));


--
-- Name: team_conversations Creator can update conversation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Creator can update conversation" ON public.team_conversations FOR UPDATE TO authenticated USING ((created_by = ( SELECT p.id
   FROM public.profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1)));


--
-- Name: conversation_tasks Creators or admins can delete tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Creators or admins can delete tasks" ON public.conversation_tasks FOR DELETE TO authenticated USING (((created_by = public.get_profile_id_for_user(auth.uid())) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: inbox_custom_scopes Custom scopes are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Custom scopes are viewable by everyone" ON public.inbox_custom_scopes FOR SELECT TO authenticated USING (true);


--
-- Name: transfer_comments Enable insert for transfer participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for transfer participants" ON public.transfer_comments FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.conversation_transfers ct
  WHERE ((ct.id = transfer_comments.transfer_id) AND ((ct.from_agent_id = public.get_profile_id_for_user(auth.uid())) OR (ct.to_agent_id = public.get_profile_id_for_user(auth.uid())))))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: transfer_comments Enable read for transfer participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read for transfer participants" ON public.transfer_comments FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.conversation_transfers ct
  WHERE ((ct.id = transfer_comments.transfer_id) AND ((ct.from_agent_id = public.get_profile_id_for_user(auth.uid())) OR (ct.to_agent_id = public.get_profile_id_for_user(auth.uid())))))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: geo_blocking_settings Geo blocking visible to admins only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Geo blocking visible to admins only" ON public.geo_blocking_settings FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: team_conversation_members Members and admins can add conversation members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members and admins can add conversation members" ON public.team_conversation_members FOR INSERT TO authenticated WITH CHECK ((public.is_team_conversation_member(auth.uid(), conversation_id) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: team_conversation_members Members and admins can view conversation members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members and admins can view conversation members" ON public.team_conversation_members FOR SELECT TO authenticated USING ((public.is_team_conversation_member(auth.uid(), conversation_id) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: team_conversation_members Members can leave or admins can remove; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can leave or admins can remove" ON public.team_conversation_members FOR DELETE TO authenticated USING (((profile_id = ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: team_messages Members can send messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can send messages" ON public.team_messages FOR INSERT TO authenticated WITH CHECK ((public.is_team_conversation_member(auth.uid(), conversation_id) AND (sender_id = ( SELECT p.id
   FROM public.profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1))));


--
-- Name: team_messages Members can view conversation messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view conversation messages" ON public.team_messages FOR SELECT TO authenticated USING (public.is_team_conversation_member(auth.uid(), conversation_id));


--
-- Name: team_conversations Members can view their conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view their conversations" ON public.team_conversations FOR SELECT TO authenticated USING ((public.is_team_conversation_member(auth.uid(), id) OR (created_by = ( SELECT p.id
   FROM public.profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1))));


--
-- Name: login_attempts Only admins can delete login attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can delete login attempts" ON public.login_attempts FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: user_service_accounts Only admins can delete service accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can delete service accounts" ON public.user_service_accounts FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: user_service_accounts Only admins can insert service accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can insert service accounts" ON public.user_service_accounts FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: inbox_custom_scopes Only admins can manage custom scopes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can manage custom scopes" ON public.inbox_custom_scopes TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: global_settings Only admins can modify global settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can modify global settings" ON public.global_settings USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['dev'::public.app_role, 'admin'::public.app_role]))))));


--
-- Name: agent_stats Only admins can update agent stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can update agent stats" ON public.agent_stats FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: user_service_accounts Only admins can update service accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can update service accounts" ON public.user_service_accounts FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: talkx_blacklist Only admins can view blacklist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can view blacklist" ON public.talkx_blacklist FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: blocked_ips Only admins can view blocked IPs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can view blocked IPs" ON public.blocked_ips FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role)))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: login_attempts Only admins can view login attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can view login attempts" ON public.login_attempts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: sicoob_contact_mapping Only admins can view sicoob mappings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can view sicoob mappings" ON public.sicoob_contact_mapping FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: queue_members Queue members visible to admins or self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Queue members visible to admins or self" ON public.queue_members FOR SELECT TO authenticated USING ((public.is_admin_or_supervisor(auth.uid()) OR (profile_id = ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1))));


--
-- Name: route_permissions Route permissions are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Route permissions are viewable by everyone" ON public.route_permissions FOR SELECT USING (true);


--
-- Name: sla_rules SLA rules visible to admins only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "SLA rules visible to admins only" ON public.sla_rules FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: team_messages Senders can delete own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Senders can delete own messages" ON public.team_messages FOR DELETE TO authenticated USING ((sender_id = ( SELECT p.id
   FROM public.profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1)));


--
-- Name: team_messages Senders can edit own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Senders can edit own messages" ON public.team_messages FOR UPDATE TO authenticated USING ((sender_id = ( SELECT p.id
   FROM public.profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1)));


--
-- Name: ai_usage_logs Service role can insert AI usage logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert AI usage logs" ON public.ai_usage_logs FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: audit_logs Service role can insert any audit log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert any audit log" ON public.audit_logs FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: sicoob_contact_mapping Service role can manage sicoob mappings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage sicoob mappings" ON public.sicoob_contact_mapping TO service_role USING (true) WITH CHECK (true);


--
-- Name: instance_registry Service role full access on instance_registry; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on instance_registry" ON public.instance_registry TO service_role USING (true) WITH CHECK (true);


--
-- Name: security_audit_logs Service role inserts security audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role inserts security audit logs" ON public.security_audit_logs FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: messages Service role only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role only" ON public.messages TO service_role USING (true);


--
-- Name: gmail_accounts Service role only for gmail accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role only for gmail accounts" ON public.gmail_accounts TO service_role USING (true) WITH CHECK (true);


--
-- Name: agent_visibility_grants Special agents can view own grants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Special agents can view own grants" ON public.agent_visibility_grants FOR SELECT TO authenticated USING ((agent_id IN ( SELECT p.id
   FROM public.profiles p
  WHERE (p.user_id = auth.uid()))));


--
-- Name: whatsapp_connections Staff can view their assigned connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view their assigned connections" ON public.whatsapp_connections FOR SELECT TO authenticated USING ((public.is_admin_or_supervisor(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'dev'::public.app_role)))) OR (created_by = auth.uid())));


--
-- Name: stickers Sticker delete with ownership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sticker delete with ownership" ON public.stickers FOR DELETE TO authenticated USING (((uploaded_by = (auth.uid())::text) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: stickers Sticker insert with ownership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sticker insert with ownership" ON public.stickers FOR INSERT TO authenticated WITH CHECK (((uploaded_by = (auth.uid())::text) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: stickers Sticker update with ownership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sticker update with ownership" ON public.stickers FOR UPDATE TO authenticated USING (((uploaded_by = (auth.uid())::text) OR public.is_admin_or_supervisor(auth.uid()))) WITH CHECK (((uploaded_by = (auth.uid())::text) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: talkx_campaigns Users can create campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create campaigns" ON public.talkx_campaigns FOR INSERT TO authenticated WITH CHECK ((created_by = ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)));


--
-- Name: nps_surveys Users can create own NPS surveys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own NPS surveys" ON public.nps_surveys FOR INSERT TO authenticated WITH CHECK (((agent_id IS NOT NULL) AND (agent_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())))));


--
-- Name: conversation_snoozes Users can create own snoozes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own snoozes" ON public.conversation_snoozes FOR INSERT TO authenticated WITH CHECK ((snoozed_by IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: scheduled_messages Users can create scheduled messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create scheduled messages" ON public.scheduled_messages FOR INSERT TO authenticated WITH CHECK (((created_by IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: message_templates Users can create their own templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own templates" ON public.message_templates FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: audio_memes Users can delete own audio memes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own audio memes" ON public.audio_memes FOR DELETE TO authenticated USING (((uploaded_by = auth.uid()) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: talkx_campaigns Users can delete own draft campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own draft campaigns" ON public.talkx_campaigns FOR DELETE TO authenticated USING (((created_by = ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)) AND (status = 'draft'::text)));


--
-- Name: notifications Users can delete own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own notifications" ON public.notifications FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: custom_emojis Users can delete own or admin custom emojis; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own or admin custom emojis" ON public.custom_emojis FOR DELETE TO authenticated USING (((uploaded_by = auth.uid()) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: passkey_credentials Users can delete own passkeys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own passkeys" ON public.passkey_credentials FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: saved_filters Users can delete own saved filters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own saved filters" ON public.saved_filters FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: conversation_snoozes Users can delete own snoozes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own snoozes" ON public.conversation_snoozes FOR DELETE TO authenticated USING ((snoozed_by IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: training_sessions Users can delete own training sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own training sessions" ON public.training_sessions FOR DELETE TO authenticated USING (((profile_id = public.get_profile_id_for_user(auth.uid())) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: whisper_messages Users can delete own whisper messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own whisper messages" ON public.whisper_messages FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: talkx_recipients Users can delete recipients of own campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete recipients of own campaigns" ON public.talkx_recipients FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.talkx_campaigns tc
  WHERE ((tc.id = talkx_recipients.campaign_id) AND (tc.created_by = ( SELECT profiles.id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid())
         LIMIT 1)) AND (tc.status = 'draft'::text)))));


--
-- Name: user_devices Users can delete their own devices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own devices" ON public.user_devices FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: contact_notes Users can delete their own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own notes" ON public.contact_notes FOR DELETE TO authenticated USING ((author_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: message_reactions Users can delete their own reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own reactions" ON public.message_reactions FOR DELETE TO authenticated USING ((user_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: user_sessions Users can delete their own sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own sessions" ON public.user_sessions FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: message_templates Users can delete their own templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own templates" ON public.message_templates FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: scheduled_messages Users can delete their scheduled messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their scheduled messages" ON public.scheduled_messages FOR DELETE TO authenticated USING (((created_by IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: email_threads Users can delete threads of own accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete threads of own accounts" ON public.email_threads FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.gmail_accounts ga
  WHERE ((ga.id = email_threads.gmail_account_id) AND (ga.user_id = auth.uid())))));


--
-- Name: csat_surveys Users can insert CSAT surveys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert CSAT surveys" ON public.csat_surveys FOR INSERT TO authenticated WITH CHECK (((agent_id IS NULL) OR (agent_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: ai_conversation_tags Users can insert ai tags for assigned contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert ai tags for assigned contacts" ON public.ai_conversation_tags FOR INSERT TO authenticated WITH CHECK (((contact_id IN ( SELECT c.id
   FROM public.contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid()))))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: calls Users can insert calls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert calls" ON public.calls FOR INSERT TO authenticated WITH CHECK (((agent_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: contacts Users can insert contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert contacts" ON public.contacts FOR INSERT TO authenticated WITH CHECK ((public.is_admin_or_supervisor(auth.uid()) OR ((assigned_to IS NOT NULL) AND (assigned_to IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))))));


--
-- Name: contact_custom_fields Users can insert custom fields for assigned contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert custom fields for assigned contacts" ON public.contact_custom_fields FOR INSERT TO authenticated WITH CHECK (((contact_id IN ( SELECT c.id
   FROM public.contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid()))))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: sales_deals Users can insert deals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert deals" ON public.sales_deals FOR INSERT TO authenticated WITH CHECK (((assigned_to IS NULL) OR (assigned_to IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: messages Users can insert messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (((agent_id IS NULL) OR (agent_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: email_messages Users can insert messages for own accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert messages for own accounts" ON public.email_messages FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.gmail_accounts ga
  WHERE ((ga.id = email_messages.gmail_account_id) AND (ga.user_id = auth.uid())))));


--
-- Name: agent_achievements Users can insert own achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own achievements" ON public.agent_achievements FOR INSERT TO authenticated WITH CHECK (((profile_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: conversation_analyses Users can insert own analyses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own analyses" ON public.conversation_analyses FOR INSERT TO authenticated WITH CHECK (((analyzed_by IS NULL) OR (analyzed_by IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: passkey_credentials Users can insert own passkeys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own passkeys" ON public.passkey_credentials FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: performance_snapshots Users can insert own performance snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own performance snapshots" ON public.performance_snapshots FOR INSERT TO authenticated WITH CHECK ((profile_id = ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)));


--
-- Name: saved_filters Users can insert own saved filters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own saved filters" ON public.saved_filters FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: agent_stats Users can insert own stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own stats" ON public.agent_stats FOR INSERT TO authenticated WITH CHECK (((profile_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: query_telemetry Users can insert own telemetry; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own telemetry" ON public.query_telemetry FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: training_sessions Users can insert own training sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own training sessions" ON public.training_sessions FOR INSERT TO authenticated WITH CHECK (((profile_id = public.get_profile_id_for_user(auth.uid())) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: voice_command_logs Users can insert own voice logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own voice logs" ON public.voice_command_logs FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: whisper_messages Users can insert own whisper messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own whisper messages" ON public.whisper_messages FOR INSERT TO authenticated WITH CHECK (((sender_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: message_reactions Users can insert reactions for assigned contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert reactions for assigned contacts" ON public.message_reactions FOR INSERT TO authenticated WITH CHECK (((contact_id IN ( SELECT c.id
   FROM public.contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM public.profiles p
          WHERE (p.user_id = auth.uid()))))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: talkx_recipients Users can insert recipients to own campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert recipients to own campaigns" ON public.talkx_recipients FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.talkx_campaigns tc
  WHERE ((tc.id = talkx_recipients.campaign_id) AND (tc.created_by = ( SELECT profiles.id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid())
         LIMIT 1))))));


--
-- Name: tags Users can insert tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert tags" ON public.tags FOR INSERT TO authenticated WITH CHECK (((created_by IS NULL) OR (created_by IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: contact_tags Users can insert tags for assigned contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert tags for assigned contacts" ON public.contact_tags FOR INSERT TO authenticated WITH CHECK (((contact_id IN ( SELECT c.id
   FROM public.contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid()))))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: user_devices Users can insert their own devices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own devices" ON public.user_devices FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: profiles Users can insert their own profile safely; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile safely" ON public.profiles FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND ((role IS NULL) OR (role = 'agent'::text)) AND ((access_level IS NULL) OR (access_level = 'basic'::text)) AND ((permissions IS NULL) OR (permissions = '{}'::jsonb))));


--
-- Name: user_settings Users can insert their own settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own settings" ON public.user_settings FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: email_threads Users can insert threads for own accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert threads for own accounts" ON public.email_threads FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.gmail_accounts ga
  WHERE ((ga.id = email_threads.gmail_account_id) AND (ga.user_id = auth.uid())))));


--
-- Name: email_labels Users can manage labels of own accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage labels of own accounts" ON public.email_labels TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.gmail_accounts ga
  WHERE ((ga.id = email_labels.gmail_account_id) AND (ga.user_id = auth.uid())))));


--
-- Name: mfa_sessions Users can manage own MFA sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own MFA sessions" ON public.mfa_sessions TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: webauthn_challenges Users can manage own challenges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own challenges" ON public.webauthn_challenges TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: favorite_contacts Users can manage own favorites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own favorites" ON public.favorite_contacts TO authenticated USING ((user_id = auth.uid()));


--
-- Name: pinned_conversations Users can manage own pins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own pins" ON public.pinned_conversations TO authenticated USING ((pinned_by IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: reminders Users can manage own reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own reminders" ON public.reminders TO authenticated USING ((profile_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: connection_alert_preferences Users can manage their own alert prefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own alert prefs" ON public.connection_alert_preferences TO authenticated USING ((auth.uid() = user_id));


--
-- Name: goals_configurations Users can manage their own goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own goals" ON public.goals_configurations TO authenticated USING (((profile_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid()))) WITH CHECK (((profile_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: voice_command_logs Users can read own voice logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own voice logs" ON public.voice_command_logs FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: password_reset_requests Users can request own password reset; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can request own password reset" ON public.password_reset_requests FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: sales_deals Users can update assigned deals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update assigned deals" ON public.sales_deals FOR UPDATE TO authenticated USING (((assigned_to IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: messages Users can update messages from their assigned contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update messages from their assigned contacts" ON public.messages FOR UPDATE TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM public.contacts c
  WHERE (c.assigned_to IN ( SELECT public.get_visible_agent_ids(auth.uid()) AS get_visible_agent_ids)))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: email_messages Users can update messages of own accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update messages of own accounts" ON public.email_messages FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.gmail_accounts ga
  WHERE ((ga.id = email_messages.gmail_account_id) AND ((ga.user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()))))));


--
-- Name: talkx_campaigns Users can update own campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own campaigns" ON public.talkx_campaigns FOR UPDATE TO authenticated USING ((created_by = ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)));


--
-- Name: notifications Users can update own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: passkey_credentials Users can update own passkeys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own passkeys" ON public.passkey_credentials FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: payment_links Users can update own payment links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own payment links" ON public.payment_links FOR UPDATE TO authenticated USING (((created_by IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: saved_filters Users can update own saved filters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own saved filters" ON public.saved_filters FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: training_sessions Users can update own training sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own training sessions" ON public.training_sessions FOR UPDATE TO authenticated USING (((profile_id = public.get_profile_id_for_user(auth.uid())) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: talkx_recipients Users can update recipients of own campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update recipients of own campaigns" ON public.talkx_recipients FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.talkx_campaigns tc
  WHERE ((tc.id = talkx_recipients.campaign_id) AND (tc.created_by = ( SELECT profiles.id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid())
         LIMIT 1))))));


--
-- Name: contacts Users can update their assigned contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their assigned contacts" ON public.contacts FOR UPDATE TO authenticated USING (((assigned_to IN ( SELECT public.get_visible_agent_ids(auth.uid()) AS get_visible_agent_ids)) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: calls Users can update their calls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their calls" ON public.calls FOR UPDATE TO authenticated USING ((agent_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: user_devices Users can update their own devices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own devices" ON public.user_devices FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: contact_notes Users can update their own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own notes" ON public.contact_notes FOR UPDATE TO authenticated USING ((author_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: user_sessions Users can update their own sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own sessions" ON public.user_sessions FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: user_settings Users can update their own settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own settings" ON public.user_settings FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: message_templates Users can update their own templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own templates" ON public.message_templates FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: scheduled_messages Users can update their scheduled messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their scheduled messages" ON public.scheduled_messages FOR UPDATE TO authenticated USING (((created_by IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: email_threads Users can update threads of own accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update threads of own accounts" ON public.email_threads FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.gmail_accounts ga
  WHERE ((ga.id = email_threads.gmail_account_id) AND ((ga.user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()))))));


--
-- Name: agent_stats Users can view agent stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view agent stats" ON public.agent_stats FOR SELECT TO authenticated USING (((profile_id IN ( SELECT p.id
   FROM public.profiles p
  WHERE (p.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: sales_deals Users can view assigned or admin deals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view assigned or admin deals" ON public.sales_deals FOR SELECT TO authenticated USING ((public.is_admin_or_supervisor(auth.uid()) OR (assigned_to IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())))));


--
-- Name: contact_tags Users can view contact tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view contact tags" ON public.contact_tags FOR SELECT TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM public.contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM public.profiles p
          WHERE (p.user_id = auth.uid()))))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: knowledge_base_files Users can view knowledge base files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view knowledge base files" ON public.knowledge_base_files FOR SELECT TO authenticated USING (((article_id IN ( SELECT a.id
   FROM public.knowledge_base_articles a
  WHERE (a.is_published = true))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: email_labels Users can view labels of own accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view labels of own accounts" ON public.email_labels FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.gmail_accounts ga
  WHERE ((ga.id = email_labels.gmail_account_id) AND ((ga.user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()))))));


--
-- Name: messages Users can view messages from their assigned contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view messages from their assigned contacts" ON public.messages FOR SELECT TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM public.contacts c
  WHERE (c.assigned_to IN ( SELECT public.get_visible_agent_ids(auth.uid()) AS get_visible_agent_ids)))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: email_messages Users can view messages of own accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view messages of own accounts" ON public.email_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.gmail_accounts ga
  WHERE ((ga.id = email_messages.gmail_account_id) AND ((ga.user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()))))));


--
-- Name: contact_notes Users can view notes on accessible contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view notes on accessible contacts" ON public.contact_notes FOR SELECT TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM public.contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid()))))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: ai_usage_logs Users can view own AI usage logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own AI usage logs" ON public.ai_usage_logs FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: csat_surveys Users can view own CSAT surveys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own CSAT surveys" ON public.csat_surveys FOR SELECT TO authenticated USING (((agent_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: calls Users can view own calls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own calls" ON public.calls FOR SELECT TO authenticated USING (((agent_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: talkx_campaigns Users can view own campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own campaigns" ON public.talkx_campaigns FOR SELECT TO authenticated USING ((created_by = ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)));


--
-- Name: notifications Users can view own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: agent_achievements Users can view own or admin all achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own or admin all achievements" ON public.agent_achievements FOR SELECT TO authenticated USING (((profile_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: agent_skills Users can view own or admin all skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own or admin all skills" ON public.agent_skills FOR SELECT TO authenticated USING (((profile_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: passkey_credentials Users can view own passkeys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own passkeys" ON public.passkey_credentials FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: payment_links Users can view own payment links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own payment links" ON public.payment_links FOR SELECT TO authenticated USING (((created_by IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: performance_snapshots Users can view own performance snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own performance snapshots" ON public.performance_snapshots FOR SELECT TO authenticated USING ((profile_id = ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: saved_filters Users can view own saved filters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own saved filters" ON public.saved_filters FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: user_service_accounts Users can view own service accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own service accounts" ON public.user_service_accounts FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: conversation_snoozes Users can view own snoozes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own snoozes" ON public.conversation_snoozes FOR SELECT TO authenticated USING ((snoozed_by IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: query_telemetry Users can view own telemetry; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own telemetry" ON public.query_telemetry FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: training_sessions Users can view own training sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own training sessions" ON public.training_sessions FOR SELECT TO authenticated USING (((profile_id = public.get_profile_id_for_user(auth.uid())) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: whisper_messages Users can view own whisper messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own whisper messages" ON public.whisper_messages FOR SELECT TO authenticated USING (((sender_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR (target_agent_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: queue_positions Users can view queue positions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view queue positions" ON public.queue_positions FOR SELECT TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM public.contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM public.profiles p
          WHERE (p.user_id = auth.uid()))))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: message_reactions Users can view reactions on accessible messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view reactions on accessible messages" ON public.message_reactions FOR SELECT TO authenticated USING (((message_id IN ( SELECT m.id
   FROM public.messages m
  WHERE (m.contact_id IN ( SELECT c.id
           FROM public.contacts c
          WHERE ((c.assigned_to IN ( SELECT p.id
                   FROM public.profiles p
                  WHERE (p.user_id = auth.uid()))) OR (c.assigned_to IS NULL)))))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: talkx_recipients Users can view recipients of own campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view recipients of own campaigns" ON public.talkx_recipients FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.talkx_campaigns tc
  WHERE ((tc.id = talkx_recipients.campaign_id) AND ((tc.created_by = ( SELECT profiles.id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid())
         LIMIT 1)) OR public.is_admin_or_supervisor(auth.uid()))))));


--
-- Name: saved_filters Users can view shared filters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view shared filters" ON public.saved_filters FOR SELECT TO authenticated USING ((is_shared = true));


--
-- Name: user_devices Users can view their own devices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own devices" ON public.user_devices FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: email_accounts Users can view their own email accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own email accounts" ON public.email_accounts FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: gmail_accounts Users can view their own gmail accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own gmail accounts" ON public.gmail_accounts FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: goals_configurations Users can view their own goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own goals" ON public.goals_configurations FOR SELECT TO authenticated USING (((profile_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: security_audit_logs Users can view their own security logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own security logs" ON public.security_audit_logs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_sessions Users can view their own sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own sessions" ON public.user_sessions FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: user_settings Users can view their own settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own settings" ON public.user_settings FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: scheduled_messages Users can view their scheduled messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their scheduled messages" ON public.scheduled_messages FOR SELECT TO authenticated USING (((created_by IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: message_templates Users can view their templates and global ones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their templates and global ones" ON public.message_templates FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (is_global = true)));


--
-- Name: email_threads Users can view threads of own accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view threads of own accounts" ON public.email_threads FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.gmail_accounts ga
  WHERE ((ga.id = email_threads.gmail_account_id) AND ((ga.user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()))))));


--
-- Name: team_message_receipts Users insert team receipts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert team receipts" ON public.team_message_receipts FOR INSERT TO authenticated WITH CHECK ((auth.uid() = profile_id));


--
-- Name: team_message_receipts Users view team receipts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view team receipts" ON public.team_message_receipts FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.team_messages tm
  WHERE ((tm.id = team_message_receipts.message_id) AND public.is_team_conversation_member(auth.uid(), tm.conversation_id)))));


--
-- Name: audit_logs Users view their own audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view their own audit logs" ON public.audit_logs FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: client_wallet_rules Wallet rules visible to admins only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Wallet rules visible to admins only" ON public.client_wallet_rules FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: whisper_messages Whispers are for internal staff only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Whispers are for internal staff only" ON public.whisper_messages USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['dev'::public.app_role, 'admin'::public.app_role, 'manager'::public.app_role, 'supervisor'::public.app_role, 'agent'::public.app_role]))))));


--
-- Name: agent_achievements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_achievements ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_skills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_skills ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_visibility_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_visibility_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_conversation_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_conversation_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_providers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_usage_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: allowed_countries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.allowed_countries ENABLE ROW LEVEL SECURITY;

--
-- Name: audio_meme_favorites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audio_meme_favorites ENABLE ROW LEVEL SECURITY;

--
-- Name: audio_memes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audio_memes ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: auto_close_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auto_close_config ENABLE ROW LEVEL SECURITY;

--
-- Name: automations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

--
-- Name: away_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.away_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: blocked_countries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blocked_countries ENABLE ROW LEVEL SECURITY;

--
-- Name: blocked_ips; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;

--
-- Name: business_hours; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;

--
-- Name: calls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_ab_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_ab_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: channel_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.channel_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: channel_routing_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.channel_routing_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: chatbot_executions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chatbot_executions ENABLE ROW LEVEL SECURITY;

--
-- Name: chatbot_flows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chatbot_flows ENABLE ROW LEVEL SECURITY;

--
-- Name: client_wallet_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_wallet_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: connection_alert_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.connection_alert_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: connection_health_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.connection_health_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_custom_fields; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_custom_fields ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_purchases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_purchases ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts contacts_select_dynamic_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contacts_select_dynamic_policy ON public.contacts FOR SELECT TO authenticated USING ((public.user_has_permission(auth.uid(), 'inbox.view_all'::text) OR (public.user_has_permission(auth.uid(), 'inbox.view_department'::text) AND ((assigned_to IS NULL) OR (assigned_to IN ( SELECT p.id
   FROM public.profiles p
  WHERE (p.department_id = ( SELECT profiles.department_id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid()))))))) OR (assigned_to = ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())))));


--
-- Name: conversation_analyses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_analyses ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_closures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_closures ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_memory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_memory ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_sla; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_sla ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_snoozes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_snoozes ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_transfers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_transfers ENABLE ROW LEVEL SECURITY;

--
-- Name: crisis_room_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crisis_room_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: csat_auto_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.csat_auto_config ENABLE ROW LEVEL SECURITY;

--
-- Name: csat_surveys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.csat_surveys ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_emojis; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_emojis ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_activities ENABLE ROW LEVEL SECURITY;

--
-- Name: department_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.department_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

--
-- Name: dispatch_error_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dispatch_error_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: dlq_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dlq_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: email_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: email_labels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_labels ENABLE ROW LEVEL SECURITY;

--
-- Name: email_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: email_threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entity_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: evolution_health_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.evolution_health_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: evolution_instance_credentials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.evolution_instance_credentials ENABLE ROW LEVEL SECURITY;

--
-- Name: evolution_retry_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.evolution_retry_metrics ENABLE ROW LEVEL SECURITY;

--
-- Name: failed_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.failed_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: favorite_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.favorite_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: followup_executions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.followup_executions ENABLE ROW LEVEL SECURITY;

--
-- Name: followup_sequences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.followup_sequences ENABLE ROW LEVEL SECURITY;

--
-- Name: followup_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.followup_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: geo_blocking_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.geo_blocking_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: global_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: gmail_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gmail_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: goals_configurations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.goals_configurations ENABLE ROW LEVEL SECURITY;

--
-- Name: inbox_custom_scopes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inbox_custom_scopes ENABLE ROW LEVEL SECURITY;

--
-- Name: instance_auth_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instance_auth_events ENABLE ROW LEVEL SECURITY;

--
-- Name: instance_processing_pauses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instance_processing_pauses ENABLE ROW LEVEL SECURITY;

--
-- Name: instance_registry; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instance_registry ENABLE ROW LEVEL SECURITY;

--
-- Name: ip_whitelist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ip_whitelist ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_base_articles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_base_articles ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_base_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_base_files ENABLE ROW LEVEL SECURITY;

--
-- Name: login_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: message_reactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

--
-- Name: message_reactions message_reactions_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY message_reactions_delete_policy ON public.message_reactions FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.messages m
     JOIN public.contacts c ON ((c.id = m.contact_id)))
  WHERE ((m.id = message_reactions.message_id) AND (public.is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = public.get_profile_id_for_user(auth.uid())))))));


--
-- Name: message_reactions message_reactions_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY message_reactions_insert_policy ON public.message_reactions FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.messages m
     JOIN public.contacts c ON ((c.id = m.contact_id)))
  WHERE ((m.id = message_reactions.message_id) AND (public.is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = public.get_profile_id_for_user(auth.uid())) OR ((c.assigned_to IS NULL) AND public.is_queue_member_of_contact(c.id, auth.uid())))))));


--
-- Name: message_reactions message_reactions_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY message_reactions_select_policy ON public.message_reactions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.messages m
     JOIN public.contacts c ON ((c.id = m.contact_id)))
  WHERE ((m.id = message_reactions.message_id) AND (public.is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = public.get_profile_id_for_user(auth.uid())) OR ((c.assigned_to IS NULL) AND public.is_queue_member_of_contact(c.id, auth.uid())))))));


--
-- Name: message_reactions message_reactions_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY message_reactions_update_policy ON public.message_reactions FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.messages m
     JOIN public.contacts c ON ((c.id = m.contact_id)))
  WHERE ((m.id = message_reactions.message_id) AND (public.is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = public.get_profile_id_for_user(auth.uid())))))));


--
-- Name: message_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: messages messages_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_select_policy ON public.messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.contacts c
  WHERE ((c.id = messages.contact_id) AND (public.is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = public.get_profile_id_for_user(auth.uid())) OR ((c.assigned_to IS NULL) AND public.is_queue_member_of_contact(c.id, auth.uid())))))));


--
-- Name: meta_capi_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_capi_events ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mfa_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: nps_surveys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nps_surveys ENABLE ROW LEVEL SECURITY;

--
-- Name: number_reputation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.number_reputation ENABLE ROW LEVEL SECURITY;

--
-- Name: passkey_credentials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.passkey_credentials ENABLE ROW LEVEL SECURITY;

--
-- Name: password_reset_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;

--
-- Name: performance_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.performance_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: pinned_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pinned_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: playbooks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.playbooks ENABLE ROW LEVEL SECURITY;

--
-- Name: processed_webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: qr_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qr_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: query_telemetry; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.query_telemetry ENABLE ROW LEVEL SECURITY;

--
-- Name: queue_goals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.queue_goals ENABLE ROW LEVEL SECURITY;

--
-- Name: queue_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.queue_members ENABLE ROW LEVEL SECURITY;

--
-- Name: queue_positions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.queue_positions ENABLE ROW LEVEL SECURITY;

--
-- Name: queue_skill_requirements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.queue_skill_requirements ENABLE ROW LEVEL SECURITY;

--
-- Name: queues; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.queues ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_limit_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limit_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_limit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: reconnection_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reconnection_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: rls_denied_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rls_denied_log ENABLE ROW LEVEL SECURITY;

--
-- Name: role_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: route_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.route_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: route_permissions route_permissions_admin_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY route_permissions_admin_policy ON public.route_permissions TO authenticated USING ((public.is_admin_or_supervisor(auth.uid()) OR public.has_role(auth.uid(), 'dev'::public.app_role))) WITH CHECK ((public.is_admin_or_supervisor(auth.uid()) OR public.has_role(auth.uid(), 'dev'::public.app_role)));


--
-- Name: sales_deals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_deals ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_pipeline_stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_pipeline_stages ENABLE ROW LEVEL SECURITY;

--
-- Name: saved_filters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saved_filters ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduled_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduled_report_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scheduled_report_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduled_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: security_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: security_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: sicoob_contact_mapping; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sicoob_contact_mapping ENABLE ROW LEVEL SECURITY;

--
-- Name: sla_configurations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sla_configurations ENABLE ROW LEVEL SECURITY;

--
-- Name: sla_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sla_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: stickers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stickers ENABLE ROW LEVEL SECURITY;

--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: talkx_blacklist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.talkx_blacklist ENABLE ROW LEVEL SECURITY;

--
-- Name: talkx_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.talkx_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: talkx_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.talkx_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: team_conversation_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_conversation_members ENABLE ROW LEVEL SECURITY;

--
-- Name: team_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: team_message_receipts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_message_receipts ENABLE ROW LEVEL SECURITY;

--
-- Name: team_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: training_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: transfer_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transfer_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: user_devices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles user_roles_admin_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_admin_policy ON public.user_roles TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: user_roles user_roles_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_select_policy ON public.user_roles FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: user_service_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_service_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: user_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: audio_meme_favorites users manage own meme favorites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users manage own meme favorites" ON public.audio_meme_favorites TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: voice_command_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.voice_command_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: warroom_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warroom_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: webauthn_challenges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_cloud_webhook_pings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_cloud_webhook_pings ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_connection_queues; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_connection_queues ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_flows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_flows ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_official_credentials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_official_credentials ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: whisper_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whisper_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO sandbox_exec;


--
-- Name: FUNCTION audit_role_changes(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.audit_role_changes() FROM PUBLIC;
GRANT ALL ON FUNCTION public.audit_role_changes() TO service_role;
GRANT ALL ON FUNCTION public.audit_role_changes() TO sandbox_exec;


--
-- Name: FUNCTION auto_assign_contact(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.auto_assign_contact() FROM PUBLIC;
GRANT ALL ON FUNCTION public.auto_assign_contact() TO service_role;
GRANT ALL ON FUNCTION public.auto_assign_contact() TO sandbox_exec;


--
-- Name: FUNCTION auto_assign_to_queue_agent(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.auto_assign_to_queue_agent() FROM PUBLIC;
GRANT ALL ON FUNCTION public.auto_assign_to_queue_agent() TO service_role;
GRANT ALL ON FUNCTION public.auto_assign_to_queue_agent() TO sandbox_exec;


--
-- Name: FUNCTION calculate_level(xp_amount integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.calculate_level(xp_amount integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calculate_level(xp_amount integer) TO service_role;
GRANT ALL ON FUNCTION public.calculate_level(xp_amount integer) TO sandbox_exec;
GRANT ALL ON FUNCTION public.calculate_level(xp_amount integer) TO authenticated;


--
-- Name: FUNCTION check_user_permission(p_permission_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_user_permission(p_permission_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_user_permission(p_permission_name text) TO service_role;
GRANT ALL ON FUNCTION public.check_user_permission(p_permission_name text) TO sandbox_exec;
GRANT ALL ON FUNCTION public.check_user_permission(p_permission_name text) TO authenticated;


--
-- Name: FUNCTION cleanup_expired_challenges(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cleanup_expired_challenges() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cleanup_expired_challenges() TO service_role;
GRANT ALL ON FUNCTION public.cleanup_expired_challenges() TO sandbox_exec;


--
-- Name: FUNCTION clear_login_attempts(p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.clear_login_attempts(p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.clear_login_attempts(p_email text) TO service_role;
GRANT ALL ON FUNCTION public.clear_login_attempts(p_email text) TO sandbox_exec;


--
-- Name: FUNCTION clear_qr_on_connect(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.clear_qr_on_connect() FROM PUBLIC;
GRANT ALL ON FUNCTION public.clear_qr_on_connect() TO service_role;
GRANT ALL ON FUNCTION public.clear_qr_on_connect() TO sandbox_exec;


--
-- Name: FUNCTION contacts_count_by_type(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.contacts_count_by_type() FROM PUBLIC;
GRANT ALL ON FUNCTION public.contacts_count_by_type() TO service_role;
GRANT ALL ON FUNCTION public.contacts_count_by_type() TO sandbox_exec;
GRANT ALL ON FUNCTION public.contacts_count_by_type() TO authenticated;


--
-- Name: FUNCTION decrypt_gmail_token(p_encrypted bytea); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.decrypt_gmail_token(p_encrypted bytea) FROM PUBLIC;
GRANT ALL ON FUNCTION public.decrypt_gmail_token(p_encrypted bytea) TO service_role;
GRANT ALL ON FUNCTION public.decrypt_gmail_token(p_encrypted bytea) TO sandbox_exec;


--
-- Name: FUNCTION encrypt_gmail_token(p_token text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.encrypt_gmail_token(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.encrypt_gmail_token(p_token text) TO service_role;
GRANT ALL ON FUNCTION public.encrypt_gmail_token(p_token text) TO sandbox_exec;


--
-- Name: FUNCTION ensure_single_default_ai_provider(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ensure_single_default_ai_provider() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_single_default_ai_provider() TO service_role;
GRANT ALL ON FUNCTION public.ensure_single_default_ai_provider() TO sandbox_exec;


--
-- Name: FUNCTION ensure_single_default_filter(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ensure_single_default_filter() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_single_default_filter() TO service_role;
GRANT ALL ON FUNCTION public.ensure_single_default_filter() TO sandbox_exec;


--
-- Name: FUNCTION fn_accept_transfer(p_transfer_id uuid, p_operator text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_accept_transfer(p_transfer_id uuid, p_operator text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_accept_transfer(p_transfer_id uuid, p_operator text) TO service_role;
GRANT ALL ON FUNCTION public.fn_accept_transfer(p_transfer_id uuid, p_operator text) TO sandbox_exec;
GRANT ALL ON FUNCTION public.fn_accept_transfer(p_transfer_id uuid, p_operator text) TO authenticated;


--
-- Name: FUNCTION fn_accept_transfer(p_transfer_id uuid, p_agent_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_accept_transfer(p_transfer_id uuid, p_agent_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_accept_transfer(p_transfer_id uuid, p_agent_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.fn_accept_transfer(p_transfer_id uuid, p_agent_id uuid) TO sandbox_exec;
GRANT ALL ON FUNCTION public.fn_accept_transfer(p_transfer_id uuid, p_agent_id uuid) TO authenticated;


--
-- Name: FUNCTION fn_complete_transfer(p_transfer_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_complete_transfer(p_transfer_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_complete_transfer(p_transfer_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.fn_complete_transfer(p_transfer_id uuid) TO sandbox_exec;
GRANT ALL ON FUNCTION public.fn_complete_transfer(p_transfer_id uuid) TO authenticated;


--
-- Name: FUNCTION fn_complete_transfer(p_transfer_id uuid, p_notes text, p_type text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_complete_transfer(p_transfer_id uuid, p_notes text, p_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_complete_transfer(p_transfer_id uuid, p_notes text, p_type text) TO service_role;
GRANT ALL ON FUNCTION public.fn_complete_transfer(p_transfer_id uuid, p_notes text, p_type text) TO sandbox_exec;
GRANT ALL ON FUNCTION public.fn_complete_transfer(p_transfer_id uuid, p_notes text, p_type text) TO authenticated;


--
-- Name: FUNCTION fn_create_transfer(p_conversation_id uuid, p_from_agent_id uuid, p_to_agent_id uuid, p_to_queue_id uuid, p_transfer_type text, p_priority text, p_context_summary text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_create_transfer(p_conversation_id uuid, p_from_agent_id uuid, p_to_agent_id uuid, p_to_queue_id uuid, p_transfer_type text, p_priority text, p_context_summary text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_create_transfer(p_conversation_id uuid, p_from_agent_id uuid, p_to_agent_id uuid, p_to_queue_id uuid, p_transfer_type text, p_priority text, p_context_summary text) TO service_role;
GRANT ALL ON FUNCTION public.fn_create_transfer(p_conversation_id uuid, p_from_agent_id uuid, p_to_agent_id uuid, p_to_queue_id uuid, p_transfer_type text, p_priority text, p_context_summary text) TO sandbox_exec;
GRANT ALL ON FUNCTION public.fn_create_transfer(p_conversation_id uuid, p_from_agent_id uuid, p_to_agent_id uuid, p_to_queue_id uuid, p_transfer_type text, p_priority text, p_context_summary text) TO authenticated;


--
-- Name: FUNCTION fn_create_transfer(p_source_instance text, p_target_instance text, p_remote_jid text, p_reason text, p_category text, p_priority integer, p_transfer_type text, p_source_operator text, p_context_summary text, p_tags text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_create_transfer(p_source_instance text, p_target_instance text, p_remote_jid text, p_reason text, p_category text, p_priority integer, p_transfer_type text, p_source_operator text, p_context_summary text, p_tags text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_create_transfer(p_source_instance text, p_target_instance text, p_remote_jid text, p_reason text, p_category text, p_priority integer, p_transfer_type text, p_source_operator text, p_context_summary text, p_tags text[]) TO service_role;
GRANT ALL ON FUNCTION public.fn_create_transfer(p_source_instance text, p_target_instance text, p_remote_jid text, p_reason text, p_category text, p_priority integer, p_transfer_type text, p_source_operator text, p_context_summary text, p_tags text[]) TO sandbox_exec;
GRANT ALL ON FUNCTION public.fn_create_transfer(p_source_instance text, p_target_instance text, p_remote_jid text, p_reason text, p_category text, p_priority integer, p_transfer_type text, p_source_operator text, p_context_summary text, p_tags text[]) TO authenticated;


--
-- Name: FUNCTION fn_increment_meme_use(p_meme_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_increment_meme_use(p_meme_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_increment_meme_use(p_meme_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_increment_meme_use(p_meme_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.fn_increment_meme_use(p_meme_id uuid) TO sandbox_exec;


--
-- Name: FUNCTION fn_list_audio_meme_categories(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_list_audio_meme_categories() FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_list_audio_meme_categories() TO authenticated;
GRANT ALL ON FUNCTION public.fn_list_audio_meme_categories() TO service_role;
GRANT ALL ON FUNCTION public.fn_list_audio_meme_categories() TO sandbox_exec;


--
-- Name: FUNCTION fn_list_audio_memes_for_user(p_category text, p_only_favorites boolean, p_search text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_list_audio_memes_for_user(p_category text, p_only_favorites boolean, p_search text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_list_audio_memes_for_user(p_category text, p_only_favorites boolean, p_search text) TO authenticated;
GRANT ALL ON FUNCTION public.fn_list_audio_memes_for_user(p_category text, p_only_favorites boolean, p_search text) TO service_role;
GRANT ALL ON FUNCTION public.fn_list_audio_memes_for_user(p_category text, p_only_favorites boolean, p_search text) TO sandbox_exec;


--
-- Name: FUNCTION fn_return_transfer(p_transfer_id uuid, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_return_transfer(p_transfer_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_return_transfer(p_transfer_id uuid, p_reason text) TO service_role;
GRANT ALL ON FUNCTION public.fn_return_transfer(p_transfer_id uuid, p_reason text) TO sandbox_exec;
GRANT ALL ON FUNCTION public.fn_return_transfer(p_transfer_id uuid, p_reason text) TO authenticated;


--
-- Name: FUNCTION fn_toggle_user_meme_favorite(p_meme_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_toggle_user_meme_favorite(p_meme_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_toggle_user_meme_favorite(p_meme_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_toggle_user_meme_favorite(p_meme_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.fn_toggle_user_meme_favorite(p_meme_id uuid) TO sandbox_exec;


--
-- Name: FUNCTION fn_transfer_comment(p_transfer_id uuid, p_agent_id uuid, p_content text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_transfer_comment(p_transfer_id uuid, p_agent_id uuid, p_content text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_transfer_comment(p_transfer_id uuid, p_agent_id uuid, p_content text) TO service_role;
GRANT ALL ON FUNCTION public.fn_transfer_comment(p_transfer_id uuid, p_agent_id uuid, p_content text) TO sandbox_exec;
GRANT ALL ON FUNCTION public.fn_transfer_comment(p_transfer_id uuid, p_agent_id uuid, p_content text) TO authenticated;


--
-- Name: FUNCTION fn_transfer_comment(p_transfer_id uuid, p_author text, p_instance text, p_content text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_transfer_comment(p_transfer_id uuid, p_author text, p_instance text, p_content text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_transfer_comment(p_transfer_id uuid, p_author text, p_instance text, p_content text) TO service_role;
GRANT ALL ON FUNCTION public.fn_transfer_comment(p_transfer_id uuid, p_author text, p_instance text, p_content text) TO sandbox_exec;
GRANT ALL ON FUNCTION public.fn_transfer_comment(p_transfer_id uuid, p_author text, p_instance text, p_content text) TO authenticated;


--
-- Name: FUNCTION generate_transfer_ticket(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.generate_transfer_ticket() FROM PUBLIC;
GRANT ALL ON FUNCTION public.generate_transfer_ticket() TO service_role;
GRANT ALL ON FUNCTION public.generate_transfer_ticket() TO sandbox_exec;


--
-- Name: FUNCTION get_channel_credentials(_connection_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_channel_credentials(_connection_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_channel_credentials(_connection_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.get_channel_credentials(_connection_id uuid) TO sandbox_exec;


--
-- Name: FUNCTION get_channel_credentials_safe(p_channel_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_channel_credentials_safe(p_channel_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_channel_credentials_safe(p_channel_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.get_channel_credentials_safe(p_channel_id uuid) TO sandbox_exec;
GRANT ALL ON FUNCTION public.get_channel_credentials_safe(p_channel_id uuid) TO authenticated;


--
-- Name: FUNCTION get_connection_instance(_connection_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_connection_instance(_connection_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_connection_instance(_connection_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.get_connection_instance(_connection_id uuid) TO sandbox_exec;
GRANT ALL ON FUNCTION public.get_connection_instance(_connection_id uuid) TO authenticated;


--
-- Name: FUNCTION get_connection_qr_code(_connection_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_connection_qr_code(_connection_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_connection_qr_code(_connection_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.get_connection_qr_code(_connection_id uuid) TO sandbox_exec;


--
-- Name: FUNCTION get_own_gmail_accounts(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_own_gmail_accounts() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_own_gmail_accounts() TO service_role;
GRANT ALL ON FUNCTION public.get_own_gmail_accounts() TO sandbox_exec;
GRANT ALL ON FUNCTION public.get_own_gmail_accounts() TO authenticated;


--
-- Name: FUNCTION get_own_lockout_status(p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_own_lockout_status(p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_own_lockout_status(p_email text) TO service_role;
GRANT ALL ON FUNCTION public.get_own_lockout_status(p_email text) TO sandbox_exec;
GRANT ALL ON FUNCTION public.get_own_lockout_status(p_email text) TO authenticated;


--
-- Name: TABLE password_reset_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.password_reset_requests TO anon;
GRANT ALL ON TABLE public.password_reset_requests TO authenticated;
GRANT ALL ON TABLE public.password_reset_requests TO service_role;
GRANT SELECT,INSERT ON TABLE public.password_reset_requests TO sandbox_exec;


--
-- Name: FUNCTION get_own_reset_requests(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_own_reset_requests() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_own_reset_requests() TO service_role;
GRANT ALL ON FUNCTION public.get_own_reset_requests() TO sandbox_exec;
GRANT ALL ON FUNCTION public.get_own_reset_requests() TO authenticated;


--
-- Name: FUNCTION get_profile_id_for_user(_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_profile_id_for_user(_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_profile_id_for_user(_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.get_profile_id_for_user(_user_id uuid) TO sandbox_exec;
GRANT ALL ON FUNCTION public.get_profile_id_for_user(_user_id uuid) TO authenticated;


--
-- Name: FUNCTION get_profile_role_for_check(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_profile_role_for_check(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_profile_role_for_check(p_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.get_profile_role_for_check(p_user_id uuid) TO sandbox_exec;
GRANT ALL ON FUNCTION public.get_profile_role_for_check(p_user_id uuid) TO authenticated;


--
-- Name: FUNCTION get_reset_requests_safe(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_reset_requests_safe() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_reset_requests_safe() TO service_role;
GRANT ALL ON FUNCTION public.get_reset_requests_safe() TO sandbox_exec;
GRANT ALL ON FUNCTION public.get_reset_requests_safe() TO authenticated;


--
-- Name: FUNCTION get_team_profiles(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_team_profiles() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_team_profiles() TO service_role;
GRANT ALL ON FUNCTION public.get_team_profiles() TO sandbox_exec;
GRANT ALL ON FUNCTION public.get_team_profiles() TO authenticated;


--
-- Name: FUNCTION get_visible_agent_ids(_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_visible_agent_ids(_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_visible_agent_ids(_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.get_visible_agent_ids(_user_id uuid) TO sandbox_exec;
GRANT ALL ON FUNCTION public.get_visible_agent_ids(_user_id uuid) TO authenticated;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;
GRANT ALL ON FUNCTION public.handle_new_user() TO sandbox_exec;


--
-- Name: FUNCTION handle_new_user_role(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_user_role() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_new_user_role() TO service_role;
GRANT ALL ON FUNCTION public.handle_new_user_role() TO sandbox_exec;


--
-- Name: FUNCTION handle_new_user_settings(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_user_settings() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_new_user_settings() TO service_role;
GRANT ALL ON FUNCTION public.handle_new_user_settings() TO sandbox_exec;


--
-- Name: FUNCTION handle_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_updated_at() TO service_role;
GRANT ALL ON FUNCTION public.handle_updated_at() TO sandbox_exec;


--
-- Name: FUNCTION has_role(_user_id uuid, _role public.app_role); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO service_role;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO sandbox_exec;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO authenticated;


--
-- Name: FUNCTION init_agent_stats(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.init_agent_stats() FROM PUBLIC;
GRANT ALL ON FUNCTION public.init_agent_stats() TO service_role;
GRANT ALL ON FUNCTION public.init_agent_stats() TO sandbox_exec;


--
-- Name: FUNCTION is_account_locked(check_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_account_locked(check_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_account_locked(check_email text) TO service_role;
GRANT ALL ON FUNCTION public.is_account_locked(check_email text) TO sandbox_exec;
GRANT ALL ON FUNCTION public.is_account_locked(check_email text) TO authenticated;


--
-- Name: FUNCTION is_admin_or_supervisor(_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_admin_or_supervisor(_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_admin_or_supervisor(_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_admin_or_supervisor(_user_id uuid) TO sandbox_exec;
GRANT ALL ON FUNCTION public.is_admin_or_supervisor(_user_id uuid) TO authenticated;


--
-- Name: FUNCTION is_contact_visible_to_user(_contact_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid) TO sandbox_exec;
GRANT ALL ON FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid) TO authenticated;


--
-- Name: FUNCTION is_country_allowed(check_country_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_country_allowed(check_country_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_country_allowed(check_country_code text) TO service_role;
GRANT ALL ON FUNCTION public.is_country_allowed(check_country_code text) TO sandbox_exec;
GRANT ALL ON FUNCTION public.is_country_allowed(check_country_code text) TO authenticated;


--
-- Name: FUNCTION is_country_blocked(check_country_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_country_blocked(check_country_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_country_blocked(check_country_code text) TO service_role;
GRANT ALL ON FUNCTION public.is_country_blocked(check_country_code text) TO sandbox_exec;
GRANT ALL ON FUNCTION public.is_country_blocked(check_country_code text) TO authenticated;


--
-- Name: FUNCTION is_ip_blocked(check_ip text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_ip_blocked(check_ip text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_ip_blocked(check_ip text) TO service_role;
GRANT ALL ON FUNCTION public.is_ip_blocked(check_ip text) TO sandbox_exec;
GRANT ALL ON FUNCTION public.is_ip_blocked(check_ip text) TO authenticated;


--
-- Name: FUNCTION is_ip_whitelisted(check_ip text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_ip_whitelisted(check_ip text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_ip_whitelisted(check_ip text) TO service_role;
GRANT ALL ON FUNCTION public.is_ip_whitelisted(check_ip text) TO sandbox_exec;
GRANT ALL ON FUNCTION public.is_ip_whitelisted(check_ip text) TO authenticated;


--
-- Name: FUNCTION is_queue_member_of_contact(_contact_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_queue_member_of_contact(_contact_id uuid, _user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_queue_member_of_contact(_contact_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_queue_member_of_contact(_contact_id uuid, _user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_queue_member_of_contact(_contact_id uuid, _user_id uuid) TO sandbox_exec;


--
-- Name: FUNCTION is_team_conversation_member(_user_id uuid, _conversation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_team_conversation_member(_user_id uuid, _conversation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_team_conversation_member(_user_id uuid, _conversation_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_team_conversation_member(_user_id uuid, _conversation_id uuid) TO sandbox_exec;
GRANT ALL ON FUNCTION public.is_team_conversation_member(_user_id uuid, _conversation_id uuid) TO authenticated;


--
-- Name: FUNCTION is_within_business_hours(connection_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_within_business_hours(connection_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_within_business_hours(connection_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_within_business_hours(connection_id uuid) TO sandbox_exec;
GRANT ALL ON FUNCTION public.is_within_business_hours(connection_id uuid) TO authenticated;


--
-- Name: FUNCTION log_assignment_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.log_assignment_change() FROM PUBLIC;
GRANT ALL ON FUNCTION public.log_assignment_change() TO service_role;
GRANT ALL ON FUNCTION public.log_assignment_change() TO sandbox_exec;


--
-- Name: FUNCTION log_audit_event(p_action text, p_entity_type text, p_entity_id text, p_details jsonb, p_user_agent text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.log_audit_event(p_action text, p_entity_type text, p_entity_id text, p_details jsonb, p_user_agent text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.log_audit_event(p_action text, p_entity_type text, p_entity_id text, p_details jsonb, p_user_agent text) TO service_role;
GRANT ALL ON FUNCTION public.log_audit_event(p_action text, p_entity_type text, p_entity_id text, p_details jsonb, p_user_agent text) TO sandbox_exec;
GRANT ALL ON FUNCTION public.log_audit_event(p_action text, p_entity_type text, p_entity_id text, p_details jsonb, p_user_agent text) TO authenticated;


--
-- Name: FUNCTION log_audit_event(p_event_type text, p_resource text, p_action text, p_status text, p_details jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.log_audit_event(p_event_type text, p_resource text, p_action text, p_status text, p_details jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.log_audit_event(p_event_type text, p_resource text, p_action text, p_status text, p_details jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.log_audit_event(p_event_type text, p_resource text, p_action text, p_status text, p_details jsonb) TO service_role;
GRANT ALL ON FUNCTION public.log_audit_event(p_event_type text, p_resource text, p_action text, p_status text, p_details jsonb) TO sandbox_exec;


--
-- Name: FUNCTION log_rls_denied(p_resource text, p_required_role text, p_context jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.log_rls_denied(p_resource text, p_required_role text, p_context jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.log_rls_denied(p_resource text, p_required_role text, p_context jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.log_rls_denied(p_resource text, p_required_role text, p_context jsonb) TO service_role;
GRANT ALL ON FUNCTION public.log_rls_denied(p_resource text, p_required_role text, p_context jsonb) TO sandbox_exec;


--
-- Name: FUNCTION log_security_event(p_event_type text, p_resource text, p_action text, p_status text, p_details jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.log_security_event(p_event_type text, p_resource text, p_action text, p_status text, p_details jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.log_security_event(p_event_type text, p_resource text, p_action text, p_status text, p_details jsonb) TO service_role;
GRANT ALL ON FUNCTION public.log_security_event(p_event_type text, p_resource text, p_action text, p_status text, p_details jsonb) TO sandbox_exec;


--
-- Name: FUNCTION manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text) TO service_role;
GRANT ALL ON FUNCTION public.manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text) TO sandbox_exec;
GRANT ALL ON FUNCTION public.manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text) TO authenticated;


--
-- Name: FUNCTION manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text, _admin_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text, _admin_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text, _admin_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text, _admin_user_id uuid) TO sandbox_exec;
GRANT ALL ON FUNCTION public.manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text, _admin_user_id uuid) TO authenticated;


--
-- Name: FUNCTION manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text, _admin_user_id uuid, _target_profile_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text, _admin_user_id uuid, _target_profile_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text, _admin_user_id uuid, _target_profile_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text, _admin_user_id uuid, _target_profile_id uuid) TO sandbox_exec;
GRANT ALL ON FUNCTION public.manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text, _admin_user_id uuid, _target_profile_id uuid) TO authenticated;


--
-- Name: FUNCTION mask_channel_credentials(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mask_channel_credentials() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mask_channel_credentials() TO service_role;
GRANT ALL ON FUNCTION public.mask_channel_credentials() TO sandbox_exec;


--
-- Name: FUNCTION normalize_contact_phone(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.normalize_contact_phone() FROM PUBLIC;
GRANT ALL ON FUNCTION public.normalize_contact_phone() TO service_role;
GRANT ALL ON FUNCTION public.normalize_contact_phone() TO sandbox_exec;


--
-- Name: FUNCTION notify_sicoob_on_reply(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_sicoob_on_reply() FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_sicoob_on_reply() TO service_role;
GRANT ALL ON FUNCTION public.notify_sicoob_on_reply() TO sandbox_exec;


--
-- Name: FUNCTION on_role_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.on_role_change() FROM PUBLIC;
GRANT ALL ON FUNCTION public.on_role_change() TO service_role;
GRANT ALL ON FUNCTION public.on_role_change() TO sandbox_exec;


--
-- Name: FUNCTION pause_instance(p_instance text, p_reason text, p_minutes integer, p_trigger_count integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pause_instance(p_instance text, p_reason text, p_minutes integer, p_trigger_count integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pause_instance(p_instance text, p_reason text, p_minutes integer, p_trigger_count integer) TO service_role;
GRANT ALL ON FUNCTION public.pause_instance(p_instance text, p_reason text, p_minutes integer, p_trigger_count integer) TO sandbox_exec;


--
-- Name: FUNCTION prevent_profile_privilege_escalation(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC;
GRANT ALL ON FUNCTION public.prevent_profile_privilege_escalation() TO service_role;
GRANT ALL ON FUNCTION public.prevent_profile_privilege_escalation() TO sandbox_exec;


--
-- Name: FUNCTION prevent_role_escalation(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.prevent_role_escalation() FROM PUBLIC;
GRANT ALL ON FUNCTION public.prevent_role_escalation() TO service_role;
GRANT ALL ON FUNCTION public.prevent_role_escalation() TO sandbox_exec;


--
-- Name: FUNCTION purge_old_query_telemetry(p_days integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.purge_old_query_telemetry(p_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.purge_old_query_telemetry(p_days integer) TO service_role;
GRANT ALL ON FUNCTION public.purge_old_query_telemetry(p_days integer) TO sandbox_exec;


--
-- Name: FUNCTION rate_limit_reset_requests(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rate_limit_reset_requests() FROM PUBLIC;
GRANT ALL ON FUNCTION public.rate_limit_reset_requests() TO service_role;
GRANT ALL ON FUNCTION public.rate_limit_reset_requests() TO sandbox_exec;


--
-- Name: FUNCTION reassign_absent_agents(inactive_minutes integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reassign_absent_agents(inactive_minutes integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reassign_absent_agents(inactive_minutes integer) TO service_role;
GRANT ALL ON FUNCTION public.reassign_absent_agents(inactive_minutes integer) TO sandbox_exec;


--
-- Name: FUNCTION reassign_overloaded_agents(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reassign_overloaded_agents() FROM PUBLIC;
GRANT ALL ON FUNCTION public.reassign_overloaded_agents() TO service_role;
GRANT ALL ON FUNCTION public.reassign_overloaded_agents() TO sandbox_exec;


--
-- Name: FUNCTION record_failed_login(p_email text, p_ip_address text, p_user_agent text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_failed_login(p_email text, p_ip_address text, p_user_agent text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_failed_login(p_email text, p_ip_address text, p_user_agent text) TO service_role;
GRANT ALL ON FUNCTION public.record_failed_login(p_email text, p_ip_address text, p_user_agent text) TO sandbox_exec;


--
-- Name: FUNCTION rpc_dlq_abandon(p_item_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_dlq_abandon(p_item_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_dlq_abandon(p_item_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.rpc_dlq_abandon(p_item_id uuid) TO sandbox_exec;
GRANT ALL ON FUNCTION public.rpc_dlq_abandon(p_item_id uuid) TO authenticated;


--
-- Name: FUNCTION rpc_dlq_abandon(p_item_id uuid, p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_dlq_abandon(p_item_id uuid, p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_dlq_abandon(p_item_id uuid, p_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.rpc_dlq_abandon(p_item_id uuid, p_id uuid) TO sandbox_exec;
GRANT ALL ON FUNCTION public.rpc_dlq_abandon(p_item_id uuid, p_id uuid) TO authenticated;


--
-- Name: FUNCTION rpc_dlq_bulk_abandon(p_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_dlq_bulk_abandon(p_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_dlq_bulk_abandon(p_ids uuid[]) TO service_role;
GRANT ALL ON FUNCTION public.rpc_dlq_bulk_abandon(p_ids uuid[]) TO sandbox_exec;
GRANT ALL ON FUNCTION public.rpc_dlq_bulk_abandon(p_ids uuid[]) TO authenticated;


--
-- Name: TABLE dlq_audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dlq_audit_log TO anon;
GRANT ALL ON TABLE public.dlq_audit_log TO authenticated;
GRANT ALL ON TABLE public.dlq_audit_log TO service_role;
GRANT SELECT,INSERT ON TABLE public.dlq_audit_log TO sandbox_exec;


--
-- Name: FUNCTION rpc_dlq_list_audit(p_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_dlq_list_audit(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_dlq_list_audit(p_limit integer) TO service_role;
GRANT ALL ON FUNCTION public.rpc_dlq_list_audit(p_limit integer) TO sandbox_exec;
GRANT ALL ON FUNCTION public.rpc_dlq_list_audit(p_limit integer) TO authenticated;


--
-- Name: FUNCTION rpc_dlq_list_audit(p_limit integer, p_offset integer, p_action text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_dlq_list_audit(p_limit integer, p_offset integer, p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_dlq_list_audit(p_limit integer, p_offset integer, p_action text) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_dlq_list_audit(p_limit integer, p_offset integer, p_action text) TO service_role;
GRANT ALL ON FUNCTION public.rpc_dlq_list_audit(p_limit integer, p_offset integer, p_action text) TO sandbox_exec;


--
-- Name: FUNCTION rpc_dlq_log_item_action(p_item_id uuid, p_action text, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_dlq_log_item_action(p_item_id uuid, p_action text, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_dlq_log_item_action(p_item_id uuid, p_action text, p_reason text) TO service_role;
GRANT ALL ON FUNCTION public.rpc_dlq_log_item_action(p_item_id uuid, p_action text, p_reason text) TO sandbox_exec;
GRANT ALL ON FUNCTION public.rpc_dlq_log_item_action(p_item_id uuid, p_action text, p_reason text) TO authenticated;


--
-- Name: FUNCTION rpc_dlq_log_item_action(p_item_id uuid, p_action text, p_reason text, p_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_dlq_log_item_action(p_item_id uuid, p_action text, p_reason text, p_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_dlq_log_item_action(p_item_id uuid, p_action text, p_reason text, p_ids uuid[]) TO service_role;
GRANT ALL ON FUNCTION public.rpc_dlq_log_item_action(p_item_id uuid, p_action text, p_reason text, p_ids uuid[]) TO sandbox_exec;
GRANT ALL ON FUNCTION public.rpc_dlq_log_item_action(p_item_id uuid, p_action text, p_reason text, p_ids uuid[]) TO authenticated;


--
-- Name: FUNCTION rpc_dlq_retry_now(p_item_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_dlq_retry_now(p_item_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_dlq_retry_now(p_item_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.rpc_dlq_retry_now(p_item_id uuid) TO sandbox_exec;
GRANT ALL ON FUNCTION public.rpc_dlq_retry_now(p_item_id uuid) TO authenticated;


--
-- Name: FUNCTION rpc_dlq_retry_now(p_item_id uuid, p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_dlq_retry_now(p_item_id uuid, p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_dlq_retry_now(p_item_id uuid, p_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.rpc_dlq_retry_now(p_item_id uuid, p_id uuid) TO sandbox_exec;
GRANT ALL ON FUNCTION public.rpc_dlq_retry_now(p_item_id uuid, p_id uuid) TO authenticated;


--
-- Name: FUNCTION rpc_instance_auth_event_summary(p_instance text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_instance_auth_event_summary(p_instance text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_instance_auth_event_summary(p_instance text) TO service_role;
GRANT ALL ON FUNCTION public.rpc_instance_auth_event_summary(p_instance text) TO sandbox_exec;
GRANT ALL ON FUNCTION public.rpc_instance_auth_event_summary(p_instance text) TO authenticated;


--
-- Name: FUNCTION rpc_instance_auth_event_trend(p_instance text, p_hours integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_instance_auth_event_trend(p_instance text, p_hours integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_instance_auth_event_trend(p_instance text, p_hours integer) TO service_role;
GRANT ALL ON FUNCTION public.rpc_instance_auth_event_trend(p_instance text, p_hours integer) TO sandbox_exec;
GRANT ALL ON FUNCTION public.rpc_instance_auth_event_trend(p_instance text, p_hours integer) TO authenticated;


--
-- Name: TABLE dispatch_error_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dispatch_error_logs TO anon;
GRANT ALL ON TABLE public.dispatch_error_logs TO authenticated;
GRANT ALL ON TABLE public.dispatch_error_logs TO service_role;
GRANT SELECT,INSERT ON TABLE public.dispatch_error_logs TO sandbox_exec;


--
-- Name: FUNCTION rpc_list_dispatch_error_logs(p_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_list_dispatch_error_logs(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_list_dispatch_error_logs(p_limit integer) TO service_role;
GRANT ALL ON FUNCTION public.rpc_list_dispatch_error_logs(p_limit integer) TO sandbox_exec;
GRANT ALL ON FUNCTION public.rpc_list_dispatch_error_logs(p_limit integer) TO authenticated;


--
-- Name: TABLE failed_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.failed_messages TO anon;
GRANT ALL ON TABLE public.failed_messages TO authenticated;
GRANT ALL ON TABLE public.failed_messages TO service_role;
GRANT SELECT,INSERT ON TABLE public.failed_messages TO sandbox_exec;


--
-- Name: FUNCTION rpc_list_failed_messages(p_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_list_failed_messages(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_list_failed_messages(p_limit integer) TO service_role;
GRANT ALL ON FUNCTION public.rpc_list_failed_messages(p_limit integer) TO sandbox_exec;
GRANT ALL ON FUNCTION public.rpc_list_failed_messages(p_limit integer) TO authenticated;


--
-- Name: FUNCTION rpc_list_failed_messages(p_status text[], p_instance text, p_search text, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_list_failed_messages(p_status text[], p_instance text, p_search text, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer, p_offset integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_list_failed_messages(p_status text[], p_instance text, p_search text, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_list_failed_messages(p_status text[], p_instance text, p_search text, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer, p_offset integer) TO service_role;
GRANT ALL ON FUNCTION public.rpc_list_failed_messages(p_status text[], p_instance text, p_search text, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer, p_offset integer) TO sandbox_exec;


--
-- Name: FUNCTION rpc_list_transfers_paginated(p_status text, p_priority integer, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_list_transfers_paginated(p_status text, p_priority integer, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer, p_offset integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_list_transfers_paginated(p_status text, p_priority integer, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_list_transfers_paginated(p_status text, p_priority integer, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer, p_offset integer) TO service_role;
GRANT ALL ON FUNCTION public.rpc_list_transfers_paginated(p_status text, p_priority integer, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer, p_offset integer) TO sandbox_exec;


--
-- Name: FUNCTION rpc_migrate_whatsapp_integration(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_migrate_whatsapp_integration() FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_migrate_whatsapp_integration() TO service_role;
GRANT ALL ON FUNCTION public.rpc_migrate_whatsapp_integration() TO sandbox_exec;


--
-- Name: FUNCTION rpc_upsert_contact(p_remote_jid text, p_instance text, p_push_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_upsert_contact(p_remote_jid text, p_instance text, p_push_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_upsert_contact(p_remote_jid text, p_instance text, p_push_name text) TO service_role;
GRANT ALL ON FUNCTION public.rpc_upsert_contact(p_remote_jid text, p_instance text, p_push_name text) TO sandbox_exec;
GRANT ALL ON FUNCTION public.rpc_upsert_contact(p_remote_jid text, p_instance text, p_push_name text) TO authenticated;


--
-- Name: FUNCTION sanitize_reset_request(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sanitize_reset_request() FROM PUBLIC;
GRANT ALL ON FUNCTION public.sanitize_reset_request() TO service_role;
GRANT ALL ON FUNCTION public.sanitize_reset_request() TO sandbox_exec;


--
-- Name: FUNCTION search_contacts(search_term text, contact_type_filter text, company_filter text, job_title_filter text, tag_filter text, date_from timestamp with time zone, sort_field text, sort_direction text, page_size integer, page_offset integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.search_contacts(search_term text, contact_type_filter text, company_filter text, job_title_filter text, tag_filter text, date_from timestamp with time zone, sort_field text, sort_direction text, page_size integer, page_offset integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.search_contacts(search_term text, contact_type_filter text, company_filter text, job_title_filter text, tag_filter text, date_from timestamp with time zone, sort_field text, sort_direction text, page_size integer, page_offset integer) TO service_role;
GRANT ALL ON FUNCTION public.search_contacts(search_term text, contact_type_filter text, company_filter text, job_title_filter text, tag_filter text, date_from timestamp with time zone, sort_field text, sort_direction text, page_size integer, page_offset integer) TO sandbox_exec;
GRANT ALL ON FUNCTION public.search_contacts(search_term text, contact_type_filter text, company_filter text, job_title_filter text, tag_filter text, date_from timestamp with time zone, sort_field text, sort_direction text, page_size integer, page_offset integer) TO authenticated;


--
-- Name: FUNCTION search_knowledge_base(search_query text, max_results integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.search_knowledge_base(search_query text, max_results integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.search_knowledge_base(search_query text, max_results integer) TO service_role;
GRANT ALL ON FUNCTION public.search_knowledge_base(search_query text, max_results integer) TO sandbox_exec;
GRANT ALL ON FUNCTION public.search_knowledge_base(search_query text, max_results integer) TO authenticated;


--
-- Name: FUNCTION skill_based_assign(p_queue_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.skill_based_assign(p_queue_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.skill_based_assign(p_queue_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.skill_based_assign(p_queue_id uuid) TO sandbox_exec;
GRANT ALL ON FUNCTION public.skill_based_assign(p_queue_id uuid) TO authenticated;


--
-- Name: FUNCTION trg_fn_set_transfer_ticket(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.trg_fn_set_transfer_ticket() FROM PUBLIC;
GRANT ALL ON FUNCTION public.trg_fn_set_transfer_ticket() TO service_role;
GRANT ALL ON FUNCTION public.trg_fn_set_transfer_ticket() TO sandbox_exec;
GRANT ALL ON FUNCTION public.trg_fn_set_transfer_ticket() TO authenticated;


--
-- Name: FUNCTION unpause_instance(p_instance text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.unpause_instance(p_instance text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.unpause_instance(p_instance text) TO service_role;
GRANT ALL ON FUNCTION public.unpause_instance(p_instance text) TO sandbox_exec;


--
-- Name: FUNCTION update_agent_level(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_agent_level() FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_agent_level() TO service_role;
GRANT ALL ON FUNCTION public.update_agent_level() TO sandbox_exec;


--
-- Name: FUNCTION update_device_last_seen(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_device_last_seen() FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_device_last_seen() TO service_role;
GRANT ALL ON FUNCTION public.update_device_last_seen() TO sandbox_exec;


--
-- Name: FUNCTION update_global_settings_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_global_settings_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_global_settings_updated_at() TO service_role;
GRANT ALL ON FUNCTION public.update_global_settings_updated_at() TO sandbox_exec;


--
-- Name: FUNCTION update_own_profile(p_display_name text, p_avatar_url text, p_phone text, p_email text, p_signature text, p_birthday text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_own_profile(p_display_name text, p_avatar_url text, p_phone text, p_email text, p_signature text, p_birthday text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_own_profile(p_display_name text, p_avatar_url text, p_phone text, p_email text, p_signature text, p_birthday text) TO service_role;
GRANT ALL ON FUNCTION public.update_own_profile(p_display_name text, p_avatar_url text, p_phone text, p_email text, p_signature text, p_birthday text) TO sandbox_exec;
GRANT ALL ON FUNCTION public.update_own_profile(p_display_name text, p_avatar_url text, p_phone text, p_email text, p_signature text, p_birthday text) TO authenticated;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO sandbox_exec;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;


--
-- Name: FUNCTION user_has_permission(_user_id uuid, _permission_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.user_has_permission(_user_id uuid, _permission_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_has_permission(_user_id uuid, _permission_name text) TO service_role;
GRANT ALL ON FUNCTION public.user_has_permission(_user_id uuid, _permission_name text) TO sandbox_exec;
GRANT ALL ON FUNCTION public.user_has_permission(_user_id uuid, _permission_name text) TO authenticated;


--
-- Name: FUNCTION validate_reset_token(p_token text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validate_reset_token(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_reset_token(p_token text) TO service_role;
GRANT ALL ON FUNCTION public.validate_reset_token(p_token text) TO sandbox_exec;
GRANT ALL ON FUNCTION public.validate_reset_token(p_token text) TO authenticated;


--
-- Name: TABLE agent_achievements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.agent_achievements TO anon;
GRANT ALL ON TABLE public.agent_achievements TO authenticated;
GRANT ALL ON TABLE public.agent_achievements TO service_role;
GRANT SELECT,INSERT ON TABLE public.agent_achievements TO sandbox_exec;


--
-- Name: TABLE agent_skills; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.agent_skills TO anon;
GRANT ALL ON TABLE public.agent_skills TO authenticated;
GRANT ALL ON TABLE public.agent_skills TO service_role;
GRANT SELECT,INSERT ON TABLE public.agent_skills TO sandbox_exec;


--
-- Name: TABLE agent_stats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.agent_stats TO anon;
GRANT ALL ON TABLE public.agent_stats TO authenticated;
GRANT ALL ON TABLE public.agent_stats TO service_role;
GRANT SELECT,INSERT ON TABLE public.agent_stats TO sandbox_exec;


--
-- Name: TABLE agent_visibility_grants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.agent_visibility_grants TO anon;
GRANT ALL ON TABLE public.agent_visibility_grants TO authenticated;
GRANT ALL ON TABLE public.agent_visibility_grants TO service_role;
GRANT SELECT,INSERT ON TABLE public.agent_visibility_grants TO sandbox_exec;


--
-- Name: TABLE ai_conversation_tags; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_conversation_tags TO anon;
GRANT ALL ON TABLE public.ai_conversation_tags TO authenticated;
GRANT ALL ON TABLE public.ai_conversation_tags TO service_role;
GRANT SELECT,INSERT ON TABLE public.ai_conversation_tags TO sandbox_exec;


--
-- Name: TABLE ai_providers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_providers TO anon;
GRANT ALL ON TABLE public.ai_providers TO authenticated;
GRANT ALL ON TABLE public.ai_providers TO service_role;
GRANT SELECT,INSERT ON TABLE public.ai_providers TO sandbox_exec;


--
-- Name: TABLE ai_usage_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_usage_logs TO anon;
GRANT ALL ON TABLE public.ai_usage_logs TO authenticated;
GRANT ALL ON TABLE public.ai_usage_logs TO service_role;
GRANT SELECT,INSERT ON TABLE public.ai_usage_logs TO sandbox_exec;


--
-- Name: TABLE allowed_countries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.allowed_countries TO anon;
GRANT ALL ON TABLE public.allowed_countries TO authenticated;
GRANT ALL ON TABLE public.allowed_countries TO service_role;
GRANT SELECT,INSERT ON TABLE public.allowed_countries TO sandbox_exec;


--
-- Name: TABLE audio_meme_favorites; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.audio_meme_favorites TO anon;
GRANT ALL ON TABLE public.audio_meme_favorites TO authenticated;
GRANT ALL ON TABLE public.audio_meme_favorites TO service_role;
GRANT SELECT,INSERT ON TABLE public.audio_meme_favorites TO sandbox_exec;


--
-- Name: TABLE audio_memes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.audio_memes TO anon;
GRANT ALL ON TABLE public.audio_memes TO authenticated;
GRANT ALL ON TABLE public.audio_memes TO service_role;
GRANT SELECT,INSERT ON TABLE public.audio_memes TO sandbox_exec;


--
-- Name: TABLE audit_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.audit_logs TO anon;
GRANT ALL ON TABLE public.audit_logs TO authenticated;
GRANT ALL ON TABLE public.audit_logs TO service_role;
GRANT SELECT,INSERT ON TABLE public.audit_logs TO sandbox_exec;


--
-- Name: TABLE auto_close_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.auto_close_config TO anon;
GRANT ALL ON TABLE public.auto_close_config TO authenticated;
GRANT ALL ON TABLE public.auto_close_config TO service_role;
GRANT SELECT,INSERT ON TABLE public.auto_close_config TO sandbox_exec;


--
-- Name: TABLE automations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.automations TO anon;
GRANT ALL ON TABLE public.automations TO authenticated;
GRANT ALL ON TABLE public.automations TO service_role;
GRANT SELECT,INSERT ON TABLE public.automations TO sandbox_exec;


--
-- Name: TABLE away_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.away_messages TO anon;
GRANT ALL ON TABLE public.away_messages TO authenticated;
GRANT ALL ON TABLE public.away_messages TO service_role;
GRANT SELECT,INSERT ON TABLE public.away_messages TO sandbox_exec;


--
-- Name: TABLE blocked_countries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.blocked_countries TO anon;
GRANT ALL ON TABLE public.blocked_countries TO authenticated;
GRANT ALL ON TABLE public.blocked_countries TO service_role;
GRANT SELECT,INSERT ON TABLE public.blocked_countries TO sandbox_exec;


--
-- Name: TABLE blocked_ips; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.blocked_ips TO anon;
GRANT ALL ON TABLE public.blocked_ips TO authenticated;
GRANT ALL ON TABLE public.blocked_ips TO service_role;
GRANT SELECT,INSERT ON TABLE public.blocked_ips TO sandbox_exec;


--
-- Name: TABLE business_hours; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.business_hours TO anon;
GRANT ALL ON TABLE public.business_hours TO authenticated;
GRANT ALL ON TABLE public.business_hours TO service_role;
GRANT SELECT,INSERT ON TABLE public.business_hours TO sandbox_exec;


--
-- Name: TABLE calls; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.calls TO anon;
GRANT ALL ON TABLE public.calls TO authenticated;
GRANT ALL ON TABLE public.calls TO service_role;
GRANT SELECT,INSERT ON TABLE public.calls TO sandbox_exec;


--
-- Name: TABLE campaign_ab_variants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.campaign_ab_variants TO anon;
GRANT ALL ON TABLE public.campaign_ab_variants TO authenticated;
GRANT ALL ON TABLE public.campaign_ab_variants TO service_role;
GRANT SELECT,INSERT ON TABLE public.campaign_ab_variants TO sandbox_exec;


--
-- Name: TABLE campaign_contacts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.campaign_contacts TO anon;
GRANT ALL ON TABLE public.campaign_contacts TO authenticated;
GRANT ALL ON TABLE public.campaign_contacts TO service_role;
GRANT SELECT,INSERT ON TABLE public.campaign_contacts TO sandbox_exec;


--
-- Name: TABLE campaigns; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.campaigns TO anon;
GRANT ALL ON TABLE public.campaigns TO authenticated;
GRANT ALL ON TABLE public.campaigns TO service_role;
GRANT SELECT,INSERT ON TABLE public.campaigns TO sandbox_exec;


--
-- Name: TABLE channel_connections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.channel_connections TO anon;
GRANT ALL ON TABLE public.channel_connections TO authenticated;
GRANT ALL ON TABLE public.channel_connections TO service_role;
GRANT SELECT,INSERT ON TABLE public.channel_connections TO sandbox_exec;


--
-- Name: TABLE channel_connections_safe; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.channel_connections_safe TO anon;
GRANT ALL ON TABLE public.channel_connections_safe TO authenticated;
GRANT ALL ON TABLE public.channel_connections_safe TO service_role;
GRANT SELECT,INSERT ON TABLE public.channel_connections_safe TO sandbox_exec;


--
-- Name: TABLE channel_routing_rules; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.channel_routing_rules TO anon;
GRANT ALL ON TABLE public.channel_routing_rules TO authenticated;
GRANT ALL ON TABLE public.channel_routing_rules TO service_role;
GRANT SELECT,INSERT ON TABLE public.channel_routing_rules TO sandbox_exec;


--
-- Name: TABLE chatbot_executions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chatbot_executions TO anon;
GRANT ALL ON TABLE public.chatbot_executions TO authenticated;
GRANT ALL ON TABLE public.chatbot_executions TO service_role;
GRANT SELECT,INSERT ON TABLE public.chatbot_executions TO sandbox_exec;


--
-- Name: TABLE chatbot_flows; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chatbot_flows TO anon;
GRANT ALL ON TABLE public.chatbot_flows TO authenticated;
GRANT ALL ON TABLE public.chatbot_flows TO service_role;
GRANT SELECT,INSERT ON TABLE public.chatbot_flows TO sandbox_exec;


--
-- Name: TABLE client_wallet_rules; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.client_wallet_rules TO anon;
GRANT ALL ON TABLE public.client_wallet_rules TO authenticated;
GRANT ALL ON TABLE public.client_wallet_rules TO service_role;
GRANT SELECT,INSERT ON TABLE public.client_wallet_rules TO sandbox_exec;


--
-- Name: TABLE connection_alert_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.connection_alert_preferences TO anon;
GRANT ALL ON TABLE public.connection_alert_preferences TO authenticated;
GRANT ALL ON TABLE public.connection_alert_preferences TO service_role;
GRANT SELECT,INSERT ON TABLE public.connection_alert_preferences TO sandbox_exec;


--
-- Name: TABLE connection_health_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.connection_health_logs TO anon;
GRANT ALL ON TABLE public.connection_health_logs TO authenticated;
GRANT ALL ON TABLE public.connection_health_logs TO service_role;
GRANT SELECT,INSERT ON TABLE public.connection_health_logs TO sandbox_exec;


--
-- Name: TABLE contact_custom_fields; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.contact_custom_fields TO anon;
GRANT ALL ON TABLE public.contact_custom_fields TO authenticated;
GRANT ALL ON TABLE public.contact_custom_fields TO service_role;
GRANT SELECT,INSERT ON TABLE public.contact_custom_fields TO sandbox_exec;


--
-- Name: TABLE contact_notes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.contact_notes TO anon;
GRANT ALL ON TABLE public.contact_notes TO authenticated;
GRANT ALL ON TABLE public.contact_notes TO service_role;
GRANT SELECT,INSERT ON TABLE public.contact_notes TO sandbox_exec;


--
-- Name: TABLE contact_purchases; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.contact_purchases TO anon;
GRANT ALL ON TABLE public.contact_purchases TO authenticated;
GRANT ALL ON TABLE public.contact_purchases TO service_role;
GRANT SELECT,INSERT ON TABLE public.contact_purchases TO sandbox_exec;


--
-- Name: TABLE contact_tags; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.contact_tags TO anon;
GRANT ALL ON TABLE public.contact_tags TO authenticated;
GRANT ALL ON TABLE public.contact_tags TO service_role;
GRANT SELECT,INSERT ON TABLE public.contact_tags TO sandbox_exec;


--
-- Name: TABLE contacts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.contacts TO anon;
GRANT ALL ON TABLE public.contacts TO authenticated;
GRANT ALL ON TABLE public.contacts TO service_role;
GRANT SELECT,INSERT ON TABLE public.contacts TO sandbox_exec;


--
-- Name: TABLE conversation_analyses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversation_analyses TO anon;
GRANT ALL ON TABLE public.conversation_analyses TO authenticated;
GRANT ALL ON TABLE public.conversation_analyses TO service_role;
GRANT SELECT,INSERT ON TABLE public.conversation_analyses TO sandbox_exec;


--
-- Name: TABLE conversation_closures; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversation_closures TO anon;
GRANT ALL ON TABLE public.conversation_closures TO authenticated;
GRANT ALL ON TABLE public.conversation_closures TO service_role;
GRANT SELECT,INSERT ON TABLE public.conversation_closures TO sandbox_exec;


--
-- Name: TABLE conversation_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversation_events TO anon;
GRANT ALL ON TABLE public.conversation_events TO authenticated;
GRANT ALL ON TABLE public.conversation_events TO service_role;
GRANT SELECT,INSERT ON TABLE public.conversation_events TO sandbox_exec;


--
-- Name: TABLE conversation_memory; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversation_memory TO anon;
GRANT ALL ON TABLE public.conversation_memory TO authenticated;
GRANT ALL ON TABLE public.conversation_memory TO service_role;
GRANT SELECT,INSERT ON TABLE public.conversation_memory TO sandbox_exec;


--
-- Name: TABLE conversation_sla; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversation_sla TO anon;
GRANT ALL ON TABLE public.conversation_sla TO authenticated;
GRANT ALL ON TABLE public.conversation_sla TO service_role;
GRANT SELECT,INSERT ON TABLE public.conversation_sla TO sandbox_exec;


--
-- Name: TABLE conversation_snoozes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversation_snoozes TO anon;
GRANT ALL ON TABLE public.conversation_snoozes TO authenticated;
GRANT ALL ON TABLE public.conversation_snoozes TO service_role;
GRANT SELECT,INSERT ON TABLE public.conversation_snoozes TO sandbox_exec;


--
-- Name: TABLE conversation_tasks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversation_tasks TO anon;
GRANT ALL ON TABLE public.conversation_tasks TO authenticated;
GRANT ALL ON TABLE public.conversation_tasks TO service_role;
GRANT SELECT,INSERT ON TABLE public.conversation_tasks TO sandbox_exec;


--
-- Name: TABLE conversation_transfers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversation_transfers TO anon;
GRANT ALL ON TABLE public.conversation_transfers TO authenticated;
GRANT ALL ON TABLE public.conversation_transfers TO service_role;
GRANT SELECT,INSERT ON TABLE public.conversation_transfers TO sandbox_exec;


--
-- Name: TABLE crisis_room_alerts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.crisis_room_alerts TO anon;
GRANT ALL ON TABLE public.crisis_room_alerts TO authenticated;
GRANT ALL ON TABLE public.crisis_room_alerts TO service_role;
GRANT SELECT,INSERT ON TABLE public.crisis_room_alerts TO sandbox_exec;


--
-- Name: TABLE csat_auto_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.csat_auto_config TO anon;
GRANT ALL ON TABLE public.csat_auto_config TO authenticated;
GRANT ALL ON TABLE public.csat_auto_config TO service_role;
GRANT SELECT,INSERT ON TABLE public.csat_auto_config TO sandbox_exec;


--
-- Name: TABLE csat_surveys; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.csat_surveys TO anon;
GRANT ALL ON TABLE public.csat_surveys TO authenticated;
GRANT ALL ON TABLE public.csat_surveys TO service_role;
GRANT SELECT,INSERT ON TABLE public.csat_surveys TO sandbox_exec;


--
-- Name: TABLE custom_emojis; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.custom_emojis TO anon;
GRANT ALL ON TABLE public.custom_emojis TO authenticated;
GRANT ALL ON TABLE public.custom_emojis TO service_role;
GRANT SELECT,INSERT ON TABLE public.custom_emojis TO sandbox_exec;


--
-- Name: TABLE deal_activities; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.deal_activities TO anon;
GRANT ALL ON TABLE public.deal_activities TO authenticated;
GRANT ALL ON TABLE public.deal_activities TO service_role;
GRANT SELECT,INSERT ON TABLE public.deal_activities TO sandbox_exec;


--
-- Name: TABLE department_invitations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.department_invitations TO anon;
GRANT ALL ON TABLE public.department_invitations TO authenticated;
GRANT ALL ON TABLE public.department_invitations TO service_role;
GRANT SELECT,INSERT ON TABLE public.department_invitations TO sandbox_exec;


--
-- Name: TABLE departments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.departments TO anon;
GRANT ALL ON TABLE public.departments TO authenticated;
GRANT ALL ON TABLE public.departments TO service_role;
GRANT SELECT,INSERT ON TABLE public.departments TO sandbox_exec;


--
-- Name: COLUMN departments.whatsapp_api_key; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(whatsapp_api_key) ON TABLE public.departments TO service_role;


--
-- Name: TABLE departments_safe; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.departments_safe TO anon;
GRANT ALL ON TABLE public.departments_safe TO authenticated;
GRANT ALL ON TABLE public.departments_safe TO service_role;
GRANT SELECT,INSERT ON TABLE public.departments_safe TO sandbox_exec;


--
-- Name: TABLE email_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_accounts TO anon;
GRANT ALL ON TABLE public.email_accounts TO authenticated;
GRANT ALL ON TABLE public.email_accounts TO service_role;
GRANT SELECT,INSERT ON TABLE public.email_accounts TO sandbox_exec;


--
-- Name: TABLE email_labels; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_labels TO anon;
GRANT ALL ON TABLE public.email_labels TO authenticated;
GRANT ALL ON TABLE public.email_labels TO service_role;
GRANT SELECT,INSERT ON TABLE public.email_labels TO sandbox_exec;


--
-- Name: TABLE email_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_messages TO anon;
GRANT ALL ON TABLE public.email_messages TO authenticated;
GRANT ALL ON TABLE public.email_messages TO service_role;
GRANT SELECT,INSERT ON TABLE public.email_messages TO sandbox_exec;


--
-- Name: TABLE email_threads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_threads TO anon;
GRANT ALL ON TABLE public.email_threads TO authenticated;
GRANT ALL ON TABLE public.email_threads TO service_role;
GRANT SELECT,INSERT ON TABLE public.email_threads TO sandbox_exec;


--
-- Name: TABLE entity_versions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.entity_versions TO anon;
GRANT ALL ON TABLE public.entity_versions TO authenticated;
GRANT ALL ON TABLE public.entity_versions TO service_role;
GRANT SELECT,INSERT ON TABLE public.entity_versions TO sandbox_exec;


--
-- Name: TABLE evolution_health_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.evolution_health_logs TO anon;
GRANT ALL ON TABLE public.evolution_health_logs TO authenticated;
GRANT ALL ON TABLE public.evolution_health_logs TO service_role;
GRANT SELECT,INSERT ON TABLE public.evolution_health_logs TO sandbox_exec;


--
-- Name: TABLE evolution_instance_credentials; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.evolution_instance_credentials TO anon;
GRANT ALL ON TABLE public.evolution_instance_credentials TO authenticated;
GRANT ALL ON TABLE public.evolution_instance_credentials TO service_role;
GRANT SELECT,INSERT ON TABLE public.evolution_instance_credentials TO sandbox_exec;


--
-- Name: TABLE evolution_retry_metrics; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.evolution_retry_metrics TO anon;
GRANT ALL ON TABLE public.evolution_retry_metrics TO authenticated;
GRANT ALL ON TABLE public.evolution_retry_metrics TO service_role;
GRANT SELECT,INSERT ON TABLE public.evolution_retry_metrics TO sandbox_exec;


--
-- Name: TABLE favorite_contacts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.favorite_contacts TO anon;
GRANT ALL ON TABLE public.favorite_contacts TO authenticated;
GRANT ALL ON TABLE public.favorite_contacts TO service_role;
GRANT SELECT,INSERT ON TABLE public.favorite_contacts TO sandbox_exec;


--
-- Name: TABLE followup_executions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.followup_executions TO anon;
GRANT ALL ON TABLE public.followup_executions TO authenticated;
GRANT ALL ON TABLE public.followup_executions TO service_role;
GRANT SELECT,INSERT ON TABLE public.followup_executions TO sandbox_exec;


--
-- Name: TABLE followup_sequences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.followup_sequences TO anon;
GRANT ALL ON TABLE public.followup_sequences TO authenticated;
GRANT ALL ON TABLE public.followup_sequences TO service_role;
GRANT SELECT,INSERT ON TABLE public.followup_sequences TO sandbox_exec;


--
-- Name: TABLE followup_steps; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.followup_steps TO anon;
GRANT ALL ON TABLE public.followup_steps TO authenticated;
GRANT ALL ON TABLE public.followup_steps TO service_role;
GRANT SELECT,INSERT ON TABLE public.followup_steps TO sandbox_exec;


--
-- Name: TABLE geo_blocking_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.geo_blocking_settings TO anon;
GRANT ALL ON TABLE public.geo_blocking_settings TO authenticated;
GRANT ALL ON TABLE public.geo_blocking_settings TO service_role;
GRANT SELECT,INSERT ON TABLE public.geo_blocking_settings TO sandbox_exec;


--
-- Name: TABLE global_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.global_settings TO anon;
GRANT ALL ON TABLE public.global_settings TO authenticated;
GRANT ALL ON TABLE public.global_settings TO service_role;
GRANT SELECT,INSERT ON TABLE public.global_settings TO sandbox_exec;


--
-- Name: TABLE gmail_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gmail_accounts TO anon;
GRANT ALL ON TABLE public.gmail_accounts TO authenticated;
GRANT ALL ON TABLE public.gmail_accounts TO service_role;
GRANT SELECT,INSERT ON TABLE public.gmail_accounts TO sandbox_exec;


--
-- Name: TABLE gmail_accounts_safe; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gmail_accounts_safe TO anon;
GRANT ALL ON TABLE public.gmail_accounts_safe TO authenticated;
GRANT ALL ON TABLE public.gmail_accounts_safe TO service_role;
GRANT SELECT,INSERT ON TABLE public.gmail_accounts_safe TO sandbox_exec;


--
-- Name: TABLE goals_configurations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.goals_configurations TO anon;
GRANT ALL ON TABLE public.goals_configurations TO authenticated;
GRANT ALL ON TABLE public.goals_configurations TO service_role;
GRANT SELECT,INSERT ON TABLE public.goals_configurations TO sandbox_exec;


--
-- Name: TABLE inbox_custom_scopes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inbox_custom_scopes TO anon;
GRANT ALL ON TABLE public.inbox_custom_scopes TO authenticated;
GRANT ALL ON TABLE public.inbox_custom_scopes TO service_role;
GRANT SELECT,INSERT ON TABLE public.inbox_custom_scopes TO sandbox_exec;


--
-- Name: TABLE instance_auth_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.instance_auth_events TO anon;
GRANT ALL ON TABLE public.instance_auth_events TO authenticated;
GRANT ALL ON TABLE public.instance_auth_events TO service_role;
GRANT SELECT,INSERT ON TABLE public.instance_auth_events TO sandbox_exec;


--
-- Name: TABLE instance_processing_pauses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.instance_processing_pauses TO anon;
GRANT ALL ON TABLE public.instance_processing_pauses TO authenticated;
GRANT ALL ON TABLE public.instance_processing_pauses TO service_role;
GRANT SELECT,INSERT ON TABLE public.instance_processing_pauses TO sandbox_exec;


--
-- Name: TABLE instance_registry; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.instance_registry TO anon;
GRANT ALL ON TABLE public.instance_registry TO authenticated;
GRANT ALL ON TABLE public.instance_registry TO service_role;
GRANT SELECT,INSERT ON TABLE public.instance_registry TO sandbox_exec;


--
-- Name: TABLE ip_whitelist; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ip_whitelist TO anon;
GRANT ALL ON TABLE public.ip_whitelist TO authenticated;
GRANT ALL ON TABLE public.ip_whitelist TO service_role;
GRANT SELECT,INSERT ON TABLE public.ip_whitelist TO sandbox_exec;


--
-- Name: TABLE knowledge_base_articles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.knowledge_base_articles TO anon;
GRANT ALL ON TABLE public.knowledge_base_articles TO authenticated;
GRANT ALL ON TABLE public.knowledge_base_articles TO service_role;
GRANT SELECT,INSERT ON TABLE public.knowledge_base_articles TO sandbox_exec;


--
-- Name: TABLE knowledge_base_files; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.knowledge_base_files TO anon;
GRANT ALL ON TABLE public.knowledge_base_files TO authenticated;
GRANT ALL ON TABLE public.knowledge_base_files TO service_role;
GRANT SELECT,INSERT ON TABLE public.knowledge_base_files TO sandbox_exec;


--
-- Name: TABLE login_attempts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.login_attempts TO anon;
GRANT ALL ON TABLE public.login_attempts TO authenticated;
GRANT ALL ON TABLE public.login_attempts TO service_role;
GRANT SELECT,INSERT ON TABLE public.login_attempts TO sandbox_exec;


--
-- Name: TABLE message_reactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.message_reactions TO anon;
GRANT ALL ON TABLE public.message_reactions TO authenticated;
GRANT ALL ON TABLE public.message_reactions TO service_role;
GRANT SELECT,INSERT ON TABLE public.message_reactions TO sandbox_exec;


--
-- Name: TABLE message_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.message_templates TO anon;
GRANT ALL ON TABLE public.message_templates TO authenticated;
GRANT ALL ON TABLE public.message_templates TO service_role;
GRANT SELECT,INSERT ON TABLE public.message_templates TO sandbox_exec;


--
-- Name: TABLE messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.messages TO anon;
GRANT ALL ON TABLE public.messages TO authenticated;
GRANT ALL ON TABLE public.messages TO service_role;
GRANT SELECT,INSERT ON TABLE public.messages TO sandbox_exec;


--
-- Name: TABLE meta_capi_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.meta_capi_events TO anon;
GRANT ALL ON TABLE public.meta_capi_events TO authenticated;
GRANT ALL ON TABLE public.meta_capi_events TO service_role;
GRANT SELECT,INSERT ON TABLE public.meta_capi_events TO sandbox_exec;


--
-- Name: TABLE mfa_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mfa_sessions TO anon;
GRANT ALL ON TABLE public.mfa_sessions TO authenticated;
GRANT ALL ON TABLE public.mfa_sessions TO service_role;
GRANT SELECT,INSERT ON TABLE public.mfa_sessions TO sandbox_exec;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;
GRANT SELECT,INSERT ON TABLE public.notifications TO sandbox_exec;


--
-- Name: TABLE nps_surveys; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.nps_surveys TO anon;
GRANT ALL ON TABLE public.nps_surveys TO authenticated;
GRANT ALL ON TABLE public.nps_surveys TO service_role;
GRANT SELECT,INSERT ON TABLE public.nps_surveys TO sandbox_exec;


--
-- Name: TABLE number_reputation; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.number_reputation TO anon;
GRANT ALL ON TABLE public.number_reputation TO authenticated;
GRANT ALL ON TABLE public.number_reputation TO service_role;
GRANT SELECT,INSERT ON TABLE public.number_reputation TO sandbox_exec;


--
-- Name: TABLE passkey_credentials; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.passkey_credentials TO anon;
GRANT ALL ON TABLE public.passkey_credentials TO authenticated;
GRANT ALL ON TABLE public.passkey_credentials TO service_role;
GRANT SELECT,INSERT ON TABLE public.passkey_credentials TO sandbox_exec;


--
-- Name: TABLE password_reset_requests_safe; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.password_reset_requests_safe TO anon;
GRANT ALL ON TABLE public.password_reset_requests_safe TO authenticated;
GRANT ALL ON TABLE public.password_reset_requests_safe TO service_role;
GRANT SELECT,INSERT ON TABLE public.password_reset_requests_safe TO sandbox_exec;


--
-- Name: TABLE payment_links; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.payment_links TO anon;
GRANT ALL ON TABLE public.payment_links TO authenticated;
GRANT ALL ON TABLE public.payment_links TO service_role;
GRANT SELECT,INSERT ON TABLE public.payment_links TO sandbox_exec;


--
-- Name: TABLE performance_snapshots; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.performance_snapshots TO anon;
GRANT ALL ON TABLE public.performance_snapshots TO authenticated;
GRANT ALL ON TABLE public.performance_snapshots TO service_role;
GRANT SELECT,INSERT ON TABLE public.performance_snapshots TO sandbox_exec;


--
-- Name: TABLE permissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.permissions TO anon;
GRANT ALL ON TABLE public.permissions TO authenticated;
GRANT ALL ON TABLE public.permissions TO service_role;
GRANT SELECT,INSERT ON TABLE public.permissions TO sandbox_exec;


--
-- Name: TABLE pinned_conversations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pinned_conversations TO anon;
GRANT ALL ON TABLE public.pinned_conversations TO authenticated;
GRANT ALL ON TABLE public.pinned_conversations TO service_role;
GRANT SELECT,INSERT ON TABLE public.pinned_conversations TO sandbox_exec;


--
-- Name: TABLE playbooks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.playbooks TO anon;
GRANT ALL ON TABLE public.playbooks TO authenticated;
GRANT ALL ON TABLE public.playbooks TO service_role;
GRANT SELECT,INSERT ON TABLE public.playbooks TO sandbox_exec;


--
-- Name: TABLE processed_webhook_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.processed_webhook_events TO anon;
GRANT ALL ON TABLE public.processed_webhook_events TO authenticated;
GRANT ALL ON TABLE public.processed_webhook_events TO service_role;
GRANT SELECT,INSERT ON TABLE public.processed_webhook_events TO sandbox_exec;


--
-- Name: TABLE products; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.products TO anon;
GRANT ALL ON TABLE public.products TO authenticated;
GRANT ALL ON TABLE public.products TO service_role;
GRANT SELECT,INSERT ON TABLE public.products TO sandbox_exec;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;
GRANT SELECT,INSERT ON TABLE public.profiles TO sandbox_exec;


--
-- Name: TABLE profiles_public; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles_public TO anon;
GRANT ALL ON TABLE public.profiles_public TO authenticated;
GRANT ALL ON TABLE public.profiles_public TO service_role;
GRANT SELECT,INSERT ON TABLE public.profiles_public TO sandbox_exec;


--
-- Name: TABLE qr_attempts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.qr_attempts TO anon;
GRANT ALL ON TABLE public.qr_attempts TO authenticated;
GRANT ALL ON TABLE public.qr_attempts TO service_role;
GRANT SELECT,INSERT ON TABLE public.qr_attempts TO sandbox_exec;


--
-- Name: TABLE query_telemetry; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.query_telemetry TO anon;
GRANT ALL ON TABLE public.query_telemetry TO authenticated;
GRANT ALL ON TABLE public.query_telemetry TO service_role;
GRANT SELECT,INSERT ON TABLE public.query_telemetry TO sandbox_exec;


--
-- Name: TABLE queue_goals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.queue_goals TO anon;
GRANT ALL ON TABLE public.queue_goals TO authenticated;
GRANT ALL ON TABLE public.queue_goals TO service_role;
GRANT SELECT,INSERT ON TABLE public.queue_goals TO sandbox_exec;


--
-- Name: TABLE queue_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.queue_members TO anon;
GRANT ALL ON TABLE public.queue_members TO authenticated;
GRANT ALL ON TABLE public.queue_members TO service_role;
GRANT SELECT,INSERT ON TABLE public.queue_members TO sandbox_exec;


--
-- Name: TABLE queue_positions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.queue_positions TO anon;
GRANT ALL ON TABLE public.queue_positions TO authenticated;
GRANT ALL ON TABLE public.queue_positions TO service_role;
GRANT SELECT,INSERT ON TABLE public.queue_positions TO sandbox_exec;


--
-- Name: TABLE queue_skill_requirements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.queue_skill_requirements TO anon;
GRANT ALL ON TABLE public.queue_skill_requirements TO authenticated;
GRANT ALL ON TABLE public.queue_skill_requirements TO service_role;
GRANT SELECT,INSERT ON TABLE public.queue_skill_requirements TO sandbox_exec;


--
-- Name: TABLE queues; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.queues TO anon;
GRANT ALL ON TABLE public.queues TO authenticated;
GRANT ALL ON TABLE public.queues TO service_role;
GRANT SELECT,INSERT ON TABLE public.queues TO sandbox_exec;


--
-- Name: TABLE rate_limit_configs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rate_limit_configs TO anon;
GRANT ALL ON TABLE public.rate_limit_configs TO authenticated;
GRANT ALL ON TABLE public.rate_limit_configs TO service_role;
GRANT SELECT,INSERT ON TABLE public.rate_limit_configs TO sandbox_exec;


--
-- Name: TABLE rate_limit_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rate_limit_logs TO anon;
GRANT ALL ON TABLE public.rate_limit_logs TO authenticated;
GRANT ALL ON TABLE public.rate_limit_logs TO service_role;
GRANT SELECT,INSERT ON TABLE public.rate_limit_logs TO sandbox_exec;


--
-- Name: TABLE reconnection_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reconnection_logs TO anon;
GRANT ALL ON TABLE public.reconnection_logs TO authenticated;
GRANT ALL ON TABLE public.reconnection_logs TO service_role;
GRANT SELECT,INSERT ON TABLE public.reconnection_logs TO sandbox_exec;


--
-- Name: TABLE reminders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reminders TO anon;
GRANT ALL ON TABLE public.reminders TO authenticated;
GRANT ALL ON TABLE public.reminders TO service_role;
GRANT SELECT,INSERT ON TABLE public.reminders TO sandbox_exec;


--
-- Name: TABLE rls_denied_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rls_denied_log TO anon;
GRANT ALL ON TABLE public.rls_denied_log TO authenticated;
GRANT ALL ON TABLE public.rls_denied_log TO service_role;
GRANT SELECT,INSERT ON TABLE public.rls_denied_log TO sandbox_exec;


--
-- Name: TABLE role_permissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.role_permissions TO anon;
GRANT ALL ON TABLE public.role_permissions TO authenticated;
GRANT ALL ON TABLE public.role_permissions TO service_role;
GRANT SELECT,INSERT ON TABLE public.role_permissions TO sandbox_exec;


--
-- Name: TABLE route_permissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.route_permissions TO anon;
GRANT ALL ON TABLE public.route_permissions TO authenticated;
GRANT ALL ON TABLE public.route_permissions TO service_role;
GRANT SELECT,INSERT ON TABLE public.route_permissions TO sandbox_exec;


--
-- Name: TABLE sales_deals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sales_deals TO anon;
GRANT ALL ON TABLE public.sales_deals TO authenticated;
GRANT ALL ON TABLE public.sales_deals TO service_role;
GRANT SELECT,INSERT ON TABLE public.sales_deals TO sandbox_exec;


--
-- Name: TABLE sales_pipeline_stages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sales_pipeline_stages TO anon;
GRANT ALL ON TABLE public.sales_pipeline_stages TO authenticated;
GRANT ALL ON TABLE public.sales_pipeline_stages TO service_role;
GRANT SELECT,INSERT ON TABLE public.sales_pipeline_stages TO sandbox_exec;


--
-- Name: TABLE saved_filters; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.saved_filters TO anon;
GRANT ALL ON TABLE public.saved_filters TO authenticated;
GRANT ALL ON TABLE public.saved_filters TO service_role;
GRANT SELECT,INSERT ON TABLE public.saved_filters TO sandbox_exec;


--
-- Name: TABLE scheduled_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.scheduled_messages TO anon;
GRANT ALL ON TABLE public.scheduled_messages TO authenticated;
GRANT ALL ON TABLE public.scheduled_messages TO service_role;
GRANT SELECT,INSERT ON TABLE public.scheduled_messages TO sandbox_exec;


--
-- Name: TABLE scheduled_report_configs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.scheduled_report_configs TO anon;
GRANT ALL ON TABLE public.scheduled_report_configs TO authenticated;
GRANT ALL ON TABLE public.scheduled_report_configs TO service_role;
GRANT SELECT,INSERT ON TABLE public.scheduled_report_configs TO sandbox_exec;


--
-- Name: TABLE scheduled_reports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.scheduled_reports TO anon;
GRANT ALL ON TABLE public.scheduled_reports TO authenticated;
GRANT ALL ON TABLE public.scheduled_reports TO service_role;
GRANT SELECT,INSERT ON TABLE public.scheduled_reports TO sandbox_exec;


--
-- Name: TABLE security_alerts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.security_alerts TO anon;
GRANT ALL ON TABLE public.security_alerts TO authenticated;
GRANT ALL ON TABLE public.security_alerts TO service_role;
GRANT SELECT,INSERT ON TABLE public.security_alerts TO sandbox_exec;


--
-- Name: TABLE security_audit_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.security_audit_logs TO anon;
GRANT ALL ON TABLE public.security_audit_logs TO authenticated;
GRANT ALL ON TABLE public.security_audit_logs TO service_role;
GRANT SELECT,INSERT ON TABLE public.security_audit_logs TO sandbox_exec;


--
-- Name: TABLE sicoob_contact_mapping; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sicoob_contact_mapping TO anon;
GRANT ALL ON TABLE public.sicoob_contact_mapping TO authenticated;
GRANT ALL ON TABLE public.sicoob_contact_mapping TO service_role;
GRANT SELECT,INSERT ON TABLE public.sicoob_contact_mapping TO sandbox_exec;


--
-- Name: TABLE sla_configurations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sla_configurations TO anon;
GRANT ALL ON TABLE public.sla_configurations TO authenticated;
GRANT ALL ON TABLE public.sla_configurations TO service_role;
GRANT SELECT,INSERT ON TABLE public.sla_configurations TO sandbox_exec;


--
-- Name: TABLE sla_rules; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sla_rules TO anon;
GRANT ALL ON TABLE public.sla_rules TO authenticated;
GRANT ALL ON TABLE public.sla_rules TO service_role;
GRANT SELECT,INSERT ON TABLE public.sla_rules TO sandbox_exec;


--
-- Name: TABLE stickers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.stickers TO anon;
GRANT ALL ON TABLE public.stickers TO authenticated;
GRANT ALL ON TABLE public.stickers TO service_role;
GRANT SELECT,INSERT ON TABLE public.stickers TO sandbox_exec;


--
-- Name: TABLE tags; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tags TO anon;
GRANT ALL ON TABLE public.tags TO authenticated;
GRANT ALL ON TABLE public.tags TO service_role;
GRANT SELECT,INSERT ON TABLE public.tags TO sandbox_exec;


--
-- Name: TABLE talkx_blacklist; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.talkx_blacklist TO anon;
GRANT ALL ON TABLE public.talkx_blacklist TO authenticated;
GRANT ALL ON TABLE public.talkx_blacklist TO service_role;
GRANT SELECT,INSERT ON TABLE public.talkx_blacklist TO sandbox_exec;


--
-- Name: TABLE talkx_campaigns; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.talkx_campaigns TO anon;
GRANT ALL ON TABLE public.talkx_campaigns TO authenticated;
GRANT ALL ON TABLE public.talkx_campaigns TO service_role;
GRANT SELECT,INSERT ON TABLE public.talkx_campaigns TO sandbox_exec;


--
-- Name: TABLE talkx_recipients; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.talkx_recipients TO anon;
GRANT ALL ON TABLE public.talkx_recipients TO authenticated;
GRANT ALL ON TABLE public.talkx_recipients TO service_role;
GRANT SELECT,INSERT ON TABLE public.talkx_recipients TO sandbox_exec;


--
-- Name: TABLE team_conversation_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.team_conversation_members TO anon;
GRANT ALL ON TABLE public.team_conversation_members TO authenticated;
GRANT ALL ON TABLE public.team_conversation_members TO service_role;
GRANT SELECT,INSERT ON TABLE public.team_conversation_members TO sandbox_exec;


--
-- Name: TABLE team_conversations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.team_conversations TO anon;
GRANT ALL ON TABLE public.team_conversations TO authenticated;
GRANT ALL ON TABLE public.team_conversations TO service_role;
GRANT SELECT,INSERT ON TABLE public.team_conversations TO sandbox_exec;


--
-- Name: TABLE team_message_receipts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.team_message_receipts TO anon;
GRANT ALL ON TABLE public.team_message_receipts TO authenticated;
GRANT ALL ON TABLE public.team_message_receipts TO service_role;
GRANT SELECT,INSERT ON TABLE public.team_message_receipts TO sandbox_exec;


--
-- Name: TABLE team_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.team_messages TO anon;
GRANT ALL ON TABLE public.team_messages TO authenticated;
GRANT ALL ON TABLE public.team_messages TO service_role;
GRANT SELECT,INSERT ON TABLE public.team_messages TO sandbox_exec;


--
-- Name: TABLE training_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.training_sessions TO anon;
GRANT ALL ON TABLE public.training_sessions TO authenticated;
GRANT ALL ON TABLE public.training_sessions TO service_role;
GRANT SELECT,INSERT ON TABLE public.training_sessions TO sandbox_exec;


--
-- Name: TABLE transfer_comments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.transfer_comments TO anon;
GRANT ALL ON TABLE public.transfer_comments TO authenticated;
GRANT ALL ON TABLE public.transfer_comments TO service_role;
GRANT SELECT,INSERT ON TABLE public.transfer_comments TO sandbox_exec;


--
-- Name: SEQUENCE transfer_ticket_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.transfer_ticket_seq TO anon;
GRANT ALL ON SEQUENCE public.transfer_ticket_seq TO authenticated;
GRANT ALL ON SEQUENCE public.transfer_ticket_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.transfer_ticket_seq TO sandbox_exec;


--
-- Name: TABLE user_devices; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_devices TO anon;
GRANT ALL ON TABLE public.user_devices TO authenticated;
GRANT ALL ON TABLE public.user_devices TO service_role;
GRANT SELECT,INSERT ON TABLE public.user_devices TO sandbox_exec;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_roles TO anon;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;
GRANT SELECT,INSERT ON TABLE public.user_roles TO sandbox_exec;


--
-- Name: TABLE user_service_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_service_accounts TO anon;
GRANT ALL ON TABLE public.user_service_accounts TO authenticated;
GRANT ALL ON TABLE public.user_service_accounts TO service_role;
GRANT SELECT,INSERT ON TABLE public.user_service_accounts TO sandbox_exec;


--
-- Name: TABLE user_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_sessions TO anon;
GRANT ALL ON TABLE public.user_sessions TO authenticated;
GRANT ALL ON TABLE public.user_sessions TO service_role;
GRANT SELECT,INSERT ON TABLE public.user_sessions TO sandbox_exec;


--
-- Name: TABLE user_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_settings TO anon;
GRANT ALL ON TABLE public.user_settings TO authenticated;
GRANT ALL ON TABLE public.user_settings TO service_role;
GRANT SELECT,INSERT ON TABLE public.user_settings TO sandbox_exec;


--
-- Name: TABLE v_pending_transfers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_pending_transfers TO anon;
GRANT ALL ON TABLE public.v_pending_transfers TO authenticated;
GRANT ALL ON TABLE public.v_pending_transfers TO service_role;
GRANT SELECT,INSERT ON TABLE public.v_pending_transfers TO sandbox_exec;


--
-- Name: TABLE voice_command_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.voice_command_logs TO anon;
GRANT ALL ON TABLE public.voice_command_logs TO authenticated;
GRANT ALL ON TABLE public.voice_command_logs TO service_role;
GRANT SELECT,INSERT ON TABLE public.voice_command_logs TO sandbox_exec;


--
-- Name: TABLE warroom_alerts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.warroom_alerts TO anon;
GRANT ALL ON TABLE public.warroom_alerts TO authenticated;
GRANT ALL ON TABLE public.warroom_alerts TO service_role;
GRANT SELECT,INSERT ON TABLE public.warroom_alerts TO sandbox_exec;


--
-- Name: TABLE webauthn_challenges; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.webauthn_challenges TO anon;
GRANT ALL ON TABLE public.webauthn_challenges TO authenticated;
GRANT ALL ON TABLE public.webauthn_challenges TO service_role;
GRANT SELECT,INSERT ON TABLE public.webauthn_challenges TO sandbox_exec;


--
-- Name: TABLE webhook_rate_limits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.webhook_rate_limits TO anon;
GRANT ALL ON TABLE public.webhook_rate_limits TO authenticated;
GRANT ALL ON TABLE public.webhook_rate_limits TO service_role;
GRANT SELECT,INSERT ON TABLE public.webhook_rate_limits TO sandbox_exec;


--
-- Name: TABLE whatsapp_cloud_webhook_pings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.whatsapp_cloud_webhook_pings TO anon;
GRANT ALL ON TABLE public.whatsapp_cloud_webhook_pings TO authenticated;
GRANT ALL ON TABLE public.whatsapp_cloud_webhook_pings TO service_role;
GRANT SELECT,INSERT ON TABLE public.whatsapp_cloud_webhook_pings TO sandbox_exec;


--
-- Name: TABLE whatsapp_connection_queues; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.whatsapp_connection_queues TO anon;
GRANT ALL ON TABLE public.whatsapp_connection_queues TO authenticated;
GRANT ALL ON TABLE public.whatsapp_connection_queues TO service_role;
GRANT SELECT,INSERT ON TABLE public.whatsapp_connection_queues TO sandbox_exec;


--
-- Name: TABLE whatsapp_connections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.whatsapp_connections TO anon;
GRANT ALL ON TABLE public.whatsapp_connections TO authenticated;
GRANT ALL ON TABLE public.whatsapp_connections TO service_role;
GRANT SELECT,INSERT ON TABLE public.whatsapp_connections TO sandbox_exec;


--
-- Name: COLUMN whatsapp_connections.qr_code; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(qr_code) ON TABLE public.whatsapp_connections TO service_role;


--
-- Name: TABLE whatsapp_connections_agent; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.whatsapp_connections_agent TO anon;
GRANT ALL ON TABLE public.whatsapp_connections_agent TO authenticated;
GRANT ALL ON TABLE public.whatsapp_connections_agent TO service_role;
GRANT SELECT,INSERT ON TABLE public.whatsapp_connections_agent TO sandbox_exec;


--
-- Name: TABLE whatsapp_connections_public; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.whatsapp_connections_public TO anon;
GRANT ALL ON TABLE public.whatsapp_connections_public TO authenticated;
GRANT ALL ON TABLE public.whatsapp_connections_public TO service_role;
GRANT SELECT,INSERT ON TABLE public.whatsapp_connections_public TO sandbox_exec;


--
-- Name: TABLE whatsapp_connections_safe; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.whatsapp_connections_safe TO anon;
GRANT ALL ON TABLE public.whatsapp_connections_safe TO authenticated;
GRANT ALL ON TABLE public.whatsapp_connections_safe TO service_role;
GRANT SELECT,INSERT ON TABLE public.whatsapp_connections_safe TO sandbox_exec;


--
-- Name: TABLE whatsapp_flows; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.whatsapp_flows TO anon;
GRANT ALL ON TABLE public.whatsapp_flows TO authenticated;
GRANT ALL ON TABLE public.whatsapp_flows TO service_role;
GRANT SELECT,INSERT ON TABLE public.whatsapp_flows TO sandbox_exec;


--
-- Name: TABLE whatsapp_groups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.whatsapp_groups TO anon;
GRANT ALL ON TABLE public.whatsapp_groups TO authenticated;
GRANT ALL ON TABLE public.whatsapp_groups TO service_role;
GRANT SELECT,INSERT ON TABLE public.whatsapp_groups TO sandbox_exec;


--
-- Name: TABLE whatsapp_official_credentials; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.whatsapp_official_credentials TO anon;
GRANT ALL ON TABLE public.whatsapp_official_credentials TO authenticated;
GRANT ALL ON TABLE public.whatsapp_official_credentials TO service_role;
GRANT SELECT,INSERT ON TABLE public.whatsapp_official_credentials TO sandbox_exec;


--
-- Name: TABLE whatsapp_official_credentials_safe; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.whatsapp_official_credentials_safe TO anon;
GRANT ALL ON TABLE public.whatsapp_official_credentials_safe TO authenticated;
GRANT ALL ON TABLE public.whatsapp_official_credentials_safe TO service_role;
GRANT SELECT,INSERT ON TABLE public.whatsapp_official_credentials_safe TO sandbox_exec;


--
-- Name: TABLE whatsapp_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.whatsapp_templates TO anon;
GRANT ALL ON TABLE public.whatsapp_templates TO authenticated;
GRANT ALL ON TABLE public.whatsapp_templates TO service_role;
GRANT SELECT,INSERT ON TABLE public.whatsapp_templates TO sandbox_exec;


--
-- Name: TABLE whisper_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.whisper_messages TO anon;
GRANT ALL ON TABLE public.whisper_messages TO authenticated;
GRANT ALL ON TABLE public.whisper_messages TO service_role;
GRANT SELECT,INSERT ON TABLE public.whisper_messages TO sandbox_exec;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,USAGE ON SEQUENCES TO sandbox_exec;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO sandbox_exec;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,INSERT ON TABLES TO sandbox_exec;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--



-- ─── 4. STORAGE BUCKETS ──────────────────────────────────────────
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('avatars','avatars','t','5242880',NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('stickers','stickers','t',NULL,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('audio-memes','audio-memes','t',NULL,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('custom-emojis','custom-emojis','t','512000',NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('whatsapp-media','whatsapp-media','f',NULL,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('team-chat-files','team-chat-files','f',NULL,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('audio-messages','audio-messages','f',NULL,NULL) ON CONFLICT (id) DO NOTHING;

COMMIT;
