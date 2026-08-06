-- ============================================================================
-- FIX — zapp.audio_meme_favorites: race condition + REVOKE FROM PUBLIC
-- ============================================================================
-- Tipo: SECURITY FIX (HIGH: race condition permite linhas duplicadas)
--       + HARDENING (MEDIUM: defense-in-depth)
--
-- PROBLEMA 1 — Race condition (HIGH, identificado pelo Agente 3 — Penetration Tester):
--   A tabela zapp.audio_meme_favorites não possui constraint UNIQUE(user_id, meme_id).
--   A função zapp.fn_toggle_user_meme_favorite executa um padrão não-atômico:
--     DELETE FROM audio_meme_favorites WHERE user_id = p_user_id AND meme_id = p_meme_id;
--     v_existed := FOUND;
--     IF NOT v_existed THEN
--       INSERT INTO audio_meme_favorites (user_id, meme_id) VALUES (p_user_id, p_meme_id);
--     END IF;
--   Duas chamadas concorrentes (ex: double-click ou spam) podem:
--     T1: DELETE → FOUND=false (nenhuma linha removida)
--     T2: DELETE → FOUND=false (nenhuma linha removida)
--     T1: INSERT → (user_id, meme_id) inserido
--     T2: INSERT → (user_id, meme_id) inserido novamente
--   Resultado: duas linhas duplicadas para o mesmo (user_id, meme_id).
--   Um usuário normal pode executar via sobrecarga 1-arg (que usa auth.uid()).
--   Não requer bypass de autorização.
--
-- CORREÇÃO PROBLEMA 1:
--   1. Adicionar UNIQUE(user_id, meme_id) na tabela
--   2. Reescrever a função para usar INSERT ON CONFLICT DO NOTHING + DELETE,
--      tornando o toggle idempotente e seguro contra concorrência.
--
-- PROBLEMA 2 — REVOKE FROM PUBLIC ausente (MEDIUM):
--   A migration 20260806100000_harden_meme_favorite_2arg_guard.sql restaurou
--   GRANT EXECUTE TO authenticated na sobrecarga (uuid, uuid) sem primeiro
--   emitir REVOKE ALL FROM PUBLIC. Em PostgreSQL, funções são criadas com
--   EXECUTE TO PUBLIC por default (herdado ao longo do tempo). A role 'anon'
--   herda de PUBLIC. Chamadas anon são bloqueadas pelo guard auth.uid() IS NULL,
--   mas viola defense-in-depth: a superfície de ataque é mais ampla do que deveria.
--
-- CORREÇÃO PROBLEMA 2:
--   Revogar EXECUTE FROM PUBLIC e FROM anon na sobrecarga (uuid, uuid).
--   A sobrecarga (uuid) — 1-arg — também recebe o mesmo tratamento por simetria.
--
-- Rollback:
--   -- Desfazer UNIQUE constraint (com cuidado — pode haver duplicatas remanescentes):
--   ALTER TABLE zapp.audio_meme_favorites DROP CONSTRAINT IF EXISTS uq_audio_meme_favorites_user_meme;
--   -- Desfazer REVOKE (restaura comportamento pré-fix — NÃO recomendado):
--   GRANT EXECUTE ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid, uuid) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid) TO PUBLIC;
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Limpar duplicatas existentes antes de adicionar a constraint UNIQUE
--         (operação segura — mantém apenas a linha mais antiga de cada par)
-- ─────────────────────────────────────────────────────────────────────────────

