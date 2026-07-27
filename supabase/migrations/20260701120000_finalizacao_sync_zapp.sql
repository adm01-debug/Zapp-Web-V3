-- ═══════════════════════════════════════════════════════════════
-- MIGRAÇÃO — Finalização Lovable Cloud -> banco canônico (schema zapp)
-- Padrão (A): storage real (zapp/public) + views de compatibilidade
-- Gerado: 2026-07-01
-- IDEMPOTENTE (IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS) · TRANSACIONAL
-- Escopo: 40 colunas em 7 tabelas + 4 tabelas novas + 6 views + 1 trigger (INCLUI Tier 3)
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ╔═══ SEÇÃO 1 — DRIFT DE COLUNAS (aditivo) ═══╗
-- 1.1 zapp.instance_registry — FUSÃO operador/slot + owner/api/proxy
--     /!\ SEGREDO EM TEXTO: api_key e proxy_pass entram como text puro. Migrar para vault/pgsodium.
ALTER TABLE zapp.instance_registry ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE zapp.instance_registry ADD COLUMN IF NOT EXISTS status text DEFAULT 'inactive'::text;
ALTER TABLE zapp.instance_registry ADD COLUMN IF NOT EXISTS connection_status text DEFAULT 'disconnected'::text;
ALTER TABLE zapp.instance_registry ADD COLUMN IF NOT EXISTS api_key text;
ALTER TABLE zapp.instance_registry ADD COLUMN IF NOT EXISTS api_url text;
ALTER TABLE zapp.instance_registry ADD COLUMN IF NOT EXISTS profile_picture text;
ALTER TABLE zapp.instance_registry ADD COLUMN IF NOT EXISTS is_master boolean DEFAULT false;
ALTER TABLE zapp.instance_registry ADD COLUMN IF NOT EXISTS proxy_host text;
ALTER TABLE zapp.instance_registry ADD COLUMN IF NOT EXISTS proxy_port text;
ALTER TABLE zapp.instance_registry ADD COLUMN IF NOT EXISTS proxy_user text;
ALTER TABLE zapp.instance_registry ADD COLUMN IF NOT EXISTS proxy_pass text;
ALTER TABLE zapp.instance_registry ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}'::jsonb;
ALTER TABLE zapp.instance_registry ADD COLUMN IF NOT EXISTS last_connected_at timestamp with time zone;
ALTER TABLE zapp.instance_registry ADD COLUMN IF NOT EXISTS message_count_sent integer DEFAULT 0;
ALTER TABLE zapp.instance_registry ADD COLUMN IF NOT EXISTS message_count_received integer DEFAULT 0;
ALTER TABLE zapp.instance_registry ADD COLUMN IF NOT EXISTS error_logs text;
ALTER TABLE zapp.instance_registry ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE zapp.instance_registry ADD COLUMN IF NOT EXISTS responsible_name text;
ALTER TABLE zapp.instance_registry ADD COLUMN IF NOT EXISTS responsible_email text;

-- 1.2 zapp.conversation_transfers (+7)
ALTER TABLE zapp.conversation_transfers ADD COLUMN IF NOT EXISTS from_agent_id uuid;
ALTER TABLE zapp.conversation_transfers ADD COLUMN IF NOT EXISTS to_agent_id uuid;
ALTER TABLE zapp.conversation_transfers ADD COLUMN IF NOT EXISTS from_queue_id uuid;
ALTER TABLE zapp.conversation_transfers ADD COLUMN IF NOT EXISTS to_queue_id uuid;
ALTER TABLE zapp.conversation_transfers ADD COLUMN IF NOT EXISTS sla_deadline timestamp with time zone;
ALTER TABLE zapp.conversation_transfers ADD COLUMN IF NOT EXISTS return_reason text;
ALTER TABLE zapp.conversation_transfers ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- 1.3 zapp.transfer_comments (+2)
ALTER TABLE zapp.transfer_comments ADD COLUMN IF NOT EXISTS agent_id uuid NOT NULL;
ALTER TABLE zapp.transfer_comments ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- 1.4 public.department_invitations (+5)
ALTER TABLE public.department_invitations ADD COLUMN IF NOT EXISTS email text;  -- NULLABLE: backfill + SET NOT NULL depois
ALTER TABLE public.department_invitations ADD COLUMN IF NOT EXISTS role text DEFAULT 'member'::text NOT NULL;
ALTER TABLE public.department_invitations ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text;
ALTER TABLE public.department_invitations ADD COLUMN IF NOT EXISTS invited_by uuid;
ALTER TABLE public.department_invitations ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- 1.5 public.departments (+3)
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS whatsapp_mode text DEFAULT 'standard'::text;
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS whatsapp_api_key text;
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS whatsapp_instance_id text;

-- 1.6 public.profiles (+3)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS _admin_user_id uuid;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS online_status text DEFAULT 'offline'::text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_online boolean DEFAULT false;

