-- =============================================================================
-- Migration v9: Schema Hardening — Normalização de status + 3 novos CHECK
-- Data: 2026-07-17
-- Autor: Claude Code (schema audit)
--
-- Contexto:
--   Audit revelou 27 linhas em evo.evolution_messages com status raw da WA API
--   (DELIVERY_ACK, READ, SERVER_ACK) que não foram normalizados pelo webhook
--   handler — provavelmente dados legados de antes da implementação do mapeamento
--   em evolution-webhook-msg-handlers.ts.
--
-- Alterações:
--   1. NORMALIZA 27 linhas (DELIVERY_ACK→delivered, READ→read, SERVER_ACK→sent)
--   2. CHECK em evo.evolution_messages.status
--   3. CHECK em evo.evolution_connection_history.state
--   4. CHECK em zapp.workspace_members.role
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PARTE 1: Normalizar status uppercase legado em evo.evolution_messages
-- ---------------------------------------------------------------------------
-- O webhook handler (evolution-webhook-msg-handlers.ts) mapeia corretamente:
--   SERVER_ACK  → 'sent'     |  DELIVERY_ACK → 'delivered'  |  READ → 'read'
-- Estas 27 linhas são anteriores à implementação do mapeamento.
-- ---------------------------------------------------------------------------
DO $norm$
DECLARE
  v_dlv  integer := 0;
  v_read integer := 0;
  v_srv  integer := 0;
BEGIN
  UPDATE evo.evolution_messages
  SET    status     = 'delivered',
         updated_at = now()
  WHERE  status = 'DELIVERY_ACK';
  GET DIAGNOSTICS v_dlv = ROW_COUNT;

  UPDATE evo.evolution_messages
  SET    status     = 'read',
         updated_at = now()
  WHERE  status = 'READ';
  GET DIAGNOSTICS v_read = ROW_COUNT;

  UPDATE evo.evolution_messages
  SET    status     = 'sent',
         updated_at = now()
  WHERE  status = 'SERVER_ACK';
  GET DIAGNOSTICS v_srv = ROW_COUNT;

  RAISE NOTICE '[v9] Normalização status: DELIVERY_ACK→delivered: % | READ→read: % | SERVER_ACK→sent: %',
               v_dlv, v_read, v_srv;

  -- Garantia: nenhum valor uppercase deve restar
  IF EXISTS (
    SELECT 1 FROM evo.evolution_messages
    WHERE status = ANY(ARRAY['DELIVERY_ACK','READ','SERVER_ACK','PLAYED','PLAYED_ACK','PENDING'])
    LIMIT 1
  ) THEN
    RAISE EXCEPTION '[v9] FALHA: valores uppercase residuais detectados após normalização!';
  END IF;
END $norm$;

-- ---------------------------------------------------------------------------
-- PARTE 2: CHECK em evo.evolution_messages.status
-- Tabela: particionada (23 partições por instância), varchar(20), nullable
-- Default: 'delivered'
-- Valores válidos auditados + TypeScript MessageUIStatus:
--   received  → mensagem inbound recebida
--   sent      → enviada (SERVER_ACK)
--   delivered → entregue (DELIVERY_ACK)
--   read      → lida (READ)
--   deleted   → deleção suave
--   pending   → agendada/na fila
--   played    → áudio reproduzido (PLAYED/PLAYED_ACK)
--   failed    → falha no envio (precaução — estado terminal)
-- ---------------------------------------------------------------------------
DO $t2$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c   ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_messages'
      AND co.conname = 'evolution_messages_status_check'
  ) THEN
    ALTER TABLE evo.evolution_messages
      ADD CONSTRAINT evolution_messages_status_check
      CHECK (
        status IS NULL
        OR status = ANY(ARRAY[
          'received','sent','delivered','read',
          'deleted','pending','played','failed'
        ]::character varying[])
      )
      NOT VALID;
    RAISE NOTICE '[v9] CHECK evolution_messages_status_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v9] CHECK evolution_messages_status_check já existe — skip';
  END IF;
