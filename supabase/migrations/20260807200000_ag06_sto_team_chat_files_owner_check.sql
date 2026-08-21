-- ESPELHO repo×DB — migration aplicada via MCP (supabase_apply_migration) na auditoria Hermes 2026-08-06/07.
-- Registro em supabase_migrations.schema_migrations; este arquivo é o registro histórico (DB-as-source).
-- AG02-RLS-13 (P2): owner check no bucket privado team-chat-files.
--
-- RESTAURADO de docs/history/migrations-archive/ em 2026-08-21 (plano-100): a limpeza
-- Fase 4-6 (commit 793cd26f, PR #1328, 2026-08-19) arquivou este arquivo junto com o
-- squash canônico de 2026-08-04, mas esta migration é datada 2026-08-07 — POSTERIOR
-- ao corte do squash (20260804000000) — então nunca poderia ter sido absorvida por ele.
-- Confirmado ao vivo (pg_policies): a policy auth_rw_teamfiles EXISTE em produção com
-- exatamente esta definição — estava apenas ausente do diretório de migrations ativas,
-- quebrando `team-chat-comprehensive.test.tsx` (quality-gate) e a reprodutibilidade em
-- banco limpo. Demais arquivos pós-squash arquivados na mesma limpeza não foram
-- auditados aqui — este é o único caso confirmado como bloqueante nesta sessão.
DROP POLICY IF EXISTS auth_rw_teamfiles ON storage.objects;
CREATE POLICY auth_rw_teamfiles ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'team-chat-files' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'team-chat-files' AND (storage.foldername(name))[1] = auth.uid()::text);
