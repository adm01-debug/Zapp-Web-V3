-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION COMPLETA: Lovable Cloud → Supabase Self-Hosted (VPS Atomica)
-- Gerado: 2026-05-02 a partir de 346 migrations Lovable
-- 
-- ORDEM DE EXECUÇÃO:
--   00 → Extensions + Enums + Roles
--   01 → 35 tables faltantes (CREATE TABLE + FKs + RLS + triggers)
--   02 → 263 colunas a adicionar em 44 tables existentes (ALTER ADD COLUMN)
--   03 → 171 functions (CREATE OR REPLACE)
--   04 → 6 views
--   05 → 9 storage buckets (UPSERT)
--
-- IDEMPOTENTE: pode rodar várias vezes sem efeitos colaterais
-- ═══════════════════════════════════════════════════════════════════



-- ╔═══════════════════════════════════════════════════════════╗
-- ║ INCLUDE: 00_setup.sql
-- ╚═══════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════
-- 00_SETUP: Extensions + Enums + Roles
-- ═══════════════════════════════════════════════════════════

-- Extensions (idempotente)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
-- pg_cron e pg_net são gerenciados pelo Supabase self-hosted;
-- comentar se já estiverem habilitados no painel:
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;

-- Enums (7) — IF NOT EXISTS via DO block

DO $$ BEGIN
  CREATE TYPE public.ai_provider_type AS ENUM ('lovable_ai', 'openai_compatible', 'google_gemini', 'custom_webhook', 'custom_agent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'supervisor', 'agent', 'special_agent', 'dev');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.automation_execution_status AS ENUM ('pending', 'accepted', 'dismissed', 'executed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.automation_trigger_type AS ENUM ('first_response_pending', 'inactivity', 'tag_applied', 'tag_removed', 'keyword_match');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.channel_type AS ENUM ('whatsapp', 'instagram', 'telegram', 'messenger', 'webchat', 'email');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.provider_type AS ENUM ('evolution', 'wppconnect', 'baileys', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.service_account_type AS ENUM ('google_sheets', 'google_docs', 'google_calendar', 'google_drive', 'dropbox');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ╔═══════════════════════════════════════════════════════════╗
-- ║ INCLUDE: 01_new_tables.sql
-- ╚═══════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════
-- 01_NEW_TABLES: 35 tables faltantes no VPS
-- Inclui: PKs, FKs, RLS policies, triggers, indexes
-- ═══════════════════════════════════════════════════════════

--
-- PostgreSQL database dump
--

\restrict oTKNL5Wi30DbMmYyBWrOWLyhPbOmzbeRLMLxvt9JpLPPirSLynRwT3u4zR2nIpM

-- Dumped from database version 15.16 (Debian 15.16-0+deb12u1)
-- Dumped by pg_dump version 15.16 (Debian 15.16-0+deb12u1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: sticky_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sticky_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    channel_connection_id uuid,
    agent_profile_id uuid NOT NULL,
    queue_id uuid,
    last_assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instance_processing_pauses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instance_processing_pauses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_name text NOT NULL,
    paused_until timestamp with time zone NOT NULL,
    reason text NOT NULL,
    trigger_count integer DEFAULT 0 NOT NULL,
    paused_by uuid,
    auto_paused boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    investigated_at timestamp with time zone,
    investigated_by uuid,
    investigation_notes text
);


--
-- Name: integration_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    default_instance text,
    display_phone text,
    waba_name text,
    detected_signals jsonb DEFAULT '{}'::jsonb NOT NULL,
    migration_status text DEFAULT 'pending'::text NOT NULL,
    migration_notes text,
    migrated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT integration_profiles_migration_status_check CHECK ((migration_status = ANY (ARRAY['pending'::text, 'migrated'::text, 'pending_credentials'::text, 'noop'::text, 'error'::text]))),
    CONSTRAINT integration_profiles_provider_check CHECK ((provider = ANY (ARRAY['evolution'::text, 'cloud'::text])))
);


--
-- Name: channel_provider_routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_provider_routes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_connection_id uuid,
    whatsapp_connection_id uuid,
    primary_provider_id uuid NOT NULL,
    fallback_provider_id uuid,
    current_provider_id uuid,
    switched_at timestamp with time zone,
    switched_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT one_channel_ref CHECK (((((channel_connection_id IS NOT NULL))::integer + ((whatsapp_connection_id IS NOT NULL))::integer) = 1))
);


--
-- Name: contact_export_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_export_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    exported_by uuid,
    workspace_id uuid NOT NULL,
    exported_at timestamp with time zone DEFAULT now() NOT NULL,
    contact_count integer,
    export_format text DEFAULT 'csv'::text,
    filters_used jsonb
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
    consent_status text DEFAULT 'unknown'::text,
    phone_numbers jsonb DEFAULT '[]'::jsonb,
    version integer DEFAULT 1 NOT NULL,
    updated_by uuid,
    lgpd_consent_at timestamp with time zone,
    lgpd_consent_channel text,
    lgpd_opt_out_at timestamp with time zone,
    lgpd_marketing_consent boolean DEFAULT false,
    lgpd_data_sharing boolean DEFAULT false,
    lgpd_profiling boolean DEFAULT false,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    deleted_reason text,
    merged_from_id uuid,
    lgpd_last_updated_at timestamp with time zone,
    birth_date date,
    CONSTRAINT chk_birth_date_not_future CHECK (((birth_date IS NULL) OR (birth_date <= CURRENT_DATE))),
    CONSTRAINT chk_contact_email_format CHECK (((email IS NULL) OR (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::text))),
    CONSTRAINT chk_contact_name_length CHECK (((length(name) >= 1) AND (length(name) <= 500))),
    CONSTRAINT chk_contact_phone_length CHECK (((phone IS NULL) OR ((length(phone) >= 4) AND (length(phone) <= 20)))),
    CONSTRAINT chk_lgpd_marketing_requires_consent CHECK (((NOT lgpd_marketing_consent) OR ((lgpd_consent_at IS NOT NULL) AND (lgpd_opt_out_at IS NULL)))),
    CONSTRAINT chk_lgpd_optout_after_consent CHECK (((lgpd_opt_out_at IS NULL) OR (lgpd_consent_at IS NULL) OR (lgpd_opt_out_at >= lgpd_consent_at))),
    CONSTRAINT chk_phone_numbers_valid CHECK (((phone_numbers IS NULL) OR (phone_numbers = '[]'::jsonb) OR public.validate_phone_numbers(phone_numbers)))
);


--
-- Name: TABLE contacts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.contacts IS 'Contact/conversation records with SLA tracking indexes';


--
-- Name: COLUMN contacts.contact_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contacts.contact_type IS 'Type of contact: cliente, fornecedor, colaborador, prestador_servico';


--
-- Name: COLUMN contacts.phone_numbers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contacts.phone_numbers IS 'JSONB array of phone numbers with type/label/whatsapp flags';


--
-- Name: COLUMN contacts.version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contacts.version IS 'Optimistic locking version counter';


--
-- Name: COLUMN contacts.lgpd_consent_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contacts.lgpd_consent_at IS 'LGPD: Timestamp when contact gave general consent';


--
-- Name: COLUMN contacts.lgpd_consent_channel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contacts.lgpd_consent_channel IS 'LGPD: Channel through which consent was given';


--
-- Name: COLUMN contacts.lgpd_opt_out_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contacts.lgpd_opt_out_at IS 'LGPD: Timestamp when contact revoked consent';


--
-- Name: COLUMN contacts.lgpd_marketing_consent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contacts.lgpd_marketing_consent IS 'LGPD: Specific consent for marketing communications';


--
-- Name: COLUMN contacts.lgpd_data_sharing; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contacts.lgpd_data_sharing IS 'LGPD: Specific consent for data sharing with partners';


--
-- Name: COLUMN contacts.lgpd_profiling; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contacts.lgpd_profiling IS 'LGPD: Specific consent for profiling and personalization';


--
-- Name: COLUMN contacts.deleted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contacts.deleted_at IS 'Soft delete timestamp (NULL = active)';


--
-- Name: COLUMN contacts.deleted_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contacts.deleted_by IS 'User who deleted the contact';


--
-- Name: COLUMN contacts.merged_from_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contacts.merged_from_id IS 'ID of contact that was merged into this one';


--
-- Name: conversation_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    participant_type text NOT NULL,
    profile_id uuid,
    external_actor_id text,
    role text DEFAULT 'observer'::text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    left_at timestamp with time zone,
    reason_left text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversation_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_contact_id uuid NOT NULL,
    external_conversation_id uuid,
    remote_jid text NOT NULL,
    instance_name text DEFAULT 'wpp2'::text NOT NULL,
    channel text DEFAULT 'whatsapp'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    last_event_at timestamp with time zone,
    last_event_type text,
    message_count bigint DEFAULT 0 NOT NULL,
    unread_count integer DEFAULT 0 NOT NULL,
    health_score numeric(4,2),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
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
-- Name: email_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email_message_id uuid NOT NULL,
    gmail_attachment_id text,
    filename text NOT NULL,
    mime_type text,
    size_bytes integer,
    storage_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE email_attachments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.email_attachments IS 'Anexos de email Gmail - RLS corrigido em 2026-04-12';


--
-- Name: email_labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_labels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gmail_account_id uuid NOT NULL,
    gmail_label_id text NOT NULL,
    name text NOT NULL,
    label_type text DEFAULT 'user'::text,
    color text,
    message_count integer DEFAULT 0,
    unread_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_labels_label_type_check CHECK ((label_type = ANY (ARRAY['system'::text, 'user'::text])))
);


--
-- Name: email_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    gmail_message_id text NOT NULL,
    gmail_account_id uuid NOT NULL,
    from_address text NOT NULL,
    from_name text,
    to_addresses text[] DEFAULT '{}'::text[],
    cc_addresses text[] DEFAULT '{}'::text[],
    bcc_addresses text[] DEFAULT '{}'::text[],
    reply_to_address text,
    subject text,
    body_text text,
    body_html text,
    snippet text,
    label_ids text[] DEFAULT '{}'::text[],
    is_read boolean DEFAULT false,
    is_starred boolean DEFAULT false,
    has_attachments boolean DEFAULT false,
    in_reply_to text,
    references_header text,
    internal_date timestamp with time zone,
    direction text DEFAULT 'inbound'::text NOT NULL,
    zapp_message_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_messages_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])))
);


--
-- Name: TABLE email_messages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.email_messages IS 'Mensagens de email Gmail - RLS corrigido em 2026-04-12';


--
-- Name: evolution_fallback_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evolution_fallback_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ts timestamp with time zone DEFAULT now() NOT NULL,
    action text NOT NULL,
    endpoint text NOT NULL,
    instance text,
    status integer NOT NULL,
    reason text NOT NULL,
    mode text DEFAULT 'detected'::text NOT NULL,
    fallback_target text NOT NULL,
    primary_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: file_scan_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_scan_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_name text NOT NULL,
    bucket_id text NOT NULL,
    status text NOT NULL,
    provider text NOT NULL,
    provider_response jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: gmail_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gmail_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id_ref uuid NOT NULL,
    account_id uuid NOT NULL,
    attachment_id text NOT NULL,
    filename text NOT NULL,
    mime_type text,
    size_bytes integer,
    storage_url text,
    downloaded boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gmail_health_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gmail_health_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now(),
    status text NOT NULL,
    operation text,
    resource text,
    request_id text,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    is_failure boolean DEFAULT false
);


--
-- Name: instance_auth_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instance_auth_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_name text NOT NULL,
    reason text NOT NULL,
    source text NOT NULL,
    http_status integer,
    detail text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT instance_auth_events_reason_check CHECK ((reason = ANY (ARRAY['invalid_signature'::text, 'auth_401'::text, 'auth_403'::text]))),
    CONSTRAINT instance_auth_events_source_check CHECK ((source = ANY (ARRAY['webhook'::text, 'evolution-api'::text])))
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
    email_subject text,
    email_from text,
    email_to text[],
    email_cc text[],
    email_html_body text,
    email_thread_id uuid,
    is_edited boolean DEFAULT false NOT NULL,
    request_id text,
    error_code text,
    error_reason text,
    retry_attempt smallint,
    retry_total smallint,
    CONSTRAINT messages_message_type_check CHECK ((message_type = ANY (ARRAY['text'::text, 'image'::text, 'audio'::text, 'video'::text, 'document'::text, 'sticker'::text, 'location'::text, 'contact'::text, 'poll'::text, 'button'::text, 'list'::text, 'reaction'::text, 'vcard'::text, 'ptt'::text, 'link'::text, 'template'::text, 'interactive'::text, 'order'::text, 'product'::text, 'catalog'::text]))),
    CONSTRAINT messages_sender_check CHECK ((sender = ANY (ARRAY['agent'::text, 'contact'::text])))
);

ALTER TABLE ONLY public.messages REPLICA IDENTITY FULL;


--
-- Name: TABLE messages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.messages IS 'Chat messages with RLS and performance indexes';


--
-- Name: COLUMN messages.retry_attempt; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.messages.retry_attempt IS 'Última tentativa de envio registrada (1..retry_total). Persistido para sobreviver a reload.';


--
-- Name: COLUMN messages.retry_total; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.messages.retry_total IS 'Total de tentativas configurado para o envio (MAX_RETRIES no messageSender).';


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
-- Name: nps_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nps_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    channel text DEFAULT 'whatsapp'::text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    responded boolean DEFAULT false NOT NULL,
    response_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: outbox_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outbox_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    idempotency_key text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    dispatched_at timestamp with time zone,
    last_error text,
    trace_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pii_access_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pii_access_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    accessed_by uuid,
    contact_id uuid,
    field text NOT NULL,
    accessed_at timestamp with time zone DEFAULT now() NOT NULL,
    source text
);


--
-- Name: provider_session_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_session_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid,
    provider_id uuid NOT NULL,
    level text DEFAULT 'info'::text NOT NULL,
    event text NOT NULL,
    message text,
    latency_ms integer,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT provider_session_logs_level_check CHECK ((level = ANY (ARRAY['info'::text, 'warn'::text, 'error'::text])))
);


--
-- Name: provider_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id uuid NOT NULL,
    channel_connection_id uuid,
    whatsapp_connection_id uuid,
    status text DEFAULT 'connecting'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    last_heartbeat_at timestamp with time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT provider_sessions_status_check CHECK ((status = ANY (ARRAY['connecting'::text, 'connected'::text, 'degraded'::text, 'disconnected'::text, 'failed'::text])))
);


--
-- Name: proxy_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proxy_alerts (
    id bigint NOT NULL,
    ts timestamp with time zone DEFAULT now() NOT NULL,
    kind text NOT NULL,
    severity text NOT NULL,
    value numeric NOT NULL,
    threshold numeric NOT NULL,
    window_minutes integer NOT NULL,
    sample_size integer NOT NULL,
    details jsonb
);


--
-- Name: proxy_alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.proxy_alerts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: proxy_alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.proxy_alerts_id_seq OWNED BY public.proxy_alerts.id;


--
-- Name: proxy_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proxy_metrics (
    id bigint NOT NULL,
    ts timestamp with time zone DEFAULT now() NOT NULL,
    cid text,
    rid text,
    op text NOT NULL,
    target text NOT NULL,
    status integer NOT NULL,
    ms integer NOT NULL,
    ok boolean NOT NULL,
    timeout_fired boolean DEFAULT false NOT NULL,
    pg_timeout boolean DEFAULT false NOT NULL,
    err_code text,
    err_msg text
);


--
-- Name: proxy_metrics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.proxy_metrics_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: proxy_metrics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.proxy_metrics_id_seq OWNED BY public.proxy_metrics.id;


--
-- Name: reprocess_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reprocess_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key text NOT NULL,
    target_kind text NOT NULL,
    target_id uuid NOT NULL,
    action text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    requested_by uuid,
    reason text,
    result jsonb,
    error_message text,
    trace_id text,
    scheduled_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: scheduled_job_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_job_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_name text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    status text,
    rows_affected integer,
    error_msg text,
    CONSTRAINT scheduled_job_log_status_check CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'error'::text])))
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
-- Name: webhook_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_audit_log (
    id bigint NOT NULL,
    request_id uuid NOT NULL,
    instance text,
    event_type text,
    status text NOT NULL,
    duration_ms integer,
    error_message text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT webhook_audit_log_status_check CHECK ((status = ANY (ARRAY['received'::text, 'processed'::text, 'duplicate'::text, 'error'::text, 'rejected'::text])))
);


--
-- Name: webhook_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.webhook_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: webhook_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.webhook_audit_log_id_seq OWNED BY public.webhook_audit_log.id;


--
-- Name: webhook_event_dedup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_event_dedup (
    event_key text NOT NULL,
    instance_name text NOT NULL,
    event_type text NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    payload_hash text
);


--
-- Name: TABLE webhook_event_dedup; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.webhook_event_dedup IS 'Chave de idempotência para eventos do webhook (Evolution + Cloud API). PK = sha256(instance:msg_id:event_type:ts). TTL 7 dias.';


