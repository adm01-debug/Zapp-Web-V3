-- F4-18: Adiciona colunas de retry/erro em evo.evolution_messages
-- O messageSender.ts escreve error_code, error_reason, retry_attempt, retry_total
-- mas a tabela não tinha essas colunas → writeback silenciosamente perdido.
-- Colunas são nullable (sem default) para não impactar rows existentes.
-- Rollback: R-DDL (ALTER TABLE ... DROP COLUMN)

ALTER TABLE evo.evolution_messages
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS error_reason text,
  ADD COLUMN IF NOT EXISTS retry_attempt integer,
  ADD COLUMN IF NOT EXISTS retry_total integer;

-- Atualiza a view zapp.messages para expor as novas colunas
-- (a view é um pass-through simples; as colunas novas aparecem automaticamente
--  se a view usar SELECT * ou listar explicitamente — verificar no banco)
