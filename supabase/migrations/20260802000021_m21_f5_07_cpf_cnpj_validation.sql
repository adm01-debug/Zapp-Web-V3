-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260802000021_m21_f5_07_cpf_cnpj_validation.sql
-- Purpose  : F5-07 CRÍTICO — CPF/CNPJ digit + mod-11 validation functions
--            and CHECK constraints on evo.evolution_contacts.
--
--   Step 1  CREATE OR REPLACE FUNCTION zapp.validate_cpf(text) RETURNS boolean
--           IMMUTABLE PARALLEL SAFE — standard Brazilian CPF mod-11 algorithm:
--           NULL → NULL (so CHECK allows missing CPF);
--           Strips any non-digit chars (accepts "123.456.789-09" or "12345678909");
--           Must be exactly 11 digits; rejects all-same-digit sequences;
--           Verifies both check digits via mod-11.
--
--   Step 2  CREATE OR REPLACE FUNCTION zapp.validate_cnpj(text) RETURNS boolean
--           IMMUTABLE PARALLEL SAFE — standard Brazilian CNPJ mod-11 algorithm:
--           NULL → NULL; strips non-digits; must be 14 digits; not all-same;
--           Verifies both check digits with CNPJ weight sequences
--           [5,4,3,2,9,8,7,6,5,4,3,2] and [6,5,4,3,2,9,8,7,6,5,4,3,2].
--
--   Step 3  ADD CHECK constraints to evo.evolution_contacts (cpf/cnpj columns
--           were added by F5-06 / M-20):
--           ck_cpf_valid  — cpf  IS NULL OR zapp.validate_cpf(cpf)
--           ck_cnpj_valid — cnpj IS NULL OR zapp.validate_cnpj(cnpj)
--           Existing rows all have NULL (columns just added) → constraint passes
--           immediately; no NOT VALID needed, but we DROP IF EXISTS first for
--           idempotency.
--
--   Step 4  REVOKE / GRANT for new functions.
--
--   Step 5  Verification.
--
-- Note: Physical columns cpf/cnpj/pii_cpf_masked_at added by F5-06 (M-20).
-- Idempotência: CREATE OR REPLACE; DROP CONSTRAINT IF EXISTS + ADD.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: zapp.validate_cpf — Brazilian CPF mod-11 validation
--   Algorithm (Receita Federal):
--     1. Strip non-digits; must be exactly 11 digits.
--     2. Reject all-same-digit CPFs (000…0, 111…1, …).
--     3. First check digit  d[10]:
--          s1 = Σ d[i] * (11 - i)  for i = 1..9
--          r1 = s1 % 11
--          c1 = 0 if r1 < 2, else (11 - r1)
--          Must equal d[10].
--     4. Second check digit d[11]:
--          s2 = Σ d[i] * (12 - i)  for i = 1..10
--          r2 = s2 % 11
--          c2 = 0 if r2 < 2, else (11 - r2)
--          Must equal d[11].
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.validate_cpf(p_cpf text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $fn$
DECLARE
  v  text;
  s1 int := 0;
  s2 int := 0;
  c1 int;
  c2 int;
  i  int;
BEGIN
  IF p_cpf IS NULL THEN
    RETURN NULL;
  END IF;

  v := pg_catalog.regexp_replace(p_cpf, '[^0-9]', '', 'g');

  IF pg_catalog.length(v) <> 11 THEN
    RETURN false;
  END IF;

  -- Reject all-same-digit sequences (111.111.111-11, etc.)
  IF v ~ '^(.)\1{10}$' THEN
    RETURN false;
  END IF;

  -- First check digit (position 10)
  FOR i IN 1..9 LOOP
    s1 := s1 + pg_catalog.substring(v, i, 1)::int * (11 - i);
  END LOOP;
  c1 := s1 % 11;
  IF c1 < 2 THEN c1 := 0; ELSE c1 := 11 - c1; END IF;
  IF c1 <> pg_catalog.substring(v, 10, 1)::int THEN
    RETURN false;
  END IF;

  -- Second check digit (position 11)
  FOR i IN 1..10 LOOP
    s2 := s2 + pg_catalog.substring(v, i, 1)::int * (12 - i);
  END LOOP;
  c2 := s2 % 11;
  IF c2 < 2 THEN c2 := 0; ELSE c2 := 11 - c2; END IF;

  RETURN c2 = pg_catalog.substring(v, 11, 1)::int;
END;
$fn$;

COMMENT ON FUNCTION zapp.validate_cpf(text)
  IS 'Validates a Brazilian CPF number (mod-11). Accepts formatted (123.456.789-09) or '
     'raw (12345678909) strings. Returns NULL for NULL input (missing CPF = allowed). '
     'Returns false for invalid length, all-same-digit, or wrong check digits.';


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: zapp.validate_cnpj — Brazilian CNPJ mod-11 validation
--   Algorithm (Receita Federal):
--     1. Strip non-digits; must be exactly 14 digits.
--     2. Reject all-same-digit CNPJs.
--     3. First check digit  d[13]:
--          weights w1 = [5,4,3,2,9,8,7,6,5,4,3,2]
--          s1 = Σ d[i] * w1[i]  for i = 1..12
--          r1 = s1 % 11
--          c1 = 0 if r1 < 2, else (11 - r1)
--          Must equal d[13].
--     4. Second check digit d[14]:
--          weights w2 = [6,5,4,3,2,9,8,7,6,5,4,3,2]
--          s2 = Σ d[i] * w2[i]  for i = 1..13
--          r2 = s2 % 11
--          c2 = 0 if r2 < 2, else (11 - r2)
--          Must equal d[14].
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.validate_cnpj(p_cnpj text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $fn$
DECLARE
  v   text;
  w1  int[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
  w2  int[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s1  int   := 0;
  s2  int   := 0;
  c1  int;
  c2  int;
  i   int;
BEGIN
  IF p_cnpj IS NULL THEN
    RETURN NULL;
  END IF;

  v := pg_catalog.regexp_replace(p_cnpj, '[^0-9]', '', 'g');

  IF pg_catalog.length(v) <> 14 THEN
    RETURN false;
  END IF;

  -- Reject all-same-digit sequences (00.000.000/0000-00, etc.)
  IF v ~ '^(.)\1{13}$' THEN
    RETURN false;
  END IF;

  -- First check digit (position 13)
  FOR i IN 1..12 LOOP
    s1 := s1 + pg_catalog.substring(v, i, 1)::int * w1[i];
  END LOOP;
  c1 := s1 % 11;
  IF c1 < 2 THEN c1 := 0; ELSE c1 := 11 - c1; END IF;
  IF c1 <> pg_catalog.substring(v, 13, 1)::int THEN
    RETURN false;
  END IF;

  -- Second check digit (position 14)
  FOR i IN 1..13 LOOP
    s2 := s2 + pg_catalog.substring(v, i, 1)::int * w2[i];
  END LOOP;
  c2 := s2 % 11;
  IF c2 < 2 THEN c2 := 0; ELSE c2 := 11 - c2; END IF;

  RETURN c2 = pg_catalog.substring(v, 14, 1)::int;
END;
$fn$;

COMMENT ON FUNCTION zapp.validate_cnpj(text)
  IS 'Validates a Brazilian CNPJ number (mod-11). Accepts formatted (12.345.678/0001-95) '
     'or raw (12345678000195) strings. Returns NULL for NULL input. '
     'Returns false for invalid length, all-same-digit, or wrong check digits.';


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: CHECK constraints on evo.evolution_contacts
--   NULL is allowed (contact may not have CPF/CNPJ on file).
--   All existing rows have cpf IS NULL and cnpj IS NULL (columns added by M-20
--   with no DEFAULT) → no existing rows violate the constraint.
--   DROP IF EXISTS first for idempotency.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE evo.evolution_contacts
  DROP CONSTRAINT IF EXISTS ck_cpf_valid;

ALTER TABLE evo.evolution_contacts
  ADD CONSTRAINT ck_cpf_valid
    CHECK (cpf IS NULL OR zapp.validate_cpf(cpf));

ALTER TABLE evo.evolution_contacts
  DROP CONSTRAINT IF EXISTS ck_cnpj_valid;

ALTER TABLE evo.evolution_contacts
  ADD CONSTRAINT ck_cnpj_valid
    CHECK (cnpj IS NULL OR zapp.validate_cnpj(cnpj));

COMMENT ON CONSTRAINT ck_cpf_valid ON evo.evolution_contacts
  IS 'CPF mod-11 validation. NULL = contact does not have a CPF on file (valid). '
     'Non-NULL values must pass zapp.validate_cpf() (F5-07).';
COMMENT ON CONSTRAINT ck_cnpj_valid ON evo.evolution_contacts
  IS 'CNPJ mod-11 validation. NULL = contact does not have a CNPJ on file (valid). '
     'Non-NULL values must pass zapp.validate_cnpj() (F5-07).';


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 4: REVOKE / GRANT
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION zapp.validate_cpf(text)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION zapp.validate_cnpj(text) FROM PUBLIC, anon;

GRANT  EXECUTE ON FUNCTION zapp.validate_cpf(text)  TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION zapp.validate_cnpj(text) TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 5: Verification
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn_count   integer;
  v_ck_count   integer;
  v_cpf_ok     boolean;
  v_cnpj_ok    boolean;
BEGIN
  -- Functions exist in zapp schema
  SELECT COUNT(*) INTO v_fn_count
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname IN ('validate_cpf', 'validate_cnpj');

  IF v_fn_count < 2 THEN
    RAISE EXCEPTION '[M-21 VER] validate_cpf/validate_cnpj not found in zapp (found %/2)', v_fn_count;
  END IF;

  -- CHECK constraints exist on evo.evolution_contacts
  SELECT COUNT(*) INTO v_ck_count
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class      r  ON r.oid  = c.conrelid
    JOIN pg_catalog.pg_namespace  n  ON n.oid  = r.relnamespace
   WHERE n.nspname = 'evo'
     AND r.relname = 'evolution_contacts'
     AND c.contype = 'c'
     AND c.conname IN ('ck_cpf_valid', 'ck_cnpj_valid');

  IF v_ck_count < 2 THEN
    RAISE EXCEPTION '[M-21 VER] CHECK constraints not found on evo.evolution_contacts (found %/2)', v_ck_count;
  END IF;

  -- Smoke-test validate_cpf with known valid/invalid CPFs
  -- Valid: 529.982.247-25 (well-known test CPF)
  v_cpf_ok := zapp.validate_cpf('529.982.247-25');
  IF NOT v_cpf_ok THEN
    RAISE EXCEPTION '[M-21 VER] validate_cpf returned false for known-valid CPF 529.982.247-25';
  END IF;

  -- Invalid: 111.111.111-11 (all-same)
  v_cpf_ok := zapp.validate_cpf('111.111.111-11');
  IF v_cpf_ok THEN
    RAISE EXCEPTION '[M-21 VER] validate_cpf returned true for all-same CPF 111.111.111-11';
  END IF;

  -- Invalid: wrong check digit
  v_cpf_ok := zapp.validate_cpf('529.982.247-26');
  IF v_cpf_ok THEN
    RAISE EXCEPTION '[M-21 VER] validate_cpf returned true for CPF with wrong check digit';
  END IF;

  -- NULL returns NULL
  v_cpf_ok := zapp.validate_cpf(NULL);
  IF v_cpf_ok IS NOT NULL THEN
    RAISE EXCEPTION '[M-21 VER] validate_cpf(NULL) should return NULL, got %', v_cpf_ok;
  END IF;

  -- Smoke-test validate_cnpj with known valid/invalid CNPJ
  -- Valid: 11.222.333/0001-81 (well-known test CNPJ)
  v_cnpj_ok := zapp.validate_cnpj('11.222.333/0001-81');
  IF NOT v_cnpj_ok THEN
    RAISE EXCEPTION '[M-21 VER] validate_cnpj returned false for known-valid CNPJ 11.222.333/0001-81';
  END IF;

  -- Invalid: 00.000.000/0000-00 (all-same)
  v_cnpj_ok := zapp.validate_cnpj('00.000.000/0000-00');
  IF v_cnpj_ok THEN
    RAISE EXCEPTION '[M-21 VER] validate_cnpj returned true for all-zero CNPJ';
  END IF;

  -- Invalid: wrong check digit
  v_cnpj_ok := zapp.validate_cnpj('11.222.333/0001-82');
  IF v_cnpj_ok THEN
    RAISE EXCEPTION '[M-21 VER] validate_cnpj returned true for CNPJ with wrong check digit';
  END IF;

  -- NULL returns NULL
  v_cnpj_ok := zapp.validate_cnpj(NULL);
  IF v_cnpj_ok IS NOT NULL THEN
    RAISE EXCEPTION '[M-21 VER] validate_cnpj(NULL) should return NULL, got %', v_cnpj_ok;
  END IF;

  RAISE NOTICE '[M-21 VER] F5-07 OK — functions(%) ✓ constraints(%) ✓ cpf_smoke ✓ cnpj_smoke ✓',
    v_fn_count, v_ck_count;
END $$;
