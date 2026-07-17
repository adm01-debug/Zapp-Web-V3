-- =============================================================================
-- Migration v10: Schema Hardening — 6 novos CHECK constraints
-- Data: 2026-07-17
-- Autor: Claude Code (schema audit)
--
-- Contexto:
--   Continuação do schema audit iniciado em v8/v9.
--   Auditoria de valores em produção identificou 6 colunas enum-like sem
--   CHECK constraint em evo.*
--
-- Alterações (NOT VALID + VALIDATE para zero downtime):
--   1. evo.evolution_conversations.status       (particionada, 23 partições)
--   2. evo.evolution_messages.direction         (particionada, 23 partições)
--   3. evo.evolution_connection_history.previous_state
--   4. evo.evolution_calls.call_status
--   5. evo.evolution_calls.call_type
--   6. evo.evolution_calls.direction
--
-- Valores auditados:
--   conversations.status   : aberta (12523), arquivada (6)
--   messages.direction     : inbound (40356), outbound (694)
--   conn_history.prev_state: connecting/connected/disconnected/qr_pending/banned
--   calls.call_status      : ended (11), ringing (7), missed (2)
--                            + rejected|failed|accepted (WA API spec, não vistos em prod)
--   calls.call_type        : voice (19), video (1)
--   calls.direction        : outgoing (16), incoming (4)
--
-- Contagem pós-v10 esperada:
--   evo: 62 atuais + 24 (conv.status) + 24 (msg.direction) + 1 (prev_state)
--        + 3 (calls.*) = 114 entries
--   zapp: 142 (sem alterações)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PARTE 1: CHECK em evo.evolution_conversations.status
-- Tabela: particionada (relkind='p'), 23 partições por instância
-- Tipo: varchar(30), nullable, default 'aberta'
-- Valores auditados: aberta, arquivada
-- ---------------------------------------------------------------------------
DO $t1$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c   ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_conversations'
      AND co.conname = 'evolution_conversations_status_check'
  ) THEN
    ALTER TABLE evo.evolution_conversations
      ADD CONSTRAINT evolution_conversations_status_check
      CHECK (
        status IS NULL
        OR status = ANY(ARRAY[
          'aberta','arquivada'
        ]::character varying[])
      )
      NOT VALID;
    RAISE NOTICE '[v10] CHECK evolution_conversations_status_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v10] CHECK evolution_conversations_status_check já existe — skip';
  END IF;
END $t1$;

-- Valida em todas as 23 partições simultaneamente (PG15)
ALTER TABLE evo.evolution_conversations
  VALIDATE CONSTRAINT evolution_conversations_status_check;

-- ---------------------------------------------------------------------------
-- PARTE 2: CHECK em evo.evolution_messages.direction
-- Tabela: particionada (relkind='p'), 23 partições por instância
-- Tipo: varchar(10), nullable, sem default
-- Valores auditados: inbound (40356), outbound (694)
-- ---------------------------------------------------------------------------
DO $t2$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c   ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_messages'
      AND co.conname = 'evolution_messages_direction_check'
  ) THEN
    ALTER TABLE evo.evolution_messages
      ADD CONSTRAINT evolution_messages_direction_check
      CHECK (
        direction IS NULL
        OR direction = ANY(ARRAY[
          'inbound','outbound'
        ]::character varying[])
      )
      NOT VALID;
    RAISE NOTICE '[v10] CHECK evolution_messages_direction_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v10] CHECK evolution_messages_direction_check já existe — skip';
  END IF;
END $t2$;

ALTER TABLE evo.evolution_messages
  VALIDATE CONSTRAINT evolution_messages_direction_check;

-- ---------------------------------------------------------------------------
-- PARTE 3: CHECK em evo.evolution_connection_history.previous_state
-- Tabela: base (relkind='r'), text nullable
-- Valores: idênticos à coluna 'state' (já constrainada em v9)
-- connecting/connected/disconnected/qr_pending/banned
-- ---------------------------------------------------------------------------
DO $t3$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c   ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_connection_history'
      AND co.conname = 'evolution_connection_history_previous_state_check'
  ) THEN
    ALTER TABLE evo.evolution_connection_history
      ADD CONSTRAINT evolution_connection_history_previous_state_check
      CHECK (
        previous_state IS NULL
        OR previous_state = ANY(ARRAY[
          'connecting','connected','disconnected','qr_pending','banned'
        ])
      )
      NOT VALID;
    RAISE NOTICE '[v10] CHECK evolution_connection_history_previous_state_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v10] CHECK evolution_connection_history_previous_state_check já existe — skip';
  END IF;
