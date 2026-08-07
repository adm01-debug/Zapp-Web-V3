-- ESPELHO repo×DB — migration aplicada via MCP (supabase_apply_migration) na auditoria Hermes 2026-08-06/07.
-- Registro em supabase_migrations.schema_migrations; este arquivo é o registro histórico (DB-as-source).
-- AG02-RLS-13 (P2): owner check no bucket privado team-chat-files.
DROP POLICY IF EXISTS auth_rw_teamfiles ON storage.objects;
CREATE POLICY auth_rw_teamfiles ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'team-chat-files' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'team-chat-files' AND (storage.foldername(name))[1] = auth.uid()::text);
