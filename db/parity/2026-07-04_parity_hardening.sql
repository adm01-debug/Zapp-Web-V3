-- ============================================================================
-- PARIDADE LOVABLE → SELF-HOSTED: religamento de triggers + endurecimento RLS
-- Data: 2026-07-04 | Aplicado em produção (supabase.atomicabr.com.br) via MCP
-- Idempotente: pode ser reexecutado sem efeitos colaterais.
-- Cada bloco foi validado antes em simulação transacional (DO + ROLLBACK).
-- Rollback: ver db/parity/2026-07-04_parity_hardening_rollback.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) SEGURANÇA: password_reset_requests (sanitize + rate-limit)
--    sanitize somente em INSERT: em UPDATE quebraria a aprovação por admin
--    autenticado (o fluxo de aprovação usa service role / edge function).
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS sanitize_reset_request_trigger ON public.password_reset_requests;
CREATE TRIGGER sanitize_reset_request_trigger
  BEFORE INSERT ON public.password_reset_requests
  FOR EACH ROW EXECUTE FUNCTION public.sanitize_reset_request();

DROP TRIGGER IF EXISTS trg_rate_limit_reset ON public.password_reset_requests;
CREATE TRIGGER trg_rate_limit_reset
  BEFORE INSERT ON public.password_reset_requests
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_reset_requests();

ALTER FUNCTION public.sanitize_reset_request() SET search_path = public, auth;
ALTER FUNCTION public.rate_limit_reset_requests() SET search_path = public;

