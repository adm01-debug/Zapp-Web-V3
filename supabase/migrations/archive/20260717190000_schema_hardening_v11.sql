-- =============================================================================
-- Migration v11: Schema Hardening — 6 novos CHECK constraints (zapp + evo)
-- Data: 2026-07-17
-- Autor: Claude Code (schema audit)
--
-- Contexto:
--   Continuação do schema audit (v8→v9→v10→v11).
--   Auditados em produção: valores confirmados como conjuntos fechados.
--
-- Alterações (NOT VALID + VALIDATE para zero downtime):
--   1. zapp.n8n_variables.type         (34 rows, NOT NULL, varchar)
--   2. zapp.calls.direction            (31 rows, NOT NULL, text)
--   3. zapp.alert_channels.min_severity(3 rows, nullable, text)
--   4. zapp.whatsapp_connections.api_type   (3 rows, NOT NULL, text)
--   5. zapp.whatsapp_connections.routing_mode (3 rows, NOT NULL, text)
--   6. evo.evolution_media.media_type  (23366 rows, nullable, text)
--
-- Valores auditados em produção:
--   n8n_variables.type      : string, number, boolean (+ spec: all 3)
--   calls.direction         : inbound (26), outbound (5)
--   alert_channels.min_severity: info, warning, critical (spec)
--   whatsapp_connections.api_type: evolution (3 rows), official (spec)
--   whatsapp_connections.routing_mode: manual/sticky/rules/round_robin (spec)
--   evolution_media.media_type: image/audio/document/video/sticker (WA API spec)
--
-- Contagem pós-v11 esperada:
--   zapp: 142 atuais + 5 = 147 CHECK constraints
--   evo:  114 atuais + 1 = 115 CHECK constraints
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PARTE 1: CHECK em zapp.n8n_variables.type
-- Tabela base, 34 linhas, NOT NULL
-- ---------------------------------------------------------------------------
DO $t1$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c   ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp'
      AND c.relname = 'n8n_variables'
      AND co.conname = 'n8n_variables_type_check'
  ) THEN
    ALTER TABLE zapp.n8n_variables
      ADD CONSTRAINT n8n_variables_type_check
      CHECK (type = ANY(ARRAY['string','number','boolean']))
      NOT VALID;
    RAISE NOTICE '[v11] CHECK n8n_variables_type_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v11] CHECK n8n_variables_type_check já existe — skip';
  END IF;
END $t1$;

ALTER TABLE zapp.n8n_variables
  VALIDATE CONSTRAINT n8n_variables_type_check;

-- ---------------------------------------------------------------------------
-- PARTE 2: CHECK em zapp.calls.direction
-- Tabela base, 31 linhas, NOT NULL, text
-- Valores: inbound (26), outbound (5)
-- ---------------------------------------------------------------------------
DO $t2$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c   ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp'
      AND c.relname = 'calls'
      AND co.conname = 'calls_direction_check'
  ) THEN
    ALTER TABLE zapp.calls
      ADD CONSTRAINT calls_direction_check
      CHECK (direction = ANY(ARRAY['inbound','outbound']))
      NOT VALID;
    RAISE NOTICE '[v11] CHECK calls_direction_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v11] CHECK calls_direction_check já existe — skip';
  END IF;
END $t2$;

ALTER TABLE zapp.calls
  VALIDATE CONSTRAINT calls_direction_check;

-- ---------------------------------------------------------------------------
-- PARTE 3: CHECK em zapp.alert_channels.min_severity
-- Tabela base, 3 linhas, nullable, text
-- Valores: info/warning/critical (spec Zapp alerting)
-- ---------------------------------------------------------------------------
DO $t3$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c   ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp'
      AND c.relname = 'alert_channels'
      AND co.conname = 'alert_channels_min_severity_check'
  ) THEN
    ALTER TABLE zapp.alert_channels
      ADD CONSTRAINT alert_channels_min_severity_check
      CHECK (
        min_severity IS NULL
        OR min_severity = ANY(ARRAY['info','warning','critical'])
      )
      NOT VALID;
    RAISE NOTICE '[v11] CHECK alert_channels_min_severity_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v11] CHECK alert_channels_min_severity_check já existe — skip';
  END IF;
END $t3$;

ALTER TABLE zapp.alert_channels
  VALIDATE CONSTRAINT alert_channels_min_severity_check;

