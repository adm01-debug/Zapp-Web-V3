-- 20260817180000 — Gamificação real: coins + índice único de conquistas (Etapa 66 do plano 100 etapas)
-- Rollback: ALTER TABLE zapp.agent_stats DROP COLUMN IF EXISTS coins;
--           DROP INDEX IF EXISTS zapp.agent_achievements_unique;

-- coins: moeda de gamificação (badge do dashboard) — coluna nova, default 0.
ALTER TABLE zapp.agent_stats
  ADD COLUMN IF NOT EXISTS coins numeric NOT NULL DEFAULT 0;

-- Dedupe de conquistas por perfil+tipo (antes era client-side).
CREATE UNIQUE INDEX IF NOT EXISTS agent_achievements_unique
  ON zapp.agent_achievements (profile_id, achievement_type);