DO $cleanup_dupes$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM zapp.audio_meme_favorites
  WHERE id NOT IN (
    SELECT MIN(id)
    FROM zapp.audio_meme_favorites
    GROUP BY user_id, meme_id
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted > 0 THEN
    RAISE NOTICE 'Cleaned % duplicate audio_meme_favorites rows before adding UNIQUE constraint', v_deleted;
  ELSE
    RAISE NOTICE 'No duplicate audio_meme_favorites rows found';
  END IF;
END;
$cleanup_dupes$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Adicionar UNIQUE(user_id, meme_id)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE zapp.audio_meme_favorites
  ADD CONSTRAINT uq_audio_meme_favorites_user_meme
  UNIQUE (user_id, meme_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Reescrever fn_toggle_user_meme_favorite(uuid, uuid) para usar
--         INSERT ON CONFLICT + DELETE atômico — elimina a race condition.
--
--         Lógica nova:
--           1. Tenta INSERT ON CONFLICT DO NOTHING
--           2. Se não inseriu (IS_FAVORITE=true já existia) → DELETE → is_favorite=false
--           3. Se inseriu → is_favorite=true
--
--         Isso é seguro: a constraint UNIQUE garante que apenas uma transação
--         vence no INSERT quando há corrida. A que perde obtém FOUND=false e
--         retorna is_favorite=true sem duplicar.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION zapp.fn_toggle_user_meme_favorite(
  p_user_id uuid,
  p_meme_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp', 'auth', 'extensions'
AS $$
DECLARE
  v_inserted boolean;
BEGIN
  -- Ownership guard: authenticated só pode operar no próprio user_id.
  -- Admins/supervisores podem agir em nome de outros.
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_argument: p_user_id nao pode ser NULL';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF p_user_id <> auth.uid() AND NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'permission_denied: nao e permitido alterar favoritos de outro usuario'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Toggle atômico usando UNIQUE constraint para eliminar race condition:
  -- INSERT ON CONFLICT DO NOTHING — apenas uma transação vence quando concorrentes.
  -- Se a linha JÁ EXISTE → INSERT falha silenciosamente → deletamos (toggle off).
  -- Se a linha NÃO EXISTE → INSERT vence → is_favorite=true (toggle on).
  INSERT INTO zapp.audio_meme_favorites (user_id, meme_id)
  VALUES (p_user_id, p_meme_id)
  ON CONFLICT (user_id, meme_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  -- v_inserted = 1 significa que INSERT inseriu (linha não existia → agora favoritado)
  -- v_inserted = 0 significa que INSERT conflitou (linha já existia → desfavoritar)

  IF v_inserted = 0 THEN
    -- Linha já existia — remover (toggle off)
    DELETE FROM zapp.audio_meme_favorites
    WHERE user_id = p_user_id AND meme_id = p_meme_id;

    RETURN jsonb_build_object(
      'ok',          true,
      'user_id',     p_user_id,
      'meme_id',     p_meme_id,
      'is_favorite', false,
      'action',      'removed'
    );
  ELSE
    -- Linha foi inserida (toggle on)
    RETURN jsonb_build_object(
      'ok',          true,
      'user_id',     p_user_id,
      'meme_id',     p_meme_id,
      'is_favorite', true,
      'action',      'added'
    );
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: REVOKE FROM PUBLIC/anon em ambas as sobrecargas (defense-in-depth)
-- ─────────────────────────────────────────────────────────────────────────────

-- Sobrecarga 2-arg (uuid, uuid) — o vetor de escalada horizontal
REVOKE ALL ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid, uuid) FROM PUBLIC, anon;
-- Re-confirmar grant para authenticated (belt-and-suspenders)
GRANT EXECUTE ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid, uuid) TO authenticated;

-- Sobrecarga 1-arg (uuid) — usa auth.uid() internamente; mesma lógica de revoke
DO $revoke_1arg$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp'
      AND p.proname = 'fn_toggle_user_meme_favorite'
      AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_meme_id uuid'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid) TO authenticated';
    RAISE NOTICE 'Revoked PUBLIC/anon EXECUTE on fn_toggle_user_meme_favorite(uuid)';
  ELSE
    RAISE NOTICE 'fn_toggle_user_meme_favorite(uuid) not found — skipping revoke';
  END IF;
END;
$revoke_1arg$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: Atualizar comentário da função
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid, uuid) IS
  'Toggle de favorito de meme por user_id + meme_id. '
  'Ownership guard: caller deve ser o próprio user_id ou ter role admin/supervisor. '
  'RACE CONDITION FIX (20260806200100): reescrita para INSERT ON CONFLICT DO NOTHING '
  'aproveitando UNIQUE(user_id, meme_id) — operação atômica sem risco de duplicatas. '
  'REVOKE FROM PUBLIC (20260806200100): anon não tem mais EXECUTE (defense-in-depth). '
  'A sobrecarga 1-arg (p_meme_id uuid) usa auth.uid() internamente e é preferida no cliente.';
