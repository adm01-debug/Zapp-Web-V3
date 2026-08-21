-- =============================================================================
-- Materializa a policy DELETE de zapp.team_messages (plano-100, 2026-08-21) —
-- mesma classe do CREATE OR REPLACE de zapp.fn_get_vault_secret (20260821001500)
-- e da policy auth_rw_teamfiles (20260807200000, restaurada nesta sessão):
-- drift onde a DDL foi aplicada via MCP e nunca ficou versionada em
-- supabase/migrations/ com o estado final.
--
-- CORREÇÃO (2026-08-21, merge com origin/main #1355): a versão original deste
-- arquivo também recriava team_messages_insert/team_messages_update, sob a
-- suposição de que nenhuma migration versionada tinha o estado vivo — mas a
-- investigação original só varreu docs/history/migrations-archive/ (achando
-- o bug de janela de arquivamento documentado abaixo) e não conferiu
-- supabase/migrations/ ativas. `20260817260016_team_chat_rls_membership_admin_delete.sql`
-- (já presente no repo, nunca arquivada, mesclada de origin/main via PR #1355)
-- JÁ recria team_messages_insert/team_messages_update com texto idêntico ao
-- que este arquivo também definia — confirmado por comparação direta. Manter
-- as duas definições seria redundante (DROP+CREATE idêntico duas vezes) e a
-- comment antiga ("nunca capturado em arquivo") ficaria factualmente errada.
-- Removidas aqui; team_messages_insert/update seguem sob responsabilidade de
-- 20260817260016. Only team_messages_delete permanece — não coberta por
-- nenhuma migration ativa nem arquivada.
--
-- CONTEXTO — como isso foi descoberto:
--   team-chat-comprehensive.test.tsx (quality-gate) lia supabase/migrations/*.sql
--   e falhava em asserções sobre estas policies. Investigação (pg_policy ao
--   vivo, 2026-08-21) + arqueologia em docs/history/migrations-archive/ (Fase
--   4-6, commit 793cd26f, PR #1328, 2026-08-19) revelou um bug sistemático na
--   janela de arquivamento: o range documentado no README do archive é
--   "versão entre 20260804000000 (o próprio squash) e 20260817000000" — mas
--   qualquer arquivo com timestamp POSTERIOR ao squash não pode logicamente
--   estar "já consolidado" por ele. Isto varreu para o archive pelo menos
--   `20260804140000_fix_rls_delta_corrigido.sql`, cujo team_messages_delete é
--   IDÊNTICO (byte-a-byte, confirmado contra pg_policy ao vivo) ao materializado
--   abaixo — mas o arquivo inteiro cobre outras tabelas também, então restaurá-lo
--   por completo arriscaria reintroduzir DDL já superada por migrations
--   posteriores (ex.: team_messages_insert/update, hoje em 20260817260016).
--   Materializar só a policy DELETE evita esse risco.
--
-- Idempotente via DROP POLICY IF EXISTS + CREATE POLICY.
--
-- ROLLBACK: não recomendado — reverteria controle de RLS ativo em produção
-- (quem pode apagar mensagem de chat interno da equipe). Se necessário,
-- restaurar a definição anterior a partir do histórico git deste arquivo.
-- =============================================================================

DROP POLICY IF EXISTS team_messages_delete ON zapp.team_messages;
CREATE POLICY team_messages_delete ON zapp.team_messages FOR DELETE TO authenticated
  USING (sender_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
         OR zapp.is_admin_or_supervisor(auth.uid()));
