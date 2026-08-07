-- MIGRATION: 20260808250000
-- FIX GAP-03: logflare_pub FOR ALL TABLES causava lag crescente no slot cainophile
--
-- ROOT CAUSE: logflare_pub era criada como FOR ALL TABLES na instalação padrão do Supabase.
-- Isso fazia o consumer cainophile (Logflare analytics) receber WAL de TODOS os schemas:
--   evo (142 tabelas), zapp, bpm, auth, storage, ops, etc.
--
-- IMPACTO MEDIDO: evolution_messages_wpp2 acumula 227.455 UPDATEs por sessão
-- (cada mudança de status pending→sent→delivered→read = 1 UPDATE → 1 evento WAL para cainophile).
-- Com FOR ALL TABLES, o slot cainophile acumulava 641 MB de lag durante sessões intensas.
--
-- FIX: Restringir logflare_pub para apenas schemas de baixo volume que o Logflare
-- efetivamente precisa monitorar no banco postgres (seus dados vivem no DB _supabase):
--   - ops: tabelas de monitoramento/audit (poucas escritas)
--   - supabase_migrations: tracking de migrations (raríssimas escritas)
--   - extensions: rate-limiter pgrst (2 tabelas, mínimas escritas)
--
-- EXCLUÍDOS: evo, zapp, bpm, auth, storage, net, realtime, vault, ...
-- net.* são UNLOGGED (não publicáveis mesmo se quiséssemos)
--
-- VALIDADO: slot começa em 4.2 MB após o fix (vs 641 MB acumulado antes).
--           evo/zapp = 0 tabelas na publicação confirmado.
--
-- NOTA: net.http_request_queue e net._http_response são UNLOGGED (relpersistence='u')
-- e não podem ser adicionadas a publicações — isso é comportamento correto do PostgreSQL.

-- Executar como superuser (requer: psql -U postgres via exec container)
-- A migration é registrada aqui para auditoria; o DDL foi aplicado via exec container
-- em 2026-08-07 durante a auditoria exaustiva de DBA (sessão: EVO-POSTGRES-AUDIT).

-- Verificação pós-apply (deve retornar puballtables=false e 0 para evo/zapp/bpm):
-- SELECT pubname, puballtables FROM pg_publication WHERE pubname='logflare_pub';
-- SELECT count(*) FROM pg_publication_tables
--   WHERE pubname='logflare_pub' AND schemaname IN ('evo','zapp','bpm');

-- Estado aplicado diretamente no banco (2026-08-07 via exec container supabase_db):
-- DROP PUBLICATION IF EXISTS logflare_pub;
-- CREATE PUBLICATION logflare_pub
--   FOR TABLES IN SCHEMA ops, supabase_migrations, extensions
--   WITH (publish = 'insert, update, delete');

-- Este arquivo documenta o fix. Para reaplicar num restore:
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname='logflare_pub' AND puballtables=true
  ) THEN
    RAISE NOTICE 'logflare_pub ainda é FOR ALL TABLES — aplicando fix GAP-03';
    -- Não podemos chamar DROP/CREATE PUBLICATION de dentro de uma função DO $$
    -- sem ser superuser. O fix deve ser reaplicado via:
    --   psql -U postgres -d postgres -c "DROP PUBLICATION IF EXISTS logflare_pub;"
    --   psql -U postgres -d postgres -c "CREATE PUBLICATION logflare_pub FOR TABLES IN SCHEMA ops, supabase_migrations, extensions WITH (publish = 'insert, update, delete');"
    RAISE EXCEPTION 'GAP-03 PENDENTE: logflare_pub precisa ser restrita manualmente como superuser. Ver migration 20260808250000.';
  ELSE
    RAISE NOTICE 'logflare_pub OK — não é FOR ALL TABLES (fix GAP-03 já aplicado)';
  END IF;
END $$;