-- ╔═══ SEÇÃO 2 — RECRIAÇÃO DAS VIEWS DE COMPATIBILIDADE ═══╗
DROP VIEW IF EXISTS public.instance_registry;
CREATE VIEW public.instance_registry WITH (security_invoker=true) AS
    SELECT id, instance_name, display_name, phone_number, department, responsible_name, responsible_email, is_active, webhook_url, webhook_enabled, auto_reply_enabled, auto_reply_message, business_hours_enabled, max_concurrent_chats, sla_first_response_minutes, sla_resolution_hours, bitrix_integration, n8n_workflows, config, notes, created_at, updated_at, slot_name, operator_name, operator_email, operator_since, operator_phone, usage_type, owner_id, status, connection_status, api_key, api_url, profile_picture, is_master, proxy_host, proxy_port, proxy_user, proxy_pass, settings, last_connected_at, message_count_sent, message_count_received, error_logs, metadata
    FROM zapp.instance_registry;

DROP VIEW IF EXISTS public.conversation_transfers;
CREATE VIEW public.conversation_transfers WITH (security_invoker=true) AS
    SELECT id, ticket_number, source_instance, source_conversation_id, source_message_id, source_operator, target_instance, target_conversation_id, target_operator, contact_id, remote_jid, contact_name, transfer_type, category, reason, context_summary, context_messages, tags, status, priority, created_at, updated_at, accepted_at, completed_at, expires_at, resolution_notes, resolution_type, from_agent_id, to_agent_id, from_queue_id, to_queue_id, sla_deadline, return_reason, metadata
    FROM zapp.conversation_transfers;

DROP VIEW IF EXISTS public.transfer_comments;
CREATE VIEW public.transfer_comments WITH (security_invoker=true) AS
    SELECT id, transfer_id, author_name, author_instance, content, created_at, agent_id, metadata
    FROM zapp.transfer_comments;

DROP VIEW IF EXISTS zapp.departments;
CREATE VIEW zapp.departments WITH (security_invoker=true) AS
    SELECT created_at, description, id, is_active, name, slug, updated_at, whatsapp_mode, whatsapp_api_key, whatsapp_instance_id
    FROM public.departments;

DROP VIEW IF EXISTS zapp.profiles;
CREATE VIEW zapp.profiles WITH (security_invoker=true) AS
    SELECT id, user_id, name, email, avatar_url, role, max_chats, department, is_online, last_seen, created_at, updated_at, access_level, birthday, can_download, department_id, is_active, job_title, nickname, permissions, phone, session_invalidated_at, signature, _admin_user_id, online_status
    FROM public.profiles;

-- ╔═══ SEÇÃO 3 — TABELAS NOVAS (+ RLS + policies + views) ═══╗
-- 3.1 public.rls_denied_log
CREATE TABLE IF NOT EXISTS public.rls_denied_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    resource text NOT NULL,
    required_role text,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rls_denied_log_pkey PRIMARY KEY (id)
);
ALTER TABLE public.rls_denied_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_rls_denied_resource_created ON public.rls_denied_log USING btree (resource, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rls_denied_user_created ON public.rls_denied_log USING btree (user_id, created_at DESC);
DROP POLICY IF EXISTS "Admins view rls_denied_log" ON public.rls_denied_log;
CREATE POLICY "Admins view rls_denied_log" ON public.rls_denied_log FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'supervisor'::public.app_role)));

-- 3.2 public.security_audit_logs
CREATE TABLE IF NOT EXISTS public.security_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    event_type text NOT NULL,
    resource text,
    action text,
    status text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT security_audit_logs_pkey PRIMARY KEY (id)
);
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins view all security audit logs" ON public.security_audit_logs;
CREATE POLICY "Admins view all security audit logs" ON public.security_audit_logs FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'dev'::public.app_role)));
DROP POLICY IF EXISTS "Block authenticated deletes on security audit logs" ON public.security_audit_logs;
CREATE POLICY "Block authenticated deletes on security audit logs" ON public.security_audit_logs FOR DELETE TO authenticated USING (false);
DROP POLICY IF EXISTS "Block authenticated updates on security audit logs" ON public.security_audit_logs;
CREATE POLICY "Block authenticated updates on security audit logs" ON public.security_audit_logs FOR UPDATE TO authenticated USING (false);
DROP POLICY IF EXISTS "Service role inserts security audit logs" ON public.security_audit_logs;
CREATE POLICY "Service role inserts security audit logs" ON public.security_audit_logs FOR INSERT TO service_role WITH CHECK (true);
DROP POLICY IF EXISTS "Users can view their own security logs" ON public.security_audit_logs;
CREATE POLICY "Users can view their own security logs" ON public.security_audit_logs FOR SELECT USING ((auth.uid() = user_id));