END $t3$;

ALTER TABLE evo.evolution_connection_history
  VALIDATE CONSTRAINT evolution_connection_history_previous_state_check;

-- ---------------------------------------------------------------------------
-- PARTE 4: CHECKs em evo.evolution_calls (3 constraints em uma tabela base)
-- call_status: ended/ringing/missed + rejected/failed/accepted (spec WA API)
-- call_type  : voice/video
-- direction  : incoming/outgoing (atenção: diferente de messages.direction!)
-- Tabela: base (relkind='r'), 20 linhas em produção, colunas NOT NULL
-- ---------------------------------------------------------------------------
DO $t4$
BEGIN
  -- call_status
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c   ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_calls'
      AND co.conname = 'evolution_calls_call_status_check'
  ) THEN
    ALTER TABLE evo.evolution_calls
      ADD CONSTRAINT evolution_calls_call_status_check
      CHECK (
        call_status = ANY(ARRAY[
          'ended','ringing','missed','rejected','failed','accepted'
        ])
      )
      NOT VALID;
    RAISE NOTICE '[v10] CHECK evolution_calls_call_status_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v10] CHECK evolution_calls_call_status_check já existe — skip';
  END IF;

  -- call_type
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c   ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_calls'
      AND co.conname = 'evolution_calls_call_type_check'
  ) THEN
    ALTER TABLE evo.evolution_calls
      ADD CONSTRAINT evolution_calls_call_type_check
      CHECK (
        call_type = ANY(ARRAY['voice','video'])
      )
      NOT VALID;
    RAISE NOTICE '[v10] CHECK evolution_calls_call_type_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v10] CHECK evolution_calls_call_type_check já existe — skip';
  END IF;

  -- direction (incoming/outgoing — diferente de messages que usa inbound/outbound)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c   ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_calls'
      AND co.conname = 'evolution_calls_direction_check'
  ) THEN
    ALTER TABLE evo.evolution_calls
      ADD CONSTRAINT evolution_calls_direction_check
      CHECK (
        direction = ANY(ARRAY['incoming','outgoing'])
      )
      NOT VALID;
    RAISE NOTICE '[v10] CHECK evolution_calls_direction_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v10] CHECK evolution_calls_direction_check já existe — skip';
  END IF;
END $t4$;

ALTER TABLE evo.evolution_calls VALIDATE CONSTRAINT evolution_calls_call_status_check;
ALTER TABLE evo.evolution_calls VALIDATE CONSTRAINT evolution_calls_call_type_check;
ALTER TABLE evo.evolution_calls VALIDATE CONSTRAINT evolution_calls_direction_check;

-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO FINAL
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_not_valid  integer;
  v_new_checks integer;
BEGIN
  -- Zero NOT VALID em evo+zapp
  SELECT COUNT(*) INTO v_not_valid
  FROM pg_constraint co
  JOIN pg_class     c ON c.oid = co.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE co.contype = 'c'
    AND NOT co.convalidated
    AND n.nspname IN ('zapp','evo');

  -- Os 6 novos CHECK devem estar validados (base tables têm 1 entry cada;
  -- particionadas terão múltiplas — buscamos pelo menos 1 entrada por nome)
  SELECT COUNT(DISTINCT co.conname) INTO v_new_checks
  FROM pg_constraint co
  JOIN pg_class     c ON c.oid = co.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE co.contype = 'c'
    AND co.convalidated
    AND co.conname IN (
      'evolution_conversations_status_check',
      'evolution_messages_direction_check',
      'evolution_connection_history_previous_state_check',
      'evolution_calls_call_status_check',
      'evolution_calls_call_type_check',
      'evolution_calls_direction_check'
    );

  RAISE NOTICE '[v10] VERIFY: NOT VALID restantes = % | novos CHECK validados = %/6',
               v_not_valid, v_new_checks;

  IF v_not_valid > 0 THEN
    RAISE EXCEPTION '[v10] FALHA: % constraint(s) NOT VALID após migration!', v_not_valid;
  END IF;

  IF v_new_checks < 6 THEN
    RAISE EXCEPTION '[v10] FALHA: apenas %/6 novos CHECK validados!', v_new_checks;
  END IF;

  RAISE NOTICE '[v10] ✓ Migration v10 aplicada com sucesso.';
END $verify$;