--
-- Name: webhook_events_processed; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_events_processed (
    event_id text NOT NULL,
    instance text NOT NULL,
    event_type text NOT NULL,
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE webhook_events_processed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.webhook_events_processed IS 'Deduplication table for incoming Evolution webhook events. Rows older than 30 days can be purged.';


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
-- Name: proxy_alerts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proxy_alerts ALTER COLUMN id SET DEFAULT nextval('public.proxy_alerts_id_seq'::regclass);


--
-- Name: proxy_metrics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proxy_metrics ALTER COLUMN id SET DEFAULT nextval('public.proxy_metrics_id_seq'::regclass);


--
-- Name: webhook_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_audit_log ALTER COLUMN id SET DEFAULT nextval('public.webhook_audit_log_id_seq'::regclass);


--
-- Name: channel_provider_routes channel_provider_routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_provider_routes
    ADD CONSTRAINT channel_provider_routes_pkey PRIMARY KEY (id);


--
-- Name: contact_export_log contact_export_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_export_log
    ADD CONSTRAINT contact_export_log_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_phone_key UNIQUE (phone);


--
-- Name: contacts contacts_phone_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_phone_unique UNIQUE (phone);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: conversation_participants conversation_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_pkey PRIMARY KEY (id);


--
-- Name: conversation_threads conversation_threads_external_contact_id_instance_name_chan_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_threads
    ADD CONSTRAINT conversation_threads_external_contact_id_instance_name_chan_key UNIQUE (external_contact_id, instance_name, channel);


--
-- Name: conversation_threads conversation_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_threads
    ADD CONSTRAINT conversation_threads_pkey PRIMARY KEY (id);


--
-- Name: crisis_room_alerts crisis_room_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crisis_room_alerts
    ADD CONSTRAINT crisis_room_alerts_pkey PRIMARY KEY (id);


--
-- Name: email_attachments email_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_attachments
    ADD CONSTRAINT email_attachments_pkey PRIMARY KEY (id);


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
-- Name: email_messages email_messages_gmail_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_gmail_message_id_key UNIQUE (gmail_message_id);


--
-- Name: email_messages email_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_pkey PRIMARY KEY (id);


--
-- Name: evolution_fallback_events evolution_fallback_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evolution_fallback_events
    ADD CONSTRAINT evolution_fallback_events_pkey PRIMARY KEY (id);


--
-- Name: file_scan_logs file_scan_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_scan_logs
    ADD CONSTRAINT file_scan_logs_pkey PRIMARY KEY (id);


--
-- Name: gmail_attachments gmail_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gmail_attachments
    ADD CONSTRAINT gmail_attachments_pkey PRIMARY KEY (id);


--
-- Name: gmail_health_logs gmail_health_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gmail_health_logs
    ADD CONSTRAINT gmail_health_logs_pkey PRIMARY KEY (id);


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
-- Name: integration_profiles integration_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_profiles
    ADD CONSTRAINT integration_profiles_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: mfa_sessions mfa_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfa_sessions
    ADD CONSTRAINT mfa_sessions_pkey PRIMARY KEY (id);


--
-- Name: nps_invitations nps_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nps_invitations
    ADD CONSTRAINT nps_invitations_pkey PRIMARY KEY (id);


--
-- Name: outbox_events outbox_events_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_events
    ADD CONSTRAINT outbox_events_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: outbox_events outbox_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_events
    ADD CONSTRAINT outbox_events_pkey PRIMARY KEY (id);


--
-- Name: pii_access_log pii_access_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pii_access_log
    ADD CONSTRAINT pii_access_log_pkey PRIMARY KEY (id);


--
-- Name: provider_session_logs provider_session_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_session_logs
    ADD CONSTRAINT provider_session_logs_pkey PRIMARY KEY (id);


--
-- Name: provider_sessions provider_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_sessions
    ADD CONSTRAINT provider_sessions_pkey PRIMARY KEY (id);


--
-- Name: proxy_alerts proxy_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proxy_alerts
    ADD CONSTRAINT proxy_alerts_pkey PRIMARY KEY (id);


--
-- Name: proxy_metrics proxy_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proxy_metrics
    ADD CONSTRAINT proxy_metrics_pkey PRIMARY KEY (id);


--
-- Name: reprocess_jobs reprocess_jobs_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reprocess_jobs
    ADD CONSTRAINT reprocess_jobs_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: reprocess_jobs reprocess_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reprocess_jobs
    ADD CONSTRAINT reprocess_jobs_pkey PRIMARY KEY (id);


--
-- Name: scheduled_job_log scheduled_job_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_job_log
    ADD CONSTRAINT scheduled_job_log_pkey PRIMARY KEY (id);


--
-- Name: sticky_assignments sticky_assignments_contact_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sticky_assignments
    ADD CONSTRAINT sticky_assignments_contact_id_key UNIQUE (contact_id);


--
-- Name: sticky_assignments sticky_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sticky_assignments
    ADD CONSTRAINT sticky_assignments_pkey PRIMARY KEY (id);


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
-- Name: voice_command_logs voice_command_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_command_logs
    ADD CONSTRAINT voice_command_logs_pkey PRIMARY KEY (id);


--
-- Name: webauthn_challenges webauthn_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_pkey PRIMARY KEY (id);


--
-- Name: webhook_audit_log webhook_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_audit_log
    ADD CONSTRAINT webhook_audit_log_pkey PRIMARY KEY (id);


--
-- Name: webhook_event_dedup webhook_event_dedup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_event_dedup
    ADD CONSTRAINT webhook_event_dedup_pkey PRIMARY KEY (event_key);


--
-- Name: webhook_events_processed webhook_events_processed_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events_processed
    ADD CONSTRAINT webhook_events_processed_pkey PRIMARY KEY (event_id);


--
-- Name: webhook_rate_limits webhook_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_rate_limits
    ADD CONSTRAINT webhook_rate_limits_pkey PRIMARY KEY (id);


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
-- Name: idx_contacts_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_deleted ON public.contacts USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


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
-- Name: idx_contacts_not_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_not_deleted ON public.contacts USING btree (deleted_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_contacts_phone_numbers; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_phone_numbers ON public.contacts USING gin (phone_numbers);


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
-- Name: idx_contacts_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_type ON public.contacts USING btree (contact_type);


--
-- Name: idx_email_attachments_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_attachments_message ON public.email_attachments USING btree (email_message_id);


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
-- Name: idx_email_messages_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_from ON public.email_messages USING btree (from_address);


--
-- Name: idx_email_messages_gmail_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_gmail_id ON public.email_messages USING btree (gmail_message_id);


--
-- Name: idx_email_messages_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_thread ON public.email_messages USING btree (thread_id);


--
-- Name: idx_evolution_fallback_events_action_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evolution_fallback_events_action_ts ON public.evolution_fallback_events USING btree (action, ts DESC);


--
-- Name: idx_evolution_fallback_events_instance_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evolution_fallback_events_instance_ts ON public.evolution_fallback_events USING btree (instance, ts DESC);


--
-- Name: idx_evolution_fallback_events_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evolution_fallback_events_ts ON public.evolution_fallback_events USING btree (ts DESC);


--
-- Name: idx_gmail_attachments_msg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gmail_attachments_msg ON public.gmail_attachments USING btree (message_id_ref);


--
-- Name: idx_gmail_health_logs_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gmail_health_logs_request_id ON public.gmail_health_logs USING btree (request_id);


--
-- Name: idx_gmail_health_logs_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gmail_health_logs_timestamp ON public.gmail_health_logs USING btree ("timestamp" DESC);


--
-- Name: idx_iae_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_iae_created_at ON public.instance_auth_events USING btree (created_at DESC);


--
-- Name: idx_iae_instance_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_iae_instance_created ON public.instance_auth_events USING btree (instance_name, created_at DESC);


--
-- Name: idx_iae_reason_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_iae_reason_created ON public.instance_auth_events USING btree (reason, created_at DESC);


--
-- Name: idx_ipp_instance_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ipp_instance_active ON public.instance_processing_pauses USING btree (instance_name, paused_until DESC);


--
-- Name: idx_ipp_investigated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ipp_investigated_at ON public.instance_processing_pauses USING btree (investigated_at DESC NULLS LAST);


--
-- Name: idx_ipp_paused_until; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ipp_paused_until ON public.instance_processing_pauses USING btree (paused_until DESC);


--
-- Name: idx_job_log_name_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_log_name_started ON public.scheduled_job_log USING btree (job_name, started_at DESC);


--
-- Name: idx_messages_contact_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_contact_created ON public.messages USING btree (contact_id, created_at DESC);


--
-- Name: idx_messages_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_contact_id ON public.messages USING btree (contact_id);


--
-- Name: idx_messages_contact_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_contact_timestamp ON public.messages USING btree (contact_id, created_at DESC);


--
-- Name: idx_messages_content_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_content_search ON public.messages USING gin (to_tsvector('portuguese'::regconfig, content));


--
-- Name: idx_messages_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_created_at ON public.messages USING btree (created_at DESC);


--
-- Name: idx_messages_external_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_external_id ON public.messages USING btree (external_id);


--
-- Name: idx_messages_failed_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_failed_status ON public.messages USING btree (status, created_at DESC) WHERE (status = ANY (ARRAY['failed'::text, 'failed_auth'::text, 'failed_retries'::text]));


--
-- Name: idx_messages_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_request_id ON public.messages USING btree (request_id) WHERE (request_id IS NOT NULL);


--
-- Name: idx_mfa_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mfa_sessions_user ON public.mfa_sessions USING btree (user_id);


--
-- Name: idx_nps_invitations_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nps_invitations_contact ON public.nps_invitations USING btree (contact_id, sent_at DESC);


--
-- Name: idx_nps_invitations_responded; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nps_invitations_responded ON public.nps_invitations USING btree (responded, sent_at DESC);


--
-- Name: idx_outbox_aggregate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbox_aggregate ON public.outbox_events USING btree (aggregate_type, aggregate_id);


--
-- Name: idx_outbox_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbox_event_type ON public.outbox_events USING btree (event_type, created_at DESC);


--
-- Name: idx_outbox_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbox_pending ON public.outbox_events USING btree (next_attempt_at) WHERE (status = 'pending'::text);


--
-- Name: idx_participants_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participants_active ON public.conversation_participants USING btree (thread_id) WHERE (left_at IS NULL);


--
-- Name: idx_participants_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participants_profile ON public.conversation_participants USING btree (profile_id) WHERE (profile_id IS NOT NULL);


--
-- Name: idx_participants_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participants_thread ON public.conversation_participants USING btree (thread_id, joined_at DESC);


--
-- Name: idx_pii_access_log_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pii_access_log_user ON public.pii_access_log USING btree (accessed_by, accessed_at DESC);


--
-- Name: idx_provider_session_logs_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_session_logs_provider ON public.provider_session_logs USING btree (provider_id, created_at DESC);


--
-- Name: idx_provider_session_logs_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_session_logs_session ON public.provider_session_logs USING btree (session_id, created_at DESC);


--
-- Name: idx_provider_sessions_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_sessions_channel ON public.provider_sessions USING btree (channel_connection_id, started_at DESC);


--
-- Name: idx_provider_sessions_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_sessions_open ON public.provider_sessions USING btree (provider_id, status) WHERE (ended_at IS NULL);


--
-- Name: idx_proxy_alerts_kind_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proxy_alerts_kind_ts ON public.proxy_alerts USING btree (kind, ts DESC);


--
-- Name: idx_proxy_alerts_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proxy_alerts_ts ON public.proxy_alerts USING btree (ts DESC);


--
-- Name: idx_proxy_metrics_status_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proxy_metrics_status_ts ON public.proxy_metrics USING btree (status, ts DESC);


--
-- Name: idx_proxy_metrics_target_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proxy_metrics_target_ts ON public.proxy_metrics USING btree (target, ts DESC);


--
-- Name: idx_proxy_metrics_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proxy_metrics_ts ON public.proxy_metrics USING btree (ts DESC);


--
-- Name: idx_rate_limits_instance_window; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_limits_instance_window ON public.webhook_rate_limits USING btree (instance_id, window_start DESC);


--
-- Name: idx_rj_requested_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rj_requested_by ON public.reprocess_jobs USING btree (requested_by, created_at DESC);


--
-- Name: idx_rj_status_sched; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rj_status_sched ON public.reprocess_jobs USING btree (status, scheduled_at) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text]));


--
-- Name: idx_rj_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rj_target ON public.reprocess_jobs USING btree (target_kind, target_id);


--
-- Name: idx_sticky_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sticky_agent ON public.sticky_assignments USING btree (agent_profile_id);


--
-- Name: idx_sticky_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sticky_contact ON public.sticky_assignments USING btree (contact_id);


--
-- Name: idx_sticky_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sticky_expires ON public.sticky_assignments USING btree (expires_at);


--
-- Name: idx_threads_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_threads_contact ON public.conversation_threads USING btree (external_contact_id);


--
-- Name: idx_threads_instance_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_threads_instance_channel ON public.conversation_threads USING btree (instance_name, channel);


--
-- Name: idx_threads_status_lastev; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_threads_status_lastev ON public.conversation_threads USING btree (status, last_event_at DESC);


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
-- Name: idx_webhook_event_dedup_instance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_event_dedup_instance ON public.webhook_event_dedup USING btree (instance_name, received_at DESC);


--
-- Name: idx_webhook_event_dedup_received_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_event_dedup_received_at ON public.webhook_event_dedup USING btree (received_at);


--
-- Name: integration_profiles_one_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX integration_profiles_one_active ON public.integration_profiles USING btree (is_active) WHERE (is_active = true);


--
-- Name: uniq_route_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_route_channel ON public.channel_provider_routes USING btree (channel_connection_id) WHERE (channel_connection_id IS NOT NULL);


--
-- Name: uniq_route_wpp; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_route_wpp ON public.channel_provider_routes USING btree (whatsapp_connection_id) WHERE (whatsapp_connection_id IS NOT NULL);


--
-- Name: webhook_audit_log_instance_received_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_audit_log_instance_received_idx ON public.webhook_audit_log USING btree (instance, received_at DESC);


--
-- Name: webhook_audit_log_received_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_audit_log_received_at_idx ON public.webhook_audit_log USING btree (received_at DESC);


--
-- Name: webhook_audit_log_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_audit_log_status_idx ON public.webhook_audit_log USING btree (status) WHERE (status = ANY (ARRAY['error'::text, 'rejected'::text]));


--
-- Name: webhook_events_processed_processed_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_events_processed_processed_at_idx ON public.webhook_events_processed USING btree (processed_at DESC);


--
-- Name: channel_provider_routes channel_provider_routes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER channel_provider_routes_updated_at BEFORE UPDATE ON public.channel_provider_routes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: contacts on_contact_created_auto_assign; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_contact_created_auto_assign BEFORE INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.auto_assign_contact();


--
-- Name: contacts on_contact_queue_auto_assign; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_contact_queue_auto_assign BEFORE INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.auto_assign_to_queue_agent();


--
-- Name: contacts trg_contact_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_contact_audit AFTER INSERT OR DELETE OR UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.fn_contact_audit_trigger();


--
-- Name: contacts trg_contacts_increment_version; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_contacts_increment_version BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.fn_contacts_increment_version();


--
-- Name: contacts trg_contacts_lgpd_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_contacts_lgpd_timestamp BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.fn_contacts_update_lgpd_timestamp();


--
-- Name: contacts trg_contacts_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_contacts_set_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW WHEN ((NOT (new.updated_at IS DISTINCT FROM old.updated_at))) EXECUTE FUNCTION public.fn_contacts_set_updated_at();


--
-- Name: integration_profiles trg_integration_profiles_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_integration_profiles_updated BEFORE UPDATE ON public.integration_profiles FOR EACH ROW EXECUTE FUNCTION public.tg_integration_profiles_updated();


--
-- Name: instance_processing_pauses trg_ipp_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ipp_updated_at BEFORE UPDATE ON public.instance_processing_pauses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: contacts trg_log_assignment_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_log_assignment_change AFTER UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.log_assignment_change();


--
-- Name: channel_provider_routes trg_log_route_switchover; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_log_route_switchover BEFORE UPDATE ON public.channel_provider_routes FOR EACH ROW EXECUTE FUNCTION public.fn_log_route_switchover();


--
-- Name: contacts trg_normalize_contact_phone; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_normalize_contact_phone BEFORE INSERT OR UPDATE OF phone ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.normalize_contact_phone();


--
-- Name: outbox_events trg_outbox_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_outbox_updated BEFORE UPDATE ON public.outbox_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: reprocess_jobs trg_rj_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_rj_updated BEFORE UPDATE ON public.reprocess_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: messages trg_sicoob_reply; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sicoob_reply AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.notify_sicoob_on_reply();


--
-- Name: contacts trg_sticky_on_contact_assign; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sticky_on_contact_assign AFTER INSERT OR UPDATE OF assigned_to ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.fn_sticky_on_contact_assign();


--
-- Name: conversation_threads trg_threads_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_threads_updated BEFORE UPDATE ON public.conversation_threads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: contacts update_contacts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: messages update_messages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_service_accounts update_user_service_accounts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_service_accounts_updated_at BEFORE UPDATE ON public.user_service_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: channel_provider_routes channel_provider_routes_channel_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_provider_routes
    ADD CONSTRAINT channel_provider_routes_channel_connection_id_fkey FOREIGN KEY (channel_connection_id) REFERENCES public.channel_connections(id) ON DELETE CASCADE;


--
-- Name: channel_provider_routes channel_provider_routes_current_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_provider_routes
    ADD CONSTRAINT channel_provider_routes_current_provider_id_fkey FOREIGN KEY (current_provider_id) REFERENCES public.provider_configs(id) ON DELETE SET NULL;


--
-- Name: channel_provider_routes channel_provider_routes_fallback_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_provider_routes
    ADD CONSTRAINT channel_provider_routes_fallback_provider_id_fkey FOREIGN KEY (fallback_provider_id) REFERENCES public.provider_configs(id) ON DELETE SET NULL;


--
-- Name: channel_provider_routes channel_provider_routes_primary_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_provider_routes
    ADD CONSTRAINT channel_provider_routes_primary_provider_id_fkey FOREIGN KEY (primary_provider_id) REFERENCES public.provider_configs(id) ON DELETE RESTRICT;


--
-- Name: channel_provider_routes channel_provider_routes_whatsapp_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_provider_routes
    ADD CONSTRAINT channel_provider_routes_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE;


--
-- Name: contact_export_log contact_export_log_exported_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_export_log
    ADD CONSTRAINT contact_export_log_exported_by_fkey FOREIGN KEY (exported_by) REFERENCES auth.users(id) ON DELETE SET NULL;


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
-- Name: contacts contacts_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_merged_from_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_merged_from_id_fkey FOREIGN KEY (merged_from_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_queue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.queues(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_whatsapp_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL;


--
-- Name: conversation_participants conversation_participants_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.conversation_threads(id) ON DELETE CASCADE;


--
-- Name: crisis_room_alerts crisis_room_alerts_acknowledged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crisis_room_alerts
    ADD CONSTRAINT crisis_room_alerts_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES public.profiles(id);


--
-- Name: email_attachments email_attachments_email_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_attachments
    ADD CONSTRAINT email_attachments_email_message_id_fkey FOREIGN KEY (email_message_id) REFERENCES public.email_messages(id) ON DELETE CASCADE;


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
-- Name: email_messages email_messages_zapp_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_zapp_message_id_fkey FOREIGN KEY (zapp_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: gmail_attachments gmail_attachments_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gmail_attachments
    ADD CONSTRAINT gmail_attachments_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.gmail_accounts(id) ON DELETE CASCADE;


--
-- Name: gmail_attachments gmail_attachments_message_id_ref_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gmail_attachments
    ADD CONSTRAINT gmail_attachments_message_id_ref_fkey FOREIGN KEY (message_id_ref) REFERENCES public.gmail_messages(id) ON DELETE CASCADE;


--
-- Name: instance_processing_pauses instance_processing_pauses_investigated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instance_processing_pauses
    ADD CONSTRAINT instance_processing_pauses_investigated_by_fkey FOREIGN KEY (investigated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: instance_processing_pauses instance_processing_pauses_paused_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instance_processing_pauses
    ADD CONSTRAINT instance_processing_pauses_paused_by_fkey FOREIGN KEY (paused_by) REFERENCES auth.users(id) ON DELETE SET NULL;


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
-- Name: messages messages_email_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_email_thread_id_fkey FOREIGN KEY (email_thread_id) REFERENCES public.email_threads(id) ON DELETE SET NULL;


--
-- Name: messages messages_whatsapp_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL;


--
-- Name: mfa_sessions mfa_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfa_sessions
    ADD CONSTRAINT mfa_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: nps_invitations nps_invitations_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nps_invitations
    ADD CONSTRAINT nps_invitations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: nps_invitations nps_invitations_response_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nps_invitations
    ADD CONSTRAINT nps_invitations_response_id_fkey FOREIGN KEY (response_id) REFERENCES public.nps_surveys(id) ON DELETE SET NULL;


--
-- Name: pii_access_log pii_access_log_accessed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pii_access_log
    ADD CONSTRAINT pii_access_log_accessed_by_fkey FOREIGN KEY (accessed_by) REFERENCES auth.users(id);


--
-- Name: provider_session_logs provider_session_logs_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_session_logs
    ADD CONSTRAINT provider_session_logs_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.provider_configs(id) ON DELETE CASCADE;


--
-- Name: provider_session_logs provider_session_logs_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_session_logs
    ADD CONSTRAINT provider_session_logs_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.provider_sessions(id) ON DELETE CASCADE;


--
-- Name: provider_sessions provider_sessions_channel_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_sessions
    ADD CONSTRAINT provider_sessions_channel_connection_id_fkey FOREIGN KEY (channel_connection_id) REFERENCES public.channel_connections(id) ON DELETE SET NULL;


--
-- Name: provider_sessions provider_sessions_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_sessions
    ADD CONSTRAINT provider_sessions_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.provider_configs(id) ON DELETE CASCADE;


--
-- Name: provider_sessions provider_sessions_whatsapp_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_sessions
    ADD CONSTRAINT provider_sessions_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL;


--
-- Name: reprocess_jobs reprocess_jobs_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reprocess_jobs
    ADD CONSTRAINT reprocess_jobs_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id);


--
-- Name: sticky_assignments sticky_assignments_agent_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sticky_assignments
    ADD CONSTRAINT sticky_assignments_agent_profile_id_fkey FOREIGN KEY (agent_profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: sticky_assignments sticky_assignments_channel_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sticky_assignments
    ADD CONSTRAINT sticky_assignments_channel_connection_id_fkey FOREIGN KEY (channel_connection_id) REFERENCES public.channel_connections(id) ON DELETE CASCADE;


--
-- Name: sticky_assignments sticky_assignments_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sticky_assignments
    ADD CONSTRAINT sticky_assignments_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: sticky_assignments sticky_assignments_queue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sticky_assignments
    ADD CONSTRAINT sticky_assignments_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.queues(id) ON DELETE SET NULL;


--
-- Name: evolution_fallback_events Admin/supervisor can read fallback events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/supervisor can read fallback events" ON public.evolution_fallback_events FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: sticky_assignments Admins and supervisors manage sticky; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and supervisors manage sticky" ON public.sticky_assignments TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: crisis_room_alerts Admins can delete crisis alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete crisis alerts" ON public.crisis_room_alerts FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: webhook_rate_limits Admins can delete rate limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete rate limits" ON public.webhook_rate_limits FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: nps_invitations Admins can insert NPS invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert NPS invitations" ON public.nps_invitations FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: crisis_room_alerts Admins can insert crisis alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert crisis alerts" ON public.crisis_room_alerts FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: webhook_rate_limits Admins can insert rate limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert rate limits" ON public.webhook_rate_limits FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: nps_invitations Admins can update NPS invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update NPS invitations" ON public.nps_invitations FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: crisis_room_alerts Admins can update crisis alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update crisis alerts" ON public.crisis_room_alerts FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: webhook_rate_limits Admins can update rate limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update rate limits" ON public.webhook_rate_limits FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: user_service_accounts Admins can view all service accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all service accounts" ON public.user_service_accounts FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: proxy_alerts Admins can view proxy alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view proxy alerts" ON public.proxy_alerts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: proxy_metrics Admins can view proxy metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view proxy metrics" ON public.proxy_metrics FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: webhook_rate_limits Admins can view rate limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view rate limits" ON public.webhook_rate_limits FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: provider_session_logs Admins manage provider logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage provider logs" ON public.provider_session_logs TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: channel_provider_routes Admins manage routes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage routes" ON public.channel_provider_routes TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: provider_sessions Admins manage sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage sessions" ON public.provider_sessions TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: webhook_event_dedup Admins read dedup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read dedup" ON public.webhook_event_dedup FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: sticky_assignments Agents can view own sticky; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can view own sticky" ON public.sticky_assignments FOR SELECT TO authenticated USING (((agent_profile_id = ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: crisis_room_alerts Authenticated can view crisis alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view crisis alerts" ON public.crisis_room_alerts FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));


--
-- Name: provider_session_logs Authenticated read provider logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated read provider logs" ON public.provider_session_logs FOR SELECT TO authenticated USING (true);


--
-- Name: channel_provider_routes Authenticated read routes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated read routes" ON public.channel_provider_routes FOR SELECT TO authenticated USING (true);


--
-- Name: provider_sessions Authenticated read sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated read sessions" ON public.provider_sessions FOR SELECT TO authenticated USING (true);


--
-- Name: gmail_health_logs Authenticated users can insert gmail health logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert gmail health logs" ON public.gmail_health_logs FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: nps_invitations Authenticated users can view NPS invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view NPS invitations" ON public.nps_invitations FOR SELECT TO authenticated USING (true);


--
-- Name: gmail_health_logs Authorized users can read health logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized users can read health logs" ON public.gmail_health_logs FOR SELECT TO authenticated USING (public.is_admin_or_supervisor());


--
-- Name: webauthn_challenges Block anon access to webauthn challenges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Block anon access to webauthn challenges" ON public.webauthn_challenges TO anon USING (false) WITH CHECK (false);


--
-- Name: user_service_accounts Only admins can delete service accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can delete service accounts" ON public.user_service_accounts FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: user_service_accounts Only admins can insert service accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can insert service accounts" ON public.user_service_accounts FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: user_service_accounts Only admins can update service accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can update service accounts" ON public.user_service_accounts FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: webhook_event_dedup Service writes dedup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service writes dedup" ON public.webhook_event_dedup FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: messages Users can insert messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (((agent_id IS NULL) OR (agent_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: voice_command_logs Users can insert own voice logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own voice logs" ON public.voice_command_logs FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: mfa_sessions Users can manage own MFA sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own MFA sessions" ON public.mfa_sessions TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: webauthn_challenges Users can manage own challenges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own challenges" ON public.webauthn_challenges TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: email_labels Users can manage their email labels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their email labels" ON public.email_labels TO authenticated USING ((gmail_account_id IN ( SELECT gmail_accounts.id
   FROM public.gmail_accounts
  WHERE (gmail_accounts.profile_id IN ( SELECT profiles.id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid())))))) WITH CHECK ((gmail_account_id IN ( SELECT gmail_accounts.id
   FROM public.gmail_accounts
  WHERE (gmail_accounts.profile_id IN ( SELECT profiles.id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid()))))));


--
-- Name: voice_command_logs Users can read own voice logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own voice logs" ON public.voice_command_logs FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: messages Users can update messages from their assigned contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update messages from their assigned contacts" ON public.messages FOR UPDATE TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM public.contacts c
  WHERE (c.assigned_to IN ( SELECT public.get_visible_agent_ids(auth.uid()) AS get_visible_agent_ids)))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: messages Users can view messages from their assigned contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view messages from their assigned contacts" ON public.messages FOR SELECT TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM public.contacts c
  WHERE (c.assigned_to IN ( SELECT public.get_visible_agent_ids(auth.uid()) AS get_visible_agent_ids)))) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: user_service_accounts Users can view own service accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own service accounts" ON public.user_service_accounts FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: file_scan_logs Users can view scan logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view scan logs" ON public.file_scan_logs FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: email_labels Users can view their email labels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their email labels" ON public.email_labels FOR SELECT TO authenticated USING (((gmail_account_id IN ( SELECT gmail_accounts.id
   FROM public.gmail_accounts
  WHERE (gmail_accounts.profile_id IN ( SELECT profiles.id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.user_id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'supervisor'::text])))))));


