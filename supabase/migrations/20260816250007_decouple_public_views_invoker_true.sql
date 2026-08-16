-- Auditoria 10 agentes r3: security-invoker-gate (Hermes) acusou corretamente —
-- as views espelho em public.evolution_* seguiam security_invoker=false apos o
-- fix das 11 de zapp (9348e7ab4 + 20260816250005). Como o PostgREST expoe public
-- por default, leituras via public bypassavam RLS (mesmo vazamento multi-tenant,
-- porta diferente). Subjacentes todas com RLS + grant de authenticated (pre-check).
-- Validado: via public com JWT real = 11 contatos (RLS filtra); sem JWT = 0.
DO $fix$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='v' AND n.nspname='public'
      AND c.relname ~ '^evolution_(contacts|messages|conversations|groups|group_participants)'
      AND coalesce(array_to_string(c.reloptions,','),'') NOT LIKE '%security_invoker=true%'
  LOOP
    EXECUTE format('ALTER VIEW %I.%I SET (security_invoker=true)', r.nspname, r.relname);
  END LOOP;
END $fix$;