-- ----------------------------------------------------------------------------
-- 2) AUTO-ASSIGN de contatos (adaptado: evolution_contacts não tem
--    whatsapp_connection_id — resolve via instance_name; assigned_to é varchar)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION evo.fn_uuid_safe(t text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE WHEN t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN t::uuid END
$f$;

CREATE OR REPLACE FUNCTION evo.fn_auto_assign_contact() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = evo, public AS $f$
DECLARE v_connection_id uuid; v_agent uuid;
BEGIN
  BEGIN
    SELECT wc.id INTO v_connection_id FROM public.whatsapp_connections wc
    WHERE wc.instance_name = NEW.instance_name::text AND wc.is_active = true
    ORDER BY wc.last_connected_at DESC NULLS LAST LIMIT 1;
    SELECT r.agent_id INTO v_agent FROM public.client_wallet_rules r
    WHERE r.is_active = true AND (r.whatsapp_connection_id IS NULL OR r.whatsapp_connection_id = v_connection_id)
    ORDER BY r.priority DESC, r.created_at ASC LIMIT 1;
    IF v_agent IS NOT NULL THEN NEW.assigned_to := v_agent::text; END IF;
  EXCEPTION WHEN OTHERS THEN NULL; -- nunca bloquear ingestão de contatos
  END;
  RETURN NEW;
END $f$;

CREATE OR REPLACE FUNCTION evo.fn_log_assignment_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = zapp, evo, public AS $f$
BEGIN
  BEGIN
    INSERT INTO zapp.conversation_events (contact_id, event_type, from_agent_id, to_agent_id, performed_by, metadata)
    VALUES (NEW.id,
      CASE WHEN OLD.assigned_to IS NULL THEN 'assign' WHEN NEW.assigned_to IS NULL THEN 'unassign' ELSE 'transfer' END,
      evo.fn_uuid_safe(OLD.assigned_to), evo.fn_uuid_safe(NEW.assigned_to),
      COALESCE(evo.fn_uuid_safe(NEW.assigned_to), evo.fn_uuid_safe(OLD.assigned_to)),
      jsonb_build_object('source','evo.trg_log_assignment_change','instance',NEW.instance_name));
  EXCEPTION WHEN OTHERS THEN NULL; -- auditoria não pode bloquear escrita
  END;
  RETURN NEW;
END $f$;

DROP TRIGGER IF EXISTS trg_auto_assign_contact ON evo.evolution_contacts;
CREATE TRIGGER trg_auto_assign_contact
  BEFORE INSERT ON evo.evolution_contacts
  FOR EACH ROW WHEN (NEW.assigned_to IS NULL)
  EXECUTE FUNCTION evo.fn_auto_assign_contact();

DROP TRIGGER IF EXISTS trg_log_assignment_change ON evo.evolution_contacts;
CREATE TRIGGER trg_log_assignment_change
  AFTER UPDATE OF assigned_to ON evo.evolution_contacts
  FOR EACH ROW WHEN (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
  EXECUTE FUNCTION evo.fn_log_assignment_change();

-- ----------------------------------------------------------------------------
-- 3) GAMIFICAÇÃO: agent_stats (defaults faltantes + unique + init + level)
-- ----------------------------------------------------------------------------
ALTER TABLE zapp.agent_stats
  ALTER COLUMN achievements_count SET DEFAULT 0,
  ALTER COLUMN best_streak SET DEFAULT 0,
  ALTER COLUMN conversations_resolved SET DEFAULT 0,
  ALTER COLUMN current_streak SET DEFAULT 0,
  ALTER COLUMN level SET DEFAULT 1,
  ALTER COLUMN messages_received SET DEFAULT 0,
  ALTER COLUMN messages_sent SET DEFAULT 0,
  ALTER COLUMN xp SET DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS agent_stats_profile_id_key ON zapp.agent_stats(profile_id);

CREATE OR REPLACE FUNCTION public.init_agent_stats() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = zapp, public AS $f$
BEGIN
  -- original Lovable inseria em public.agent_stats, que aqui é VIEW (ON CONFLICT inválido)
  INSERT INTO zapp.agent_stats (profile_id) VALUES (NEW.id) ON CONFLICT (profile_id) DO NOTHING;
  RETURN NEW;
END $f$;

CREATE OR REPLACE FUNCTION public.update_agent_level() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $f$
BEGIN
  -- xp é numeric no self-hosted; calculate_level espera integer
  NEW.level := public.calculate_level(COALESCE(NEW.xp,0)::int);
  RETURN NEW;
END $f$;

DROP TRIGGER IF EXISTS update_level_on_xp_change ON zapp.agent_stats;
CREATE TRIGGER update_level_on_xp_change
  BEFORE INSERT OR UPDATE OF xp ON zapp.agent_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_agent_level();

DROP TRIGGER IF EXISTS on_profile_created_init_stats ON public.profiles;
CREATE TRIGGER on_profile_created_init_stats
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.init_agent_stats();

-- ----------------------------------------------------------------------------
-- 4) saved_filters: default único por usuário/entidade (AFTER + WHEN evita recursão)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS ensure_single_default_filter_trigger ON public.saved_filters;
CREATE TRIGGER ensure_single_default_filter_trigger
  AFTER INSERT OR UPDATE OF is_default ON public.saved_filters
  FOR EACH ROW WHEN (NEW.is_default IS TRUE)
  EXECUTE FUNCTION public.ensure_single_default_filter();
ALTER FUNCTION public.ensure_single_default_filter() SET search_path = public;

-- ----------------------------------------------------------------------------
-- 5) user_devices: last_seen automático
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_user_devices_last_seen ON public.user_devices;
CREATE TRIGGER update_user_devices_last_seen
  BEFORE UPDATE ON public.user_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_device_last_seen();
ALTER FUNCTION public.update_device_last_seen() SET search_path = public;

-- ----------------------------------------------------------------------------
-- 6) user_roles: auditoria de mudanças de papel em audit_logs
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS audit_user_role_changes ON public.user_roles;
CREATE TRIGGER audit_user_role_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_role_changes();
ALTER FUNCTION public.audit_role_changes() SECURITY DEFINER;
ALTER FUNCTION public.audit_role_changes() SET search_path = public, auth;