END $t2$;

-- Valida constraint em todas as 23 partições (PG15: VALIDATE em tabela raiz
-- propaga para todas as partições filhas automaticamente)
ALTER TABLE evo.evolution_messages
  VALIDATE CONSTRAINT evolution_messages_status_check;

-- ---------------------------------------------------------------------------
-- PARTE 3: CHECK em evo.evolution_connection_history.state
-- Tabela: base (relkind='r'), text NOT NULL, sem default
-- Valores auditados em produção (5.223 linhas totais):
--   connecting (2552), connected (2326), disconnected (338),
--   qr_pending (5), banned (2)
-- ---------------------------------------------------------------------------
DO $t3$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c   ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_connection_history'
      AND co.conname = 'evolution_connection_history_state_check'
  ) THEN
    ALTER TABLE evo.evolution_connection_history
      ADD CONSTRAINT evolution_connection_history_state_check
      CHECK (
        state = ANY(ARRAY[
          'connecting','connected','disconnected','qr_pending','banned'
        ])
      )
      NOT VALID;
    RAISE NOTICE '[v9] CHECK evolution_connection_history_state_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v9] CHECK evolution_connection_history_state_check já existe — skip';
  END IF;
END $t3$;

ALTER TABLE evo.evolution_connection_history
  VALIDATE CONSTRAINT evolution_connection_history_state_check;

-- ---------------------------------------------------------------------------
-- PARTE 4: CHECK em zapp.workspace_members.role
-- Tabela: base (relkind='r'), text NOT NULL, default 'member'
-- Valores auditados: admin (3), member (12)
-- ---------------------------------------------------------------------------
DO $t4$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c   ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp'
      AND c.relname = 'workspace_members'
      AND co.conname = 'workspace_members_role_check'
  ) THEN
    ALTER TABLE zapp.workspace_members
      ADD CONSTRAINT workspace_members_role_check
      CHECK (
        role = ANY(ARRAY['admin','member'])
      )
      NOT VALID;
    RAISE NOTICE '[v9] CHECK workspace_members_role_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v9] CHECK workspace_members_role_check já existe — skip';
  END IF;
END $t4$;

ALTER TABLE zapp.workspace_members
  VALIDATE CONSTRAINT workspace_members_role_check;

-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO FINAL: 0 NOT VALID + 3 novos CHECK validados
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_not_valid  integer;
  v_new_checks integer;
BEGIN
  -- Nenhum NOT VALID deve restar nos schemas auditados
  SELECT COUNT(*) INTO v_not_valid
  FROM pg_constraint co
  JOIN pg_class     c ON c.oid = co.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE co.contype = 'c'
    AND NOT co.convalidated
    AND n.nspname IN ('zapp','evo');

  -- Os 3 novos CHECK devem existir e estar validados
  SELECT COUNT(*) INTO v_new_checks
  FROM pg_constraint co
  JOIN pg_class     c ON c.oid = co.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE co.contype = 'c'
    AND co.convalidated
    AND co.conname IN (
      'evolution_messages_status_check',
      'evolution_connection_history_state_check',
      'workspace_members_role_check'
    );

  RAISE NOTICE '[v9] VERIFY: NOT VALID restantes = % | novos CHECK validados = %/3',
               v_not_valid, v_new_checks;

  IF v_not_valid > 0 THEN
    RAISE EXCEPTION '[v9] FALHA: % constraint(s) NOT VALID encontrado(s) após migration!', v_not_valid;
  END IF;

  IF v_new_checks < 3 THEN
    RAISE EXCEPTION '[v9] FALHA: apenas %/3 novos CHECK encontrados e validados!', v_new_checks;
  END IF;

  RAISE NOTICE '[v9] ✓ Migration v9 aplicada com sucesso.';
END $verify$;
