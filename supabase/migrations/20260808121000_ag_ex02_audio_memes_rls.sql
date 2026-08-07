-- AG-EX-02 (bloco 1) — zapp.audio_memes: escopar UPDATE/DELETE/INSERT com predicado real
-- Versão: 20260808121000
--
-- Contexto/justificativa:
--  * Policy anterior: auth_secure_30 = ALL com USING(true) e WITH CHECK (uploaded_by = auth.uid()::text OR is_admin_or_supervisor()).
--    - SELECT irrestrito: MANTIDO intencional — catálogo de memes compartilhado; o path real do app é
--      leitura direta (RPC fn_list_audio_memes_for_user sem EXECUTE p/ authenticated — drift documentado),
--      usado pelo picker de TODOS os usuários (useAudioManagement.ts fallback / AudioMemePicker.tsx).
--    - DELETE com USING(true): QUALQUER authenticated podia deletar meme alheio; hoje só é bloqueado
--      ACIDENTALMENTE pelo trigger trg_audit_audio_meme_delete (INSERT em webhook_audit_log sem policy
--      INSERT p/ authenticated). Escopo real fecha a superfície e remove a dependência da mitigação acidental.
--    - UPDATE: USING(true) + WITH CHECK efetivamente escopado (não-admin não consegue manter uploaded_by alheio);
--      novo USING explícito owner/admin remove o gap teórico.
--  * Comportamento visível p/ o app: inalterado (não-admin já não conseguia UPDATE/DELETE; admin passa
--    por is_admin_or_supervisor()). INSERT: mesma WITH CHECK de antes.
--  * 17/17 linhas têm uploaded_by='sistema' (dono real = ninguém) → só admin gerencia; regular não perde
--    leitura (SELECT compartilhada mantida).

BEGIN;

DROP POLICY IF EXISTS "auth_secure_30" ON zapp.audio_memes;

CREATE POLICY "auth_secure_30" ON zapp.audio_memes
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "auth_secure_30_insert" ON zapp.audio_memes
  FOR INSERT TO authenticated
  WITH CHECK (((uploaded_by = (auth.uid())::text) OR is_admin_or_supervisor()));

CREATE POLICY "auth_secure_30_update" ON zapp.audio_memes
  FOR UPDATE TO authenticated
  USING (((uploaded_by = (auth.uid())::text) OR is_admin_or_supervisor()))
  WITH CHECK (((uploaded_by = (auth.uid())::text) OR is_admin_or_supervisor()));

CREATE POLICY "auth_secure_30_delete" ON zapp.audio_memes
  FOR DELETE TO authenticated
  USING (((uploaded_by = (auth.uid())::text) OR is_admin_or_supervisor()));

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260808121000', 'ag_ex02_audio_memes_rls')
ON CONFLICT (version) DO NOTHING;

COMMIT;