-- 3.3 zapp.inbox_custom_scopes (+ view public.inbox_custom_scopes)
CREATE TABLE IF NOT EXISTS zapp.inbox_custom_scopes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    label text NOT NULL,
    description text,
    icon text,
    filter_criteria jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inbox_custom_scopes_pkey PRIMARY KEY (id)
);
ALTER TABLE zapp.inbox_custom_scopes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Custom scopes are viewable by everyone" ON zapp.inbox_custom_scopes;
CREATE POLICY "Custom scopes are viewable by everyone" ON zapp.inbox_custom_scopes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Only admins can manage custom scopes" ON zapp.inbox_custom_scopes;
CREATE POLICY "Only admins can manage custom scopes" ON zapp.inbox_custom_scopes TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));
-- public.inbox_custom_scopes may exist as TABLE from migration 20260527122016; migrate data then replace with VIEW
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='inbox_custom_scopes' AND c.relkind='r') THEN
    INSERT INTO zapp.inbox_custom_scopes SELECT * FROM public.inbox_custom_scopes ON CONFLICT (id) DO NOTHING;
    DROP TABLE public.inbox_custom_scopes CASCADE;
  END IF;
END $$;
DROP VIEW IF EXISTS public.inbox_custom_scopes;
CREATE VIEW public.inbox_custom_scopes WITH (security_invoker=true) AS SELECT * FROM zapp.inbox_custom_scopes;

-- 3.4 zapp.dlq_audit_log (+ view public.dlq_audit_log)
CREATE TABLE IF NOT EXISTS zapp.dlq_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action text,
    item_id uuid,
    performed_by uuid,
    reason text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT dlq_audit_log_pkey PRIMARY KEY (id)
);
ALTER TABLE zapp.dlq_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins view dlq" ON zapp.dlq_audit_log;
CREATE POLICY "Admins view dlq" ON zapp.dlq_audit_log FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'supervisor'::public.app_role]))))));
-- public.dlq_audit_log may exist as TABLE from migration 20260521104452; migrate data then replace with VIEW
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='dlq_audit_log' AND c.relkind='r') THEN
    INSERT INTO zapp.dlq_audit_log(id,action,item_id,performed_by,reason,created_at) SELECT id,action,item_id,performed_by,reason,created_at FROM public.dlq_audit_log ON CONFLICT (id) DO NOTHING;
    DROP TABLE public.dlq_audit_log CASCADE;
  END IF;
END $$;
DROP VIEW IF EXISTS public.dlq_audit_log;
CREATE VIEW public.dlq_audit_log WITH (security_invoker=true) AS SELECT * FROM zapp.dlq_audit_log;

-- ╔═══ SEÇÃO 4 — TRIGGER: sincronismo online_status <-> is_online ═══╗
CREATE OR REPLACE FUNCTION zapp.sync_profile_online_status()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.online_status := CASE WHEN NEW.is_online THEN 'online' ELSE 'offline' END;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_sync_online_status ON public.profiles;
CREATE TRIGGER trg_sync_online_status
  BEFORE INSERT OR UPDATE OF is_online, online_status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION zapp.sync_profile_online_status();

-- ╔═══ SEÇÃO 3B — TIER 3: evo.evolution_health_logs (aditivo, cross-domain) ═══╗
ALTER TABLE evo.evolution_health_logs ADD COLUMN IF NOT EXISTS connection_id uuid;
ALTER TABLE evo.evolution_health_logs ADD COLUMN IF NOT EXISTS error_count integer DEFAULT 0;
ALTER TABLE evo.evolution_health_logs ADD COLUMN IF NOT EXISTS success_count integer DEFAULT 0;
ALTER TABLE evo.evolution_health_logs ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
-- public.evolution_health_logs may exist as TABLE from migration 20260506193742; drop whatever exists then create VIEW
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='evolution_health_logs' AND c.relkind='r') THEN
    DROP TABLE public.evolution_health_logs CASCADE;
  ELSIF EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='evolution_health_logs' AND c.relkind='v') THEN
    DROP VIEW public.evolution_health_logs CASCADE;
  END IF;
END $$;
CREATE VIEW public.evolution_health_logs AS
 SELECT id, instance_name, status, error_message, response_time_ms, online_instances, total_instances, endpoint_tested, http_status_code, metadata, performed_at, connection_id, error_count, success_count, created_at
 FROM evo.evolution_health_logs;

-- ╔═══ SEÇÃO 5 — VERIFICAÇÃO (roda dentro da transação) ═══╗
DO $v$
DECLARE faltando int;
BEGIN
  SELECT count(*) INTO faltando FROM (
    SELECT 1 WHERE to_regclass('public.security_audit_logs') IS NULL
    UNION ALL SELECT 1 WHERE to_regclass('public.rls_denied_log') IS NULL
    UNION ALL SELECT 1 WHERE to_regclass('zapp.inbox_custom_scopes') IS NULL
    UNION ALL SELECT 1 WHERE to_regclass('zapp.dlq_audit_log') IS NULL
  ) q;
  IF faltando > 0 THEN RAISE EXCEPTION 'Verificacao falhou: % itens ausentes', faltando; END IF;
  RAISE NOTICE 'OK: migracao aplicada e verificada.';
END $v$;

COMMIT;
-- FIM. Rollback: mudancas aditivas; para reverter, DROP dos objetos criados.
