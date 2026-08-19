-- ============================================================================
-- Etapa 70 — Gamificação real: XP transacional (níveis + achievements)
-- 2026-08-18 | DB-as-source: aplicado via MCP (supabase_apply_migration /
-- role postgres); este arquivo é o espelho versionado. Idempotente.
--
-- Problema: XP/achievements eram escritos client-side em agent_stats /
-- agent_achievements (2-3 statements não-atômicos). Dois clientes com o MESMO
-- snapshot computam o mesmo "novo XP" e o último UPDATE vence → XP perdido
-- (race condition, E59) e achievements duplicados só deduplicados por índice
-- criado na E66 — o insert concorrente que perdia a corrida VIRAVA ERRO.
--
-- Modelo (o estado já vive em agent_stats/agent_achievements — E66):
--   * zapp.xp_transactions  — ledger imutável de XP (entrada, data, motivo).
--   * zapp.rpc_grant_xp     — SECURITY DEFINER, transacional: insere no ledger
--     e faz upsert atômico em agent_stats somando APENAS o delta (nunca um
--     total calculado fora da transação). Nível recalculado do total
--     acumulado (fórmula espelhada em levelUtils.ts: FLOOR(SQRT(xp/50))+1).
--   * zapp.rpc_unlock_achievement — SECURITY DEFINER, transacional: dedupe
--     via ON CONFLICT (profile_id, achievement_type) DO NOTHING (índice
--     único da E66) → desbloqueia 1x; tipos repetíveis (daily_goal, streak,
--     message_milestone — semântica pré-existente de marcos cumulativos)
--     seguem permitidos; achievements_count +1; XP via rpc_grant_xp.
--   * Índice único agent_stats_profile_unique: invariante assumido por
--     maybeSingle() em todo o front (useAgentGamification, leaderboard);
--     necessário para o ON CONFLICT (profile_id). Se o apply falhar por
--     duplicados existentes, é um problema de dados REAL a corrigir antes.
--
-- Segurança: ambas as funções exigem auth.uid() e o perfil DEVE pertencer
-- ao usuário autenticado (nunca conceder XP a terceiros).
--
-- Rollback:
--   DROP FUNCTION IF EXISTS zapp.rpc_unlock_achievement(uuid, text, text, text, integer);
--   DROP FUNCTION IF EXISTS zapp.rpc_grant_xp(uuid, integer, text);
--   DROP TABLE IF EXISTS zapp.xp_transactions;
--   DROP INDEX IF EXISTS zapp.agent_stats_profile_unique;
-- ============================================================================

BEGIN;

-- Invariante de 1 linha de stats por perfil (assumido por maybeSingle em todo
-- o front; habilitado explicitamente para o ON CONFLICT (profile_id)).
CREATE UNIQUE INDEX IF NOT EXISTS agent_stats_profile_unique
  ON zapp.agent_stats (profile_id);

