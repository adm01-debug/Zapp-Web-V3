-- =============================================================================
-- Migration v13: Fix cross-table constraint mismatch in evo.evolution_connection_history
-- Data: 2026-07-17
-- Autor: Claude Code (schema audit — FASE B3 failure diagnosis)
--
-- Problema diagnosticado:
--   O trigger zapp.fn_log_whatsapp_connection_state_change() faz INSERT em
--   zapp.evolution_connection_history (VIEW → evo.evolution_connection_history)
--   mapeando NEW.status → state e OLD.status → previous_state.
--
--   zapp.whatsapp_connections_status_check permite 6 valores:
--     ['connected','disconnected','connecting','qr_pending','banned','logged_out']
--
--   Mas evo.evolution_connection_history_state_check e previous_state_check
--   permitiam apenas 5 valores — sem 'logged_out':
--     ['connecting','connected','disconnected','qr_pending','banned']
--
--   Resultado: qualquer UPDATE de whatsapp_connections.status para/de 'logged_out'
--   causava violação de CHECK constraint silenciosa (SQLSTATE 23514), tornando
--   'logged_out' completamente inutilizável em produção.
--   0 registros históricos de logout jamais foram gravados (confirmado via SELECT).
--
-- Impacto:
--   - Toda transição de estado para 'logged_out' falha silenciosamente
--   - Toda transição de estado a partir de 'logged_out' também falha
--   - WhatsApp logout → reconnect é impossível via UPDATE do status
--
-- Correção: adicionar 'logged_out' a ambas as constraints NOT VALID + VALIDATE
--   (DROP + ADD porque não existe ALTER CONSTRAINT para CHECK em PG15)
--
-- Evidência: FASE B3 acceptance test detectou a falha via check_violation
--   ao tentar UPDATE zapp.whatsapp_connections SET status = 'logged_out'
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PARTE 1: evolution_connection_history.state_check
-- Adiciona 'logged_out' ao conjunto permitido de estados
-- ---------------------------------------------------------------------------
DO $fix_state$
BEGIN
  -- Verificar se o constraint já inclui 'logged_out'
  IF EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c   ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_connection_history'
      AND co.conname = 'evolution_connection_history_state_check'
      AND pg_get_constraintdef(co.oid) LIKE '%logged_out%'
  ) THEN
    RAISE NOTICE '[v13] evolution_connection_history_state_check já inclui logged_out — skip';
  ELSE
    -- DROP + ADD (único caminho para modificar CHECK constraint em PG15)
    ALTER TABLE evo.evolution_connection_history
      DROP CONSTRAINT IF EXISTS evolution_connection_history_state_check;

    ALTER TABLE evo.evolution_connection_history
      ADD CONSTRAINT evolution_connection_history_state_check
      CHECK (
        state = ANY(ARRAY[
          'connecting','connected','disconnected',
          'qr_pending','banned','logged_out'
        ])
      )
      NOT VALID;

    RAISE NOTICE '[v13] evolution_connection_history_state_check recriado com logged_out (NOT VALID)';
  END IF;
END $fix_state$;

ALTER TABLE evo.evolution_connection_history
  VALIDATE CONSTRAINT evolution_connection_history_state_check;

-- ---------------------------------------------------------------------------
-- PARTE 2: evolution_connection_history.previous_state_check
-- Adiciona 'logged_out' ao conjunto permitido de estados anteriores
-- ---------------------------------------------------------------------------
DO $fix_prev$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c   ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_connection_history'
      AND co.conname = 'evolution_connection_history_previous_state_check'
      AND pg_get_constraintdef(co.oid) LIKE '%logged_out%'
  ) THEN
    RAISE NOTICE '[v13] evolution_connection_history_previous_state_check já inclui logged_out — skip';
  ELSE
    ALTER TABLE evo.evolution_connection_history
      DROP CONSTRAINT IF EXISTS evolution_connection_history_previous_state_check;

    ALTER TABLE evo.evolution_connection_history
      ADD CONSTRAINT evolution_connection_history_previous_state_check
      CHECK (
        previous_state IS NULL
        OR previous_state = ANY(ARRAY[
          'connecting','connected','disconnected',
          'qr_pending','banned','logged_out'
        ])
      )
      NOT VALID;

    RAISE NOTICE '[v13] evolution_connection_history_previous_state_check recriado com logged_out (NOT VALID)';
  END IF;
END $fix_prev$;

ALTER TABLE evo.evolution_connection_history
  VALIDATE CONSTRAINT evolution_connection_history_previous_state_check;

-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO FINAL
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_state_ok    boolean;
  v_prev_ok     boolean;
  v_not_valid   integer;
BEGIN
  -- state_check inclui 'logged_out' e está validado
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c   ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_connection_history'
      AND co.conname = 'evolution_connection_history_state_check'
      AND co.convalidated = true
      AND pg_get_constraintdef(co.oid) LIKE '%logged_out%'
  ) INTO v_state_ok;

  -- previous_state_check inclui 'logged_out' e está validado
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c   ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_connection_history'
      AND co.conname = 'evolution_connection_history_previous_state_check'
      AND co.convalidated = true
      AND pg_get_constraintdef(co.oid) LIKE '%logged_out%'
  ) INTO v_prev_ok;

  -- Zero NOT VALID em zapp+evo após migration
  SELECT COUNT(*) INTO v_not_valid
  FROM pg_constraint co
  JOIN pg_class     c ON c.oid = co.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE co.contype = 'c'
    AND NOT co.convalidated
    AND n.nspname IN ('zapp','evo');

  RAISE NOTICE '[v13] VERIFY: state_ok=% | prev_ok=% | NOT VALID restantes=%',
    v_state_ok, v_prev_ok, v_not_valid;

  IF NOT v_state_ok THEN
    RAISE EXCEPTION '[v13] FALHA: state_check não contém logged_out ou não validado!';
  END IF;

  IF NOT v_prev_ok THEN
    RAISE EXCEPTION '[v13] FALHA: previous_state_check não contém logged_out ou não validado!';
  END IF;

  IF v_not_valid > 0 THEN
    RAISE EXCEPTION '[v13] FALHA: % constraint(s) NOT VALID após migration!', v_not_valid;
  END IF;

  RAISE NOTICE '[v13] ✓ Migration v13 aplicada com sucesso. logged_out agora válido em ambas as constraints.';
END $verify$;
