-- ============================================================
-- MIGRATION: fix_p0a_anon_dml_contacts
-- DATE: 2026-07-27
-- ISSUE: P0-A — anon podia INSERT/UPDATE/DELETE em public.contacts
--         via INSTEAD OF trigger → SECURITY DEFINER chain (bypassrls)
-- SEVERITY: P0 — explorado em pentest (HTTP 201, registro criado)
-- LAYERS:
--   1. REVOKE DML grants anon em public.contacts
--   2. Auth check nas 3 funções proxy (dupla defesa)
-- TESTED: 16/16 HTTP pentests PASS após correção
-- ============================================================

-- LAYER 1: Revogar DML anon na view public.contacts
REVOKE INSERT, UPDATE, DELETE ON public.contacts FROM anon;

-- LAYER 2a: Auth check em fn_contacts_proxy_insert
CREATE OR REPLACE FUNCTION public.fn_contacts_proxy_insert()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, zapp, evo AS $fn$
DECLARE
  v_jwt_role text;
BEGIN
  -- [2026-07-27 P0-A fix] Bloquear anon via SECURITY DEFINER chain.
  -- REVOKE já protege, mas esta verificação é defesa-em-profundidade.
  v_jwt_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  IF v_jwt_role IS NULL OR v_jwt_role = 'anon' THEN
    RAISE EXCEPTION 'Unauthorized: authentication required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO zapp.contacts (
    id, phone, name, email, avatar_url, status,
    assigned_to, queue_id, whatsapp_connection_id,
    remote_jid, push_name, instance_name,
    company, "position", notes, source, external_id, metadata,
    lead_score, total_purchases, whatsapp_labels, tags,
    created_at, updated_at
  ) VALUES (
    NEW.id, NEW.phone, NEW.name, NEW.email, NEW.avatar_url, NEW.status,
    NEW.assigned_to, NEW.queue_id, NEW.whatsapp_connection_id,
    NEW.remote_jid, NEW.push_name, NEW.instance_name,
    NEW.company, NEW."position", NEW.notes, NEW.source, NEW.external_id, NEW.metadata,
    NEW.lead_score, NEW.total_purchases, NEW.whatsapp_labels, NEW.tags,
    NEW.created_at, NEW.updated_at
  )
  RETURNING id, name, phone, email, avatar_url, status,
    assigned_to, queue_id, whatsapp_connection_id,
    remote_jid, push_name, instance_name, created_at, updated_at
  INTO NEW.id, NEW.name, NEW.phone, NEW.email, NEW.avatar_url, NEW.status,
    NEW.assigned_to, NEW.queue_id, NEW.whatsapp_connection_id,
    NEW.remote_jid, NEW.push_name, NEW.instance_name, NEW.created_at, NEW.updated_at;

  RETURN NEW;
END;
$fn$;

-- LAYER 2b: Auth check em fn_contacts_proxy_update
CREATE OR REPLACE FUNCTION public.fn_contacts_proxy_update()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, zapp, evo AS $fn$
DECLARE
  v_jwt_role text;
BEGIN
  v_jwt_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  IF v_jwt_role IS NULL OR v_jwt_role = 'anon' THEN
    RAISE EXCEPTION 'Unauthorized: authentication required' USING ERRCODE = '42501';
  END IF;

  UPDATE zapp.contacts SET
    name              = NEW.name,
    phone             = NEW.phone,
    email             = NEW.email,
    avatar_url        = NEW.avatar_url,
    status            = NEW.status,
    assigned_to       = NEW.assigned_to,
    queue_id          = NEW.queue_id,
    company           = NEW.company,
    "position"        = NEW."position",
    notes             = NEW.notes,
    source            = NEW.source,
    lead_score        = NEW.lead_score,
    total_purchases   = NEW.total_purchases,
    whatsapp_labels   = NEW.whatsapp_labels,
    tags              = NEW.tags,
    updated_at        = COALESCE(NEW.updated_at, now())
  WHERE id = OLD.id;
  RETURN NEW;
END;
$fn$;

-- LAYER 2c: Auth check em fn_contacts_proxy_delete
CREATE OR REPLACE FUNCTION public.fn_contacts_proxy_delete()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, zapp, evo AS $fn$
DECLARE
  v_jwt_role text;
BEGIN
  v_jwt_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  IF v_jwt_role IS NULL OR v_jwt_role = 'anon' THEN
    RAISE EXCEPTION 'Unauthorized: authentication required' USING ERRCODE = '42501';
  END IF;

  DELETE FROM zapp.contacts WHERE id = OLD.id;
  RETURN OLD;
END;
$fn$;

-- VERIFICAÇÃO PÓS-MIGRATION (deve retornar todos FALSE exceto SELECT)
-- SELECT
--   has_table_privilege('anon','public.contacts','INSERT') AS should_be_false,
--   has_table_privilege('anon','public.contacts','UPDATE') AS should_be_false,
--   has_table_privilege('anon','public.contacts','DELETE') AS should_be_false,
--   has_table_privilege('anon','public.contacts','SELECT') AS should_be_true;
