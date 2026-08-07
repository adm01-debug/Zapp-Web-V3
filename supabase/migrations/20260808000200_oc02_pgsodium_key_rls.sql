-- OC-02 / REC-02-24: pgsodium.key RLS
-- pgsodium.key (33 rows) — owner supabase_admin, RLS off.
-- Grants: APENAS pgsodium_keymaker + supabase_admin. SECURITY DEFINER fns (18)
-- owned by pgsodium_keymaker (create_key INSERTs direto; decrypt por key_uuid).
-- Role 'pgsodium' nao existe neste ambiente; o equivalente do spec e
-- pgsodium_keymaker (mesmo nome do policy target do Supabase stock).
-- vault.decrypted_secrets decripta via supabase_admin (superuser -> imune).
-- ENABLE + policy na MESMA transacao (supabase_apply_migration).
ALTER TABLE pgsodium.key ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pgsodium_keymaker_all" ON pgsodium.key FOR ALL TO pgsodium_keymaker USING (true) WITH CHECK (true);
