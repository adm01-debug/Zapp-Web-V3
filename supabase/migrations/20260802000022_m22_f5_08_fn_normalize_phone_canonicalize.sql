-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260802000022_m22_f5_08_fn_normalize_phone_canonicalize.sql
-- Purpose  : F5-08 CRÍTICO — Canonicalize phone normalization pipeline:
--
--   Step 1  CREATE OR REPLACE FUNCTION zapp.fn_normalize_phone(text) RETURNS text
--           Hardened vs. the version in 20260727120000:
--           • PARALLEL SAFE added (was only IMMUTABLE)
--           • SET search_path TO 'pg_catalog' added (prevents schema injection)
--           • All syscalls prefixed with pg_catalog. (regexp_replace, length,
--             coalesce)
--           • Logic unchanged: strip non-digits; NULL if < 10 or > 13 digits;
--             prepend '55' for 10/11-digit Brazilian numbers; return as-is for
--             12–13 digit numbers (already have country code).
--
--   Step 2  CREATE OR REPLACE FUNCTION zapp.fn_contacts_view_insert_handler()
--           Fixes raw phone usage from M-20 (20260802000020):
--           • phone_number  : fn_normalize_phone(NEW.phone) instead of NEW.phone
--           • JID fallback  : fn_normalize_phone(NEW.phone) || '@s.whatsapp.net'
--             instead of     NEW.phone || '@s.whatsapp.net'
--           All other logic unchanged from M-20.
--
--   Step 3  CREATE OR REPLACE FUNCTION zapp.fn_contacts_view_update_handler()
--           Fixes raw phone usage from M-20:
--           • phone_number CASE: THEN fn_normalize_phone(NEW.phone) ELSE ec.phone_number
--           All other logic unchanged from M-20.
--
--   Step 4  Verification.
--
-- Note: fn_normalize_phone was first created in 20260727120000 without
--       PARALLEL SAFE and without fixed search_path. This migration supersedes
--       that definition idempotently via CREATE OR REPLACE.
--
-- Idempotência: CREATE OR REPLACE — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Harden zapp.fn_normalize_phone
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_normalize_phone(p_phone text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $fn$
DECLARE
  v_digits text;
BEGIN
  v_digits := pg_catalog.regexp_replace(
    pg_catalog.coalesce(p_phone, ''),
    '[^0-9]', '', 'g'
  );

  IF pg_catalog.length(v_digits) < 10 OR pg_catalog.length(v_digits) > 13 THEN
    RETURN NULL;
  END IF;

  -- Prepend Brazilian country code for 10/11-digit numbers (local format)
  IF pg_catalog.length(v_digits) IN (10, 11) THEN
    v_digits := '55' || v_digits;
  END IF;

  RETURN v_digits;
END;
$fn$;

COMMENT ON FUNCTION zapp.fn_normalize_phone(text)
  IS 'Normalizes a Brazilian phone number to E.164-like format (country code 55 + DDD + number). '
     'Strips all non-digit characters. Returns NULL for invalid lengths (< 10 or > 13 digits). '
     'Prepends "55" for 10/11-digit inputs (local format). Returns as-is for 12/13-digit inputs '
     '(already include country code). IMMUTABLE PARALLEL SAFE — safe for use in indexes and CHECK constraints.';

REVOKE EXECUTE ON FUNCTION zapp.fn_normalize_phone(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_normalize_phone(text) TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: fn_contacts_view_insert_handler — normalize phone before INSERT
--   Changes vs M-20 (20260802000020):
--     remote_jid fallback: NEW.phone → fn_normalize_phone(NEW.phone)
--     phone_number:        NEW.phone → fn_normalize_phone(NEW.phone)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_contacts_view_insert_handler()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'zapp', 'evo', 'public'
AS $function$
DECLARE
  v_id            uuid;
  v_instance      text;
  v_phone_norm    text;
BEGIN
  v_instance := NULLIF(NEW.instance_name, '');

  IF v_instance IS NULL AND NEW.whatsapp_connection_id IS NOT NULL THEN
    SELECT wc.instance_name INTO v_instance
      FROM zapp.whatsapp_connections wc
     WHERE wc.id = NEW.whatsapp_connection_id;
  END IF;

  -- Normalize phone once; reuse for phone_number and JID fallback.
  v_phone_norm := zapp.fn_normalize_phone(NEW.phone);

  INSERT INTO evo.evolution_contacts (
    id, remote_jid, phone_number, push_name, profile_picture_url, full_name,
    email, company, role_title, lead_status, lead_source, lead_score,
    whatsapp_labels, tags, assigned_to, queue_id, notes, instance_name,
    raw_data, total_purchases, last_message_at, created_at, updated_at,
    cpf, cnpj
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()),
    COALESCE(
      NULLIF(NEW.remote_jid, ''),
      NULLIF(NEW.external_id, ''),
      v_phone_norm || '@s.whatsapp.net'   -- normalized phone for JID fallback
    ),
    v_phone_norm,                          -- normalized E.164-like phone_number
    COALESCE(NEW.push_name, NEW.nickname),
    NEW.avatar_url,
    NEW.name,
    NEW.email,
    NEW.company,
    COALESCE(NEW."position", NEW.job_title),
    COALESCE(NEW.status, 'open'),
    NEW.source,
    COALESCE(NEW.lead_score, 0),
    NEW.whatsapp_labels,
    NEW.tags,
    NEW.assigned_to,
    NEW.queue_id,
    NEW.notes,
    COALESCE(v_instance, 'wpp2'),
    NEW.metadata,
    COALESCE(NEW.total_purchases, 0),
    NEW.last_message_at,
    COALESCE(NEW.created_at, now()),
    COALESCE(NEW.updated_at, now()),
    NEW.cpf,
    NEW.cnpj
  ) RETURNING id INTO v_id;

  NEW.id := v_id;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION zapp.fn_contacts_view_insert_handler() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_contacts_view_insert_handler() TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: fn_contacts_view_update_handler — normalize phone before UPDATE
--   Change vs M-20: THEN NEW.phone → THEN zapp.fn_normalize_phone(NEW.phone)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_contacts_view_update_handler()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'zapp', 'evo', 'public'
AS $function$
DECLARE
  v_instance    text;
BEGIN
  IF NEW.whatsapp_connection_id IS DISTINCT FROM OLD.whatsapp_connection_id
     AND NEW.whatsapp_connection_id IS NOT NULL THEN
    SELECT wc.instance_name INTO v_instance
      FROM zapp.whatsapp_connections wc
     WHERE wc.id = NEW.whatsapp_connection_id;
  END IF;

  UPDATE evo.evolution_contacts ec SET
    full_name           = CASE WHEN NEW.name IS DISTINCT FROM OLD.name
                               THEN NEW.name              ELSE ec.full_name           END,
    phone_number        = CASE WHEN NEW.phone IS DISTINCT FROM OLD.phone
                               THEN zapp.fn_normalize_phone(NEW.phone)  -- normalized
                               ELSE ec.phone_number                      END,
    email               = CASE WHEN NEW.email IS DISTINCT FROM OLD.email
                               THEN NEW.email             ELSE ec.email               END,
    profile_picture_url = CASE WHEN NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
                               THEN NEW.avatar_url        ELSE ec.profile_picture_url END,
    lead_status         = CASE WHEN NEW.status IS DISTINCT FROM OLD.status
                               THEN NEW.status            ELSE ec.lead_status         END,
    assigned_to         = CASE WHEN NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
                               THEN NEW.assigned_to       ELSE ec.assigned_to         END,
    queue_id            = CASE WHEN NEW.queue_id IS DISTINCT FROM OLD.queue_id
                               THEN NEW.queue_id          ELSE ec.queue_id            END,
    company             = CASE WHEN NEW.company IS DISTINCT FROM OLD.company
                               THEN NEW.company           ELSE ec.company             END,
    notes               = CASE WHEN NEW.notes IS DISTINCT FROM OLD.notes
                               THEN NEW.notes             ELSE ec.notes               END,
    tags                = CASE WHEN NEW.tags IS DISTINCT FROM OLD.tags
                               THEN NEW.tags              ELSE ec.tags                END,
    whatsapp_labels     = CASE WHEN NEW.whatsapp_labels IS DISTINCT FROM OLD.whatsapp_labels
                               THEN NEW.whatsapp_labels   ELSE ec.whatsapp_labels     END,
    lead_score          = CASE WHEN NEW.lead_score IS DISTINCT FROM OLD.lead_score
                               THEN NEW.lead_score        ELSE ec.lead_score          END,
    last_message_at     = CASE WHEN NEW.last_message_at IS DISTINCT FROM OLD.last_message_at
                               THEN NEW.last_message_at   ELSE ec.last_message_at     END,
    instance_name       = COALESCE(v_instance, ec.instance_name),
    raw_data            = CASE WHEN NEW.metadata IS DISTINCT FROM OLD.metadata
                               THEN NEW.metadata          ELSE ec.raw_data            END,
    cpf                 = CASE WHEN NEW.cpf IS DISTINCT FROM OLD.cpf
                               THEN NEW.cpf               ELSE ec.cpf                 END,
    cnpj                = CASE WHEN NEW.cnpj IS DISTINCT FROM OLD.cnpj
                               THEN NEW.cnpj              ELSE ec.cnpj                END,
    pii_cpf_masked_at   = CASE WHEN NEW.pii_cpf_masked_at IS DISTINCT FROM OLD.pii_cpf_masked_at
                               THEN NEW.pii_cpf_masked_at ELSE ec.pii_cpf_masked_at   END,
    updated_at          = COALESCE(NEW.updated_at, now())
  WHERE ec.id = OLD.id;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION zapp.fn_contacts_view_update_handler() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_contacts_view_update_handler() TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 4: Verification
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn_count   integer;
  v_parallel   text;
  v_secdef     boolean;
  v_norm_ok    text;
BEGIN
  -- All three functions exist in zapp schema
  SELECT COUNT(*) INTO v_fn_count
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname IN (
       'fn_normalize_phone',
       'fn_contacts_view_insert_handler',
       'fn_contacts_view_update_handler'
     );

  IF v_fn_count < 3 THEN
    RAISE EXCEPTION '[M-22 VER] Expected 3 functions, found %', v_fn_count;
  END IF;

  -- fn_normalize_phone must be PARALLEL SAFE (proparallel = 's')
  SELECT CASE p.proparallel WHEN 's' THEN 'safe' WHEN 'r' THEN 'restricted' ELSE 'unsafe' END
    INTO v_parallel
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'fn_normalize_phone';

  IF v_parallel <> 'safe' THEN
    RAISE EXCEPTION '[M-22 VER] fn_normalize_phone proparallel=% (expected safe)', v_parallel;
  END IF;

  -- fn_contacts_view_insert_handler must be SECURITY DEFINER
  SELECT p.prosecdef INTO v_secdef
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'fn_contacts_view_insert_handler';

  IF NOT v_secdef THEN
    RAISE EXCEPTION '[M-22 VER] fn_contacts_view_insert_handler is not SECURITY DEFINER';
  END IF;

  -- Smoke-test fn_normalize_phone
  -- 11 digits (local mobile) → '55' + 11 digits = 13 digits
  v_norm_ok := zapp.fn_normalize_phone('(11) 98765-4321');
  IF v_norm_ok IS DISTINCT FROM '5511987654321' THEN
    RAISE EXCEPTION '[M-22 VER] fn_normalize_phone("(11) 98765-4321") = %, expected 5511987654321', v_norm_ok;
  END IF;

  -- 10 digits (local landline) → '55' + 10 digits = 12 digits
  v_norm_ok := zapp.fn_normalize_phone('(11) 3456-7890');
  IF v_norm_ok IS DISTINCT FROM '551134567890' THEN
    RAISE EXCEPTION '[M-22 VER] fn_normalize_phone("(11) 3456-7890") = %, expected 551134567890', v_norm_ok;
  END IF;

  -- Already E.164 13 digits → unchanged
  v_norm_ok := zapp.fn_normalize_phone('5511987654321');
  IF v_norm_ok IS DISTINCT FROM '5511987654321' THEN
    RAISE EXCEPTION '[M-22 VER] fn_normalize_phone("5511987654321") = %, expected 5511987654321', v_norm_ok;
  END IF;

  -- Too short → NULL
  v_norm_ok := zapp.fn_normalize_phone('12345');
  IF v_norm_ok IS NOT NULL THEN
    RAISE EXCEPTION '[M-22 VER] fn_normalize_phone("12345") = %, expected NULL', v_norm_ok;
  END IF;

  -- NULL input → NULL
  v_norm_ok := zapp.fn_normalize_phone(NULL);
  IF v_norm_ok IS NOT NULL THEN
    RAISE EXCEPTION '[M-22 VER] fn_normalize_phone(NULL) = %, expected NULL', v_norm_ok;
  END IF;

  RAISE NOTICE '[M-22 VER] F5-08 OK — functions(%) ✓ parallel_safe ✓ secdef ✓ normalize_smoke ✓',
    v_fn_count;
END $$;
