-- ============================================================================
-- FIX CRÍTICO — RLS policies incorretas em zapp.sticker_favorites
-- ============================================================================
-- Tipo: FIX CRÍTICO DE SEGURANÇA (Broken Access Control — OWASP A01:2021)
--
-- PROBLEMA (Agente 5 — auditoria exaustiva 2026-08-06):
--
--   Duas policies permitem acesso irrestrito para QUALQUER usuário autenticado:
--
--   1. sf_delete_own (DELETE, authenticated, USING = true):
--      Nome diz "own" mas condição não filtra por user_id — qualquer usuário
--      autenticado pode deletar favoritos de stickers de qualquer outro usuário.
--
--   2. sf_service_all (ALL commands, authenticated, USING = true, WITH CHECK = true):
--      Nome enganoso — aplica a role 'authenticated', não 'service_role'.
--      Policy permissiva para TODOS os comandos com condições sempre verdadeiras
--      anula completamente as demais policies, inclusive sf_insert_auth que tem
--      WITH CHECK = (user_id = auth.uid()).
--
--   Impacto combinado:
--   - DELETE: qualquer autenticado pode deletar favoritos alheios (IDOR)
--   - INSERT: sf_service_all bypassa o WITH CHECK de sf_insert_auth (IDOR)
--   - UPDATE: sf_service_all permite UPDATE irrestrito (tabela não usa UPDATE,
--             mas a policy abria vetor de ataque)
--
-- CORREÇÃO:
--   1. DROP sf_service_all — policy mal-nomeada e mal-configurada, sem utilidade
--      legítima (service_role ignora RLS por BYPASSRLS no Supabase por padrão;
--      não precisa de policy explícita).
--   2. DROP + RECREATE sf_delete_own — com USING (user_id = auth.uid()).
--
-- POLICIES MANTIDAS INTACTAS (já corretas):
--   - sf_insert_auth: INSERT TO authenticated WITH CHECK (user_id = auth.uid()) ✅
--   - sf_select_all:  SELECT TO authenticated USING (true) ✅ (leitura pública ok)
--
-- Detectado em: auditoria exaustiva 5 agentes — 2026-08-06
-- ============================================================================

-- ─── 1: Remover sf_service_all (policy malconfigurada) ────────────────────────
DROP POLICY IF EXISTS sf_service_all ON zapp.sticker_favorites;

-- ─── 2: Corrigir sf_delete_own para filtrar por user_id ──────────────────────
DROP POLICY IF EXISTS sf_delete_own ON zapp.sticker_favorites;

CREATE POLICY sf_delete_own ON zapp.sticker_favorites
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE zapp.sticker_favorites IS
'Tabela de stickers favoritos por usuário. RLS ativo.
Policies após FIX (2026-08-06):
  sf_select_all  — SELECT authenticated, USING true (leitura de todos os registros ok)
  sf_insert_auth — INSERT authenticated, WITH CHECK (user_id = auth.uid())
  sf_delete_own  — DELETE authenticated, USING (user_id = auth.uid()) [CORRIGIDA 2026-08-06]
Políticas removidas: sf_service_all (mal-nomeada, aplicava a authenticated com acesso irrestrito).';
