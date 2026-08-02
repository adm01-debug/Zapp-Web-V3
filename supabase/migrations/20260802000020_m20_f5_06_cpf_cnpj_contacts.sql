-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260802000020_m20_f5_06_cpf_cnpj_contacts.sql
-- Purpose  : F5-06 CRÍTICO — Add CPF / CNPJ / pii_cpf_masked_at to the
--            contacts pipeline:
--
--   Step 1  ADD COLUMN IF NOT EXISTS cpf text, cnpj text,
--           pii_cpf_masked_at timestamptz to evo.evolution_contacts.
--
--   Step 2  Update zapp.contacts VIEW via DO block (adapts to live definition —
--           production was modified live to use function calls instead of CTEs,
--           documented in R29 migration):
--           (a) Replace NULL::text AS cpf → ec.cpf (same slot, same type).
--           (b) Append ec.cnpj, ec.pii_cpf_masked_at before the FROM clause.
--               New columns MUST go at the end (CREATE OR REPLACE VIEW rules).
--           Recreates view with WITH (security_invoker = on) preserved.
--
--   Step 3  CREATE OR REPLACE zapp.fn_contacts_view_insert_handler():
--           zapp-schema version with cpf/cnpj propagation; references
--           zapp.whatsapp_connections (not public); correct search_path.
--
--   Step 4  CREATE OR REPLACE zapp.fn_contacts_view_update_handler():
--           Adds cpf / cnpj / pii_cpf_masked_at via CASE WHEN IS DISTINCT FROM
--           pattern; references zapp.whatsapp_connections.
--
--   Step 5  INSTEAD OF INSERT + INSTEAD OF UPDATE triggers on zapp.contacts.
--           (INSTEAD OF DELETE already set by M-16 — untouched.)
--
--   Step 6  REVOKE / GRANT for new functions.
--
--   Step 7  Verification.
--
-- Note: CPF/CNPJ digit + mod-11 validation is in F5-07 (validate_cpf /
--       validate_cnpj IMMUTABLE functions + CHECK constraints).
-- Idempotência: ADD COLUMN IF NOT EXISTS; CREATE OR REPLACE; DROP TRIGGER IF EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Add CPF / CNPJ / pii_cpf_masked_at to evo.evolution_contacts
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE evo.evolution_contacts
  ADD COLUMN IF NOT EXISTS cpf               text,
  ADD COLUMN IF NOT EXISTS cnpj              text,
  ADD COLUMN IF NOT EXISTS pii_cpf_masked_at timestamptz;

COMMENT ON COLUMN evo.evolution_contacts.cpf
  IS 'CPF do contato (11 dígitos sem pontuação). Validação mod-11 adicionada em F5-07.';
COMMENT ON COLUMN evo.evolution_contacts.cnpj
  IS 'CNPJ do contato (14 dígitos sem pontuação). Validação adicionada em F5-07.';
COMMENT ON COLUMN evo.evolution_contacts.pii_cpf_masked_at
  IS 'Timestamp do último mascaramento de CPF (LGPD). NULL = CPF ainda não foi mascarado.';


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Update zapp.contacts VIEW
--   Reads the live pg_views.definition so we adapt to whatever the production
--   view definition is (function-call version or CTE version).
--   Changes:
--     (a) NULL::text AS cpf  →  ec.cpf      (same column slot, same type)
--     (b) Append ec.cnpj, ec.pii_cpf_masked_at before FROM clause
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_def text;
  v_pos integer;
BEGIN
  SELECT definition INTO v_def
    FROM pg_catalog.pg_views
   WHERE schemaname = 'zapp' AND viewname = 'contacts';

  IF NOT FOUND OR v_def IS NULL THEN
    RAISE EXCEPTION '[M-20 Step2] zapp.contacts view not found in pg_views';
  END IF;

  -- (a) Replace NULL::text AS cpf → ec.cpf
  --     Only patch if the placeholder is still there (idempotent).
  IF position('NULL::text AS cpf' IN v_def) > 0 THEN
    v_def := replace(v_def, 'NULL::text AS cpf', 'ec.cpf');
    RAISE NOTICE '[M-20 Step2] Replaced NULL::text AS cpf → ec.cpf';
  ELSIF position('ec.cpf' IN v_def) > 0 THEN
    RAISE NOTICE '[M-20 Step2] ec.cpf already present — skip (a)';
  ELSE
    RAISE WARNING '[M-20 Step2] Neither "NULL::text AS cpf" nor "ec.cpf" found — cpf handling uncertain';
  END IF;

  -- (b) Append ec.cnpj, ec.pii_cpf_masked_at before the main FROM clause.
  --     Both CTEs (archive) and function-call (production) versions have
  --     exactly one occurrence of "FROM evo.evolution_contacts" in the main
  --     SELECT (CTEs use zapp.workspaces and zapp.whatsapp_connections).
  IF position('ec.cnpj' IN v_def) = 0 THEN
    v_pos := strpos(v_def, 'FROM evo.evolution_contacts');
    IF v_pos = 0 THEN
      RAISE EXCEPTION '[M-20 Step2] Landmark "FROM evo.evolution_contacts" not found in view definition';
    END IF;
    -- Trim trailing whitespace from the column list, then insert new cols.
    v_def := rtrim(left(v_def, v_pos - 1))
           || E',\n   ec.cnpj,\n   ec.pii_cpf_masked_at\n '
           || right(v_def, -(v_pos - 1));
    RAISE NOTICE '[M-20 Step2] Appended ec.cnpj, ec.pii_cpf_masked_at';
  ELSE
    RAISE NOTICE '[M-20 Step2] ec.cnpj already present — skip (b)';
  END IF;

  -- Recreate the view preserving security_invoker=on.
  EXECUTE 'CREATE OR REPLACE VIEW zapp.contacts WITH (security_invoker = on) AS ' || v_def;
  RAISE NOTICE '[M-20 Step2] zapp.contacts recreated with cpf/cnpj/pii_cpf_masked_at';
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: zapp.fn_contacts_view_insert_handler — cpf/cnpj propagation
--   zapp-schema counterpart of public.fn_contacts_view_insert_handler.
--   Key differences vs archive public version:
--     • search_path = pg_catalog, zapp, evo, public  (SECURITY DEFINER safe)
--     • References zapp.whatsapp_connections (not public.whatsapp_connections)
--     • INSERT includes cpf, cnpj columns
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_contacts_view_insert_handler()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'zapp', 'evo', 'public'
AS $function$
DECLARE
  v_id       uuid;
  v_instance text;