-- ---------------------------------------------------------------------------
-- PARTE 4: CHECKs em zapp.whatsapp_connections (api_type + routing_mode)
-- Tabela base, 3 linhas, ambas NOT NULL
-- api_type   : evolution (3 rows), official (spec)
-- routing_mode: manual/sticky/rules/round_robin (spec)
-- ---------------------------------------------------------------------------
DO $t4$
BEGIN
  -- api_type
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c   ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp'
      AND c.relname = 'whatsapp_connections'
      AND co.conname = 'whatsapp_connections_api_type_check'
  ) THEN
    ALTER TABLE zapp.whatsapp_connections
      ADD CONSTRAINT whatsapp_connections_api_type_check
      CHECK (api_type = ANY(ARRAY['evolution','official']))
      NOT VALID;
    RAISE NOTICE '[v11] CHECK whatsapp_connections_api_type_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v11] CHECK whatsapp_connections_api_type_check já existe — skip';
  END IF;

  -- routing_mode
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c   ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp'
      AND c.relname = 'whatsapp_connections'
      AND co.conname = 'whatsapp_connections_routing_mode_check'
  ) THEN
    ALTER TABLE zapp.whatsapp_connections
      ADD CONSTRAINT whatsapp_connections_routing_mode_check
      CHECK (routing_mode = ANY(ARRAY['manual','sticky','rules','round_robin']))
      NOT VALID;
    RAISE NOTICE '[v11] CHECK whatsapp_connections_routing_mode_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v11] CHECK whatsapp_connections_routing_mode_check já existe — skip';
  END IF;
END $t4$;

ALTER TABLE zapp.whatsapp_connections VALIDATE CONSTRAINT whatsapp_connections_api_type_check;
ALTER TABLE zapp.whatsapp_connections VALIDATE CONSTRAINT whatsapp_connections_routing_mode_check;

-- ---------------------------------------------------------------------------
-- PARTE 5: CHECK em evo.evolution_media.media_type
-- Tabela base, 23366 linhas, nullable, text
-- Valores WA API: image/audio/document/video/sticker
-- ---------------------------------------------------------------------------
DO $t5$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c   ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_media'
      AND co.conname = 'evolution_media_media_type_check'
  ) THEN
    ALTER TABLE evo.evolution_media
      ADD CONSTRAINT evolution_media_media_type_check
      CHECK (
        media_type IS NULL
        OR media_type = ANY(ARRAY[
          'image','audio','document','video','sticker'
        ])
      )
      NOT VALID;
    RAISE NOTICE '[v11] CHECK evolution_media_media_type_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v11] CHECK evolution_media_media_type_check já existe — skip';
  END IF;
END $t5$;

ALTER TABLE evo.evolution_media
  VALIDATE CONSTRAINT evolution_media_media_type_check;

-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO FINAL
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_not_valid  integer;
  v_new_checks integer;
BEGIN
  -- Zero NOT VALID em zapp+evo
  SELECT COUNT(*) INTO v_not_valid
  FROM pg_constraint co
  JOIN pg_class     c ON c.oid = co.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE co.contype = 'c'
    AND NOT co.convalidated
    AND n.nspname IN ('zapp','evo');

  -- Os 6 novos CHECK devem estar validados
  SELECT COUNT(DISTINCT co.conname) INTO v_new_checks
  FROM pg_constraint co
  JOIN pg_class     c ON c.oid = co.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE co.contype = 'c'
    AND co.convalidated
    AND co.conname IN (
      'n8n_variables_type_check',
      'calls_direction_check',
      'alert_channels_min_severity_check',
      'whatsapp_connections_api_type_check',
      'whatsapp_connections_routing_mode_check',
      'evolution_media_media_type_check'
    );

  RAISE NOTICE '[v11] VERIFY: NOT VALID restantes = % | novos CHECK validados = %/6',
               v_not_valid, v_new_checks;

  IF v_not_valid > 0 THEN
    RAISE EXCEPTION '[v11] FALHA: % constraint(s) NOT VALID após migration!', v_not_valid;
  END IF;

  IF v_new_checks < 6 THEN
    RAISE EXCEPTION '[v11] FALHA: apenas %/6 novos CHECK validados!', v_new_checks;
  END IF;

  RAISE NOTICE '[v11] ✓ Migration v11 aplicada com sucesso.';
END $verify$;
