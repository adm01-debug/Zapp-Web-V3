-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260818190000_etapa67_gamification_atomic_xp.sql
-- Purpose  : E59 — fim da race condition de XP de gamificação.
--            As mutations do front faziam read-modify-write client-side
--            (newXp = cache.xp + delta; UPDATE com valor ABSOLUTO): 2 eventos
--            simultâneos (2 envios, envio+resolução, 2 abas) liam o MESMO
--            cache stale e gravavam o MESMO absoluto → 1 incremento perdido
--            (last-write-wins, "somam 1 vez só").
-- Fix      : RPCs transacionais no banco:
--              zapp.rpc_add_xp            — UPDATE atômico xp = xp + delta,
--                                           FOR UPDATE serializa escritas
--                                           concorrentes no mesmo perfil;
--                                           level recalculado pelo trigger
--                                           update_level_on_xp_change (existe).
--              zapp.rpc_grant_achievement — dedupe ATÔMICO via índice único
--                                           agent_achievements_unique
--                                           (ON CONFLICT DO NOTHING) + xp e
--                                           achievements_count incrementados
--                                           no MESMO UPDATE.
--            Ownership: próprio perfil ou admin (mesmo guard das policies
--            auth_own_or_admin: zapp.get_profile_id_for_user + zapp.is_admin_or_supervisor).
-- Verified : pg_proc 2026-08-18: rpc_add_xp / rpc_grant_achievement AUSENTES
--            (sem colisão de nome em zapp/public).
-- Idempotent: CREATE OR REPLACE — seguro re-rodar.
-- Rollback  : DROP FUNCTION zapp.rpc_add_xp(uuid, numeric, text);
--             DROP FUNCTION zapp.rpc_grant_achievement(uuid, text, text, text, numeric);
-- ═══════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────────
-- 1) rpc_add_xp — incremento atômico de XP
-- ───────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.rpc_add_xp(
  p_profile_id uuid,
  p_xp_delta   numeric,
  p_reason     text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'zapp', 'public'
AS $fn$
DECLARE
  v_profile_id  uuid;
  v_prev_level  integer;
  v_xp          numeric;
  v_level       integer;
BEGIN
  IF p_profile_id IS NULL OR p_xp_delta IS NULL OR p_xp_delta <= 0 THEN
    RAISE EXCEPTION 'rpc_add_xp: delta invalido (%)', p_xp_delta
      USING ERRCODE = '22013';
  END IF;

  v_profile_id := zapp.get_profile_id_for_user(auth.uid());
  IF v_profile_id IS NULL
     OR (p_profile_id <> v_profile_id AND NOT zapp.is_admin_or_supervisor()) THEN
    RAISE EXCEPTION 'rpc_add_xp: sem permissao para o perfil %', p_profile_id
      USING ERRCODE = '42501';
  END IF;

  -- Serializa escritas concorrentes no MESMO perfil: a 2ª transação espera a
  -- 1ª commitada e lê o nível/XP já atualizados (leveled_up correto).
  SELECT level INTO v_prev_level
    FROM zapp.agent_stats
   WHERE profile_id = p_profile_id
   FOR UPDATE;

  IF NOT FOUND THEN
    -- Perfil antigo sem linha de stats: cria e soma (upsert atômico).
    -- level é recalculado pelo trigger update_level_on_xp_change.
    INSERT INTO zapp.agent_stats (profile_id, xp)
    VALUES (p_profile_id, p_xp_delta)
    ON CONFLICT (profile_id) DO UPDATE
      SET xp = zapp.agent_stats.xp + EXCLUDED.xp,
          updated_at = pg_catalog.now()
    RETURNING xp, level INTO v_xp, v_level;
    v_prev_level := 1;
  ELSE
    -- ATOMICIDADE: xp = xp + delta (nunca valor absoluto vindo do cliente).
    UPDATE zapp.agent_stats
       SET xp = xp + p_xp_delta,
           updated_at = pg_catalog.now()
     WHERE profile_id = p_profile_id
    RETURNING xp, level INTO v_xp, v_level;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'profile_id',     p_profile_id,
    'xp_delta',       p_xp_delta,
    'xp',             v_xp,
    'level',          v_level,
    'previous_level', v_prev_level,
    'leveled_up',     v_level > v_prev_level,
    'reason',         p_reason
  );
