-- 20260801020002 — Dedup: UNIQUE (phone_number, instance_name) em evo.evolution_contacts (auditoria etapa 31)
-- Aplicado em producao: 2026-08-01, APOS o merge de 503 duplicados (20260801020001)
-- NOTA: indice NAO e parcial (WHERE phone_number IS NOT NULL) porque ALTER TABLE ADD CONSTRAINT
-- UNIQUE USING INDEX exige indice nao-parcial. Postgres UNIQUE permite multiplos NULLs.
-- Rollback:
--   ALTER TABLE evo.evolution_contacts DROP CONSTRAINT IF EXISTS uq_evolution_contacts_phone_instance;

CREATE UNIQUE INDEX CONCURRENTLY uq_evolution_contacts_phone_instance
  ON evo.evolution_contacts (phone_number, instance_name);

ALTER TABLE evo.evolution_contacts ADD CONSTRAINT uq_evolution_contacts_phone_instance
  UNIQUE USING INDEX uq_evolution_contacts_phone_instance;