--
-- Name: integration_profiles admins can manage integration profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins can manage integration profiles" ON public.integration_profiles TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: messages agents_full_access_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agents_full_access_messages ON public.messages TO authenticated USING (true) WITH CHECK (true);


--
-- Name: webhook_audit_log authenticated can read webhook_audit_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated can read webhook_audit_log" ON public.webhook_audit_log FOR SELECT TO authenticated USING (true);


--
-- Name: channel_provider_routes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.channel_provider_routes ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_export_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_export_log ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts contacts_no_hard_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contacts_no_hard_delete ON public.contacts FOR DELETE TO authenticated USING (false);


--
-- Name: contacts contacts_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contacts_service_role ON public.contacts TO service_role USING (true) WITH CHECK (true);


--
-- Name: conversation_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_threads ENABLE ROW LEVEL SECURITY;

--
-- Name: crisis_room_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crisis_room_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: email_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: email_attachments email_attachments_manage_via_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_attachments_manage_via_messages ON public.email_attachments TO authenticated USING (((email_message_id IN ( SELECT em.id
   FROM public.email_messages em
  WHERE (em.gmail_account_id IN ( SELECT ga.id
           FROM (public.gmail_accounts ga
             JOIN public.profiles p ON ((p.id = ga.profile_id)))
          WHERE (p.user_id = auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.user_id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'supervisor'::text]))))))) WITH CHECK (((email_message_id IN ( SELECT em.id
   FROM public.email_messages em
  WHERE (em.gmail_account_id IN ( SELECT ga.id
           FROM (public.gmail_accounts ga
             JOIN public.profiles p ON ((p.id = ga.profile_id)))
          WHERE (p.user_id = auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.user_id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'supervisor'::text])))))));


--
-- Name: email_attachments email_attachments_select_via_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_attachments_select_via_messages ON public.email_attachments FOR SELECT TO authenticated USING (((email_message_id IN ( SELECT em.id
   FROM public.email_messages em
  WHERE (em.gmail_account_id IN ( SELECT ga.id
           FROM (public.gmail_accounts ga
             JOIN public.profiles p ON ((p.id = ga.profile_id)))
          WHERE (p.user_id = auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.user_id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'supervisor'::text])))))));


--
-- Name: email_labels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_labels ENABLE ROW LEVEL SECURITY;

--
-- Name: email_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: email_messages email_messages_manage_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_messages_manage_own ON public.email_messages TO authenticated USING (((gmail_account_id IN ( SELECT ga.id
   FROM (public.gmail_accounts ga
     JOIN public.profiles p ON ((p.id = ga.profile_id)))
  WHERE (p.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.user_id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'supervisor'::text]))))))) WITH CHECK (((gmail_account_id IN ( SELECT ga.id
   FROM (public.gmail_accounts ga
     JOIN public.profiles p ON ((p.id = ga.profile_id)))
  WHERE (p.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.user_id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'supervisor'::text])))))));


--
-- Name: email_messages email_messages_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_messages_select_own ON public.email_messages FOR SELECT TO authenticated USING (((gmail_account_id IN ( SELECT ga.id
   FROM (public.gmail_accounts ga
     JOIN public.profiles p ON ((p.id = ga.profile_id)))
  WHERE (p.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.user_id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'supervisor'::text])))))));


--
-- Name: evolution_fallback_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.evolution_fallback_events ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_export_log export_log_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY export_log_insert ON public.contact_export_log FOR INSERT TO authenticated WITH CHECK ((exported_by = auth.uid()));


--
-- Name: contact_export_log export_log_managers_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY export_log_managers_read ON public.contact_export_log FOR SELECT TO authenticated USING (((workspace_id = ( SELECT contact_export_log.workspace_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'supervisor'::text, 'manager'::text])))))));


--
-- Name: file_scan_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.file_scan_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: gmail_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gmail_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: gmail_health_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gmail_health_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: instance_auth_events iae_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY iae_admin_select ON public.instance_auth_events FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: instance_auth_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instance_auth_events ENABLE ROW LEVEL SECURITY;

--
-- Name: instance_processing_pauses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instance_processing_pauses ENABLE ROW LEVEL SECURITY;

--
-- Name: integration_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integration_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: instance_processing_pauses ipp_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ipp_admin_delete ON public.instance_processing_pauses FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: instance_processing_pauses ipp_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ipp_admin_insert ON public.instance_processing_pauses FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: instance_processing_pauses ipp_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ipp_admin_select ON public.instance_processing_pauses FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: instance_processing_pauses ipp_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ipp_admin_update ON public.instance_processing_pauses FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: messages messages_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_select_policy ON public.messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.contacts c
  WHERE ((c.id = messages.contact_id) AND (public.is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = public.get_profile_id_for_user(auth.uid())) OR (c.assigned_to IS NULL))))));


--
-- Name: mfa_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mfa_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: nps_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nps_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: outbox_events outbox_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY outbox_admin_write ON public.outbox_events TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: outbox_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;

--
-- Name: outbox_events outbox_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY outbox_select_admin ON public.outbox_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: conversation_participants participants_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY participants_admin_write ON public.conversation_participants TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: conversation_participants participants_select_admin_supervisor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY participants_select_admin_supervisor ON public.conversation_participants FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: conversation_participants participants_select_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY participants_select_self ON public.conversation_participants FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = conversation_participants.profile_id) AND (p.user_id = auth.uid())))));


--
-- Name: pii_access_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pii_access_log ENABLE ROW LEVEL SECURITY;

--
-- Name: pii_access_log pii_access_log_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pii_access_log_insert ON public.pii_access_log FOR INSERT TO authenticated WITH CHECK ((accessed_by = auth.uid()));


--
-- Name: pii_access_log pii_access_log_select_managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pii_access_log_select_managers ON public.pii_access_log FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'supervisor'::text]))))));


--
-- Name: provider_session_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_session_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: proxy_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proxy_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: proxy_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proxy_metrics ENABLE ROW LEVEL SECURITY;

--
-- Name: reprocess_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reprocess_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: reprocess_jobs rj_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rj_admin_write ON public.reprocess_jobs TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: reprocess_jobs rj_select_admin_supervisor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rj_select_admin_supervisor ON public.reprocess_jobs FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: webhook_audit_log service role manages webhook_audit_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service role manages webhook_audit_log" ON public.webhook_audit_log TO service_role USING (true) WITH CHECK (true);


--
-- Name: webhook_events_processed service role manages webhook_events_processed; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service role manages webhook_events_processed" ON public.webhook_events_processed TO service_role USING (true) WITH CHECK (true);


--
-- Name: sticky_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sticky_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: integration_profiles supervisors can view integration profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "supervisors can view integration profiles" ON public.integration_profiles FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'supervisor'::public.app_role)));


--
-- Name: conversation_threads threads_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY threads_admin_write ON public.conversation_threads TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: conversation_threads threads_select_admin_supervisor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY threads_select_admin_supervisor ON public.conversation_threads FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: conversation_threads threads_select_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY threads_select_participant ON public.conversation_threads FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.conversation_participants cp
     JOIN public.profiles p ON ((p.id = cp.profile_id)))
  WHERE ((cp.thread_id = conversation_threads.id) AND (p.user_id = auth.uid())))));


--
-- Name: user_service_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_service_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: voice_command_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.voice_command_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: webauthn_challenges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_event_dedup; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_event_dedup ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_events_processed; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_events_processed ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_rate_limits ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict oTKNL5Wi30DbMmYyBWrOWLyhPbOmzbeRLMLxvt9JpLPPirSLynRwT3u4zR2nIpM



-- ╔═══════════════════════════════════════════════════════════╗
-- ║ INCLUDE: 02_alter_tables.sql
-- ╚═══════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════
-- 02_ALTER_TABLES: 263 colunas Lovable a adicionar em 44 tables existentes
-- ═══════════════════════════════════════════════════════════

-- ─── agent_skills (2 colunas) ───
ALTER TABLE public.agent_skills ADD COLUMN IF NOT EXISTS profile_id uuid NOT NULL;
ALTER TABLE public.agent_skills ADD COLUMN IF NOT EXISTS skill_level integer DEFAULT 1;

-- ─── app_settings (3 colunas) ───
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS key text NOT NULL;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS value jsonb DEFAULT '{}'::jsonb;

-- ─── automation_executions (15 colunas) ───
ALTER TABLE public.automation_executions ADD COLUMN IF NOT EXISTS acted_at timestamptz;
ALTER TABLE public.automation_executions ADD COLUMN IF NOT EXISTS acted_by uuid;
ALTER TABLE public.automation_executions ADD COLUMN IF NOT EXISTS applied_tags text[];
ALTER TABLE public.automation_executions ADD COLUMN IF NOT EXISTS assigned_to uuid;
ALTER TABLE public.automation_executions ADD COLUMN IF NOT EXISTS channel_id uuid;
ALTER TABLE public.automation_executions ADD COLUMN IF NOT EXISTS department_id uuid;
ALTER TABLE public.automation_executions ADD COLUMN IF NOT EXISTS error_at timestamptz;
ALTER TABLE public.automation_executions ADD COLUMN IF NOT EXISTS instance_name text DEFAULT 'wpp2'::text NOT NULL;
ALTER TABLE public.automation_executions ADD COLUMN IF NOT EXISTS kb_sources text[] DEFAULT '{}'::text[];
ALTER TABLE public.automation_executions ADD COLUMN IF NOT EXISTS reassigned_to uuid;
ALTER TABLE public.automation_executions ADD COLUMN IF NOT EXISTS recommended_tag text;
ALTER TABLE public.automation_executions ADD COLUMN IF NOT EXISTS remote_jid text NOT NULL;
ALTER TABLE public.automation_executions ADD COLUMN IF NOT EXISTS rule_snapshot jsonb;
ALTER TABLE public.automation_executions ADD COLUMN IF NOT EXISTS suggestion_text text;
ALTER TABLE public.automation_executions ADD COLUMN IF NOT EXISTS trigger_payload jsonb DEFAULT '{}'::jsonb NOT NULL;

-- ─── automation_rules (3 colunas) ───
ALTER TABLE public.automation_rules ADD COLUMN IF NOT EXISTS channel_id uuid;
ALTER TABLE public.automation_rules ADD COLUMN IF NOT EXISTS cooldown_seconds integer DEFAULT 300 NOT NULL;
ALTER TABLE public.automation_rules ADD COLUMN IF NOT EXISTS department_id uuid;

-- ─── avatars (4 colunas) ───
ALTER TABLE public.avatars ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;
ALTER TABLE public.avatars ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.avatars ADD COLUMN IF NOT EXISTS url text NOT NULL;
ALTER TABLE public.avatars ADD COLUMN IF NOT EXISTS user_id uuid;

-- ─── channel_queues (4 colunas) ───
ALTER TABLE public.channel_queues ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.channel_queues ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;
ALTER TABLE public.channel_queues ADD COLUMN IF NOT EXISTS priority integer DEFAULT 0 NOT NULL;
ALTER TABLE public.channel_queues ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL;

-- ─── connection_alert_preferences (4 colunas) ───
ALTER TABLE public.connection_alert_preferences ADD COLUMN IF NOT EXISTS alert_on_degraded boolean DEFAULT true NOT NULL;
ALTER TABLE public.connection_alert_preferences ADD COLUMN IF NOT EXISTS alert_on_disconnected boolean DEFAULT true NOT NULL;
ALTER TABLE public.connection_alert_preferences ADD COLUMN IF NOT EXISTS email_enabled boolean DEFAULT false NOT NULL;
ALTER TABLE public.connection_alert_preferences ADD COLUMN IF NOT EXISTS push_enabled boolean DEFAULT true NOT NULL;

-- ─── contact_audit_log (10 colunas) ───
ALTER TABLE public.contact_audit_log ADD COLUMN IF NOT EXISTS action text NOT NULL;
ALTER TABLE public.contact_audit_log ADD COLUMN IF NOT EXISTS changed_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE public.contact_audit_log ADD COLUMN IF NOT EXISTS changed_by uuid;
ALTER TABLE public.contact_audit_log ADD COLUMN IF NOT EXISTS contact_id uuid NOT NULL;
ALTER TABLE public.contact_audit_log ADD COLUMN IF NOT EXISTS ip_address inet;
ALTER TABLE public.contact_audit_log ADD COLUMN IF NOT EXISTS new_values jsonb;
ALTER TABLE public.contact_audit_log ADD COLUMN IF NOT EXISTS old_values jsonb;
ALTER TABLE public.contact_audit_log ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE public.contact_audit_log ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE public.contact_audit_log ADD COLUMN IF NOT EXISTS user_agent text;

-- ─── conversation_summaries (3 colunas) ───
ALTER TABLE public.conversation_summaries ADD COLUMN IF NOT EXISTS conversation_id uuid;
ALTER TABLE public.conversation_summaries ADD COLUMN IF NOT EXISTS generated_by text DEFAULT 'ai'::text;
ALTER TABLE public.conversation_summaries ADD COLUMN IF NOT EXISTS summary text;

-- ─── conversation_transfers (4 colunas) ───
ALTER TABLE public.conversation_transfers ADD COLUMN IF NOT EXISTS conversation_id uuid;
ALTER TABLE public.conversation_transfers ADD COLUMN IF NOT EXISTS from_agent_id uuid;
ALTER TABLE public.conversation_transfers ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE public.conversation_transfers ADD COLUMN IF NOT EXISTS to_agent_id uuid;

-- ─── dispatch_error_logs (7 colunas) ───
ALTER TABLE public.dispatch_error_logs ADD COLUMN IF NOT EXISTS agent_email text;
ALTER TABLE public.dispatch_error_logs ADD COLUMN IF NOT EXISTS agent_user_id uuid;
ALTER TABLE public.dispatch_error_logs ADD COLUMN IF NOT EXISTS channel_type text;
ALTER TABLE public.dispatch_error_logs ADD COLUMN IF NOT EXISTS context jsonb;
ALTER TABLE public.dispatch_error_logs ADD COLUMN IF NOT EXISTS failed_message_id uuid;
ALTER TABLE public.dispatch_error_logs ADD COLUMN IF NOT EXISTS occurred_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE public.dispatch_error_logs ADD COLUMN IF NOT EXISTS remote_jid text;

-- ─── email_templates (5 colunas) ───
ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS subject text;

-- ─── entity_versions (1 colunas) ───
ALTER TABLE public.entity_versions ADD COLUMN IF NOT EXISTS changed_at timestamptz DEFAULT now() NOT NULL;

-- ─── gmail_accounts (4 colunas) ───
ALTER TABLE public.gmail_accounts ADD COLUMN IF NOT EXISTS history_id text;
ALTER TABLE public.gmail_accounts ADD COLUMN IF NOT EXISTS profile_id uuid NOT NULL;
ALTER TABLE public.gmail_accounts ADD COLUMN IF NOT EXISTS scopes text[] DEFAULT '{}'::text[];
ALTER TABLE public.gmail_accounts ADD COLUMN IF NOT EXISTS watch_expiration timestamptz;

-- ─── gmail_daily_metrics (8 colunas) ───
ALTER TABLE public.gmail_daily_metrics ADD COLUMN IF NOT EXISTS account_id uuid NOT NULL;
ALTER TABLE public.gmail_daily_metrics ADD COLUMN IF NOT EXISTS avg_frt_minutes numeric;
ALTER TABLE public.gmail_daily_metrics ADD COLUMN IF NOT EXISTS date date NOT NULL;
ALTER TABLE public.gmail_daily_metrics ADD COLUMN IF NOT EXISTS received integer DEFAULT 0 NOT NULL;
ALTER TABLE public.gmail_daily_metrics ADD COLUMN IF NOT EXISTS sent integer DEFAULT 0 NOT NULL;
ALTER TABLE public.gmail_daily_metrics ADD COLUMN IF NOT EXISTS sla_breached integer DEFAULT 0 NOT NULL;
ALTER TABLE public.gmail_daily_metrics ADD COLUMN IF NOT EXISTS sla_ok integer DEFAULT 0 NOT NULL;
ALTER TABLE public.gmail_daily_metrics ADD COLUMN IF NOT EXISTS sla_warning integer DEFAULT 0 NOT NULL;

-- ─── gmail_drafts (9 colunas) ───
ALTER TABLE public.gmail_drafts ADD COLUMN IF NOT EXISTS account_id uuid NOT NULL;
ALTER TABLE public.gmail_drafts ADD COLUMN IF NOT EXISTS bcc_emails text[];
ALTER TABLE public.gmail_drafts ADD COLUMN IF NOT EXISTS body_html text;
ALTER TABLE public.gmail_drafts ADD COLUMN IF NOT EXISTS cc_emails text[];
ALTER TABLE public.gmail_drafts ADD COLUMN IF NOT EXISTS gmail_draft_id text;
ALTER TABLE public.gmail_drafts ADD COLUMN IF NOT EXISTS last_saved_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE public.gmail_drafts ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE public.gmail_drafts ADD COLUMN IF NOT EXISTS thread_id_ref uuid;
ALTER TABLE public.gmail_drafts ADD COLUMN IF NOT EXISTS to_emails text[];

-- ─── gmail_health_summary (3 colunas) ───
ALTER TABLE public.gmail_health_summary ADD COLUMN IF NOT EXISTS failure_count_60m integer DEFAULT 0;
ALTER TABLE public.gmail_health_summary ADD COLUMN IF NOT EXISTS last_validation timestamptz DEFAULT now();
ALTER TABLE public.gmail_health_summary ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ─── gmail_labels (8 colunas) ───
ALTER TABLE public.gmail_labels ADD COLUMN IF NOT EXISTS account_id uuid NOT NULL;
ALTER TABLE public.gmail_labels ADD COLUMN IF NOT EXISTS color_bg text;
ALTER TABLE public.gmail_labels ADD COLUMN IF NOT EXISTS color_fg text;
ALTER TABLE public.gmail_labels ADD COLUMN IF NOT EXISTS label_id text NOT NULL;
ALTER TABLE public.gmail_labels ADD COLUMN IF NOT EXISTS messages_total integer DEFAULT 0;
ALTER TABLE public.gmail_labels ADD COLUMN IF NOT EXISTS messages_unread integer DEFAULT 0;
ALTER TABLE public.gmail_labels ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.gmail_labels ADD COLUMN IF NOT EXISTS type text;

-- ─── gmail_messages (18 colunas) ───
ALTER TABLE public.gmail_messages ADD COLUMN IF NOT EXISTS account_id uuid NOT NULL;
ALTER TABLE public.gmail_messages ADD COLUMN IF NOT EXISTS bcc_emails text[];
ALTER TABLE public.gmail_messages ADD COLUMN IF NOT EXISTS body_html text;
ALTER TABLE public.gmail_messages ADD COLUMN IF NOT EXISTS body_plain text;
ALTER TABLE public.gmail_messages ADD COLUMN IF NOT EXISTS cc_emails text[];
ALTER TABLE public.gmail_messages ADD COLUMN IF NOT EXISTS from_email text;
ALTER TABLE public.gmail_messages ADD COLUMN IF NOT EXISTS from_name text;
ALTER TABLE public.gmail_messages ADD COLUMN IF NOT EXISTS has_attachments boolean DEFAULT false NOT NULL;
ALTER TABLE public.gmail_messages ADD COLUMN IF NOT EXISTS internal_date timestamptz;
ALTER TABLE public.gmail_messages ADD COLUMN IF NOT EXISTS is_draft boolean DEFAULT false NOT NULL;
ALTER TABLE public.gmail_messages ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false NOT NULL;
ALTER TABLE public.gmail_messages ADD COLUMN IF NOT EXISTS is_sent boolean DEFAULT false NOT NULL;
ALTER TABLE public.gmail_messages ADD COLUMN IF NOT EXISTS label_ids text[];
ALTER TABLE public.gmail_messages ADD COLUMN IF NOT EXISTS message_id text NOT NULL;
ALTER TABLE public.gmail_messages ADD COLUMN IF NOT EXISTS snippet text;
ALTER TABLE public.gmail_messages ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE public.gmail_messages ADD COLUMN IF NOT EXISTS thread_id_ref uuid NOT NULL;
ALTER TABLE public.gmail_messages ADD COLUMN IF NOT EXISTS to_emails text[];

-- ─── gmail_revalidation_jobs (3 colunas) ───
ALTER TABLE public.gmail_revalidation_jobs ADD COLUMN IF NOT EXISTS requested_at timestamptz DEFAULT now();
ALTER TABLE public.gmail_revalidation_jobs ADD COLUMN IF NOT EXISTS requested_by uuid;
ALTER TABLE public.gmail_revalidation_jobs ADD COLUMN IF NOT EXISTS result jsonb;

-- ─── gmail_signatures (4 colunas) ───
ALTER TABLE public.gmail_signatures ADD COLUMN IF NOT EXISTS account_id uuid NOT NULL;
ALTER TABLE public.gmail_signatures ADD COLUMN IF NOT EXISTS html_content text DEFAULT ''::text NOT NULL;
ALTER TABLE public.gmail_signatures ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false NOT NULL;
ALTER TABLE public.gmail_signatures ADD COLUMN IF NOT EXISTS name text DEFAULT 'Padrão'::text NOT NULL;

-- ─── gmail_threads (17 colunas) ───
ALTER TABLE public.gmail_threads ADD COLUMN IF NOT EXISTS account_id uuid NOT NULL;
ALTER TABLE public.gmail_threads ADD COLUMN IF NOT EXISTS assigned_agent_id uuid;
ALTER TABLE public.gmail_threads ADD COLUMN IF NOT EXISTS first_reply_at timestamptz;
ALTER TABLE public.gmail_threads ADD COLUMN IF NOT EXISTS frt_minutes integer;
ALTER TABLE public.gmail_threads ADD COLUMN IF NOT EXISTS is_important boolean DEFAULT false NOT NULL;
ALTER TABLE public.gmail_threads ADD COLUMN IF NOT EXISTS is_starred boolean DEFAULT false NOT NULL;
ALTER TABLE public.gmail_threads ADD COLUMN IF NOT EXISTS label_ids text[];
ALTER TABLE public.gmail_threads ADD COLUMN IF NOT EXISTS last_message_at timestamptz;
ALTER TABLE public.gmail_threads ADD COLUMN IF NOT EXISTS message_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.gmail_threads ADD COLUMN IF NOT EXISTS participant_emails text[];
ALTER TABLE public.gmail_threads ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal'::text;
ALTER TABLE public.gmail_threads ADD COLUMN IF NOT EXISTS sla_status text DEFAULT 'ok'::text;
ALTER TABLE public.gmail_threads ADD COLUMN IF NOT EXISTS snippet text;
ALTER TABLE public.gmail_threads ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE public.gmail_threads ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE public.gmail_threads ADD COLUMN IF NOT EXISTS thread_id text NOT NULL;
ALTER TABLE public.gmail_threads ADD COLUMN IF NOT EXISTS unread_count integer DEFAULT 0 NOT NULL;