END;
$fn$;

COMMENT ON FUNCTION zapp.rpc_add_xp(uuid, numeric, text)
  IS 'E59: incrementa XP de forma atomica (xp = xp + delta, FOR UPDATE). '
     'Level recalculado pelo trigger update_level_on_xp_change. '
     'Somente o dono do perfil ou admin/supervisor.';

-- ───────────────────────────────────────────────────────────────────────────────
-- 2) rpc_grant_achievement — conquista + XP atômicos (dedupe no banco)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.rpc_grant_achievement(
  p_profile_id  uuid,
  p_type        text,
  p_name        text,
  p_description text DEFAULT NULL,
  p_xp_reward   numeric DEFAULT 0
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'zapp', 'public'
AS $fn$
DECLARE
  v_profile_id  uuid;
  v_ach_id      uuid;
  v_prev_level  integer;
  v_xp          numeric;
  v_level       integer;
BEGIN
  IF p_profile_id IS NULL OR p_type IS NULL OR pg_catalog.btrim(p_type) = '' THEN
    RAISE EXCEPTION 'rpc_grant_achievement: parametros invalidos'
      USING ERRCODE = '22023';
  END IF;
  IF p_xp_reward < 0 THEN
    RAISE EXCEPTION 'rpc_grant_achievement: reward negativo (%)', p_xp_reward
      USING ERRCODE = '22013';
  END IF;

  v_profile_id := zapp.get_profile_id_for_user(auth.uid());
  IF v_profile_id IS NULL
     OR (p_profile_id <> v_profile_id AND NOT zapp.is_admin_or_supervisor()) THEN
    RAISE EXCEPTION 'rpc_grant_achievement: sem permissao para o perfil %', p_profile_id
      USING ERRCODE = '42501';
  END IF;

  -- Dedupe ATOMICO via indice unico (profile_id, achievement_type): 2 grants
  -- simultâneos do mesmo tipo → exatamente 1 row e 1 XP.
  INSERT INTO zapp.agent_achievements (
    profile_id, achievement_type, achievement_name, achievement_description, xp_earned
  )
  VALUES (p_profile_id, p_type, p_name, p_description, p_xp_reward)
  ON CONFLICT (profile_id, achievement_type) DO NOTHING
  RETURNING id INTO v_ach_id;

  IF v_ach_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('already_had', pg_catalog.to_jsonb(true));
  END IF;

  -- Serializa escritas concorrentes no MESMO perfil.
  SELECT level INTO v_prev_level
    FROM zapp.agent_stats
   WHERE profile_id = p_profile_id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO zapp.agent_stats (profile_id, xp, achievements_count)
    VALUES (p_profile_id, p_xp_reward, 1)
    ON CONFLICT (profile_id) DO UPDATE
      SET xp = zapp.agent_stats.xp + EXCLUDED.xp,
          achievements_count = zapp.agent_stats.achievements_count + 1,
          updated_at = pg_catalog.now()
    RETURNING xp, level INTO v_xp, v_level;
    v_prev_level := 1;
  ELSE
    -- xp e achievements_count incrementais no MESMO UPDATE (atômico).
    UPDATE zapp.agent_stats
       SET xp = xp + p_xp_reward,
           achievements_count = achievements_count + 1,
           updated_at = pg_catalog.now()
     WHERE profile_id = p_profile_id
    RETURNING xp, level INTO v_xp, v_level;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'already_had',    pg_catalog.to_jsonb(false),
    'achievement_id', v_ach_id,
    'xp',             v_xp,
    'level',          v_level,
    'previous_level', v_prev_level,
    'leveled_up',     v_level > v_prev_level
  );
END;
$fn$;

COMMENT ON FUNCTION zapp.rpc_grant_achievement(uuid, text, text, text, numeric)
  IS 'E59: concede conquista de forma atomica (ON CONFLICT DO NOTHING + xp/'
     'achievements_count incrementais no mesmo UPDATE). Conquista repetida → '
     'already_had sem XP. Somente o dono do perfil ou admin/supervisor.';

GRANT EXECUTE ON FUNCTION zapp.rpc_add_xp(uuid, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION zapp.rpc_grant_achievement(uuid, text, text, text, numeric)
  TO authenticated, service_role;