-- Ledger de XP: entrada imutável, com data e motivo.
CREATE TABLE IF NOT EXISTS zapp.xp_transactions (
ALTER TABLE zapp.xp_transactions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS xp_transactions_profile_created_idx
  ON zapp.xp_transactions (profile_id, created_at DESC);

-- grant_xp: concede XP transacionalmente (ledger + estado atômico).
CREATE OR REPLACE FUNCTION zapp.rpc_grant_xp(
  p_profile_id uuid,
  p_amount integer,
  p_reason text DEFAULT 'xp'
) RETURNS TABLE (
  new_xp numeric,
  new_level integer,
  leveled_up boolean,
  previous_level integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'zapp', pg_temp
AS $fn$
DECLARE
  v_prev_xp numeric;
  v_prev_level integer;
  v_new_xp numeric;
  v_new_level integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM zapp.profiles WHERE id = p_profile_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'permission denied: perfil não pertence ao usuário';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'grant_xp: amount deve ser > 0 (recebido %)', p_amount;
  END IF;

  -- Ledger (auditoria): uma linha por concessão.
  INSERT INTO zapp.xp_transactions (profile_id, amount, reason)
  VALUES (p_profile_id, p_amount, COALESCE(p_reason, 'xp'));

  -- Estado atual (serializa concorrentes no caminho comum).
  SELECT xp, level INTO v_prev_xp, v_prev_level
    FROM zapp.agent_stats
   WHERE profile_id = p_profile_id
   FOR UPDATE;

  v_new_xp := COALESCE(v_prev_xp, 0) + p_amount;
  v_new_level := GREATEST(1, FLOOR(SQRT(v_new_xp / 50.0)) + 1)::integer;

  -- Upsert atômico: no conflito (row criada por outro tx no meio do caminho)
  -- soma APENAS o delta sobre o valor commitado — nunca um total stale.
  INSERT INTO zapp.agent_stats (profile_id, xp, level, updated_at)
  VALUES (p_profile_id, v_new_xp, v_new_level, now())
  ON CONFLICT (profile_id) DO UPDATE
    SET xp = zapp.agent_stats.xp + p_amount,
        level = GREATEST(1, FLOOR(SQRT((zapp.agent_stats.xp + p_amount) / 50.0)) + 1)::integer,
        updated_at = now()
  RETURNING xp, level INTO v_new_xp, v_new_level;

  RETURN QUERY
  SELECT v_new_xp, v_new_level, (v_new_level > COALESCE(v_prev_level, 1)), COALESCE(v_prev_level, 1);
END;
$fn$;

-- unlock_achievement: desbloqueia 1x (dedupe transacional) e credita XP.
CREATE OR REPLACE FUNCTION zapp.rpc_unlock_achievement(
  p_profile_id uuid,
  p_type text,
  p_name text,
  p_description text DEFAULT NULL,
  p_xp_reward integer DEFAULT 0
) RETURNS TABLE (
  already_unlocked boolean,
  new_xp numeric,
  new_level integer,
  leveled_up boolean,
  previous_level integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'zapp', pg_temp
AS $fn$
DECLARE
  v_inserted uuid;
  v_repeatable boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM zapp.profiles WHERE id = p_profile_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'permission denied: perfil não pertence ao usuário';
  END IF;

  -- Marcos cumulativos (semântica pré-existente do front): podem repetir.
  v_repeatable := p_type IN ('daily_goal', 'streak', 'message_milestone');

  IF v_repeatable THEN
    INSERT INTO zapp.agent_achievements
      (profile_id, achievement_type, achievement_name, achievement_description, xp_earned)
    VALUES (p_profile_id, p_type, p_name, p_description, p_xp_reward)
    RETURNING id INTO v_inserted;
  ELSE
    -- Desbloqueio único: o índice único da E66 é o árbitro (sem TOCTOU).
    INSERT INTO zapp.agent_achievements
      (profile_id, achievement_type, achievement_name, achievement_description, xp_earned)
    VALUES (p_profile_id, p_type, p_name, p_description, p_xp_reward)
    ON CONFLICT (profile_id, achievement_type) DO NOTHING
    RETURNING id INTO v_inserted;
  END IF;

  IF v_inserted IS NULL THEN
    -- Já desbloqueado: sem XP, sem contagem — resposta honesta.
    RETURN QUERY SELECT true, NULL::numeric, NULL::integer, false, NULL::integer;
    RETURN;
  END IF;

  UPDATE zapp.agent_stats
     SET achievements_count = achievements_count + 1,
         updated_at = now()
   WHERE profile_id = p_profile_id;

  IF p_xp_reward IS NOT NULL AND p_xp_reward > 0 THEN
    RETURN QUERY SELECT false, r.new_xp, r.new_level, r.leveled_up, r.previous_level
      FROM zapp.rpc_grant_xp(p_profile_id, p_xp_reward, 'achievement:' || p_type) AS r;
  ELSE
    RETURN QUERY SELECT false, NULL::numeric, NULL::integer, false, NULL::integer;
  END IF;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_grant_xp(uuid, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION zapp.rpc_unlock_achievement(uuid, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_grant_xp(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION zapp.rpc_unlock_achievement(uuid, text, text, text, integer) TO authenticated;

COMMIT;
