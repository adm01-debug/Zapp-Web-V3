-- =============================================================================
-- Migration v12: Schema Hardening — 2 novos CHECK constraints (evo)
-- Data: 2026-07-17
-- Autor: Claude Code (schema audit)
--
-- Contexto:
--   Continuação do schema audit (v8→v9→v10→v11→v12).
--   Últimos 2 candidatos confirmados após varredura exaustiva de todas as
--   colunas enum-like em zapp (312 tabelas) e evo (193 tabelas).
--
-- Alterações (NOT VALID + VALIDATE para zero downtime):
--   1. evo.evolution_conversations.priority  (particionada, 23 partições)
--      12.529 rows, nullable, varchar — todos 'normal' em produção
--   2. evo.evolution_spam_keywords.action    (base table, 5 rows, nullable)
--
-- Valores confirmados:
--   conversations.priority: low/normal/high/urgent
--     - fonte: ai-router/index.ts:1414 (validPriorities array + default 'normal')
--     - produção: 12.529 × 'normal' (valor padrão da Evolution API)
--   spam_keywords.action: flag/block
--     - fonte: varredura SQL direta em produção (3 × 'flag', 2 × 'block')
--     - nenhum outro valor identificado em nenhum edge function
--
-- Contagem pós-v12 esperada:
--   evo:  115 atuais + 24 (conv.priority, particionada) + 1 (spam_keywords.action)
--         = 117+ entradas em pg_constraint
--   zapp: 147 (sem alterações)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PARTE 1: CHECK em evo.evolution_conversations.priority
-- Tabela: particionada (relkind='p'), 23 partições por instância
-- Tipo: varchar, nullable, default 'normal'
-- Valores: low/normal/high/urgent (ai-router validPriorities, WA default)
-- Nota: VALIDATE na raiz valida todas as partições em PG15 (publish_via_partition_root)
-- ---------------------------------------------------------------------------
DO $t1$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c   ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_conversations'
      AND co.conname = 'evolution_conversations_priority_check'
  ) THEN
    ALTER TABLE evo.evolution_conversations
      ADD CONSTRAINT evolution_conversations_priority_check
      CHECK (
        priority IS NULL
        OR priority = ANY(ARRAY[
          'low','normal','high','urgent'
        ]::character varying[])
      )
      NOT VALID;
    RAISE NOTICE '[v12] CHECK evolution_conversations_priority_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v12] CHECK evolution_conversations_priority_check já existe — skip';
  END IF;
END $t1$;

-- Valida em todas as 23 partições simultaneamente (PG15)
ALTER TABLE evo.evolution_conversations
  VALIDATE CONSTRAINT evolution_conversations_priority_check;

-- ---------------------------------------------------------------------------
-- PARTE 2: CHECK em evo.evolution_spam_keywords.action
-- Tabela: base (relkind='r'), 5 linhas, nullable, text
-- Valores: flag (3 rows), block (2 rows) — varredura exaustiva de produção
-- ---------------------------------------------------------------------------
DO $t2$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class c   ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_spam_keywords'
      AND co.conname = 'evolution_spam_keywords_action_check'
  ) THEN
    ALTER TABLE evo.evolution_spam_keywords
      ADD CONSTRAINT evolution_spam_keywords_action_check
      CHECK (
        action IS NULL
        OR action = ANY(ARRAY['flag','block'])
      )
      NOT VALID;
    RAISE NOTICE '[v12] CHECK evolution_spam_keywords_action_check adicionado (NOT VALID)';
  ELSE
    RAISE NOTICE '[v12] CHECK evolution_spam_keywords_action_check já existe — skip';
  END IF;
END $t2$;

ALTER TABLE evo.evolution_spam_keywords
  VALIDATE CONSTRAINT evolution_spam_keywords_action_check;

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

  -- Os 2 novos CHECK devem estar validados
  -- (evolution_conversations é particionada: conta-se pelo menos 1 entrada pelo nome)
  SELECT COUNT(DISTINCT co.conname) INTO v_new_checks
  FROM pg_constraint co
  JOIN pg_class     c ON c.oid = co.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE co.contype = 'c'
    AND co.convalidated
    AND co.conname IN (
      'evolution_conversations_priority_check',
      'evolution_spam_keywords_action_check'
    );

  RAISE NOTICE '[v12] VERIFY: NOT VALID restantes = % | novos CHECK validados = %/2',
               v_not_valid, v_new_checks;

  IF v_not_valid > 0 THEN
    RAISE EXCEPTION '[v12] FALHA: % constraint(s) NOT VALID após migration!', v_not_valid;
  END IF;

  IF v_new_checks < 2 THEN
    RAISE EXCEPTION '[v12] FALHA: apenas %/2 novos CHECK validados!', v_new_checks;
  END IF;

  RAISE NOTICE '[v12] ✓ Migration v12 aplicada com sucesso.';
END $verify$;
