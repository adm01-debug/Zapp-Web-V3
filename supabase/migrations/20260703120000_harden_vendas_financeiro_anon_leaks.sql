-- =============================================================================
-- vendas + financeiro schemas — close a LIVE anon leak of financial/PII/PIX data
--
-- The 2026-07-02 audit hardened `zapp` and `public`. Re-running the same
-- role-simulation matrix across the remaining app schemas found that `anon` has
-- USAGE on `vendas` and `financeiro` AND could read, via the public anon key
-- (shipped in a frontend bundle):
--   vendas.ordens_compra   (1831 rows) — purchase-order ledger: cnpj, cliente,
--                          fornecedor, chave_pix (PIX payment keys!), values,
--                          vendedor, comprovante, recibo — full sales+payment data
--   vendas.fornecedores    (212 rows)  — suppliers incl. tipo_chave_pix / chave_pix
--   vendas.usuarios        — internal user directory (email, cargo, setor)
--   vendas._config / _meta_sync / envios_cotacao / ncm_skus_blacklist /
--                          produtos_ncm_mapa — RLS was OFF + anon grant
--   financeiro.destinatarios — payment recipients: doc (CPF/CNPJ), nome, ie,
--                          email, full address (PII)
--   financeiro.pedido_kits — anon could even INSERT/DELETE (write!) kits
--
-- Every affected table already grants `authenticated` SELECT and authenticated
-- has schema USAGE, so the fix is monotonic: retarget the permissive policies
-- from anon → authenticated, enable RLS on the RLS-off tables with an
-- authenticated policy, and revoke every anon table grant. Logged-in consumers
-- (any app using an authenticated session) keep working; only the anonymous
-- internet loses access. service_role is untouched. Applied to production live;
-- idempotent + guarded.
-- =============================================================================

-- 1) Retarget permissive policies off anon --------------------------------------
DO $$
DECLARE
  r record;
  targets text[][] := ARRAY[
    ARRAY['financeiro','destinatarios','anon_select'],
    ARRAY['financeiro','pedido_kits','anon_select_pedido_kits'],
    ARRAY['financeiro','pedido_kits','anon_insert_pedido_kits'],
    ARRAY['financeiro','pedido_kits','anon_delete_pedido_kits'],
    ARRAY['vendas','fornecedores','p_fornecedores_select'],
    ARRAY['vendas','ordens_compra','p_ordens_anon_select'],
    ARRAY['vendas','usuarios','p_usuarios_anon_select']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(targets,1) LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname=targets[i][1] AND tablename=targets[i][2] AND policyname=targets[i][3]
        AND (roles::text LIKE '%anon%' OR roles::text='{public}')
    ) THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I TO authenticated',
                     targets[i][3], targets[i][1], targets[i][2]);
      RAISE NOTICE 'retargeted %.% policy % -> authenticated', targets[i][1], targets[i][2], targets[i][3];
    END IF;
  END LOOP;
END $$;

-- 2) Enable RLS + authenticated policy on the RLS-off vendas tables --------------
DO $$
DECLARE t text;
  rls_off text[] := ARRAY['_config','_meta_sync','envios_cotacao','ncm_skus_blacklist','produtos_ncm_mapa'];
BEGIN
  FOREACH t IN ARRAY rls_off LOOP
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='vendas' AND c.relname=t AND c.relkind='r') THEN
      EXECUTE format('ALTER TABLE vendas.%I ENABLE ROW LEVEL SECURITY', t);
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='vendas' AND tablename=t AND policyname='authenticated_all') THEN
        EXECUTE format('CREATE POLICY authenticated_all ON vendas.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
      END IF;
      RAISE NOTICE 'vendas.%: RLS enabled + authenticated_all', t;
    END IF;
  END LOOP;
END $$;

-- 3) Revoke every anon table grant across the affected tables -------------------
DO $$
DECLARE t text;
  vendas_tbls text[] := ARRAY['_config','_meta_sync','envios_cotacao','ncm_skus_blacklist',
                              'produtos_ncm_mapa','fornecedores','ordens_compra','usuarios'];
BEGIN
  FOREACH t IN ARRAY vendas_tbls LOOP
    EXECUTE format('REVOKE ALL ON vendas.%I FROM anon', t);
  END LOOP;
  EXECUTE 'REVOKE ALL ON financeiro.destinatarios FROM anon';
  EXECUTE 'REVOKE ALL ON financeiro.pedido_kits   FROM anon';
END $$;

-- Post-change (verified live): vendas + financeiro anon live-leaks 10 -> 0,
-- RLS-off tables 5 -> 0, authenticated access preserved on all of them.
--
-- RESIDUAL (documented, not changed here — other apps' schemas, and NOT currently
-- reachable because anon lacks schema USAGE there, so latent not live):
--   evo (143 anon table grants, 26 RLS-off), email_app (33), ai (31), bpm (39),
--   archive (15, 9 RLS-off). Each schema's owner should run the same matrix and
--   `REVOKE ALL ON ALL TABLES IN SCHEMA <s> FROM anon` + `REVOKE USAGE ON SCHEMA
--   <s> FROM anon` to remove the latent mine.
