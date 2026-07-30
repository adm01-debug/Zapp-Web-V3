-- INVARIANTES DE BANCO (E20)
-- Rodar contra supabase self-hosted via supabase_db_query

-- INV-01: nenhuma particao folha publicada junto com o pai (E06)
SELECT count(*) AS inv01_leaf_partitions_in_publication
FROM pg_publication_rel pr
JOIN pg_publication p ON p.oid = pr.prpubid
JOIN pg_class c ON c.oid = pr.prrelid
JOIN pg_inherits i ON i.inhrelid = c.oid
WHERE p.pubname = 'supabase_realtime'
  AND EXISTS (
    SELECT 1 FROM pg_publication_rel pr2 
    WHERE pr2.prpubid = p.oid AND pr2.prrelid = i.inhparent
  );
-- esperado: 0

-- INV-02: TRUNCATE/REFERENCES/TRIGGER nunca para authenticated/anon (E09)
SELECT count(*) AS inv02_privileges_to_remove
FROM information_schema.role_table_grants
WHERE grantee IN ('authenticated', 'anon')
  AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')
  AND table_schema IN ('zapp', 'evo', 'bpm', 'ai', 'archive', 'logistica', 'email_app', 'financeiro');
-- esperado: 0

-- INV-03: anon sem SELECT fora da allowlist (E10)
SELECT table_schema || '.' || table_name AS inv03_anon_select_leak
FROM information_schema.role_table_grants
WHERE grantee = 'anon' AND privilege_type = 'SELECT'
  AND table_schema IN ('public', 'zapp', 'evo')
  AND table_name NOT IN ('feature_flags');
-- esperado: 0 linhas

-- INV-04: nenhuma policy de SELECT equivalente a USING(true) por enumeracao (E08)
-- Verifica se a policy ainda usa enumeracao de instancias (USING(true) disfarcado)
SELECT polname AS inv04_broad_select_policy
FROM pg_policy
WHERE polrelid = 'evo.evolution_messages'::regclass 
  AND polcmd = 'r'
  AND pg_get_expr(polqual, polrelid) NOT LIKE '%auth.uid()%';
-- esperado: 0 linhas (policy deve referenciar auth.uid())

-- INV-05: toda view de ponte com security_invoker (E10)
SELECT n.nspname || '.' || c.relname AS inv05_view_without_security_invoker
FROM pg_class c 
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'v' 
  AND n.nspname IN ('public', 'zapp')
  AND COALESCE(
    (SELECT option_value FROM pg_options_to_table(c.reloptions) 
     WHERE option_name = 'security_invoker'), 'false'
  ) NOT IN ('true', 'on');
-- esperado: 0 linhas

-- INV-06: verificar se anon tem SELECT em public.contacts
SELECT count(*) AS inv06_anon_contacts_access
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND privilege_type = 'SELECT'
  AND table_schema = 'public'
  AND table_name IN ('contacts', 'contact_intelligence');
-- esperado: 0

