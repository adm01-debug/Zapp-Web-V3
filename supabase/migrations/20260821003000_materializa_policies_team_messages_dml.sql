-- =============================================================================
-- Materializa as policies INSERT/UPDATE/DELETE de zapp.team_messages (plano-100,
-- 2026-08-21) — mesma classe de achado do CREATE OR REPLACE de
-- zapp.fn_get_vault_secret (20260821001500) e da policy auth_rw_teamfiles
-- (20260807200000, restaurada nesta sessão): drift onde a DDL foi aplicada
-- via MCP e nunca ficou versionada em supabase/migrations/ com o estado final.
--
-- CONTEXTO — como isso foi descoberto:
--   team-chat-comprehensive.test.tsx (quality-gate) lê supabase/migrations/*.sql
--   e falhou em 3 asserções sobre estas policies. Investigação (pg_policy ao
--   vivo, 2026-08-21) + arqueologia em docs/history/migrations-archive/ (Fase
--   4-6, commit 793cd26f, PR #1328, 2026-08-19) revelou um bug sistemático na
--   janela de arquivamento: o range documentado no README do archive é
--   "versão entre 20260804000000 (o próprio squash) e 20260817000000" — mas
--   qualquer arquivo com timestamp POSTERIOR ao squash não pode logicamente
--   estar "já consolidado" por ele. Isto varreu para o archive pelo menos os
--   4 arquivos abaixo (e possivelmente outros nos blocos 20260804…/20260807…
--   do mesmo README — não auditados nesta sessão, ver nota em
--   docs/history/migrations-archive/README.md):
--     20260804130000_fix_rls_critical_gaps.sql       (criação original)
--     20260804140000_fix_rls_delta_corrigido.sql      (correção de delta)
--     20260804140100_fix_rls_critical_follow_up.sql   (F-01/F-02: tautologia
--                                                       de coluna ambígua no
--                                                       WITH CHECK)
--     20260804160000_fix_rls_policy_gaps_agent2.sql   (renomeou INSERT para
--                                                       _v2 com padrão dual-
--                                                       UUID — NÃO é o estado
--                                                       vivo atual)
--
-- team_messages_update e team_messages_delete: texto abaixo é IDÊNTICO
-- (semântica e, no caso do UPDATE, byte-a-byte) ao de 20260804140100 e
-- 20260804140000 respectivamente — confirmado contra pg_policy ao vivo.
--
-- team_messages_insert: NENHUM dos 4 arquivos do archive bate com o estado
-- vivo — nem 140100 (falta o rename) nem 160000 (usa coluna profiles.auth_id
-- inexistente hoje, padrão dual-UUID diferente). O nome vivo é
-- `team_messages_insert` (sem sufixo _v2) e o WITH CHECK vivo resolve
-- sender_id via subquery em profiles (não JOIN) — outra aplicação via MCP,
-- posterior a 160000, nunca capturada em arquivo. Materializado aqui
-- diretamente do catálogo ao vivo (pg_policy/pg_get_expr, 2026-08-21).
--
-- Idempotente via DROP POLICY IF EXISTS + CREATE POLICY.
--
-- ROLLBACK: não recomendado — reverteria controles de RLS ativos em produção
-- (mensagens de chat interno da equipe). Se necessário, restaurar a definição
-- anterior específica a partir do histórico git deste arquivo.
-- =============================================================================

DROP POLICY IF EXISTS team_messages_insert ON zapp.team_messages;
DROP POLICY IF EXISTS team_messages_insert_v2 ON zapp.team_messages;
CREATE POLICY team_messages_insert ON zapp.team_messages FOR INSERT TO authenticated
  WITH CHECK (
    (
      sender_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM zapp.team_conversation_members tcm
        WHERE tcm.conversation_id = team_messages.conversation_id
          AND tcm.profile_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
      )
    )
    OR zapp.is_admin_or_supervisor(auth.uid())
  );

DROP POLICY IF EXISTS team_messages_update ON zapp.team_messages;
CREATE POLICY team_messages_update ON zapp.team_messages FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM zapp.team_conversation_members tcm
      JOIN zapp.profiles p2 ON p2.id = tcm.profile_id
      WHERE tcm.conversation_id = team_messages.conversation_id
        AND p2.user_id = auth.uid()
    )
    OR zapp.is_admin_or_supervisor(auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM zapp.team_conversation_members tcm
      JOIN zapp.profiles p2 ON p2.id = tcm.profile_id
      WHERE tcm.conversation_id = team_messages.conversation_id
        AND p2.user_id = auth.uid()
    )
    OR zapp.is_admin_or_supervisor(auth.uid())
  );

DROP POLICY IF EXISTS team_messages_delete ON zapp.team_messages;
CREATE POLICY team_messages_delete ON zapp.team_messages FOR DELETE TO authenticated
  USING (sender_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
         OR zapp.is_admin_or_supervisor(auth.uid()));