BEGIN
  v_instance := NULLIF(NEW.instance_name, '');

  IF v_instance IS NULL AND NEW.whatsapp_connection_id IS NOT NULL THEN
    SELECT wc.instance_name INTO v_instance
      FROM zapp.whatsapp_connections wc
     WHERE wc.id = NEW.whatsapp_connection_id;
  END IF;

  INSERT INTO evo.evolution_contacts (
    id, remote_jid, phone_number, push_name, profile_picture_url, full_name,
    email, company, role_title, lead_status, lead_source, lead_score,
    whatsapp_labels, tags, assigned_to, queue_id, notes, instance_name,
    raw_data, total_purchases, last_message_at, created_at, updated_at,
    cpf, cnpj
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()),
    COALESCE(NULLIF(NEW.remote_jid, ''), NULLIF(NEW.external_id, ''), NEW.phone || '@s.whatsapp.net'),
    NEW.phone,
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
-- Step 4: zapp.fn_contacts_view_update_handler — cpf/cnpj/pii propagation
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_contacts_view_update_handler()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'zapp', 'evo', 'public'
AS $function$
DECLARE
  v_instance text;
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
                               THEN NEW.phone             ELSE ec.phone_number        END,
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
-- Step 5: INSTEAD OF INSERT + UPDATE triggers on zapp.contacts
--   M-16 already set INSTEAD OF DELETE → zapp.fn_contacts_view_delete_handler.
--   This step adds INSERT and UPDATE (were missing — any INSERT/UPDATE on
--   zapp.contacts before this migration failed with "cannot insert into view").
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS contacts_insert_trigger ON zapp.contacts;
CREATE TRIGGER contacts_insert_trigger
  INSTEAD OF INSERT ON zapp.contacts
  FOR EACH ROW EXECUTE FUNCTION zapp.fn_contacts_view_insert_handler();

DROP TRIGGER IF EXISTS contacts_update_trigger ON zapp.contacts;
CREATE TRIGGER contacts_update_trigger
  INSTEAD OF UPDATE ON zapp.contacts
  FOR EACH ROW EXECUTE FUNCTION zapp.fn_contacts_view_update_handler();


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 7: Verification
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_col_count  integer;
  v_view_cols  integer;
  v_trig_count integer;
  v_fn_count   integer;
BEGIN
  -- Physical columns on evo.evolution_contacts
  SELECT COUNT(*) INTO v_col_count
    FROM information_schema.columns
   WHERE table_schema = 'evo'
     AND table_name   = 'evolution_contacts'
     AND column_name IN ('cpf', 'cnpj', 'pii_cpf_masked_at');

  IF v_col_count < 3 THEN
    RAISE EXCEPTION '[M-20 VER] Missing physical columns on evo.evolution_contacts (found %/3)', v_col_count;
  END IF;

  -- Columns visible in zapp.contacts view
  SELECT COUNT(*) INTO v_view_cols
    FROM information_schema.columns
   WHERE table_schema = 'zapp'
     AND table_name   = 'contacts'
     AND column_name IN ('cpf', 'cnpj', 'pii_cpf_masked_at');

  IF v_view_cols < 3 THEN
    RAISE EXCEPTION '[M-20 VER] zapp.contacts view missing cpf/cnpj/pii columns (found %/3)', v_view_cols;
  END IF;

  -- INSTEAD OF INSERT + UPDATE triggers on zapp.contacts
  SELECT COUNT(*) INTO v_trig_count
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class      c  ON c.oid  = t.tgrelid
    JOIN pg_catalog.pg_namespace  n  ON n.oid  = c.relnamespace
   WHERE n.nspname = 'zapp'
     AND c.relname = 'contacts'
     AND t.tgname  IN ('contacts_insert_trigger', 'contacts_update_trigger')
     AND NOT t.tgisinternal;

  IF v_trig_count < 2 THEN
    RAISE EXCEPTION '[M-20 VER] INSERT/UPDATE triggers on zapp.contacts not found (found %/2)', v_trig_count;
  END IF;

  -- Handler functions in zapp schema
  SELECT COUNT(*) INTO v_fn_count
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname IN ('fn_contacts_view_insert_handler', 'fn_contacts_view_update_handler');

  IF v_fn_count < 2 THEN
    RAISE EXCEPTION '[M-20 VER] fn_contacts_view_insert/update_handler not found in zapp (found %/2)', v_fn_count;
  END IF;

  RAISE NOTICE '[M-20 VER] F5-06 OK — phys_cols(%) ✓ view_cols(%) ✓ triggers(%) ✓ functions(%) ✓',
    v_col_count, v_view_cols, v_trig_count, v_fn_count;
END $$;
