-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 20260818220000_etapa62_dedup_atomico_recipients
-- Etapa     : E62 (PLANO-100-ETAPAS, fase 7) — subetapas 62.4/62.5
-- Purpose   : Dedup ATÔMICO de destinatários — o MESMO contato nunca entra
--             2x na mesma campanha:
--             * UNIQUE (campaign_id, contact_id) em talkx_recipients e em
--               campaign_contacts (constraints JÁ EXISTENTES no banco de
--               produção — 2026-08-04 — mas não espelhadas no repo; aqui o
--               espelho é criado com guard, incluindo pré-dedupe de
--               duplicatas históricas antes de aplicar a constraint).
--             * Coluna variant (uuid) nas duas tabelas — persistência da
--               variante A/B escolhida POR destinatário no disparo (62.5).
-- Idempotent: guards (pg_constraint / information_schema) — safe to re-run.
-- Rollback  : ALTER TABLE zapp.talkx_recipients DROP CONSTRAINT IF EXISTS
--             talkx_recipients_campaign_id_contact_id_key;
--             ALTER TABLE zapp.campaign_contacts DROP CONSTRAINT IF EXISTS
--             uq_campaign_contacts_campaign_contact;
--             ALTER TABLE zapp.talkx_recipients DROP COLUMN IF EXISTS variant;
--             ALTER TABLE zapp.campaign_contacts DROP COLUMN IF EXISTS variant;
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. UNIQUE (campaign_id, contact_id) em talkx_recipients
--    Pré-dedupe: duplicatas históricas são removidas (mantém a linha de menor
--    id — a mais antiga), depois a constraint é criada.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'talkx_recipients'
      AND con.conname = 'talkx_recipients_campaign_id_contact_id_key'
  ) THEN
    DELETE FROM zapp.talkx_recipients r
    USING zapp.talkx_recipients r2
    WHERE r.campaign_id = r2.campaign_id
      AND r.contact_id = r2.contact_id
      AND r.id > r2.id;

    ALTER TABLE zapp.talkx_recipients
      ADD CONSTRAINT talkx_recipients_campaign_id_contact_id_key
      UNIQUE (campaign_id, contact_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. UNIQUE (campaign_id, contact_id) em campaign_contacts
--    (mesmo padrão; nome espelha o constraint de produção)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'campaign_contacts'
      AND con.conname = 'uq_campaign_contacts_campaign_contact'
  ) THEN
    DELETE FROM zapp.campaign_contacts r
    USING zapp.campaign_contacts r2
    WHERE r.campaign_id = r2.campaign_id
      AND r.contact_id = r2.contact_id
      AND r.id > r2.id;

    ALTER TABLE zapp.campaign_contacts
      ADD CONSTRAINT uq_campaign_contacts_campaign_contact
      UNIQUE (campaign_id, contact_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Coluna variant (uuid) — variante A/B persistida POR destinatário
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp' AND table_name = 'talkx_recipients' AND column_name = 'variant'
  ) THEN
    ALTER TABLE zapp.talkx_recipients ADD COLUMN variant uuid;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp' AND table_name = 'campaign_contacts' AND column_name = 'variant'
  ) THEN
    ALTER TABLE zapp.campaign_contacts ADD COLUMN variant uuid;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION — falha se constraint/coluna esperadas faltarem
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing TEXT := '';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'talkx_recipients'
      AND con.conname = 'talkx_recipients_campaign_id_contact_id_key'
  ) THEN
    v_missing := v_missing || 'talkx_recipients UNIQUE; ';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'campaign_contacts'
      AND con.conname = 'uq_campaign_contacts_campaign_contact'
  ) THEN
    v_missing := v_missing || 'campaign_contacts UNIQUE; ';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp' AND table_name = 'talkx_recipients' AND column_name = 'variant'
  ) THEN
    v_missing := v_missing || 'talkx_recipients.variant; ';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp' AND table_name = 'campaign_contacts' AND column_name = 'variant'
  ) THEN
    v_missing := v_missing || 'campaign_contacts.variant; ';
  END IF;
  IF v_missing <> '' THEN
    RAISE EXCEPTION 'MISSING after 20260818220000: %', v_missing;
  END IF;
END $$;

COMMIT;