-- ─── imap_smtp_accounts (10 colunas) ───
ALTER TABLE public.imap_smtp_accounts ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.imap_smtp_accounts ADD COLUMN IF NOT EXISTS email text NOT NULL;
ALTER TABLE public.imap_smtp_accounts ADD COLUMN IF NOT EXISTS imap_host text;
ALTER TABLE public.imap_smtp_accounts ADD COLUMN IF NOT EXISTS imap_port bigint DEFAULT 993;
ALTER TABLE public.imap_smtp_accounts ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.imap_smtp_accounts ADD COLUMN IF NOT EXISTS password_encrypted text;
ALTER TABLE public.imap_smtp_accounts ADD COLUMN IF NOT EXISTS smtp_host text;
ALTER TABLE public.imap_smtp_accounts ADD COLUMN IF NOT EXISTS smtp_port bigint DEFAULT 587;
ALTER TABLE public.imap_smtp_accounts ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.imap_smtp_accounts ADD COLUMN IF NOT EXISTS username text;

-- ─── login_attempts (4 colunas) ───
ALTER TABLE public.login_attempts ADD COLUMN IF NOT EXISTS attempt_count integer DEFAULT 1 NOT NULL;
ALTER TABLE public.login_attempts ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE public.login_attempts ADD COLUMN IF NOT EXISTS locked_until timestamptz;
ALTER TABLE public.login_attempts ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL;

-- ─── notifications (2 colunas) ───
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS message text NOT NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- ─── profiles (11 colunas) ───
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS access_level text DEFAULT 'basic'::text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birthday date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS can_download boolean DEFAULT false NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department_id uuid;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS job_title text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS session_invalidated_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signature text;

-- ─── provider_message_log (14 colunas) ───
ALTER TABLE public.provider_message_log ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.provider_message_log ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT 'received'::text NOT NULL;
ALTER TABLE public.provider_message_log ADD COLUMN IF NOT EXISTS error_code text;
ALTER TABLE public.provider_message_log ADD COLUMN IF NOT EXISTS external_contact_id uuid;
ALTER TABLE public.provider_message_log ADD COLUMN IF NOT EXISTS external_message_id text;
ALTER TABLE public.provider_message_log ADD COLUMN IF NOT EXISTS idempotency_key text NOT NULL;
ALTER TABLE public.provider_message_log ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE public.provider_message_log ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL;
ALTER TABLE public.provider_message_log ADD COLUMN IF NOT EXISTS payload_hash text NOT NULL;
ALTER TABLE public.provider_message_log ADD COLUMN IF NOT EXISTS persisted_at timestamptz;
ALTER TABLE public.provider_message_log ADD COLUMN IF NOT EXISTS received_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE public.provider_message_log ADD COLUMN IF NOT EXISTS routed_at timestamptz;
ALTER TABLE public.provider_message_log ADD COLUMN IF NOT EXISTS thread_id uuid;
ALTER TABLE public.provider_message_log ADD COLUMN IF NOT EXISTS trace_id text;

-- ─── query_telemetry (10 colunas) ───
ALTER TABLE public.query_telemetry ADD COLUMN IF NOT EXISTS count_mode text;
ALTER TABLE public.query_telemetry ADD COLUMN IF NOT EXISTS duration_ms integer DEFAULT 0 NOT NULL;
ALTER TABLE public.query_telemetry ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.query_telemetry ADD COLUMN IF NOT EXISTS operation text DEFAULT 'select'::text NOT NULL;
ALTER TABLE public.query_telemetry ADD COLUMN IF NOT EXISTS query_limit integer;
ALTER TABLE public.query_telemetry ADD COLUMN IF NOT EXISTS query_offset integer;
ALTER TABLE public.query_telemetry ADD COLUMN IF NOT EXISTS record_count integer;
ALTER TABLE public.query_telemetry ADD COLUMN IF NOT EXISTS rpc_name text;
ALTER TABLE public.query_telemetry ADD COLUMN IF NOT EXISTS severity text DEFAULT 'normal'::text NOT NULL;
ALTER TABLE public.query_telemetry ADD COLUMN IF NOT EXISTS table_name text;

-- ─── queues (17 colunas) ───
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS auto_rebalance_enabled boolean DEFAULT true NOT NULL;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS department_id uuid;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS distribution_algorithm text DEFAULT 'least_busy'::text NOT NULL;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS last_assigned_at timestamptz;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS last_assigned_user_id uuid;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS max_concurrent_per_agent integer;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS max_per_queue_per_agent integer;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS max_queue_size integer;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS max_wait_seconds integer;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS max_wait_time_minutes integer DEFAULT 30;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS overflow_queue_id uuid;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS paused_at timestamptz;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS paused_by uuid;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS paused_reason text;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS routing_weight integer DEFAULT 1 NOT NULL;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS sla_priority text DEFAULT 'medium'::text NOT NULL;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'::text NOT NULL;

-- ─── rate_limit_logs (4 colunas) ───
ALTER TABLE public.rate_limit_logs ADD COLUMN IF NOT EXISTS blocked boolean DEFAULT false;
ALTER TABLE public.rate_limit_logs ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.rate_limit_logs ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.rate_limit_logs ADD COLUMN IF NOT EXISTS user_id uuid;

-- ─── role_permissions (1 colunas) ───
ALTER TABLE public.role_permissions ADD COLUMN IF NOT EXISTS role app_role NOT NULL;

-- ─── salespeople (7 colunas) ───
ALTER TABLE public.salespeople ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.salespeople ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.salespeople ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.salespeople ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.salespeople ADD COLUMN IF NOT EXISTS quota numeric DEFAULT 0;
ALTER TABLE public.salespeople ADD COLUMN IF NOT EXISTS team text;
ALTER TABLE public.salespeople ADD COLUMN IF NOT EXISTS user_id uuid;

-- ─── service_channels (17 colunas) ───
ALTER TABLE public.service_channels ADD COLUMN IF NOT EXISTS color text DEFAULT '#3B82F6'::text NOT NULL;
ALTER TABLE public.service_channels ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.service_channels ADD COLUMN IF NOT EXISTS default_queue_id uuid;
ALTER TABLE public.service_channels ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.service_channels ADD COLUMN IF NOT EXISTS disabled_at timestamptz;
ALTER TABLE public.service_channels ADD COLUMN IF NOT EXISTS disabled_reason text;
ALTER TABLE public.service_channels ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.service_channels ADD COLUMN IF NOT EXISTS icon text;
ALTER TABLE public.service_channels ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false NOT NULL;
ALTER TABLE public.service_channels ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE public.service_channels ADD COLUMN IF NOT EXISTS paused_at timestamptz;
ALTER TABLE public.service_channels ADD COLUMN IF NOT EXISTS paused_reason text;
ALTER TABLE public.service_channels ADD COLUMN IF NOT EXISTS routing_mode text DEFAULT 'manual'::text NOT NULL;
ALTER TABLE public.service_channels ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'::text NOT NULL;
ALTER TABLE public.service_channels ADD COLUMN IF NOT EXISTS sticky_enabled boolean DEFAULT false NOT NULL;
ALTER TABLE public.service_channels ADD COLUMN IF NOT EXISTS sticky_ttl_hours integer DEFAULT 24 NOT NULL;
ALTER TABLE public.service_channels ADD COLUMN IF NOT EXISTS whatsapp_connection_id uuid;

-- ─── stickers (1 colunas) ───
ALTER TABLE public.stickers ADD COLUMN IF NOT EXISTS uploaded_by text;

-- ─── system_settings (3 colunas) ───
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS key text NOT NULL;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS value jsonb DEFAULT '{}'::jsonb NOT NULL;

-- ─── tags (5 colunas) ───
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS color text DEFAULT '#3b82f6'::text NOT NULL;
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL;

-- ─── user_roles (1 colunas) ───
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS role app_role DEFAULT 'agent'::app_role NOT NULL;

-- ─── whatsapp_cloud_webhook_pings (2 colunas) ───
ALTER TABLE public.whatsapp_cloud_webhook_pings ADD COLUMN IF NOT EXISTS kind text NOT NULL;
ALTER TABLE public.whatsapp_cloud_webhook_pings ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}'::jsonb NOT NULL;

-- ─── whatsapp_connections (15 colunas) ───
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS api_type text DEFAULT 'evolution'::text NOT NULL;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS battery_level integer;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS degraded_at timestamptz;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS farewell_enabled boolean DEFAULT false;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS farewell_message text;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS health_reason text;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS health_response_ms integer;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS health_status text DEFAULT 'unknown'::text;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS is_plugged boolean;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS last_health_check timestamptz;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS max_retries integer DEFAULT 5;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS owner_jid text;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS routing_mode text DEFAULT 'manual'::text NOT NULL;


