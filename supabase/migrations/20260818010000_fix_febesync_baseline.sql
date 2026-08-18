-- ============================================================================
-- Fix baseline check:febesync (18/08)
-- DB-as-source: espelho versionado do que JÁ roda no DB vivo.
--  1) zapp.evolution_followups existia no DB (usada pelo front) sem migration
--     → check-febe-sync falhava ("tabela sem definição em migrations").
--  2) fn_block_internal_media_url + fn_enforce_direction tinham ALTER sem CREATE
--     → quebrava 'supabase db reset'.
-- ============================================================================

CREATE TABLE IF NOT EXISTS zapp.evolution_followups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      uuid,
  conversation_id uuid,
  deal_id         uuid,
  followup_type   varchar NOT NULL,
  scheduled_at    timestamptz NOT NULL,
  template_id     uuid,
  custom_message  text,
  status          varchar DEFAULT 'scheduled',
  sent_at         timestamptz,
  response_at     timestamptz,
  error_message   text,
  attempts        integer DEFAULT 0,
  max_attempts    integer DEFAULT 3,
  created_by      varchar,
  instance_name   varchar DEFAULT 'wpp2',
  metadata        jsonb,
  created_at      timestamptz DEFAULT now(),
  triggered_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_evolution_followups_status_scheduled
  ON zapp.evolution_followups (status, scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_evolution_followups_contact
  ON zapp.evolution_followups (contact_id);

-- Funções que existiam no DB via ALTER sem CREATE (espelho do DB vivo):
CREATE OR REPLACE FUNCTION zapp.fn_block_internal_media_url()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_url    text;
  v_pattern text;
  v_irrecoverable_patterns text[] := ARRAY[
    'http://localhost',
    'http://127.0.0.1',
    'http://0.0.0.0',
    '://localhost:',
    '://127.0.0.1:',
    '://0.0.0.0:'
  ];
BEGIN
  IF TG_TABLE_NAME LIKE 'evolution_messages%' THEN
    v_url := NEW.media_url;
  ELSIF TG_TABLE_NAME = 'evolution_media' THEN
    v_url := NEW.storage_url;
  ELSIF TG_TABLE_NAME = 'evolution_contacts' THEN
    v_url := NEW.profile_picture_url;
  END IF;

  IF v_url IS NOT NULL AND v_url <> '' THEN
    FOREACH v_pattern IN ARRAY v_irrecoverable_patterns LOOP
      IF v_url ILIKE ('%' || v_pattern || '%') THEN
        RAISE EXCEPTION '[ZAPP-SECURITY] URL localhost/loopback irrecuperável em %.%: "%" (padrão: "%")',
          TG_TABLE_SCHEMA, TG_TABLE_NAME, v_url, v_pattern
          USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION zapp.fn_enforce_direction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
BEGIN
  IF NEW.from_me IS TRUE  AND NEW.direction IS DISTINCT FROM 'outbound' THEN NEW.direction := 'outbound'; END IF;
  IF NEW.from_me IS FALSE AND NEW.direction IS DISTINCT FROM 'inbound'  THEN NEW.direction := 'inbound';  END IF;
  RETURN NEW;
END $function$;
