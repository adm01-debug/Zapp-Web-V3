-- ============================================================================
-- FIX GAP-AUDIT-1 — RLS explícita em zapp.audio_meme_favorites
-- ============================================================================
-- Tipo: HARDENING DE SEGURANÇA (Broken Access Control — OWASP A01:2021)
--
-- CONTEXTO:
--   A tabela zapp.audio_meme_favorites tem RLS habilitado desde a criação
--   e a policy 'auth_own_or_admin' foi criada em migrations pré-squash.
--   Porém nenhum arquivo .sql versionado contém o CREATE POLICY explícito —
--   a policy existe apenas no DB de produção, não no filesystem.
--
--   A migration 20260806700000 fez DROP da policy duplicada 'auth_secure_29'
--   mantendo apenas 'auth_own_or_admin', mas sem documentar sua definição.
--
-- PROBLEMA IDENTIFICADO (Agente 2 — auditoria 5 agentes, 2026-08-06):
--   Se o ambiente for recriado a partir das migrations do filesystem, a tabela
--   ficaria sem nenhuma policy (apenas ENABLE ROW LEVEL SECURITY), bloqueando
--   todos os acessos inclusive do próprio usuário.
--
-- CORREÇÃO:
--   Recriar idempotentemente a policy 'auth_own_or_admin' com definição
--   explícita e documentada no filesystem.
--
-- POLÍTICA RESULTANTE:
--   - SELECT/INSERT/UPDATE/DELETE para 'authenticated'
--   - USING e WITH CHECK: user_id = auth.uid() OR zapp.is_admin_or_supervisor()
--   - Leitura: cada usuário vê apenas seus próprios favoritos (ou admins)
--   - Escrita: cada usuário só pode alterar seus próprios favoritos (ou admins)
--
-- Detectado em: auditoria exaustiva 5 agentes — 2026-08-06
-- ============================================================================

-- Garantir que RLS está ativo (idempotente)
ALTER TABLE zapp.audio_meme_favorites ENABLE ROW LEVEL SECURITY;

-- Recriar idempotentemente a policy principal
DROP POLICY IF EXISTS auth_own_or_admin ON zapp.audio_meme_favorites;

CREATE POLICY auth_own_or_admin ON zapp.audio_meme_favorites
  FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid()
    OR zapp.is_admin_or_supervisor()
  )
  WITH CHECK (
    user_id = auth.uid()
    OR zapp.is_admin_or_supervisor()
  );

COMMENT ON TABLE zapp.audio_meme_favorites IS
'Favoritos de audio memes por usuário. RLS ativo.
Policy após FIX GAP-AUDIT-1 (2026-08-06):
  auth_own_or_admin — ALL, authenticated
    USING: user_id = auth.uid() OR is_admin_or_supervisor()
    WITH CHECK: user_id = auth.uid() OR is_admin_or_supervisor()
UNIQUE constraint (user_id, meme_id) adicionada em 20260806200100.
fn_toggle_user_meme_favorite: guard ownership (20260806300000) + search_path (20260806800000).';