-- ╔═══════════════════════════════════════════════════════════╗
-- ║ INCLUDE: 03_functions.sql
-- ╚═══════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════
-- All 171 public functions from Lovable migrations
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.audit_role_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'role_updated',
      'user_roles',
      NEW.id,
      jsonb_build_object('user_id', NEW.user_id, 'old_role', OLD.role, 'new_role', NEW.role)
    );
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(), 'role_created', 'user_roles', NEW.id,
      jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role)
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(), 'role_deleted', 'user_roles', OLD.id,
      jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role)
    );
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_assign_contact()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.auto_assign_to_queue_agent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.auto_pause_instance_on_auth_spike(p_instance text, p_reason text, p_trigger_count integer, p_minutes integer DEFAULT 15)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_existing uuid;
BEGIN
  IF p_minutes <= 0 OR p_minutes > 1440 THEN
    p_minutes := 15;
  END IF;

  -- Se já há pausa ativa, estende-a (não cria duplicata)
  SELECT id INTO v_existing
    FROM public.instance_processing_pauses
   WHERE instance_name = p_instance
     AND paused_until > now()
   ORDER BY paused_until DESC
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.instance_processing_pauses
       SET paused_until = GREATEST(paused_until, now() + (p_minutes || ' minutes')::interval),
           trigger_count = trigger_count + GREATEST(0, COALESCE(p_trigger_count, 0)),
           reason = p_reason,
           updated_at = now()
     WHERE id = v_existing;
    RETURN v_existing;
  END IF;

  INSERT INTO public.instance_processing_pauses (
    instance_name, paused_until, reason, trigger_count, auto_paused
  )
  VALUES (
    p_instance,
    now() + (p_minutes || ' minutes')::interval,
    p_reason,
    GREATEST(0, COALESCE(p_trigger_count, 0)),
    true
  )
  RETURNING id INTO v_id;

  -- Audit log sem user_id (auto)
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    NULL,
    'instance_auto_paused',
    'instance_processing_pauses',
    v_id::text,
    jsonb_build_object(
      'instance', p_instance,
      'minutes', p_minutes,
      'reason', p_reason,
      'trigger_count', p_trigger_count
    )
  );

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bulk_lgpd_optout(p_contact_ids uuid[], p_reason text DEFAULT 'user_request'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.contacts
  SET
    lgpd_opt_out_at        = now(),
    lgpd_marketing_consent = false,
    lgpd_data_sharing      = false,
    lgpd_profiling         = false,
    lgpd_last_updated_at   = now(),
    updated_at             = now()
  WHERE id = ANY(p_contact_ids)
    AND workspace_id = (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    )
    AND lgpd_opt_out_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bulk_soft_delete_contacts(p_contact_ids uuid[], p_reason text DEFAULT 'bulk_deletion'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  -- Chunk safety: refuse if > 500 contacts at once
  IF array_length(p_contact_ids, 1) > 500 THEN
    RAISE EXCEPTION 'Maximum 500 contacts per bulk operation. Got: %', array_length(p_contact_ids, 1);
  END IF;

  UPDATE public.contacts
  SET
    deleted_at     = now(),
    deleted_by     = auth.uid(),
    deleted_reason = p_reason,
    updated_at     = now()
  WHERE id = ANY(p_contact_ids)
    AND deleted_at IS NULL
    AND workspace_id = (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_level(xp_amount integer)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN GREATEST(1, FLOOR(SQRT(xp_amount / 50.0))::INTEGER + 1);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.can_see_pii()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'manager', 'agente_especial')
  )
$function$
;

CREATE OR REPLACE FUNCTION public.can_supervise_profile(_user_id uuid, _target_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_manager_or_above(_user_id)
    OR
    (
      public.has_role(_user_id, 'supervisor')
      AND public.get_user_department(_user_id) IS NOT NULL
      AND public.get_user_department(_user_id) = (
        SELECT department_id FROM public.profiles WHERE id = _target_profile_id LIMIT 1
      )
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = _target_profile_id AND user_id = _user_id
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_user_see_contact(_user_id uuid, _contact_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_manager_or_above(_user_id)
    OR
    (
      public.has_role(_user_id, 'supervisor')
      AND public.get_user_department(_user_id) IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.contacts c
        JOIN public.profiles p ON p.id = c.assigned_to
        WHERE c.id = _contact_id
          AND p.department_id = public.get_user_department(_user_id)
      )
    )
    OR
    EXISTS (
      SELECT 1
      FROM public.contacts c
      JOIN public.profiles p ON p.id = c.assigned_to
      WHERE c.id = _contact_id AND p.user_id = _user_id
    );
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_dispatch_error_logs()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin or service_role required';
  END IF;

  DELETE FROM public.dispatch_error_logs
  WHERE occurred_at < now() - interval '90 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_evolution_fallback_events()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.evolution_fallback_events
   WHERE ts < now() - interval '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_evolution_send_idempotency()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.evolution_send_idempotency
  WHERE expires_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_expired_challenges()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    DELETE FROM public.webauthn_challenges WHERE expires_at < now();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_failed_messages()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cutoff timestamptz := now() - interval '30 days';
  v_deleted_count integer := 0;
BEGIN
  -- Apenas service_role (cron) ou admin pode executar
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role or service_role required';
  END IF;

  WITH deleted AS (
    DELETE FROM public.failed_messages
    WHERE status IN ('succeeded', 'abandoned')
      AND COALESCE(succeeded_at, last_attempt_at, created_at) < v_cutoff
    RETURNING id
  )
  SELECT count(*) INTO v_deleted_count FROM deleted;

  RETURN jsonb_build_object(
    'deleted_count', v_deleted_count,
    'cutoff', v_cutoff,
    'executed_at', now()
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_old_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  deleted_errors int := 0;
  deleted_webhooks int := 0;
  deleted_dlq int := 0;
  deleted_audit int := 0;
BEGIN
  -- 1. Cleanup error logs > 30 days
  DELETE FROM public.app_error_logs WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS deleted_errors = ROW_COUNT;

  -- 2. Cleanup webhook events > 14 days
  DELETE FROM public.evolution_webhook_events WHERE created_at < now() - interval '14 days';
  GET DIAGNOSTICS deleted_webhooks = ROW_COUNT;

  -- 3. Cleanup dead letter queue > 30 days
  DELETE FROM public.dead_letter_queue WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS deleted_dlq = ROW_COUNT;

  -- 4. Cleanup audit log > 90 days
  DELETE FROM public.audit_log WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS deleted_audit = ROW_COUNT;

  RETURN jsonb_build_object(
    'timestamp', now(),
    'deleted_errors', deleted_errors,
    'deleted_webhooks', deleted_webhooks,
    'deleted_dlq', deleted_dlq,
    'deleted_audit', deleted_audit
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_old_evolution_retry_metrics()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.evolution_retry_metrics
  WHERE created_at < now() - interval '30 days';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_old_failed_messages()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.failed_messages
   WHERE status IN ('succeeded', 'abandoned')
     AND COALESCE(succeeded_at, last_attempt_at, created_at) < now() - interval '30 days';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_old_instance_auth_events()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.instance_auth_events
   WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_old_qr_attempts()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.qr_attempts WHERE created_at < now() - interval '60 days';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_proxy_metrics()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.proxy_metrics WHERE ts < now() - interval '24 hours';
  DELETE FROM public.proxy_alerts  WHERE ts < now() - interval '30 days';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_wa_cloud_pings()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DELETE FROM public.whatsapp_cloud_webhook_pings
  WHERE created_at < now() - interval '7 days';
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_webhook_event_dedup()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.webhook_event_dedup
   WHERE received_at < now() - interval '7 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.clear_login_attempts(p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.login_attempts WHERE email = LOWER(p_email);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.clear_qr_on_connect()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'connected' AND OLD.status != 'connected' AND NEW.qr_code IS NOT NULL THEN
    NEW.qr_code := NULL;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.contacts_count_by_type()
 RETURNS TABLE(contact_type text, count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(c.contact_type, 'cliente') AS contact_type, COUNT(*) AS count
  FROM public.contacts c
  GROUP BY COALESCE(c.contact_type, 'cliente');
$function$
;

CREATE OR REPLACE FUNCTION public.decrypt_gmail_token(p_encrypted bytea)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_encrypted IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(p_encrypted, current_setting('app.encryption_key', true));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.encrypt_gmail_token(p_token text)
 RETURNS bytea
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_token IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_encrypt(p_token, current_setting('app.encryption_key', true));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_single_default_ai_provider()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_single_default_filter()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.fn_contact_audit_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_action        text;
  v_old_values    jsonb := NULL;
  v_new_values    jsonb := NULL;
  v_changed_by    uuid;
  v_sensitive_fields text[] := ARRAY['phone', 'email', 'cpf', 'cnpj', 'name', 'notes',
                                      'address', 'company', 'custom_fields', 'tags',
                                      'lgpd_consent_at', 'lgpd_opt_out_at', 'is_blocked'];
BEGIN
  -- Determine action
  v_action := TG_OP;

  -- Attempt to get the current authenticated user
  v_changed_by := auth.uid();

  -- For UPDATE: only log fields that actually changed
  IF TG_OP = 'UPDATE' THEN
    v_old_values := jsonb_object_agg(key, value)
      FROM jsonb_each(to_jsonb(OLD))
      WHERE key = ANY(v_sensitive_fields)
        AND to_jsonb(OLD)->>key IS DISTINCT FROM to_jsonb(NEW)->>key;

    v_new_values := jsonb_object_agg(key, value)
      FROM jsonb_each(to_jsonb(NEW))
      WHERE key = ANY(v_sensitive_fields)
        AND to_jsonb(OLD)->>key IS DISTINCT FROM to_jsonb(NEW)->>key;

    -- Skip log if nothing sensitive changed
    IF v_old_values IS NULL AND v_new_values IS NULL THEN
      RETURN NEW;
    END IF;

  ELSIF TG_OP = 'INSERT' THEN
    v_new_values := to_jsonb(NEW) - 'updated_at' - 'created_at';

  ELSIF TG_OP = 'DELETE' THEN
    v_old_values := to_jsonb(OLD);

  END IF;

  INSERT INTO public.contact_audit_log (
    contact_id,
    action,
    changed_by,
    changed_at,
    old_values,
    new_values
  ) VALUES (
    COALESCE(NEW.id, OLD.id),
    v_action,
    v_changed_by,
    now(),
    v_old_values,
    v_new_values
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_contacts_increment_version()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.version := COALESCE(OLD.version, 0) + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_contacts_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_contacts_update_lgpd_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.lgpd_consent_at IS DISTINCT FROM NEW.lgpd_consent_at
    OR OLD.lgpd_opt_out_at IS DISTINCT FROM NEW.lgpd_opt_out_at
    OR OLD.lgpd_marketing_consent IS DISTINCT FROM NEW.lgpd_marketing_consent
    OR OLD.lgpd_data_sharing IS DISTINCT FROM NEW.lgpd_data_sharing
    OR OLD.lgpd_profiling IS DISTINCT FROM NEW.lgpd_profiling
  THEN
    NEW.lgpd_last_updated_at := now();
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_gmail_mark_first_reply()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Quando uma mensagem enviada é inserida, verifica se a thread ainda não teve resposta
  IF NEW.is_sent = true THEN
    UPDATE public.gmail_threads t
    SET
      first_reply_at = NEW.internal_date,
      frt_minutes    = EXTRACT(EPOCH FROM (NEW.internal_date - t.last_message_at)) / 60,
      sla_status     = 'ok'
    WHERE t.id = NEW.thread_id_ref
      AND t.first_reply_at IS NULL
      AND t.unread_count > 0;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_log_dispatch_error()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_agent_email TEXT;
BEGIN
  v_agent_email := COALESCE(
    NEW.payload->>'agent_email',
    NEW.payload->>'agentEmail',
    NEW.payload->>'assigned_to',
    NEW.payload->>'user_email'
  );

  INSERT INTO public.dispatch_error_logs (
    failed_message_id, instance_name, remote_jid,
    agent_email, error_code, error_message, http_status,
    retry_count, payload, occurred_at
  ) VALUES (
    NEW.id, NEW.instance_name, NEW.remote_jid,
    v_agent_email, NEW.error_code, NEW.error_message, NEW.http_status,
    COALESCE(NEW.retry_count, 0), NEW.payload, COALESCE(NEW.created_at, now())
  );

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_log_route_switchover()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.current_provider_id IS DISTINCT FROM NEW.current_provider_id
     AND NEW.current_provider_id IS NOT NULL THEN
    INSERT INTO public.provider_session_logs (provider_id, level, event, message, payload)
    VALUES (
      NEW.current_provider_id,
      'warn',
      'switchover',
      COALESCE(NEW.switched_reason, 'route changed'),
      jsonb_build_object(
        'from_provider', OLD.current_provider_id,
        'to_provider', NEW.current_provider_id,
        'channel_connection_id', NEW.channel_connection_id,
        'whatsapp_connection_id', NEW.whatsapp_connection_id
      )
    );
    NEW.switched_at := now();
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_mark_qr_attempt_connected()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'connected' AND (OLD.status IS DISTINCT FROM 'connected') THEN
    UPDATE public.qr_attempts
       SET status = 'connected',
           connected_at = now()
     WHERE connection_id = NEW.id
       AND status = 'pending'
       AND created_at > now() - interval '15 minutes';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_pml_protect_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key)
     OR (OLD.payload IS DISTINCT FROM NEW.payload)
     OR (OLD.payload_hash IS DISTINCT FROM NEW.payload_hash)
     OR (OLD.provider IS DISTINCT FROM NEW.provider)
     OR (OLD.external_message_id IS DISTINCT FROM NEW.external_message_id)
     OR (OLD.received_at IS DISTINCT FROM NEW.received_at) THEN
    RAISE EXCEPTION 'provider_message_log: immutable columns cannot be modified';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_register_sticky_assignment(p_contact_id uuid, p_agent_profile_id uuid, p_channel_connection_id uuid DEFAULT NULL::uuid, p_queue_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.sticky_assignments
    (contact_id, channel_connection_id, agent_profile_id, queue_id, last_assigned_at, expires_at)
  VALUES
    (p_contact_id, p_channel_connection_id, p_agent_profile_id, p_queue_id, now(), now() + interval '24 hours')
  ON CONFLICT (contact_id, channel_connection_id) DO UPDATE
    SET agent_profile_id = EXCLUDED.agent_profile_id,
        queue_id = EXCLUDED.queue_id,
        last_assigned_at = now(),
        expires_at = now() + interval '24 hours'
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_resolve_agent_for_routing(p_contact_id uuid, p_channel_connection_id uuid DEFAULT NULL::uuid, p_queue_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_agent_id uuid;
  v_resolved_queue uuid;
  v_strategy text;
  v_required_skills text[];
BEGIN
  -- 1) Sticky: último agente do contato neste canal, ainda válido e ativo
  SELECT s.agent_profile_id, s.queue_id
    INTO v_agent_id, v_resolved_queue
  FROM public.sticky_assignments s
  JOIN public.profiles p ON p.id = s.agent_profile_id
  WHERE s.contact_id = p_contact_id
    AND (p_channel_connection_id IS NULL OR s.channel_connection_id = p_channel_connection_id)
    AND s.expires_at > now()
    AND p.is_active = true
  ORDER BY s.last_assigned_at DESC
  LIMIT 1;

  IF v_agent_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'agent_profile_id', v_agent_id,
      'queue_id', v_resolved_queue,
      'strategy', 'sticky'
    );
  END IF;

  -- 2) Resolver fila: parâmetro > regra de roteamento do canal
  v_resolved_queue := p_queue_id;

  IF v_resolved_queue IS NULL AND p_channel_connection_id IS NOT NULL THEN
    SELECT queue_id INTO v_resolved_queue
    FROM public.channel_routing_rules
    WHERE channel_connection_id = p_channel_connection_id
      AND queue_id IS NOT NULL
    ORDER BY priority DESC
    LIMIT 1;
  END IF;

  IF v_resolved_queue IS NULL THEN
    RETURN jsonb_build_object(
      'agent_profile_id', NULL,
      'queue_id', NULL,
      'strategy', 'unassigned',
      'reason', 'no_queue_resolved'
    );
  END IF;

  -- 3) Skills exigidas pela fila
  SELECT COALESCE(array_agg(skill_name), ARRAY[]::text[])
    INTO v_required_skills
  FROM public.queue_skill_requirements
  WHERE queue_id = v_resolved_queue;

  -- 4) Round-robin: agente da fila com menos atribuições nas últimas 24h, com skills
  SELECT qm.profile_id INTO v_agent_id
  FROM public.queue_members qm
  JOIN public.profiles p ON p.id = qm.profile_id
  WHERE qm.queue_id = v_resolved_queue
    AND qm.is_active = true
    AND p.is_active = true
    AND (
      array_length(v_required_skills, 1) IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM unnest(v_required_skills) rs(name)
        WHERE NOT EXISTS (
          SELECT 1 FROM public.agent_skills s
          WHERE s.profile_id = qm.profile_id AND s.skill_name = rs.name
        )
      )
    )
  ORDER BY (
    SELECT COUNT(*) FROM public.sticky_assignments sa
    WHERE sa.agent_profile_id = qm.profile_id
      AND sa.last_assigned_at > now() - interval '24 hours'
  ) ASC, random()
  LIMIT 1;

  IF v_agent_id IS NULL THEN
    RETURN jsonb_build_object(
      'agent_profile_id', NULL,
      'queue_id', v_resolved_queue,
      'strategy', 'unassigned',
      'reason', 'no_eligible_agent'
    );
  END IF;

  RETURN jsonb_build_object(
    'agent_profile_id', v_agent_id,
    'queue_id', v_resolved_queue,
    'strategy', 'round_robin'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_sticky_on_contact_assign()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
BEGIN
  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = NEW.assigned_to LIMIT 1;
  IF v_profile_id IS NULL THEN RETURN NEW; END IF;

  PERFORM public.fn_sticky_upsert(NEW.id, v_profile_id, NULL, NULL, 'contact_assignment');
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_sticky_upsert(p_contact_id uuid, p_agent_profile_id uuid, p_channel_id uuid DEFAULT NULL::uuid, p_queue_id uuid DEFAULT NULL::uuid, p_source text DEFAULT 'manual'::text)
 RETURNS sticky_assignments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ttl_hours int := 24;
  v_enabled boolean := true;
  v_row public.sticky_assignments;
BEGIN
  IF p_contact_id IS NULL OR p_agent_profile_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Lê TTL/enabled do canal (se informado)
  IF p_channel_id IS NOT NULL THEN
    SELECT sticky_enabled, COALESCE(sticky_ttl_hours, 24)
      INTO v_enabled, v_ttl_hours
      FROM public.service_channels
     WHERE id = p_channel_id;

    IF NOT COALESCE(v_enabled, true) THEN
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO public.sticky_assignments AS sa
    (contact_id, agent_profile_id, queue_id, last_assigned_at, expires_at)
  VALUES
    (p_contact_id, p_agent_profile_id, p_queue_id, now(),
     now() + make_interval(hours => v_ttl_hours))
  ON CONFLICT (contact_id) DO UPDATE
    SET agent_profile_id = EXCLUDED.agent_profile_id,
        queue_id         = COALESCE(EXCLUDED.queue_id, sa.queue_id),
        last_assigned_at = now(),
        expires_at       = now() + make_interval(hours => v_ttl_hours)
  RETURNING * INTO v_row;

  -- Audit best-effort
  BEGIN
    INSERT INTO public.audit_log(actor_user_id, action, entity_type, entity_id, payload)
    VALUES (auth.uid(), 'sticky.upsert', 'sticky_assignment', v_row.id,
            jsonb_build_object('source', p_source, 'agent', p_agent_profile_id,
                               'channel', p_channel_id, 'queue', p_queue_id,
                               'expires_at', v_row.expires_at));
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_channel_credentials(_connection_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin_or_supervisor(auth.uid()) THEN
    RETURN NULL;
  END IF;
  RETURN (SELECT credentials FROM public.channel_connections WHERE id = _connection_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_channel_credentials_safe(p_channel_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_connection_instance(_connection_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT instance_id FROM public.whatsapp_connections WHERE id = _connection_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_connection_qr_code(_connection_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT qr_code FROM public.whatsapp_connections WHERE id = _connection_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_normalized_phone(phone text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE
    WHEN phone IS NULL OR phone = '' THEN NULL
    ELSE
      regexp_replace(
        CASE
          -- Strip leading 55 country code
          WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^55[1-9][0-9]' AND
               length(regexp_replace(phone, '[^0-9]', '', 'g')) IN (12, 13)
          THEN substring(regexp_replace(phone, '[^0-9]', '', 'g') FROM 3)
          ELSE regexp_replace(phone, '[^0-9]', '', 'g')
        END,
        '^',
        ''
      )
  END
$function$
;

CREATE OR REPLACE FUNCTION public.get_official_credentials_by_phone_id(p_phone_number_id text)
 RETURNS TABLE(connection_id uuid, phone_number_id text, access_token text, app_secret text, verify_token text, graph_api_version text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT connection_id, phone_number_id, access_token, app_secret, verify_token, graph_api_version
  FROM public.whatsapp_official_credentials
  WHERE phone_number_id = p_phone_number_id
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_own_lockout_status(p_email text)
 RETURNS TABLE(attempt_count integer, locked_until timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT la.attempt_count, la.locked_until
  FROM login_attempts la
  WHERE la.email = p_email
  ORDER BY la.created_at DESC
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_own_reset_requests()
 RETURNS SETOF password_reset_requests
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, user_id, email, reason, status, reviewed_by, reviewed_at,
         rejection_reason, NULL::text as reset_token, token_expires_at,
         ip_address, user_agent, created_at, updated_at
  FROM public.password_reset_requests
  WHERE user_id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.get_profile_id_for_user(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id FROM public.profiles WHERE user_id = _user_id LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_profile_role_for_check(p_user_id uuid)
 RETURNS TABLE(role text, access_level text, permissions jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.role, p.access_level, p.permissions
  FROM profiles p
  WHERE p.user_id = p_user_id
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_reset_requests_safe()
 RETURNS TABLE(id uuid, user_id uuid, email text, reason text, status text, reviewed_by uuid, reviewed_at timestamp with time zone, rejection_reason text, has_token boolean, token_expires_at timestamp with time zone, ip_address text, user_agent text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    prr.id, prr.user_id, prr.email, prr.reason, prr.status,
    prr.reviewed_by, prr.reviewed_at, prr.rejection_reason,
    (prr.reset_token IS NOT NULL) AS has_token,
    prr.token_expires_at, prr.ip_address, prr.user_agent,
    prr.created_at, prr.updated_at
  FROM public.password_reset_requests prr;
$function$
;

CREATE OR REPLACE FUNCTION public.get_route_roles(_path text)
 RETURNS app_role[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT allowed_roles FROM public.route_permissions WHERE path = _path
$function$
;

CREATE OR REPLACE FUNCTION public.get_team_profiles()
 RETURNS TABLE(id uuid, user_id uuid, name text, email text, avatar_url text, role text, is_active boolean, department text, job_title text, phone text, max_chats integer, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    p.id, p.user_id, p.name, p.email, p.avatar_url, p.role,
    p.is_active, p.department, p.job_title, p.phone, p.max_chats, p.created_at
  FROM public.profiles p;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_department(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.department_id
  FROM public.profiles p
  WHERE p.user_id = _user_id
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_visible_agent_ids(_user_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email),
    NEW.email
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'agent');
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$
;

CREATE OR REPLACE FUNCTION public.init_agent_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.agent_stats (profile_id)
  VALUES (NEW.id)
  ON CONFLICT (profile_id) DO NOTHING;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_account_locked(check_email text)
 RETURNS TABLE(is_locked boolean, locked_until timestamp with time zone, attempts integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('dev', 'admin', 'manager', 'supervisor')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'moderator')
    )
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.contacts c
    JOIN public.profiles p ON p.id = c.assigned_to
    WHERE c.id = _contact_id AND p.user_id = _user_id
  ) OR public.is_admin_or_supervisor(_user_id);
$function$
;

CREATE OR REPLACE FUNCTION public.is_country_allowed(check_country_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.is_country_blocked(check_country_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_countries
    WHERE country_code = UPPER(check_country_code)
  )
$function$
;

CREATE OR REPLACE FUNCTION public.is_instance_paused(p_instance text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.instance_processing_pauses
    WHERE instance_name = p_instance
      AND paused_until > now()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_ip_blocked(check_ip text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_ips
    WHERE ip_address = check_ip
    AND (expires_at IS NULL OR expires_at > now())
  )
$function$
;

CREATE OR REPLACE FUNCTION public.is_ip_whitelisted(check_ip text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.ip_whitelist
    WHERE ip_address = check_ip
  )
$function$
;

CREATE OR REPLACE FUNCTION public.is_manager_or_above(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('dev', 'admin', 'manager')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_team_conversation_member(_user_id uuid, _conversation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.team_conversation_members tcm
    JOIN public.profiles p ON p.id = tcm.profile_id
    WHERE tcm.conversation_id = _conversation_id
      AND p.user_id = _user_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_within_business_hours(connection_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.log_assignment_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.log_audit_event(p_action text, p_entity_type text DEFAULT NULL::text, p_entity_id text DEFAULT NULL::text, p_details jsonb DEFAULT NULL::jsonb, p_user_agent text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.mark_pause_investigated(p_pause_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS instance_processing_pauses
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.instance_processing_pauses;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.instance_processing_pauses
     SET investigated_at = now(),
         investigated_by = auth.uid(),
         investigation_notes = COALESCE(NULLIF(trim(p_notes), ''), investigation_notes)
   WHERE id = p_pause_id
   RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'pause_not_found';
  END IF;

  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mask_channel_credentials()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- This is a SELECT trigger workaround - credentials masking is handled via the safe view
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mask_cpf(cpf text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE
    WHEN cpf IS NULL THEN NULL
    ELSE '***.' || substring(cpf, 5, 3) || '.***-**'
  END
$function$
;

CREATE OR REPLACE FUNCTION public.mask_email(email text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE
    WHEN email IS NULL OR position('@' IN email) < 2 THEN email
    ELSE
      left(email, 1) ||
      repeat('*', greatest(0, position('@' IN email) - 2)) ||
      substring(email FROM position('@' IN email))
  END
$function$
;

CREATE OR REPLACE FUNCTION public.mask_phone(phone text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE
    WHEN phone IS NULL OR length(phone) < 4 THEN phone
    ELSE
      -- Show first 2 + last 4 digits, mask middle
      left(phone, 2) || repeat('*', greatest(0, length(phone) - 6)) || right(phone, 4)
  END
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_contact_phone()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.phone IS NOT NULL THEN
    NEW.phone := regexp_replace(NEW.phone, '[^0-9]', '', 'g');
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_phone_for_unique(phone text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE
    WHEN phone IS NULL THEN NULL
    ELSE (
      -- Strip non-digits
      regexp_replace(
        -- Remove country code 55
        CASE
          WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^55\d{10,11}$'
          THEN right(regexp_replace(phone, '[^0-9]', '', 'g'), -2)
          ELSE regexp_replace(phone, '[^0-9]', '', 'g')
        END,
        '[^0-9]', '', 'g'
      )
    )
  END
$function$
;

CREATE OR REPLACE FUNCTION public.notify_sicoob_on_reply()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.pause_instance(p_instance text, p_reason text, p_minutes integer DEFAULT 15, p_trigger_count integer DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  IF p_minutes <= 0 OR p_minutes > 1440 THEN
    RAISE EXCEPTION 'p_minutes must be between 1 and 1440';
  END IF;

  INSERT INTO public.instance_processing_pauses (
    instance_name, paused_until, reason, trigger_count, paused_by, auto_paused
  )
  VALUES (
    p_instance,
    now() + (p_minutes || ' minutes')::interval,
    COALESCE(NULLIF(trim(p_reason), ''), 'manual_pause'),
    GREATEST(0, COALESCE(p_trigger_count, 0)),
    auth.uid(),
    false
  )
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'instance_paused',
    'instance_processing_pauses',
    v_id::text,
    jsonb_build_object(
      'instance', p_instance,
      'minutes', p_minutes,
      'reason', p_reason,
      'trigger_count', p_trigger_count
    )
  );

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.purge_old_deleted_contacts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  -- Only purge contacts merged or deleted > 30 days ago
  DELETE FROM public.contacts
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - interval '30 days';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rate_limit_reset_requests()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.reassign_absent_agents(inactive_minutes integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.reassign_overloaded_agents()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.reassign_overloaded_agents(p_max_conversations integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN RETURN jsonb_build_object('reassigned', 0, 'message', 'No overloaded agents found'); END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_failed_login(p_email text, p_ip_address text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS TABLE(is_locked boolean, locked_until timestamp with time zone, attempts integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.restore_contact(p_contact_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only managers/admins can restore
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'manager')
  ) THEN
    RAISE EXCEPTION 'Permission denied: only managers can restore contacts';
  END IF;

  UPDATE public.contacts
  SET
    deleted_at     = NULL,
    deleted_by     = NULL,
    deleted_reason = NULL,
    updated_at     = now()
  WHERE id = p_contact_id
    AND deleted_at IS NOT NULL
    AND deleted_at >= now() - interval '30 days'
    AND workspace_id = (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact % not found, not deleted, or outside 30-day recovery window', p_contact_id;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_check_and_trigger_gmail_revalidation()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_last_val TIMESTAMP WITH TIME ZONE;
    v_status TEXT;
    v_job_id UUID;
BEGIN
    SELECT last_validation, status INTO v_last_val, v_status 
    FROM public.gmail_health_summary 
    WHERE id = 'current';

    -- Trigger if degraded/error OR if last validation was more than 30 minutes ago
    IF v_status IN ('degraded', 'error') OR v_last_val < now() - interval '30 minutes' OR v_last_val IS NULL THEN
        -- Check if there's already a pending job to avoid duplicates
        IF NOT EXISTS (SELECT 1 FROM public.gmail_revalidation_jobs WHERE status = 'pending' AND requested_at > now() - interval '5 minutes') THEN
            INSERT INTO public.gmail_revalidation_jobs (status, requested_at)
            VALUES ('pending', now())
            RETURNING id INTO v_job_id;
            
            RETURN jsonb_build_object('triggered', true, 'job_id', v_job_id, 'reason', 'Threshold met or stale data');
        END IF;
    END IF;

    RETURN jsonb_build_object('triggered', false, 'reason', 'System healthy and data fresh');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_disable_service_channel(p_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS service_channels
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.service_channels;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  UPDATE public.service_channels SET
    status = 'disabled',
    disabled_at = now(),
    disabled_reason = NULLIF(trim(COALESCE(p_reason,'')), '')
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'channel not found'; END IF;

  -- Marca conexão whatsapp como desconectada (se houver)
  IF v_row.whatsapp_connection_id IS NOT NULL THEN
    UPDATE public.whatsapp_connections
       SET status = 'disconnected', updated_at = now()
     WHERE id = v_row.whatsapp_connection_id;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'service_channel_disabled', 'service_channels', p_id::text,
          jsonb_build_object('reason', p_reason, 'wpp_connection', v_row.whatsapp_connection_id));

  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_dispatch_error_stats(p_hours integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hours INTEGER;
  v_total BIGINT;
  v_by_agent JSONB;
  v_by_instance JSONB;
  v_by_code JSONB;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  v_hours := GREATEST(1, LEAST(COALESCE(p_hours, 24), 720));

  SELECT COUNT(*) INTO v_total
  FROM public.dispatch_error_logs
  WHERE occurred_at > now() - (v_hours || ' hours')::interval;

  SELECT COALESCE(jsonb_agg(t.*), '[]'::jsonb) INTO v_by_agent FROM (
    SELECT COALESCE(agent_email, 'sem-agente') AS agent, COUNT(*)::INT AS total
    FROM public.dispatch_error_logs
    WHERE occurred_at > now() - (v_hours || ' hours')::interval
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 20
  ) t;

  SELECT COALESCE(jsonb_agg(t.*), '[]'::jsonb) INTO v_by_instance FROM (
    SELECT instance_name AS instance, COUNT(*)::INT AS total
    FROM public.dispatch_error_logs
    WHERE occurred_at > now() - (v_hours || ' hours')::interval
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 20
  ) t;

  SELECT COALESCE(jsonb_agg(t.*), '[]'::jsonb) INTO v_by_code FROM (
    SELECT COALESCE(error_code, 'unknown') AS code, COUNT(*)::INT AS total
    FROM public.dispatch_error_logs
    WHERE occurred_at > now() - (v_hours || ' hours')::interval
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 20
  ) t;

  RETURN jsonb_build_object(
    'window_hours', v_hours,
    'total', COALESCE(v_total, 0),
    'by_agent', v_by_agent,
    'by_instance', v_by_instance,
    'by_error_code', v_by_code
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_dlq_abandon(p_id uuid, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated int;
  v_reason text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  v_reason := NULLIF(TRIM(COALESCE(p_reason, '')), '');

  UPDATE public.failed_messages
     SET status = 'abandoned',
         error_message = COALESCE(error_message, '') ||
           ' [ABANDONED: ' || COALESCE(v_reason, 'no reason given') || ']',
         updated_at = now()
   WHERE id = p_id
     AND status <> 'abandoned';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'dlq_abandon',
      'failed_messages',
      p_id::text,
      jsonb_build_object('reason', v_reason)
    );
  END IF;

  RETURN v_updated > 0;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_dlq_bulk_abandon(p_ids uuid[], p_reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated int;
  v_reason text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  IF array_length(p_ids, 1) > 500 THEN
    RAISE EXCEPTION 'Bulk operation limited to 500 rows per call';
  END IF;

  v_reason := NULLIF(TRIM(COALESCE(p_reason, '')), '');

  UPDATE public.failed_messages
     SET status = 'abandoned',
         error_message = COALESCE(error_message, '') ||
           ' [ABANDONED: ' || COALESCE(v_reason, 'bulk') || ']',
         updated_at = now()
   WHERE id = ANY(p_ids)
     AND status <> 'abandoned';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'dlq_bulk_abandon',
      'failed_messages',
      NULL,
      jsonb_build_object('reason', v_reason, 'requested', array_length(p_ids, 1), 'updated', v_updated)
    );
  END IF;

  RETURN v_updated;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_dlq_list_audit(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_action text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, action text, entity_id text, details jsonb, created_at timestamp with time zone, user_id uuid, user_name text, user_email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.action,
    a.entity_id,
    a.details,
    a.created_at,
    a.user_id,
    p.name AS user_name,
    p.email AS user_email
  FROM public.audit_logs a
  LEFT JOIN public.profiles p ON p.id = a.user_id
  WHERE a.entity_type = 'failed_messages'
    AND (
      p_action IS NULL
      OR a.action = p_action
      OR (p_action = 'all' AND a.action LIKE 'dlq_%')
    )
    AND a.action LIKE 'dlq_%'
  ORDER BY a.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_dlq_log_item_action(p_action text, p_ids uuid[], p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_action text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  v_action := CASE p_action
    WHEN 'retry'        THEN 'dlq_retry_now'
    WHEN 'abandon'      THEN 'dlq_abandon'
    WHEN 'bulk_retry'   THEN 'dlq_bulk_retry'
    WHEN 'bulk_abandon' THEN 'dlq_bulk_abandon'
    ELSE NULL
  END;

  IF v_action IS NULL THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    v_action,
    'failed_messages',
    CASE WHEN array_length(p_ids, 1) = 1 THEN p_ids[1]::text ELSE NULL END,
    jsonb_build_object(
      'ids', to_jsonb(p_ids),
      'count', array_length(p_ids, 1),
      'reason', p_reason,
      'performed_at', now()
    )
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_dlq_log_reprocess_result(p_processed integer DEFAULT 0, p_succeeded integer DEFAULT 0, p_failed integer DEFAULT 0, p_abandoned integer DEFAULT 0, p_message text DEFAULT NULL::text, p_source text DEFAULT 'panel'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'dlq_reprocess_result',
    'failed_messages',
    NULL,
    jsonb_build_object(
      'source', COALESCE(NULLIF(TRIM(p_source), ''), 'panel'),
      'processed', GREATEST(COALESCE(p_processed, 0), 0),
      'succeeded', GREATEST(COALESCE(p_succeeded, 0), 0),
      'failed',    GREATEST(COALESCE(p_failed, 0), 0),
      'abandoned', GREATEST(COALESCE(p_abandoned, 0), 0),
      'message',   p_message,
      'finished_at', now()
    )
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_dlq_log_reprocess_trigger(p_source text DEFAULT 'panel'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'dlq_reprocess_trigger',
    'failed_messages',
    NULL,
    jsonb_build_object(
      'source', COALESCE(NULLIF(TRIM(p_source), ''), 'panel'),
      'triggered_at', now()
    )
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_dlq_retry_now(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  UPDATE public.failed_messages
     SET status = 'pending',
         next_attempt_at = now(),
         updated_at = now()
   WHERE id = p_id
     AND status IN ('pending','retrying','failed','abandoned');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'dlq_retry_now',
      'failed_messages',
      p_id::text,
      jsonb_build_object('forced_at', now())
    );
  END IF;

  RETURN v_updated > 0;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_dlq_stats()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT jsonb_build_object('pending', (SELECT count(*) FROM failed_messages WHERE status='pending'), 'retrying', (SELECT count(*) FROM failed_messages WHERE status='retrying'), 'failed', (SELECT count(*) FROM failed_messages WHERE status='failed'), 'total', (SELECT count(*) FROM failed_messages));
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_enqueue_reprocess(p_target_kind text, p_target_id uuid, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key TEXT;
  v_id UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  v_key := encode(digest(
    p_target_kind || ':' || p_target_id::text || ':' || p_action || ':' ||
    COALESCE(auth.uid()::text, 'system') || ':' ||
    to_char(date_trunc('hour', now()), 'YYYY-MM-DD HH24'),
    'sha256'
  ), 'hex');

  INSERT INTO public.reprocess_jobs (
    idempotency_key, target_kind, target_id, action, requested_by, reason
  )
  VALUES (v_key, p_target_kind, p_target_id, p_action, auth.uid(), p_reason)
  ON CONFLICT (idempotency_key) DO UPDATE
    SET reason = COALESCE(EXCLUDED.reason, reprocess_jobs.reason),
        updated_at = now()
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'reprocess_enqueued',
    'reprocess_jobs',
    v_id::text,
    jsonb_build_object(
      'target_kind', p_target_kind,
      'target_id', p_target_id,
      'action', p_action,
      'reason', p_reason
    )
  );

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_evolution_fallback_stats(p_hours integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hours integer;
  v_total bigint;
  v_total_7d bigint;
  v_total_1h bigint;
  v_last_event timestamptz;
  v_first_event timestamptz;
  v_by_action jsonb;
  v_by_reason jsonb;
  v_by_instance jsonb;
  v_recent jsonb;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  v_hours := GREATEST(1, LEAST(COALESCE(p_hours, 24), 720));

  SELECT COUNT(*), MIN(ts), MAX(ts)
    INTO v_total, v_first_event, v_last_event
    FROM public.evolution_fallback_events
   WHERE ts > now() - (v_hours || ' hours')::interval;

  SELECT COUNT(*) INTO v_total_7d
    FROM public.evolution_fallback_events
   WHERE ts > now() - interval '7 days';

  SELECT COUNT(*) INTO v_total_1h
    FROM public.evolution_fallback_events
   WHERE ts > now() - interval '1 hour';

  SELECT COALESCE(jsonb_agg(t.*), '[]'::jsonb) INTO v_by_action FROM (
    SELECT action, COUNT(*)::int AS count
      FROM public.evolution_fallback_events
     WHERE ts > now() - (v_hours || ' hours')::interval
     GROUP BY action
     ORDER BY COUNT(*) DESC
  ) t;

  SELECT COALESCE(jsonb_agg(t.*), '[]'::jsonb) INTO v_by_reason FROM (
    SELECT reason, COUNT(*)::int AS count
      FROM public.evolution_fallback_events
     WHERE ts > now() - (v_hours || ' hours')::interval
     GROUP BY reason
     ORDER BY COUNT(*) DESC
  ) t;

  SELECT COALESCE(jsonb_agg(t.*), '[]'::jsonb) INTO v_by_instance FROM (
    SELECT COALESCE(instance, '(sem instância)') AS instance, COUNT(*)::int AS count
      FROM public.evolution_fallback_events
     WHERE ts > now() - (v_hours || ' hours')::interval
     GROUP BY instance
     ORDER BY COUNT(*) DESC
     LIMIT 10
  ) t;

  SELECT COALESCE(jsonb_agg(t.* ORDER BY t.ts DESC), '[]'::jsonb) INTO v_recent FROM (
    SELECT ts, action, instance, status, reason, mode, fallback_target, primary_ms
      FROM public.evolution_fallback_events
     WHERE ts > now() - (v_hours || ' hours')::interval
     ORDER BY ts DESC
     LIMIT 25
  ) t;

  RETURN jsonb_build_object(
    'window_hours', v_hours,
    'total', COALESCE(v_total, 0),
    'total_last_hour', COALESCE(v_total_1h, 0),
    'total_last_7d', COALESCE(v_total_7d, 0),
    'first_event_at', v_first_event,
    'last_event_at', v_last_event,
    'by_action', v_by_action,
    'by_reason', v_by_reason,
    'by_instance', v_by_instance,
    'recent', v_recent
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_active_integration_profile()
 RETURNS integration_profiles
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.integration_profiles WHERE is_active = true LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_gmail_health_summary(p_window_minutes integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_total_calls INTEGER;
    v_failure_count INTEGER;
    v_current_status TEXT;
    v_last_validation TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get count of failures in the window
    SELECT COUNT(*) INTO v_failure_count
    FROM public.gmail_health_logs
    WHERE is_failure = true
      AND timestamp > now() - (p_window_minutes || ' minutes')::interval;

    -- Get last validation timestamp
    SELECT MAX(timestamp) INTO v_last_validation
    FROM public.gmail_health_logs
    WHERE operation = 'validation';

    -- Simple threshold logic
    IF v_failure_count > 10 THEN
        v_current_status := 'error';
    ELSIF v_failure_count > 0 THEN
        v_current_status := 'degraded';
    ELSE
        v_current_status := 'healthy';
    END IF;

    RETURN jsonb_build_object(
        'status', v_current_status,
        'failure_count_window', v_failure_count,
        'last_validation', v_last_validation,
        'window_minutes', p_window_minutes
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_gmail_health_summary()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT jsonb_build_object('total_accounts', (SELECT count(*) FROM gmail_accounts), 'active', (SELECT count(*) FROM gmail_accounts WHERE is_active=true), 'error', (SELECT count(*) FROM gmail_accounts WHERE sync_status='error'));
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_whatsapp_mode()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT value FROM public.global_settings WHERE key = 'whatsapp_mode' LIMIT 1),
    'unofficial'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_instance_auth_event_summary(p_hours integer DEFAULT 24, p_instance text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hours integer;
  v_total bigint;
  v_invalid bigint;
  v_401 bigint;
  v_403 bigint;
  v_top jsonb;
  v_first timestamptz;
  v_last timestamptz;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  v_hours := GREATEST(1, LEAST(COALESCE(p_hours, 24), 168));

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE reason = 'invalid_signature'),
    COUNT(*) FILTER (WHERE reason = 'auth_401'),
    COUNT(*) FILTER (WHERE reason = 'auth_403'),
    MIN(created_at),
    MAX(created_at)
  INTO v_total, v_invalid, v_401, v_403, v_first, v_last
  FROM public.instance_auth_events
  WHERE created_at > now() - (v_hours || ' hours')::interval
    AND (p_instance IS NULL OR instance_name = p_instance);

  SELECT COALESCE(jsonb_agg(t.*), '[]'::jsonb) INTO v_top FROM (
    SELECT
      instance_name,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE reason = 'invalid_signature')::int AS invalid_signature,
      COUNT(*) FILTER (WHERE reason = 'auth_401')::int AS auth_401,
      COUNT(*) FILTER (WHERE reason = 'auth_403')::int AS auth_403
    FROM public.instance_auth_events
    WHERE created_at > now() - (v_hours || ' hours')::interval
      AND (p_instance IS NULL OR instance_name = p_instance)
    GROUP BY instance_name
    ORDER BY COUNT(*) DESC
    LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'window_hours', v_hours,
    'total', COALESCE(v_total, 0),
    'invalid_signature', COALESCE(v_invalid, 0),
    'auth_401', COALESCE(v_401, 0),
    'auth_403', COALESCE(v_403, 0),
    'first_event_at', v_first,
    'last_event_at', v_last,
    'top_instances', v_top
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_instance_auth_event_trend(p_hours integer DEFAULT 24, p_instance text DEFAULT NULL::text)
 RETURNS TABLE(bucket timestamp with time zone, instance_name text, invalid_signature integer, auth_401 integer, auth_403 integer, total integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hours integer;
  v_bucket_minutes integer;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  v_hours := GREATEST(1, LEAST(COALESCE(p_hours, 24), 168));
  v_bucket_minutes := CASE
    WHEN v_hours <= 24 THEN 10
    WHEN v_hours <= 72 THEN 30
    ELSE 60
  END;

  RETURN QUERY
  SELECT
    date_bin((v_bucket_minutes || ' minutes')::interval, e.created_at, TIMESTAMPTZ '2000-01-01') AS bucket,
    e.instance_name,
    COUNT(*) FILTER (WHERE e.reason = 'invalid_signature')::integer AS invalid_signature,
    COUNT(*) FILTER (WHERE e.reason = 'auth_401')::integer AS auth_401,
    COUNT(*) FILTER (WHERE e.reason = 'auth_403')::integer AS auth_403,
    COUNT(*)::integer AS total
  FROM public.instance_auth_events e
  WHERE e.created_at > now() - (v_hours || ' hours')::interval
    AND (p_instance IS NULL OR e.instance_name = p_instance)
  GROUP BY 1, 2
  ORDER BY 1 ASC, 2 ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_link_channel_queue(p_channel_id uuid, p_queue_id uuid, p_priority integer DEFAULT 0, p_is_active boolean DEFAULT true)
 RETURNS channel_queues
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.channel_queues;
BEGIN
  IF NOT is_admin_or_supervisor(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.channel_queues(channel_id, queue_id, priority, is_active, created_by)
  VALUES (p_channel_id, p_queue_id, COALESCE(p_priority,0), COALESCE(p_is_active,true), auth.uid())
  ON CONFLICT (channel_id, queue_id) DO UPDATE
    SET priority=EXCLUDED.priority, is_active=EXCLUDED.is_active, updated_at=now()
  RETURNING * INTO v_row;
  RETURN v_row;
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_list_channel_queues(p_channel_id uuid)
 RETURNS TABLE(queue_id uuid, name text, status text, priority integer, is_default boolean, is_active boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT q.id, q.name, q.status,
         COALESCE(cq.priority, 0),
         (sc.default_queue_id = q.id),
         COALESCE(cq.is_active, true)
  FROM public.service_channels sc
  LEFT JOIN public.channel_queues cq ON cq.channel_id = sc.id
  LEFT JOIN public.queues q
         ON q.id = cq.queue_id OR q.id = sc.default_queue_id
  WHERE sc.id = p_channel_id AND q.id IS NOT NULL
  ORDER BY (sc.default_queue_id = q.id) DESC, COALESCE(cq.priority,0) DESC, q.name;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_list_dispatch_error_logs(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_instance text DEFAULT NULL::text, p_agent text DEFAULT NULL::text, p_error_code text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, failed_message_id uuid, instance_name text, remote_jid text, channel_type text, agent_email text, agent_user_id uuid, error_code text, error_message text, http_status integer, retry_count integer, payload jsonb, context jsonb, occurred_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit INTEGER;
  v_search TEXT;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
  v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');

  RETURN QUERY
  WITH filtered AS (
    SELECT d.*
    FROM public.dispatch_error_logs d
    WHERE (p_from IS NULL OR d.occurred_at >= p_from)
      AND (p_to IS NULL OR d.occurred_at <= p_to)
      AND (p_instance IS NULL OR d.instance_name = p_instance)
      AND (p_agent IS NULL OR d.agent_email = p_agent)
      AND (p_error_code IS NULL OR d.error_code = p_error_code)
      AND (
        v_search IS NULL OR (
          d.remote_jid ILIKE '%' || v_search || '%' OR
          d.error_message ILIKE '%' || v_search || '%' OR
          d.error_code ILIKE '%' || v_search || '%'
        )
      )
  ), counted AS (
    SELECT COUNT(*)::BIGINT AS total FROM filtered
  )
  SELECT
    f.id, f.failed_message_id, f.instance_name, f.remote_jid,
    f.channel_type, f.agent_email, f.agent_user_id,
    f.error_code, f.error_message, f.http_status, f.retry_count,
    f.payload, f.context, f.occurred_at,
    c.total
  FROM filtered f
  CROSS JOIN counted c
  ORDER BY f.occurred_at DESC
  LIMIT v_limit
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_list_eligible_agents(p_queue_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, department_id uuid, max_chats integer, active_chats bigint, is_active boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH q AS (SELECT department_id, max_per_queue_per_agent FROM public.queues WHERE id = p_queue_id)
  SELECT p.user_id,
         COALESCE(p.name, p.email),
         p.department_id,
         COALESCE(p.max_chats, 5),
         (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = p.user_id),
         COALESCE(p.is_active, true)
  FROM public.profiles p, q
  WHERE (q.department_id IS NULL OR p.department_id = q.department_id)
    AND COALESCE(p.is_active, true) = true
    AND p.role IN ('agent','supervisor','admin');
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_list_failed_messages(p_status text[] DEFAULT NULL::text[], p_instance text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, instance_name text, remote_jid text, payload jsonb, error_code text, error_message text, http_status integer, retry_count integer, max_retries integer, status text, last_attempt_at timestamp with time zone, next_attempt_at timestamp with time zone, succeeded_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit int;
  v_search text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');

  RETURN QUERY
  WITH filtered AS (
    SELECT fm.*
    FROM public.failed_messages fm
    WHERE (p_status IS NULL OR fm.status = ANY(p_status))
      AND (p_instance IS NULL OR fm.instance_name = p_instance)
      AND (p_from IS NULL OR fm.created_at >= p_from)
      AND (p_to IS NULL OR fm.created_at <= p_to)
      AND (
        v_search IS NULL OR (
          fm.remote_jid ILIKE '%' || v_search || '%' OR
          fm.error_message ILIKE '%' || v_search || '%' OR
          fm.error_code ILIKE '%' || v_search || '%'
        )
      )
  ), counted AS (
    SELECT COUNT(*)::bigint AS total FROM filtered
  )
  SELECT
    f.id, f.instance_name, f.remote_jid, f.payload, f.error_code, f.error_message,
    f.http_status, f.retry_count, f.max_retries, f.status,
    f.last_attempt_at, f.next_attempt_at, f.succeeded_at, f.created_at, f.updated_at,
    c.total
  FROM filtered f
  CROSS JOIN counted c
  ORDER BY f.created_at DESC
  LIMIT v_limit
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_list_failed_messages(p_status text DEFAULT NULL::text, p_instance text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, remote_jid text, instance_name text, status text, retry_count integer, max_retries integer, http_status integer, error_code text, error_message text, payload jsonb, next_attempt_at timestamp with time zone, succeeded_at timestamp with time zone, abandoned_at timestamp with time zone, abandon_reason text, created_at timestamp with time zone, updated_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total bigint;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.failed_messages fm
  WHERE
    (p_status IS NULL OR fm.status = p_status)
    AND (p_instance IS NULL OR fm.instance_name = p_instance)
    AND (p_search IS NULL OR fm.remote_jid ILIKE '%' || p_search || '%' OR fm.error_message ILIKE '%' || p_search || '%')
    AND (p_from IS NULL OR fm.created_at >= p_from)
    AND (p_to IS NULL OR fm.created_at <= p_to);

  RETURN QUERY
  SELECT
    fm.id, fm.remote_jid, fm.instance_name, fm.status,
    fm.retry_count, fm.max_retries, fm.http_status, fm.error_code,
    fm.error_message, fm.payload, fm.next_attempt_at,
    fm.succeeded_at, fm.abandoned_at, fm.abandon_reason,
    fm.created_at, fm.updated_at,
    v_total AS total_count
  FROM public.failed_messages fm
  WHERE
    (p_status IS NULL OR fm.status = p_status)
    AND (p_instance IS NULL OR fm.instance_name = p_instance)
    AND (p_search IS NULL OR fm.remote_jid ILIKE '%' || p_search || '%' OR fm.error_message ILIKE '%' || p_search || '%')
    AND (p_from IS NULL OR fm.created_at >= p_from)
    AND (p_to IS NULL OR fm.created_at <= p_to)
  ORDER BY fm.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_list_service_channels(p_status text DEFAULT NULL::text, p_channel_type text DEFAULT NULL::text, p_search text DEFAULT NULL::text)
 RETURNS SETOF service_channels
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  RETURN QUERY
  SELECT * FROM public.service_channels sc
   WHERE (p_status IS NULL OR sc.status = p_status)
     AND (p_channel_type IS NULL OR sc.channel_type = p_channel_type)
     AND (p_search IS NULL OR sc.name ILIKE '%'||p_search||'%' OR sc.display_name ILIKE '%'||p_search||'%')
   ORDER BY sc.is_default DESC, sc.name ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_log_gmail_health(p_status text, p_operation text DEFAULT NULL::text, p_resource text DEFAULT NULL::text, p_request_id text DEFAULT NULL::text, p_error_message text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_is_failure boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.gmail_health_logs (
        status, operation, resource, request_id, error_message, metadata, is_failure
    ) VALUES (
        p_status, p_operation, p_resource, p_request_id, p_error_message, p_metadata, p_is_failure
    ) RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_log_provider_message(p_idempotency_key text, p_provider text, p_instance_name text, p_external_message_id text, p_direction text, p_remote_jid text, p_external_contact_id uuid, p_payload jsonb, p_trace_id text DEFAULT NULL::text, p_thread_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id UUID;
  v_hash TEXT;
BEGIN
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) = 0 THEN
    RAISE EXCEPTION 'idempotency_key required';
  END IF;

  v_hash := encode(digest(p_payload::text, 'sha256'), 'hex');

  INSERT INTO public.provider_message_log (
    idempotency_key, provider, instance_name, external_message_id,
    direction, remote_jid, external_contact_id, payload, payload_hash,
    trace_id, thread_id
  )
  VALUES (
    p_idempotency_key, p_provider, p_instance_name, p_external_message_id,
    p_direction, p_remote_jid, p_external_contact_id, p_payload, v_hash,
    p_trace_id, p_thread_id
  )
  ON CONFLICT (idempotency_key) DO UPDATE
    SET metadata = provider_message_log.metadata || jsonb_build_object(
      'duplicate_attempts',
      COALESCE((provider_message_log.metadata->>'duplicate_attempts')::int, 0) + 1,
      'last_duplicate_at', now()
    )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_migrate_whatsapp_integration()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_evo_count INT := 0;
  v_evo_open  INT := 0;
  v_evo_default RECORD;
  v_cloud_phone TEXT;
  v_cloud_waba  TEXT;
  v_current_mode TEXT;
  v_chosen_provider TEXT;
  v_status TEXT;
  v_notes TEXT;
  v_signals JSONB;
  v_profile_id UUID;
  v_default_instance TEXT;
BEGIN
  -- Sinais Evolution: instâncias registradas localmente
  SELECT COUNT(*) INTO v_evo_count FROM public.whatsapp_connections;
  SELECT COUNT(*) INTO v_evo_open
    FROM public.whatsapp_connections
    WHERE COALESCE(status,'') IN ('open','connected');
  SELECT instance_id, name, phone_number, status
    INTO v_evo_default
    FROM public.whatsapp_connections
    WHERE is_default = true
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;

  -- Sinais Cloud: settings já preenchidos
  SELECT value INTO v_cloud_phone FROM public.global_settings WHERE key = 'whatsapp_cloud_display_phone';
  SELECT value INTO v_cloud_waba  FROM public.global_settings WHERE key = 'whatsapp_cloud_waba_name';

  SELECT value INTO v_current_mode FROM public.global_settings WHERE key = 'whatsapp_mode';

  v_signals := jsonb_build_object(
    'evolution_instances_total', v_evo_count,
    'evolution_instances_open',  v_evo_open,
    'evolution_default_instance', COALESCE(v_evo_default.instance_id, NULL),
    'cloud_display_phone_set',   COALESCE(NULLIF(v_cloud_phone,''), NULL) IS NOT NULL,
    'cloud_waba_name_set',       COALESCE(NULLIF(v_cloud_waba,''),  NULL) IS NOT NULL,
    'previous_mode',             COALESCE(v_current_mode, 'unset')
  );

  -- Heurística: se já há instância Evolution conectada → unofficial.
  -- Se não há nada Evolution mas Cloud está preenchida → official.
  -- Caso contrário mantém o atual (default unofficial).
  IF v_evo_open > 0 OR v_evo_count > 0 THEN
    v_chosen_provider := 'evolution';
  ELSIF COALESCE(NULLIF(v_cloud_phone,''),'') <> '' THEN
    v_chosen_provider := 'cloud';
  ELSE
    v_chosen_provider := CASE WHEN v_current_mode = 'official' THEN 'cloud' ELSE 'evolution' END;
  END IF;

  v_default_instance := COALESCE(v_evo_default.instance_id, 'wpp2');

  -- Garante setting whatsapp_mode coerente
  INSERT INTO public.global_settings(key, value)
  VALUES ('whatsapp_mode', CASE WHEN v_chosen_provider = 'cloud' THEN 'official' ELSE 'unofficial' END)
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now()
    WHERE public.global_settings.value IS DISTINCT FROM EXCLUDED.value;

  -- Status da migração
  IF v_chosen_provider = 'cloud' AND COALESCE(NULLIF(v_cloud_phone,''),'') = '' THEN
    v_status := 'pending_credentials';
    v_notes  := 'Modo oficial selecionado, mas faltam credenciais Meta (phone/WABA).';
  ELSIF v_chosen_provider = 'evolution' AND v_evo_count = 0 THEN
    v_status := 'pending_credentials';
    v_notes  := 'Modo Evolution selecionado, mas nenhuma instância registrada.';
  ELSE
    v_status := 'migrated';
    v_notes  := format('Provider %s ativado a partir dos sinais existentes.', v_chosen_provider);
  END IF;

  -- Desativa qualquer perfil ativo anterior
  UPDATE public.integration_profiles SET is_active = false WHERE is_active = true;

  -- Upsert do perfil ativo do provider escolhido
  SELECT id INTO v_profile_id
    FROM public.integration_profiles
    WHERE provider = v_chosen_provider
    ORDER BY updated_at DESC LIMIT 1;

  IF v_profile_id IS NULL THEN
    INSERT INTO public.integration_profiles
      (provider, is_active, default_instance, display_phone, waba_name,
       detected_signals, migration_status, migration_notes, migrated_at)
    VALUES
      (v_chosen_provider, true,
       CASE WHEN v_chosen_provider='evolution' THEN v_default_instance ELSE NULL END,
       NULLIF(v_cloud_phone,''), NULLIF(v_cloud_waba,''),
       v_signals, v_status, v_notes,
       CASE WHEN v_status = 'migrated' THEN now() ELSE NULL END)
    RETURNING id INTO v_profile_id;
  ELSE
    UPDATE public.integration_profiles
       SET is_active = true,
           default_instance = CASE WHEN v_chosen_provider='evolution' THEN v_default_instance ELSE default_instance END,
           display_phone = COALESCE(NULLIF(v_cloud_phone,''), display_phone),
           waba_name     = COALESCE(NULLIF(v_cloud_waba,''),  waba_name),
           detected_signals = v_signals,
           migration_status = v_status,
           migration_notes  = v_notes,
           migrated_at = CASE WHEN v_status = 'migrated' THEN now() ELSE migrated_at END
     WHERE id = v_profile_id;
  END IF;

  RETURN jsonb_build_object(
    'profile_id', v_profile_id,
    'provider',   v_chosen_provider,
    'mode',       CASE WHEN v_chosen_provider='cloud' THEN 'official' ELSE 'unofficial' END,
    'status',     v_status,
    'notes',      v_notes,
    'signals',    v_signals
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_ops_metrics(p_window_hours integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_since timestamptz := now() - make_interval(hours => GREATEST(p_window_hours, 1));
  v_result jsonb;
BEGIN
  -- Bloqueia agentes
  IF NOT (public.is_admin_or_supervisor(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH
  pml AS (
    SELECT * FROM public.provider_message_log WHERE received_at >= v_since
  ),
  by_channel AS (
    SELECT
      sc.id AS channel_id,
      sc.name AS channel_name,
      sc.channel_type,
      sc.status,
      COUNT(*) FILTER (WHERE p.direction = 'inbound') AS msgs_in,
      COUNT(*) FILTER (WHERE p.direction = 'outbound') AS msgs_out,
      COUNT(*) FILTER (WHERE p.delivery_status IN ('failed','error')) AS msgs_failed
    FROM public.service_channels sc
    LEFT JOIN pml p ON p.instance_name = sc.instance_name
    GROUP BY sc.id, sc.name, sc.channel_type, sc.status
  ),
  by_queue AS (
    SELECT
      q.id AS queue_id,
      q.name AS queue_name,
      q.status AS queue_status,
      COUNT(c.id) FILTER (WHERE c.assigned_to IS NULL) AS waiting,
      COUNT(c.id) FILTER (WHERE c.assigned_to IS NOT NULL) AS in_service,
      AVG(EXTRACT(EPOCH FROM (now() - c.created_at)))
        FILTER (WHERE c.assigned_to IS NULL) AS avg_wait_seconds,
      PERCENTILE_DISC(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (now() - c.created_at)))
        FILTER (WHERE c.assigned_to IS NULL) AS p99_wait_seconds
    FROM public.queues q
    LEFT JOIN public.contacts c ON c.queue_id = q.id
    GROUP BY q.id, q.name, q.status
  ),
  totals AS (
    SELECT
      (SELECT COUNT(*) FROM pml WHERE direction='inbound') AS total_in,
      (SELECT COUNT(*) FROM pml WHERE direction='outbound') AS total_out,
      (SELECT COUNT(*) FROM pml WHERE delivery_status IN ('failed','error')) AS total_failed,
      (SELECT COUNT(*) FROM public.service_channels WHERE status='active') AS active_channels,
      (SELECT COUNT(*) FROM public.queues WHERE status='active') AS active_queues,
      (SELECT COUNT(DISTINCT user_id) FROM public.profiles WHERE status='online') AS online_agents
  )
  SELECT jsonb_build_object(
    'window_hours', p_window_hours,
    'generated_at', now(),
    'totals', (SELECT to_jsonb(t) FROM totals t),
    'by_channel', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.msgs_in DESC) FROM by_channel c), '[]'::jsonb),
    'by_queue', COALESCE((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.waiting DESC) FROM by_queue q), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_pause_queue(p_queue_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS queues
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.queues;
BEGIN
  IF NOT is_admin_or_supervisor(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.queues
     SET status='paused', paused_at=now(), paused_by=auth.uid(), paused_reason=p_reason, is_active=false
   WHERE id=p_queue_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'queue not found'; END IF;
  RETURN v_row;
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_pause_service_channel(p_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS service_channels
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.service_channels;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  UPDATE public.service_channels SET
    status = 'paused',
    paused_at = now(),
    paused_reason = NULLIF(trim(COALESCE(p_reason,'')), '')
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'channel not found'; END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'service_channel_paused', 'service_channels', p_id::text,
          jsonb_build_object('reason', p_reason));

  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_pick_next_agent(p_queue_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_algo text;
  v_last uuid;
  v_pick uuid;
BEGIN
  SELECT distribution_algorithm, last_assigned_user_id
    INTO v_algo, v_last
    FROM public.queues
   WHERE id = p_queue_id AND status = 'active';

  IF v_algo IS NULL OR v_algo = 'manual_pull' THEN
    RETURN NULL;
  END IF;

  IF v_algo = 'round_robin' THEN
    -- Próximo elegível depois do último atribuído (ordem determinística por user_id),
    -- com fallback para o primeiro elegível se já passou do fim da lista.
    WITH cand AS (
      SELECT user_id, active_chats, max_chats
        FROM public.rpc_list_eligible_agents(p_queue_id)
       WHERE active_chats < max_chats
       ORDER BY user_id
    )
    SELECT user_id INTO v_pick FROM cand
     WHERE v_last IS NULL OR user_id > v_last
     ORDER BY user_id
     LIMIT 1;

    IF v_pick IS NULL THEN
      SELECT user_id INTO v_pick FROM (
        SELECT user_id, active_chats, max_chats
          FROM public.rpc_list_eligible_agents(p_queue_id)
         WHERE active_chats < max_chats
         ORDER BY user_id
         LIMIT 1
      ) s;
    END IF;
  ELSIF v_algo = 'longest_idle' THEN
    SELECT a.user_id INTO v_pick
      FROM public.rpc_list_eligible_agents(p_queue_id) a
      LEFT JOIN public.profiles p ON p.user_id = a.user_id
     WHERE a.active_chats < a.max_chats
     ORDER BY p.last_active_at NULLS FIRST, a.active_chats ASC, random()
     LIMIT 1;
  ELSE
    -- least_busy (default)
    SELECT user_id INTO v_pick
      FROM public.rpc_list_eligible_agents(p_queue_id)
     WHERE active_chats < max_chats
     ORDER BY active_chats ASC, random()
     LIMIT 1;
  END IF;

  IF v_pick IS NOT NULL THEN
    UPDATE public.queues
       SET last_assigned_user_id = v_pick,
           last_assigned_at = now()
     WHERE id = p_queue_id;
  END IF;

  RETURN v_pick;
END
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_provider_panel()
 RETURNS TABLE(provider_id uuid, name text, provider_type provider_type, base_url text, is_active boolean, priority integer, status text, last_ping_at timestamp with time zone, last_ping_latency_ms integer, last_error text, open_sessions bigint, events_24h bigint, errors_24h bigint, routes_primary bigint, routes_fallback bigint, routes_active bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.name, p.provider_type, p.base_url, p.is_active, p.priority,
    p.status, p.last_ping_at, p.last_ping_latency_ms, p.last_error,
    COALESCE((SELECT COUNT(*) FROM provider_sessions s
              WHERE s.provider_id = p.id AND s.ended_at IS NULL), 0),
    COALESCE((SELECT COUNT(*) FROM provider_session_logs l
              WHERE l.provider_id = p.id AND l.created_at > now() - interval '24 hours'), 0),
    COALESCE((SELECT COUNT(*) FROM provider_session_logs l
              WHERE l.provider_id = p.id AND l.level = 'error'
                AND l.created_at > now() - interval '24 hours'), 0),
    COALESCE((SELECT COUNT(*) FROM channel_provider_routes r WHERE r.primary_provider_id = p.id), 0),
    COALESCE((SELECT COUNT(*) FROM channel_provider_routes r WHERE r.fallback_provider_id = p.id), 0),
    COALESCE((SELECT COUNT(*) FROM channel_provider_routes r WHERE r.current_provider_id = p.id), 0)
  FROM provider_configs p
  ORDER BY p.priority ASC, p.name ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_provider_session_timeline(p_provider_id uuid DEFAULT NULL::uuid, p_session_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100)
 RETURNS TABLE(log_id uuid, session_id uuid, provider_id uuid, provider_name text, level text, event text, message text, latency_ms integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  RETURN QUERY
  SELECT l.id, l.session_id, l.provider_id, p.name,
         l.level, l.event, l.message, l.latency_ms, l.created_at
  FROM provider_session_logs l
  JOIN provider_configs p ON p.id = l.provider_id
  WHERE (p_provider_id IS NULL OR l.provider_id = p_provider_id)
    AND (p_session_id IS NULL OR l.session_id = p_session_id)
  ORDER BY l.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 500));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_publish_outbox(p_aggregate_type text, p_aggregate_id uuid, p_event_type text, p_payload jsonb, p_idempotency_key text DEFAULT NULL::text, p_trace_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key TEXT;
  v_id UUID;
BEGIN
  v_key := COALESCE(
    p_idempotency_key,
    encode(digest(
      p_aggregate_type || ':' || p_aggregate_id::text || ':' || p_event_type || ':' ||
      encode(digest(p_payload::text, 'sha256'), 'hex'),
      'sha256'
    ), 'hex')
  );

  INSERT INTO public.outbox_events (
    aggregate_type, aggregate_id, event_type, payload, idempotency_key, trace_id
  )
  VALUES (p_aggregate_type, p_aggregate_id, p_event_type, p_payload, v_key, p_trace_id)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_purge_channel_sticky(p_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_wpp_id UUID;
  v_count INTEGER := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  SELECT whatsapp_connection_id INTO v_wpp_id
    FROM public.service_channels WHERE id = p_id;

  IF v_wpp_id IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM public.sticky_assignments
   WHERE channel_connection_id = v_wpp_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'service_channel_sticky_purged', 'service_channels', p_id::text,
          jsonb_build_object('purged_count', v_count));

  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_queue_rebalance_candidates(p_limit integer DEFAULT 50)
 RETURNS TABLE(contact_id uuid, queue_id uuid, reason text, waiting_minutes numeric, sla_priority text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.queue_id,
    CASE
      WHEN c.assigned_to IS NULL THEN 'unassigned'
      ELSE 'sla_breached'
    END AS reason,
    EXTRACT(EPOCH FROM (now() - c.created_at))/60::numeric AS waiting_minutes,
    q.sla_priority
  FROM public.contacts c
  JOIN public.queues q ON q.id = c.queue_id
  WHERE q.is_active = true
    AND q.auto_rebalance_enabled = true
    AND (
      c.assigned_to IS NULL
      OR EXTRACT(EPOCH FROM (now() - c.created_at))/60 > q.max_wait_time_minutes
    )
  ORDER BY
    CASE q.sla_priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    q.routing_weight DESC,
    c.created_at ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_queue_sla_panel(p_skill_name text DEFAULT NULL::text, p_channel_type text DEFAULT NULL::text, p_sla_status text DEFAULT NULL::text)
 RETURNS TABLE(queue_id uuid, queue_name text, color text, sla_priority text, routing_weight integer, auto_rebalance_enabled boolean, max_wait_time_minutes integer, active_agents bigint, waiting_count bigint, in_progress_count bigint, breached_count bigint, at_risk_count bigint, oldest_wait_minutes numeric, last_routed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  RETURN QUERY
  WITH q AS (
    SELECT q.* FROM public.queues q
    WHERE q.is_active = true
      AND (
        p_skill_name IS NULL OR EXISTS (
          SELECT 1 FROM public.queue_skill_requirements qsr
          WHERE qsr.queue_id = q.id AND qsr.skill_name = p_skill_name
        )
      )
      AND (
        p_channel_type IS NULL OR EXISTS (
          SELECT 1
          FROM public.whatsapp_connection_queues wcq
          JOIN public.channel_connections cc ON cc.whatsapp_connection_id = wcq.whatsapp_connection_id
          WHERE wcq.queue_id = q.id AND cc.channel_type = p_channel_type
        )
      )
  ),
  agents AS (
    SELECT qm.queue_id, COUNT(*) FILTER (WHERE qm.is_active AND p.is_active) AS active_agents
    FROM public.queue_members qm
    JOIN public.profiles p ON p.id = qm.profile_id
    GROUP BY qm.queue_id
  ),
  contacts_agg AS (
    SELECT
      c.queue_id,
      COUNT(*) FILTER (WHERE c.assigned_to IS NULL) AS waiting_count,
      COUNT(*) FILTER (WHERE c.assigned_to IS NOT NULL) AS in_progress_count,
      MAX(EXTRACT(EPOCH FROM (now() - c.created_at))/60)
        FILTER (WHERE c.assigned_to IS NULL) AS oldest_wait_minutes
    FROM public.contacts c
    WHERE c.queue_id IS NOT NULL
    GROUP BY c.queue_id
  ),
  sla_agg AS (
    SELECT
      c.queue_id,
      COUNT(*) FILTER (
        WHERE EXTRACT(EPOCH FROM (now() - c.created_at))/60 > qq.max_wait_time_minutes
      ) AS breached_count,
      COUNT(*) FILTER (
        WHERE EXTRACT(EPOCH FROM (now() - c.created_at))/60
              BETWEEN qq.max_wait_time_minutes * 0.75 AND qq.max_wait_time_minutes
      ) AS at_risk_count
    FROM public.contacts c
    JOIN public.queues qq ON qq.id = c.queue_id
    WHERE c.assigned_to IS NULL
    GROUP BY c.queue_id
  ),
  routing AS (
    SELECT sa.queue_id, MAX(sa.last_assigned_at) AS last_routed_at
    FROM public.sticky_assignments sa
    GROUP BY sa.queue_id
  )
  SELECT
    q.id,
    q.name,
    q.color,
    q.sla_priority,
    q.routing_weight,
    q.auto_rebalance_enabled,
    q.max_wait_time_minutes,
    COALESCE(a.active_agents, 0),
    COALESCE(ca.waiting_count, 0),
    COALESCE(ca.in_progress_count, 0),
    COALESCE(s.breached_count, 0),
    COALESCE(s.at_risk_count, 0),
    COALESCE(ca.oldest_wait_minutes, 0)::numeric,
    r.last_routed_at
  FROM q
  LEFT JOIN agents a ON a.queue_id = q.id
  LEFT JOIN contacts_agg ca ON ca.queue_id = q.id
  LEFT JOIN sla_agg s ON s.queue_id = q.id
  LEFT JOIN routing r ON r.queue_id = q.id
  WHERE
    p_sla_status IS NULL
    OR (p_sla_status = 'on_track'  AND COALESCE(s.breached_count,0) = 0 AND COALESCE(s.at_risk_count,0) = 0)
    OR (p_sla_status = 'at_risk'   AND COALESCE(s.at_risk_count,0) > 0)
    OR (p_sla_status = 'breached'  AND COALESCE(s.breached_count,0) > 0)
  ORDER BY
    CASE q.sla_priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    q.routing_weight DESC,
    COALESCE(s.breached_count,0) DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_reactivate_service_channel(p_id uuid)
 RETURNS service_channels
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.service_channels;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  UPDATE public.service_channels SET
    status = 'active',
    paused_at = NULL,
    paused_reason = NULL,
    disabled_at = NULL,
    disabled_reason = NULL
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'channel not found'; END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'service_channel_reactivated', 'service_channels', p_id::text, '{}'::jsonb);

  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_record_automation_error(p_execution_id uuid, p_error text, p_context jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.automation_executions
  SET status = 'failed',
      error_message = LEFT(COALESCE(p_error, 'unknown error'), 2000),
      error_at = now(),
      trigger_payload = COALESCE(trigger_payload, '{}'::jsonb) || jsonb_build_object('error_context', p_context)
  WHERE id = p_execution_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_register_automation_execution(p_rule_id uuid, p_remote_jid text, p_instance_name text, p_assigned_to uuid, p_trigger_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cooldown INTEGER;
  v_recent_count INTEGER;
  v_id UUID;
BEGIN
  SELECT cooldown_seconds INTO v_cooldown
  FROM public.automation_rules WHERE id = p_rule_id AND is_active = true;
  IF v_cooldown IS NULL THEN RETURN NULL; END IF;

  SELECT COUNT(*) INTO v_recent_count
  FROM public.automation_executions
  WHERE rule_id = p_rule_id
    AND remote_jid = p_remote_jid
    AND created_at > now() - make_interval(secs => v_cooldown);

  IF v_recent_count > 0 THEN RETURN NULL; END IF;

  INSERT INTO public.automation_executions (
    rule_id, remote_jid, instance_name, assigned_to, trigger_payload, status
  ) VALUES (
    p_rule_id, p_remote_jid, p_instance_name, p_assigned_to, p_trigger_payload, 'pending'
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_register_automation_execution(p_rule_id uuid, p_remote_jid text, p_instance_name text, p_assigned_to text DEFAULT NULL::text, p_trigger_payload jsonb DEFAULT '{}'::jsonb, p_channel_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cooldown INT;
  v_last TIMESTAMPTZ;
  v_id UUID;
  v_channel UUID;
  v_department UUID;
  v_snapshot JSONB;
BEGIN
  SELECT cooldown_seconds, channel_id, department_id,
         jsonb_build_object(
           'name', name,
           'description', description,
           'trigger_type', trigger_type,
           'trigger_config', trigger_config,
           'actions', actions,
           'priority', priority,
           'cooldown_seconds', cooldown_seconds,
           'channel_id', channel_id,
           'department_id', department_id,
           'captured_at', now()
         )
    INTO v_cooldown, v_channel, v_department, v_snapshot
  FROM public.automation_rules WHERE id = p_rule_id AND is_active = true;

  IF v_cooldown IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT MAX(created_at) INTO v_last
  FROM public.automation_executions
  WHERE rule_id = p_rule_id AND remote_jid = p_remote_jid;

  IF v_last IS NOT NULL AND v_last > now() - make_interval(secs => v_cooldown) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.automation_executions (
    rule_id, remote_jid, instance_name, assigned_to, trigger_payload,
    channel_id, department_id, rule_snapshot, status
  ) VALUES (
    p_rule_id, p_remote_jid, p_instance_name, p_assigned_to, p_trigger_payload,
    COALESCE(p_channel_id, v_channel),
    COALESCE(p_department_id, v_department),
    v_snapshot,
    'pending'
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_register_webhook_event(p_event_key text, p_instance_name text, p_event_type text, p_payload_hash text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted BOOLEAN;
BEGIN
  IF p_event_key IS NULL OR length(p_event_key) = 0 THEN
    RAISE EXCEPTION 'event_key required';
  END IF;

  INSERT INTO public.webhook_event_dedup (event_key, instance_name, event_type, payload_hash)
  VALUES (p_event_key, p_instance_name, p_event_type, p_payload_hash)
  ON CONFLICT (event_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted > 0;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_resume_queue(p_queue_id uuid)
 RETURNS queues
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.queues;
BEGIN
  IF NOT is_admin_or_supervisor(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.queues
     SET status='active', paused_at=NULL, paused_by=NULL, paused_reason=NULL, is_active=true
   WHERE id=p_queue_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'queue not found'; END IF;
  RETURN v_row;
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_route_inbound_message(p_contact_id uuid, p_channel_id uuid DEFAULT NULL::uuid, p_queue_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sticky public.sticky_assignments;
  v_agent_user_id uuid;
  v_agent_profile_id uuid;
  v_dept_id uuid;
  v_max int;
  v_active int;
  v_online boolean;
  v_picked uuid;
  v_source text := 'algorithm';
BEGIN
  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'contact_id required';
  END IF;

  -- 1) Tenta sticky
  SELECT * INTO v_sticky
    FROM public.sticky_assignments
   WHERE contact_id = p_contact_id
     AND expires_at > now();

  IF FOUND THEN
    SELECT p.user_id,
           COALESCE(p.max_concurrent_chats, 5),
           COALESCE(p.is_online, false),
           p.department_id
      INTO v_agent_user_id, v_max, v_online, v_dept_id
      FROM public.profiles p
     WHERE p.id = v_sticky.agent_profile_id;

    SELECT count(*) INTO v_active
      FROM public.contacts
     WHERE assigned_to = v_agent_user_id
       AND COALESCE(status, 'open') NOT IN ('resolved','closed');

    -- valida: online, com folga, e (sem fila exigida OU mesmo depto da fila)
    IF v_agent_user_id IS NOT NULL
       AND v_online
       AND v_active < v_max
       AND (
         p_queue_id IS NULL
         OR EXISTS (
              SELECT 1 FROM public.queues q
               WHERE q.id = p_queue_id
                 AND (q.department_id IS NULL OR q.department_id = v_dept_id)
                 AND COALESCE(q.status, 'active') = 'active'
            )
       )
    THEN
      v_picked := v_agent_user_id;
      v_source := 'sticky';
    END IF;
  END IF;

  -- 2) Fallback: algoritmo da fila
  IF v_picked IS NULL AND p_queue_id IS NOT NULL THEN
    BEGIN
      SELECT public.rpc_pick_next_agent(p_queue_id) INTO v_picked;
    EXCEPTION WHEN undefined_function THEN
      v_picked := NULL;
    END;
    v_source := 'algorithm';
  END IF;

  IF v_picked IS NULL THEN
    BEGIN
      INSERT INTO public.audit_log(actor_user_id, action, entity_type, entity_id, payload)
      VALUES (NULL, 'route.no_agent', 'contact', p_contact_id,
              jsonb_build_object('channel', p_channel_id, 'queue', p_queue_id));
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
    RETURN jsonb_build_object('assigned', false, 'source', null);
  END IF;

  -- 3) Atribui (dispara trigger de sticky upsert)
  UPDATE public.contacts
     SET assigned_to = v_picked,
         updated_at = now()
   WHERE id = p_contact_id
     AND (assigned_to IS DISTINCT FROM v_picked);

  -- 4) Garante sticky atualizado mesmo se já era o assigned_to
  SELECT id INTO v_agent_profile_id FROM public.profiles WHERE user_id = v_picked LIMIT 1;
  IF v_agent_profile_id IS NOT NULL THEN
    PERFORM public.fn_sticky_upsert(p_contact_id, v_agent_profile_id, p_channel_id, p_queue_id, v_source);
  END IF;

  RETURN jsonb_build_object(
    'assigned', true,
    'agent_user_id', v_picked,
    'source', v_source,
    'channel_id', p_channel_id,
    'queue_id', p_queue_id
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_route_incoming_message(p_contact_id uuid, p_connection_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mode TEXT;
  v_current_assigned UUID;
  v_target_agent UUID;
  v_reason TEXT;
  v_business_open BOOLEAN := TRUE;
BEGIN
  -- Lê estado atual
  SELECT assigned_to INTO v_current_assigned
    FROM public.contacts
   WHERE id = p_contact_id
   LIMIT 1;

  -- Se contato já tem dono, não mexe (princípio "nunca tirar atendimento")
  IF v_current_assigned IS NOT NULL THEN
    RETURN jsonb_build_object(
      'action', 'skipped',
      'reason', 'already_assigned',
      'agent_id', v_current_assigned
    );
  END IF;

  -- Lê modo da conexão
  SELECT routing_mode INTO v_mode
    FROM public.whatsapp_connections
   WHERE id = p_connection_id
   LIMIT 1;

  v_mode := COALESCE(v_mode, 'manual');

  -- Horário comercial (se a função existir e a conexão configurar)
  BEGIN
    v_business_open := public.is_within_business_hours(p_connection_id);
  EXCEPTION WHEN OTHERS THEN
    v_business_open := TRUE;
  END;

  IF NOT v_business_open THEN
    RETURN jsonb_build_object(
      'action', 'unassigned',
      'reason', 'outside_business_hours',
      'mode', v_mode
    );
  END IF;

  -- Modo: manual → não faz nada (Sem dono)
  IF v_mode = 'manual' THEN
    RETURN jsonb_build_object('action', 'unassigned', 'reason', 'manual_mode');
  END IF;

  -- Modo: sticky → último agente conhecido
  IF v_mode = 'sticky' THEN
    SELECT sa.agent_profile_id INTO v_target_agent
      FROM public.sticky_assignments sa
     WHERE sa.contact_id = p_contact_id
       AND (sa.channel_connection_id IS NULL OR sa.channel_connection_id = p_connection_id)
       AND sa.expires_at > now()
     ORDER BY sa.last_assigned_at DESC
     LIMIT 1;

    IF v_target_agent IS NOT NULL THEN
      v_reason := 'sticky_match';
    END IF;
  END IF;

  -- Modo: rules → engine de client_wallet_rules
  IF v_mode = 'rules' AND v_target_agent IS NULL THEN
    SELECT cwr.agent_id INTO v_target_agent
      FROM public.client_wallet_rules cwr
     WHERE cwr.is_active = TRUE
       AND (cwr.whatsapp_connection_id IS NULL OR cwr.whatsapp_connection_id = p_connection_id)
     ORDER BY cwr.priority DESC, cwr.created_at ASC
     LIMIT 1;

    IF v_target_agent IS NOT NULL THEN
      v_reason := 'rule_match';
    END IF;
  END IF;

  -- Modo: round_robin → menor carga no depto da conexão
  IF v_mode = 'round_robin' AND v_target_agent IS NULL THEN
    SELECT p.id INTO v_target_agent
      FROM public.profiles p
     WHERE p.is_active = TRUE
       AND p.role IN ('agent', 'supervisor')
     ORDER BY (
       SELECT COUNT(*) FROM public.contacts c2
        WHERE c2.assigned_to = p.id
     ) ASC, p.created_at ASC
     LIMIT 1;

    IF v_target_agent IS NOT NULL THEN
      v_reason := 'round_robin';
    END IF;
  END IF;

  -- Aplica atribuição (se encontrou candidato)
  IF v_target_agent IS NOT NULL THEN
    UPDATE public.contacts
       SET assigned_to = v_target_agent,
           updated_at = now()
     WHERE id = p_contact_id
       AND assigned_to IS NULL;  -- guard contra race

    -- Registra sticky para próxima
    BEGIN
      PERFORM public.fn_register_sticky_assignment(
        p_contact_id, v_target_agent, p_connection_id, NULL
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- sticky é best-effort
    END;

    RETURN jsonb_build_object(
      'action', 'assigned',
      'agent_id', v_target_agent,
      'reason', v_reason,
      'mode', v_mode
    );
  END IF;

  -- Fallback: nenhum candidato encontrado em modo automático → Sem dono
  RETURN jsonb_build_object(
    'action', 'unassigned',
    'reason', 'no_candidate_fallback',
    'mode', v_mode
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_set_whatsapp_mode(p_mode text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF NOT public.is_admin_or_supervisor(v_uid) THEN
    RAISE EXCEPTION 'forbidden: only admin/supervisor can change whatsapp_mode';
  END IF;

  IF p_mode NOT IN ('official', 'unofficial') THEN
    RAISE EXCEPTION 'invalid mode: % (allowed: official, unofficial)', p_mode;
  END IF;

  INSERT INTO public.global_settings (key, value, updated_by)
  VALUES ('whatsapp_mode', p_mode, v_uid)
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();

  RETURN p_mode;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_system_health_check()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT jsonb_build_object('database','healthy','tables',(SELECT count(*) FROM pg_tables WHERE schemaname='public'),'uptime',now()-pg_postmaster_start_time());
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_unlink_channel_queue(p_channel_id uuid, p_queue_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin_or_supervisor(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.channel_queues WHERE channel_id=p_channel_id AND queue_id=p_queue_id;
  RETURN FOUND;
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_update_gmail_health_state(p_status text, p_failure_count integer, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    INSERT INTO public.gmail_health_summary (id, status, last_validation, failure_count_60m, metadata, updated_at)
    VALUES ('current', p_status, now(), p_failure_count, p_metadata, now())
    ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        last_validation = EXCLUDED.last_validation,
        failure_count_60m = EXCLUDED.failure_count_60m,
        metadata = public.gmail_health_summary.metadata || EXCLUDED.metadata,
        updated_at = now();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_upsert_service_channel(p_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_display_name text DEFAULT NULL::text, p_channel_type text DEFAULT 'whatsapp'::text, p_whatsapp_connection_id uuid DEFAULT NULL::uuid, p_default_queue_id uuid DEFAULT NULL::uuid, p_routing_mode text DEFAULT 'manual'::text, p_sticky_enabled boolean DEFAULT false, p_sticky_ttl_hours integer DEFAULT 24, p_is_default boolean DEFAULT false, p_description text DEFAULT NULL::text, p_icon text DEFAULT NULL::text, p_color text DEFAULT '#3B82F6'::text)
 RETURNS service_channels
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.service_channels;
  v_old public.service_channels;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name is required';
  END IF;

  -- Se este vai ser default, desmarca os outros do mesmo tipo
  IF p_is_default THEN
    UPDATE public.service_channels
       SET is_default = false
     WHERE channel_type = p_channel_type
       AND (p_id IS NULL OR id <> p_id)
       AND is_default = true;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.service_channels (
      name, display_name, channel_type, whatsapp_connection_id,
      default_queue_id, routing_mode, sticky_enabled, sticky_ttl_hours,
      is_default, description, icon, color, created_by
    ) VALUES (
      trim(p_name), p_display_name, p_channel_type, p_whatsapp_connection_id,
      p_default_queue_id, p_routing_mode, p_sticky_enabled, p_sticky_ttl_hours,
      p_is_default, p_description, p_icon, p_color, auth.uid()
    )
    RETURNING * INTO v_row;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'service_channel_created', 'service_channels', v_row.id::text,
            jsonb_build_object('name', v_row.name, 'type', v_row.channel_type));
  ELSE
    SELECT * INTO v_old FROM public.service_channels WHERE id = p_id;
    IF v_old.id IS NULL THEN RAISE EXCEPTION 'channel not found'; END IF;

    UPDATE public.service_channels SET
      name = trim(p_name),
      display_name = p_display_name,
      channel_type = p_channel_type,
      whatsapp_connection_id = p_whatsapp_connection_id,
      default_queue_id = p_default_queue_id,
      routing_mode = p_routing_mode,
      sticky_enabled = p_sticky_enabled,
      sticky_ttl_hours = p_sticky_ttl_hours,
      is_default = p_is_default,
      description = p_description,
      icon = p_icon,
      color = p_color
    WHERE id = p_id
    RETURNING * INTO v_row;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'service_channel_updated', 'service_channels', v_row.id::text,
            jsonb_build_object(
              'before', jsonb_build_object('name', v_old.name, 'queue', v_old.default_queue_id, 'sticky', v_old.sticky_enabled),
              'after',  jsonb_build_object('name', v_row.name, 'queue', v_row.default_queue_id, 'sticky', v_row.sticky_enabled)
            ));
  END IF;

  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.run_audit_log_purge()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  -- LGPD: maximum 2 years for audit retention
  DELETE FROM public.contact_audit_log
  WHERE changed_at < now() - interval '2 years';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('rows_purged', v_count);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.run_lgpd_purge()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count    integer;
  v_job_id   uuid;
  v_start    timestamptz := now();
BEGIN
  -- Log job start
  INSERT INTO public.scheduled_job_log (job_name, status)
  VALUES ('lgpd_purge', 'running')
  RETURNING id INTO v_job_id;

  -- Delete contacts deleted > 30 days ago
  DELETE FROM public.contacts
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - interval '30 days';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Update log
  UPDATE public.scheduled_job_log
  SET
    finished_at   = now(),
    status        = 'success',
    rows_affected = v_count
  WHERE id = v_job_id;

  RETURN jsonb_build_object(
    'job_id',       v_job_id,
    'rows_purged',  v_count,
    'duration_ms',  EXTRACT(EPOCH FROM (now() - v_start)) * 1000
  );
EXCEPTION WHEN OTHERS THEN
  UPDATE public.scheduled_job_log
  SET finished_at = now(), status = 'error', error_msg = SQLERRM
  WHERE id = v_job_id;
  RAISE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.run_pii_log_purge()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.pii_access_log WHERE accessed_at < now() - interval '90 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('rows_purged', v_count);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sanitize_reset_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.search_contacts(search_term text DEFAULT ''::text, contact_type_filter text DEFAULT NULL::text, company_filter text DEFAULT NULL::text, job_title_filter text DEFAULT NULL::text, tag_filter text DEFAULT NULL::text, date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, sort_field text DEFAULT 'name'::text, sort_direction text DEFAULT 'asc'::text, page_size integer DEFAULT 50, page_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text, email text, avatar_url text, tags text[], notes text, contact_type text, created_at timestamp with time zone, updated_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.search_contacts(p_query text, p_workspace_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, phone text, email text, company text, tags text[], channel text, avatar_url text, created_at timestamp with time zone, last_seen_at timestamp with time zone, rank real)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tsquery    tsquery;
  v_normalized text;
BEGIN
  -- Normalize query: remove accents, trim whitespace
  v_normalized := unaccent(trim(p_query));

  -- Build tsquery (websearch format handles multi-word gracefully)
  BEGIN
    v_tsquery := websearch_to_tsquery('portuguese', v_normalized);
  EXCEPTION WHEN OTHERS THEN
    v_tsquery := plainto_tsquery('portuguese', v_normalized);
  END;

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.phone,
    c.email,
    c.company,
    c.tags,
    c.channel,
    c.avatar_url,
    c.created_at,
    c.last_seen_at,
    -- Hybrid rank: full-text weight + trigram similarity
    (
      ts_rank(c.search_vector, v_tsquery) * 0.7 +
      similarity(unaccent(c.name), v_normalized) * 0.3
    )::real AS rank
  FROM public.contacts c
  WHERE
    c.workspace_id = p_workspace_id
    AND c.deleted_at IS NULL
    AND (
      c.search_vector @@ v_tsquery
      OR similarity(unaccent(c.name), v_normalized) > 0.3
      OR unaccent(lower(c.phone)) LIKE '%' || v_normalized || '%'
      OR unaccent(lower(c.email)) LIKE '%' || v_normalized || '%'
    )
  ORDER BY rank DESC, c.last_seen_at DESC NULLS LAST
  LIMIT  p_limit
  OFFSET p_offset;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_knowledge_base(search_query text, max_results integer DEFAULT 5)
 RETURNS TABLE(id uuid, title text, content text, category text, tags text[], rank real)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    a.id, a.title, a.content, a.category, a.tags,
    ts_rank(a.search_vector, websearch_to_tsquery('portuguese', search_query)) AS rank
  FROM public.knowledge_base_articles a
  WHERE a.is_published = true
    AND (
      a.search_vector @@ websearch_to_tsquery('portuguese', search_query)
      OR a.title ILIKE '%' || search_query || '%'
      OR a.content ILIKE '%' || search_query || '%'
    )
  ORDER BY rank DESC
  LIMIT max_results;
$function$
;

CREATE OR REPLACE FUNCTION public.set_automation_rules_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_woc_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;

CREATE OR REPLACE FUNCTION public.skill_based_assign(p_queue_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.soft_delete_contact(p_contact_id uuid, p_reason text DEFAULT 'manual_deletion'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.contacts
  SET
    deleted_at     = now(),
    deleted_by     = auth.uid(),
    deleted_reason = p_reason,
    updated_at     = now()
  WHERE id = p_contact_id
    AND deleted_at IS NULL
    AND workspace_id = (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact % not found or already deleted', p_contact_id;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_integration_profiles_updated()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.unpause_instance(p_instance text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  UPDATE public.instance_processing_pauses
     SET paused_until = now(),
         updated_at = now()
   WHERE instance_name = p_instance
     AND paused_until > now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'instance_unpaused',
      'instance_processing_pauses',
      p_instance,
      jsonb_build_object('instance', p_instance, 'cleared', v_count)
    );
  END IF;

  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_agent_level()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.level := calculate_level(NEW.xp);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_contact_versioned(p_contact_id uuid, p_expected_version integer, p_updates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_version integer;
  v_result          jsonb;
BEGIN
  -- Check current version matches expected
  SELECT version INTO v_current_version
  FROM public.contacts
  WHERE id = p_contact_id
    AND deleted_at IS NULL
    AND workspace_id = (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    )
  FOR UPDATE;  -- row-level lock

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTACT_NOT_FOUND: Contact % not found', p_contact_id;
  END IF;

  IF v_current_version != p_expected_version THEN
    -- Fetch the conflicting values for UI display
    SELECT jsonb_build_object(
      'error',            'CONFLICT',
      'message',          'Este contato foi modificado por outro usuário. Recarregue e tente novamente.',
      'current_version',  version,
      'your_version',     p_expected_version,
      'last_updated_by',  (SELECT full_name FROM public.profiles WHERE id = (SELECT updated_by FROM public.contacts WHERE id = p_contact_id)),
      'last_updated_at',  updated_at
    ) INTO v_result
    FROM public.contacts WHERE id = p_contact_id;

    RETURN v_result;
  END IF;

  -- Safe to update — versions match
  UPDATE public.contacts
  SET
    name    = COALESCE((p_updates->>'name')::text,    name),
    phone   = COALESCE((p_updates->>'phone')::text,   phone),
    email   = COALESCE((p_updates->>'email')::text,   email),
    company = COALESCE((p_updates->>'company')::text, company),
    notes   = COALESCE((p_updates->>'notes')::text,   notes),
    tags    = CASE WHEN p_updates ? 'tags' THEN
                ARRAY(SELECT jsonb_array_elements_text(p_updates->'tags'))
              ELSE tags END,
    custom_fields = CASE WHEN p_updates ? 'custom_fields' THEN
                      p_updates->'custom_fields'
                    ELSE custom_fields END,
    updated_by = auth.uid()
  WHERE id = p_contact_id;

  -- Return success with new version
  SELECT jsonb_build_object(
    'success', true,
    'version', version,
    'updated_at', updated_at
  ) INTO v_result
  FROM public.contacts WHERE id = p_contact_id;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_device_last_seen()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.last_seen_at = now();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_global_settings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_gmail_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_own_profile(p_display_name text DEFAULT NULL::text, p_avatar_url text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_signature text DEFAULT NULL::text, p_birthday text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_saved_filters_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.user_has_permission(_user_id uuid, _permission_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = _user_id AND p.name = _permission_name
  )
$function$
;

CREATE OR REPLACE FUNCTION public.validate_phone_numbers(phone_numbers jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
  -- Must be an array
  IF jsonb_typeof(phone_numbers) != 'array' THEN
    RETURN false;
  END IF;

  -- Each element must have a non-empty 'number' field
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(phone_numbers) AS elem
    WHERE elem->>'number' IS NULL OR trim(elem->>'number') = ''
  ) THEN
    RETURN false;
  END IF;

  -- Max 10 phone numbers per contact
  IF jsonb_array_length(phone_numbers) > 10 THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_reset_token(p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;



-- ╔═══════════════════════════════════════════════════════════╗
-- ║ INCLUDE: 04_views.sql
-- ╚═══════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════
-- 04_VIEWS: 6 views Lovable que faltam no VPS
-- ═══════════════════════════════════════════════════════════

--
-- PostgreSQL database dump
--

\restrict AGljCpCxoYGu0zdqcJVOf7SFPETLFPuCmGP3JdKdEQpMxQpNnxZHKZrMbMBeyD6

-- Dumped from database version 15.16 (Debian 15.16-0+deb12u1)
-- Dumped by pg_dump version 15.16 (Debian 15.16-0+deb12u1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: channel_connections_safe; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.channel_connections_safe WITH (security_invoker='on') AS
 SELECT channel_connections.id,
    channel_connections.channel_type,
    channel_connections.name,
    channel_connections.status,
    channel_connections.is_active,
    channel_connections.external_account_id,
    channel_connections.external_page_id,
    channel_connections.webhook_url,
    channel_connections.whatsapp_connection_id,
    channel_connections.created_at,
    channel_connections.updated_at,
    channel_connections.created_by
   FROM public.channel_connections;


--
-- Name: password_reset_requests_safe; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.password_reset_requests_safe WITH (security_invoker='on') AS
 SELECT password_reset_requests.id,
    password_reset_requests.user_id,
    password_reset_requests.email,
    password_reset_requests.reason,
    password_reset_requests.status,
    password_reset_requests.reviewed_by,
    password_reset_requests.reviewed_at,
    password_reset_requests.rejection_reason,
    password_reset_requests.token_expires_at,
    password_reset_requests.ip_address,
    password_reset_requests.user_agent,
    password_reset_requests.created_at,
    password_reset_requests.updated_at
   FROM public.password_reset_requests;


--
-- Name: profiles_public; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.profiles_public WITH (security_invoker='true') AS
 SELECT profiles.id,
    profiles.user_id,
    profiles.name,
    profiles.avatar_url,
    profiles.is_active,
    profiles.department,
    profiles.job_title
   FROM public.profiles;


--
-- Name: whatsapp_connections_agent; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.whatsapp_connections_agent WITH (security_invoker='on') AS
 SELECT whatsapp_connections.id,
    whatsapp_connections.name,
    whatsapp_connections.status,
    whatsapp_connections.phone_number,
    whatsapp_connections.is_default
   FROM public.whatsapp_connections;


--
-- Name: whatsapp_connections_public; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.whatsapp_connections_public WITH (security_invoker='true') AS
 SELECT whatsapp_connections.id,
    whatsapp_connections.name,
    whatsapp_connections.status,
    whatsapp_connections.is_default
   FROM public.whatsapp_connections;


--
-- Name: whatsapp_connections_safe; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.whatsapp_connections_safe WITH (security_invoker='true') AS
 SELECT whatsapp_connections.id,
    whatsapp_connections.name,
    whatsapp_connections.phone_number,
    whatsapp_connections.status,
    whatsapp_connections.is_default,
        CASE
            WHEN public.has_role(auth.uid(), 'admin'::public.app_role) THEN whatsapp_connections.qr_code
            ELSE NULL::text
        END AS qr_code,
        CASE
            WHEN public.has_role(auth.uid(), 'admin'::public.app_role) THEN whatsapp_connections.instance_id
            ELSE NULL::text
        END AS instance_id,
    whatsapp_connections.farewell_message,
    whatsapp_connections.farewell_enabled,
    whatsapp_connections.battery_level,
    whatsapp_connections.is_plugged,
    whatsapp_connections.retry_count,
    whatsapp_connections.max_retries,
    whatsapp_connections.last_health_check,
    whatsapp_connections.health_status,
    whatsapp_connections.health_response_ms,
    whatsapp_connections.created_by,
    whatsapp_connections.created_at,
    whatsapp_connections.updated_at
   FROM public.whatsapp_connections;


--
-- PostgreSQL database dump complete
--

\unrestrict AGljCpCxoYGu0zdqcJVOf7SFPETLFPuCmGP3JdKdEQpMxQpNnxZHKZrMbMBeyD6



-- ╔═══════════════════════════════════════════════════════════╗
-- ║ INCLUDE: 05_storage.sql
-- ╚═══════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════
-- 05_STORAGE: 9 buckets Lovable Cloud (apply UPSERT)
-- ═══════════════════════════════════════════════════════════
-- NOTA: Storage policies (RLS em storage.objects) precisam ser
-- aplicadas separadamente. Buckets criados aqui não terão policies
-- ainda — verifique 11_storage_policies.sql se existir.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('audio-memes', 'audio-memes', true, NULL, NULL) ON CONFLICT (id) DO UPDATE SET public=EXCLUDED.public, file_size_limit=EXCLUDED.file_size_limit, allowed_mime_types=EXCLUDED.allowed_mime_types;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('audio-messages', 'audio-messages', false, NULL, NULL) ON CONFLICT (id) DO UPDATE SET public=EXCLUDED.public, file_size_limit=EXCLUDED.file_size_limit, allowed_mime_types=EXCLUDED.allowed_mime_types;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('avatars', 'avatars', true, 5242880, '{image/jpeg,image/png,image/webp,image/gif}') ON CONFLICT (id) DO UPDATE SET public=EXCLUDED.public, file_size_limit=EXCLUDED.file_size_limit, allowed_mime_types=EXCLUDED.allowed_mime_types;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('custom-emojis', 'custom-emojis', true, 512000, '{image/png,image/webp,image/gif,image/jpeg,image/svg+xml}') ON CONFLICT (id) DO UPDATE SET public=EXCLUDED.public, file_size_limit=EXCLUDED.file_size_limit, allowed_mime_types=EXCLUDED.allowed_mime_types;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('email-attachments', 'email-attachments', false, NULL, NULL) ON CONFLICT (id) DO UPDATE SET public=EXCLUDED.public, file_size_limit=EXCLUDED.file_size_limit, allowed_mime_types=EXCLUDED.allowed_mime_types;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('quarantine', 'quarantine', false, NULL, NULL) ON CONFLICT (id) DO UPDATE SET public=EXCLUDED.public, file_size_limit=EXCLUDED.file_size_limit, allowed_mime_types=EXCLUDED.allowed_mime_types;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('stickers', 'stickers', true, NULL, NULL) ON CONFLICT (id) DO UPDATE SET public=EXCLUDED.public, file_size_limit=EXCLUDED.file_size_limit, allowed_mime_types=EXCLUDED.allowed_mime_types;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('team-chat-files', 'team-chat-files', false, NULL, NULL) ON CONFLICT (id) DO UPDATE SET public=EXCLUDED.public, file_size_limit=EXCLUDED.file_size_limit, allowed_mime_types=EXCLUDED.allowed_mime_types;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('whatsapp-media', 'whatsapp-media', false, NULL, NULL) ON CONFLICT (id) DO UPDATE SET public=EXCLUDED.public, file_size_limit=EXCLUDED.file_size_limit, allowed_mime_types=EXCLUDED.allowed_mime_types;