-- ----------------------------------------------------------------------------
-- 7) SICOOB: notificar sicoob-bridge-reply quando agente responde contato sicoob
--    Reescrita: original usava extensions.http_post (ext ausente) + URL Lovable.
--    Agora: pg_net (assíncrono) → gateway interno do edge-runtime.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION evo.fn_notify_sicoob_on_reply() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = evo, public AS $f$
DECLARE v_lead_status text;
BEGIN
  BEGIN
    SELECT lead_status INTO v_lead_status FROM evo.evolution_contacts WHERE id = NEW.contact_id;
    IF v_lead_status = 'sicoob_gifts' THEN
      PERFORM net.http_post(
        url := 'http://functions:9000/sicoob-bridge-reply',
        body := jsonb_build_object('contact_id', NEW.contact_id, 'content', NEW.content, 'message_id', NEW.id, 'created_at', NEW.created_at),
        headers := jsonb_build_object('Content-Type','application/json'));
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END $f$;

DROP TRIGGER IF EXISTS trg_sicoob_reply ON evo.evolution_messages;
CREATE TRIGGER trg_sicoob_reply
  AFTER INSERT ON evo.evolution_messages
  FOR EACH ROW WHEN (NEW.from_me IS TRUE AND NEW.contact_id IS NOT NULL)
  EXECUTE FUNCTION evo.fn_notify_sicoob_on_reply();

-- ----------------------------------------------------------------------------
-- 8) ENDURECIMENTO RLS (regressões vs Lovable identificadas na auditoria)
--    Antes: auth_full_access ALL/true em user_roles, password_reset_requests e
--    gmail_accounts → escalação de privilégio e leitura de tokens por qualquer
--    usuário autenticado.
-- ----------------------------------------------------------------------------
-- user_roles: leitura para autenticados; escrita apenas admin/dev (via profiles
-- para evitar recursão de RLS — is_admin_or_supervisor lê a própria user_roles)
DROP POLICY IF EXISTS auth_full_access ON public.user_roles;
DROP POLICY IF EXISTS user_roles_select_authenticated ON public.user_roles;
CREATE POLICY user_roles_select_authenticated ON public.user_roles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS user_roles_admin_manage ON public.user_roles;
CREATE POLICY user_roles_admin_manage ON public.user_roles FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.role = ANY(ARRAY['admin','dev'])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.role = ANY(ARRAY['admin','dev'])));

-- password_reset_requests: dono ou admin lê; dono insere; admin altera/apaga
DROP POLICY IF EXISTS auth_full_access ON public.password_reset_requests;
DROP POLICY IF EXISTS prr_select_own_or_admin ON public.password_reset_requests;
CREATE POLICY prr_select_own_or_admin ON public.password_reset_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.role = ANY(ARRAY['admin','dev'])));
DROP POLICY IF EXISTS prr_insert_own ON public.password_reset_requests;
CREATE POLICY prr_insert_own ON public.password_reset_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS prr_admin_write ON public.password_reset_requests;
CREATE POLICY prr_admin_write ON public.password_reset_requests FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.role = ANY(ARRAY['admin','dev'])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.role = ANY(ARRAY['admin','dev'])));
DROP POLICY IF EXISTS prr_admin_delete ON public.password_reset_requests;
CREATE POLICY prr_admin_delete ON public.password_reset_requests FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.role = ANY(ARRAY['admin','dev'])));

-- gmail_accounts (tokens criptografados): dono lê; escrita só service_role
DROP POLICY IF EXISTS auth_full_access ON email_app.gmail_accounts;
DROP POLICY IF EXISTS gmail_select_own ON email_app.gmail_accounts;
CREATE POLICY gmail_select_own ON email_app.gmail_accounts FOR SELECT TO authenticated USING (user_id = auth.uid());

-- profiles: anti-escalação (reverte silenciosamente role/access_level/permissions
-- alterados por não-admin; preferido ao variant que lança exceção)
DROP TRIGGER IF EXISTS prevent_privilege_escalation ON public.profiles;
CREATE TRIGGER prevent_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();
