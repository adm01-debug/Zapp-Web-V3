-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260805000000_delta_724_orphaned_objects.sql
-- Purpose  : Reconcile objects that exist in PRODUCTION but were never captured
--            in the canonical schema (20260804000000_canonical_schema.sql).
--            Extracted from PR #724 (branch claude/plan-implementation-review-bq8j14)
--            which was superseded by the canonical squash + RLS follow-ups.
-- Verified : pg_catalog checks against production 2026-08-04 (MCP Supabase).
--            - zapp.hmac_selftest_audit        EXISTS (10 cols, incl. executed_by)
--            - zapp.instance_auth_events       EXISTS (15 cols) + public VIEW
--            - zapp.fn_retry_stuck_messages    EXISTS (OLD version — fix below)
--            - zapp.fn_validate_whatsapp_connection_url EXISTS (OLD — fix below)
--            - zapp.validate_cpf/cnpj/mask_cpf EXISTS
-- Idempotent: CREATE IF NOT EXISTS / CREATE OR REPLACE — safe to re-run.
-- Rollback  : DROP the objects created below (documented per section).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. zapp.hmac_selftest_audit — HMAC self-test history (F7-18, PR #724 M52)
--    Schema matches PRODUCTION (incl. executed_by, added later in prod).
--    Rollback: DROP TABLE zapp.hmac_selftest_audit;
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zapp.hmac_selftest_audit (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance          text        NOT NULL DEFAULT 'selftest',
  ok                boolean     NOT NULL,
  duration_ms       numeric,
  error             text,
  message           text,
  good_accepted     boolean,
  tampered_rejected boolean,
  executed_by       text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE zapp.hmac_selftest_audit ENABLE ROW LEVEL SECURITY;

-- Policies mirror production (auth_secure_70: authenticated ALL; service_full_access: service_role ALL)
DROP POLICY IF EXISTS auth_secure_70 ON zapp.hmac_selftest_audit;
CREATE POLICY auth_secure_70 ON zapp.hmac_selftest_audit
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_full_access ON zapp.hmac_selftest_audit;
CREATE POLICY service_full_access ON zapp.hmac_selftest_audit
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. zapp.instance_auth_events — auth failure/auto-pause instrumentation (F6-25)
--    Schema matches PRODUCTION (15 cols, event_type + success).
--    Rollback: DROP TABLE zapp.instance_auth_events; DROP VIEW public.instance_auth_events;
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zapp.instance_auth_events (
  id             uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name  text        NOT NULL,
  event_type     text,
  ip_address     text,
  user_agent     text,
  success        boolean     DEFAULT false,
  created_at     timestamptz DEFAULT now(),
  reason         text,
  paused_until   timestamptz,
  investigated_at timestamptz,
  source         text,
  http_status    integer,
  detail         text,
  meta           jsonb,
  status_code    integer
);

ALTER TABLE zapp.instance_auth_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_secure_72 ON zapp.instance_auth_events;
CREATE POLICY auth_secure_72 ON zapp.instance_auth_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS iae_admin_select ON zapp.instance_auth_events;
CREATE POLICY iae_admin_select ON zapp.instance_auth_events
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS svc_rw ON zapp.instance_auth_events;
CREATE POLICY svc_rw ON zapp.instance_auth_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- public compat view (matches production viewdef: id..status_code from zapp)
CREATE OR REPLACE VIEW public.instance_auth_events AS
  SELECT id, instance_name, event_type, ip_address, user_agent, success,
         created_at, reason, paused_until, investigated_at, source,
         http_status, detail, meta, status_code
    FROM zapp.instance_auth_events;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. zapp.fn_retry_stuck_messages — F4-23 CRÍTICO rewrite (PR #724 M15)
--    PRODUCTION still has the OLD version that polls zapp.outbound_message_queue
--    (never receives rows). Rewrite operates on evo.evolution_messages.
--    Rollback: restore old definition from prod backup / git history.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_retry_stuck_messages()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'zapp', 'evo', 'public'
AS $function$
DECLARE
  v_count   INTEGER := 0;
  r         RECORD;
  v_has_enq BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'fn_enqueue_message_dispatch'
  ) INTO v_has_enq;

  FOR r IN
    SELECT id, instance_name, remote_jid,
           COALESCE(retry_attempt, 0) AS attempt
      FROM evo.evolution_messages
     WHERE status        = 'pending'
       AND updated_at    < NOW() - INTERVAL '10 minutes'
       AND (retry_attempt IS NULL OR retry_attempt < 3)
     LIMIT 100
  LOOP
    BEGIN
      UPDATE evo.evolution_messages
         SET retry_attempt = r.attempt + 1,
             updated_at    = NOW(),
             status        = CASE
                               WHEN v_has_enq THEN 'pending'
                               ELSE 'queued'
                             END
       WHERE id = r.id;

      IF v_has_enq THEN
        PERFORM zapp.fn_enqueue_message_dispatch(r.id, r.instance_name);
      END IF;

      v_count := v_count + 1;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[fn_retry_stuck_messages] failed to retry message id=%: %', r.id, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION zapp.fn_retry_stuck_messages() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_retry_stuck_messages() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. zapp.fn_validate_whatsapp_connection_url — F6-12 fail-secure (PR #724 M37)
--    PRODUCTION still has the OLD version: hardcoded fallback + info-leak in
--    exception + no SECURITY DEFINER + no official-type exemption.
--    Rollback: restore old definition from prod backup / git history.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_validate_whatsapp_connection_url()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'zapp', 'vault', 'public'
AS $fn$
DECLARE
  v_allowed_url TEXT;
BEGIN
  IF NEW.api_type = 'official' THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT decrypted_secret
      INTO v_allowed_url
      FROM vault.decrypted_secrets
     WHERE name = 'evolution_api_url'
     LIMIT 1;
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RAISE EXCEPTION 'fn_validate_whatsapp_connection_url: vault indisponível — INSERT rejeitado'
      USING ERRCODE = '42501';
  END;

  IF v_allowed_url IS NULL OR v_allowed_url = '' THEN
    RAISE EXCEPTION
      'fn_validate_whatsapp_connection_url: vault.evolution_api_url não configurado — '
      'INSERT rejeitado. Configure o secret antes de criar conexões.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.api_url IS DISTINCT FROM v_allowed_url THEN
    RAISE EXCEPTION 'api_url invalida — valor recebido não corresponde ao esperado (vault.evolution_api_url)'
      USING ERRCODE = '23514',
            DETAIL  = format('recebido: %s', NEW.api_url);
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION zapp.fn_validate_whatsapp_connection_url()
  IS 'BEFORE INSERT/UPDATE OF api_url trigger (M37/F6-12): validates api_url against '
     'vault.evolution_api_url. Fail-secure: RAISES when vault is empty or unavailable '
     '(no hardcoded fallback). Error message does not expose the expected URL. '
     'Exempts api_type=official (Meta Cloud API / Graph API endpoint).';

REVOKE EXECUTE ON FUNCTION zapp.fn_validate_whatsapp_connection_url() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_validate_whatsapp_connection_url() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. zapp.validate_cpf / validate_cnpj / mask_cpf — CPF/CNPJ validation (F5-06/07)
--    Definitions captured from PRODUCTION via pg_get_functiondef (2026-08-04).
--    Rollback: DROP FUNCTION zapp.validate_cpf(text); zapp.validate_cnpj(text); zapp.mask_cpf(text);
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.mask_cpf(cpf text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE
    WHEN cpf IS NULL THEN NULL
    ELSE '***.' || substring(cpf, 5, 3) || '.***-**'
  END
$function$;

CREATE OR REPLACE FUNCTION zapp.validate_cnpj(p_cnpj text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_clean text; v_sum integer; v_digit integer; i integer;
  v_pesos1 integer[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
  v_pesos2 integer[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
BEGIN
  IF p_cnpj IS NULL THEN RETURN false; END IF;
  v_clean := regexp_replace(p_cnpj, '[^0-9]', '', 'g');
  IF length(v_clean) != 14 THEN RETURN false; END IF;
  IF v_clean ~ '^(\d)\1{13}$' THEN RETURN false; END IF;
  v_sum := 0;
  FOR i IN 1..12 LOOP v_sum := v_sum + (substr(v_clean, i, 1)::int * v_pesos1[i]); END LOOP;
  v_digit := 11 - (v_sum % 11); IF v_digit >= 10 THEN v_digit := 0; END IF;
  IF v_digit != substr(v_clean, 13, 1)::int THEN RETURN false; END IF;
  v_sum := 0;
  FOR i IN 1..13 LOOP v_sum := v_sum + (substr(v_clean, i, 1)::int * v_pesos2[i]); END LOOP;
  v_digit := 11 - (v_sum % 11); IF v_digit >= 10 THEN v_digit := 0; END IF;
  RETURN v_digit = substr(v_clean, 14, 1)::int;
END; $function$;

CREATE OR REPLACE FUNCTION zapp.validate_cpf(p_cpf text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_clean text; v_sum integer; v_digit integer; i integer;
BEGIN
  IF p_cpf IS NULL THEN RETURN false; END IF;
  v_clean := regexp_replace(p_cpf, '[^0-9]', '', 'g');
  IF length(v_clean) != 11 THEN RETURN false; END IF;
  IF v_clean ~ '^(\d)\1{10}$' THEN RETURN false; END IF;
  v_sum := 0;
  FOR i IN 1..9 LOOP v_sum := v_sum + (substr(v_clean, i, 1)::int * (11 - i)); END LOOP;
  v_digit := (v_sum * 10) % 11; IF v_digit = 10 THEN v_digit := 0; END IF;
  IF v_digit != substr(v_clean, 10, 1)::int THEN RETURN false; END IF;
  v_sum := 0;
  FOR i IN 1..10 LOOP v_sum := v_sum + (substr(v_clean, i, 1)::int * (12 - i)); END LOOP;
  v_digit := (v_sum * 10) % 11; IF v_digit = 10 THEN v_digit := 0; END IF;
  RETURN v_digit = substr(v_clean, 11, 1)::int;
END; $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION (fails loudly if any object missing)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing TEXT := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'zapp' AND c.relname = 'hmac_selftest_audit' AND c.relkind = 'r') THEN
    v_missing := v_missing || 'zapp.hmac_selftest_audit; ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'zapp' AND c.relname = 'instance_auth_events' AND c.relkind = 'r') THEN
    v_missing := v_missing || 'zapp.instance_auth_events; ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'zapp' AND p.proname = 'fn_retry_stuck_messages') THEN
    v_missing := v_missing || 'zapp.fn_retry_stuck_messages; ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'zapp' AND p.proname = 'fn_validate_whatsapp_connection_url') THEN
    v_missing := v_missing || 'zapp.fn_validate_whatsapp_connection_url; ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'zapp' AND p.proname = 'validate_cpf') THEN
    v_missing := v_missing || 'zapp.validate_cpf; ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'zapp' AND p.proname = 'validate_cnpj') THEN
    v_missing := v_missing || 'zapp.validate_cnpj; ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'zapp' AND p.proname = 'mask_cpf') THEN
    v_missing := v_missing || 'zapp.mask_cpf; ';
  END IF;

  IF v_missing <> '' THEN
    RAISE EXCEPTION 'MISSING after delta-724 migration: %', v_missing;
  END IF;
END $$;

COMMIT;
