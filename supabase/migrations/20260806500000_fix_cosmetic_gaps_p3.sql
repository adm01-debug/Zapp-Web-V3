-- ============================================================================
-- FIX P3 — Correções cosméticas/consistência (3 gaps)
-- ============================================================================
-- Tipo: COSMÉTICO / CONSISTÊNCIA
--
-- GAP-CONSTRAINT-NAMING (P3):
--   evolution_messages_wpp2_archive tem constraint de status nomeada
--   'evolution_messages_wpp2_archive_status_check' em vez do nome padrão
--   'evolution_messages_status_check' (igual ao constraint do parent e demais
--   partições). O dado está protegido, apenas a convenção de nome diverge.
--
-- GAP-LOG-DISCRIMINATOR (P3):
--   ops._infra_check_log é compartilhada por DUAS guardrails:
--   - ops.fn_check_reference_integrity (chave JSONB: 'n_fn_obj')
--   - ops.fn_check_infrastructure     (chave JSONB: 'wpp2', 'pk', etc.)
--   Sem coluna discriminadora, queries analíticas sobre o log exigem inspeção
--   do JSONB para saber a qual guardrail cada linha pertence.
--   Adição de coluna check_type com backfill retroativo.
--
-- GAP-SECURITY-INVOKER-INCONSISTENCY (P3):
--   View zapp.evolution_contacts tem reloptions security_invoker=true enquanto
--   todas as outras views evolution_* usam security_invoker=on. Em PostgreSQL,
--   'true' e 'on' são sinônimos booleanos mas a inconsistência é cosmética.
--
-- Detectados em: auditoria exaustiva 5 agentes — 2026-08-06
-- ============================================================================

-- ─── GAP-CONSTRAINT-NAMING: renomear constraint na wpp2_archive ──────────────
ALTER TABLE evo.evolution_messages_wpp2_archive
  RENAME CONSTRAINT evolution_messages_wpp2_archive_status_check
  TO evolution_messages_status_check;

-- ─── GAP-LOG-DISCRIMINATOR: adicionar coluna check_type ao log ───────────────
ALTER TABLE ops._infra_check_log
  ADD COLUMN IF NOT EXISTS check_type text;

-- Backfill: identifica o tipo pela presença da chave 'n_fn_obj' no JSONB
-- (exclusiva de fn_check_reference_integrity)
UPDATE ops._infra_check_log
SET check_type = CASE
  WHEN detail ? 'n_fn_obj' THEN 'reference_integrity'
  ELSE                           'infrastructure'
END
WHERE check_type IS NULL;

COMMENT ON COLUMN ops._infra_check_log.check_type IS
'Discriminador da guardrail: reference_integrity = fn_check_reference_integrity; '
'infrastructure = fn_check_infrastructure. Adicionado 2026-08-06 (GAP-LOG-DISCRIMINATOR).';

-- ─── GAP-SECURITY-INVOKER: padronizar evolution_contacts para 'on' ───────────
-- 'true' e 'on' são sinônimos em PostgreSQL, mas mantemos consistência com
-- as demais views evolution_* que usam security_invoker=on.
ALTER VIEW zapp.evolution_contacts SET (security_invoker = on);
