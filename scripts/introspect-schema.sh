#!/usr/bin/env bash
# =====================================================================
# introspect-schema.sh — Reconstrói ALL_IN_ONE.sql via information_schema
# + pg_catalog. Não usa pg_dump (indisponível no Supabase Cloud gerenciado).
#
# Requer PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE no ambiente.
# Saída padrão: supabase/migrations-snapshot/ALL_IN_ONE.sql
# =====================================================================
set -euo pipefail

OUT="${1:-supabase/migrations-snapshot/ALL_IN_ONE.sql}"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

: "${PGHOST:?PGHOST não definido}"
: "${PGUSER:?PGUSER não definido}"
: "${PGDATABASE:?PGDATABASE não definido}"

echo ">> Introspectando $PGHOST/$PGDATABASE como $PGUSER"

psql_ro() { psql -X -A -t -v ON_ERROR_STOP=1 "$@"; }

{
  echo "-- =========================================================="
  echo "-- ALL_IN_ONE.sql — gerado por scripts/introspect-schema.sh"
  echo "-- Fonte: introspection ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
  echo "-- Host: $PGHOST  DB: $PGDATABASE"
  echo "-- =========================================================="
  echo "BEGIN;"
  echo ""

  # 1) Extensions
  echo "-- ============ EXTENSIONS ============"
  psql_ro -c "
    SELECT format('CREATE EXTENSION IF NOT EXISTS %I;', extname)
    FROM pg_extension
    WHERE extname NOT IN ('plpgsql')
    ORDER BY extname;
  "
  echo ""

  # 2) Enums
  echo "-- ============ ENUMS ============"
  psql_ro -c "
    SELECT format(E'DO \$\$ BEGIN CREATE TYPE public.%I AS ENUM (%s); EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;',
      t.typname,
      string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder))
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname
    ORDER BY t.typname;
  "
  echo ""

  # 3) Tables (colunas + defaults + not null)
  echo "-- ============ TABLES ============"
  psql_ro -c "
    WITH cols AS (
      SELECT
        c.table_name,
        string_agg(
          format('  %I %s%s%s',
            c.column_name,
            CASE WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name
                 WHEN c.data_type = 'ARRAY' THEN
                   (SELECT format('%s[]', et.data_type)
                    FROM information_schema.element_types et
                    WHERE (et.object_schema, et.object_name, et.object_type, et.collection_type_identifier)
                        = (c.table_schema, c.table_name, 'TABLE', c.dtd_identifier))
                 ELSE c.data_type END,
            CASE WHEN c.is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END,
            CASE WHEN c.column_default IS NOT NULL THEN ' DEFAULT ' || c.column_default ELSE '' END
          ),
          E',\n' ORDER BY c.ordinal_position
        ) AS coldef
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
      GROUP BY c.table_name
    )
    SELECT format(E'CREATE TABLE IF NOT EXISTS public.%I (\n%s\n);', table_name, coldef)
    FROM cols ORDER BY table_name;
  "
  echo ""

  # 4) Primary keys / unique / check / foreign keys
  echo "-- ============ CONSTRAINTS ============"
  psql_ro -c "
    SELECT format(E'ALTER TABLE public.%I ADD CONSTRAINT %I %s;',
      c.conrelid::regclass::text::name, c.conname, pg_get_constraintdef(c.oid))
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public'
    ORDER BY c.contype DESC, c.conname;
  " | sed 's/^/DO $$ BEGIN /' | sed 's/$/ EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;/'
  echo ""

  # 5) Indexes (non-constraint)
  echo "-- ============ INDEXES ============"
  psql_ro -c "
    SELECT indexdef || ';'
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname NOT IN (
        SELECT conname FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = 'public'
      )
    ORDER BY tablename, indexname;
  " | sed 's/^CREATE INDEX/CREATE INDEX IF NOT EXISTS/;s/^CREATE UNIQUE INDEX/CREATE UNIQUE INDEX IF NOT EXISTS/'
  echo ""

  # 6) Functions
  echo "-- ============ FUNCTIONS ============"
  psql_ro -c "
    SELECT pg_get_functiondef(p.oid) || E';\n'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    ORDER BY p.proname;
  "
  echo ""

  # 7) Views
  echo "-- ============ VIEWS ============"
  psql_ro -c "
    SELECT format(E'CREATE OR REPLACE VIEW public.%I AS\n%s;', table_name, view_definition)
    FROM information_schema.views WHERE table_schema='public'
    ORDER BY table_name;
  "
  echo ""

  # 8) Triggers
  echo "-- ============ TRIGGERS ============"
  psql_ro -c "
    SELECT format('DROP TRIGGER IF EXISTS %I ON %s;', tgname, tgrelid::regclass) || E'\n' ||
           pg_get_triggerdef(t.oid) || ';'
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
    ORDER BY c.relname, t.tgname;
  "
  echo ""

  # 9) RLS enable + policies
  echo "-- ============ RLS ============"
  psql_ro -c "
    SELECT format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
    ORDER BY c.relname;
  "
  echo ""
  echo "-- ============ POLICIES ============"
  psql_ro -c "
    SELECT format('DROP POLICY IF EXISTS %I ON public.%I;', policyname, tablename) || E'\n' ||
           format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s;',
             policyname, tablename, permissive, cmd, array_to_string(roles, ', '),
             CASE WHEN qual IS NOT NULL THEN ' USING ('||qual||')' ELSE '' END,
             CASE WHEN with_check IS NOT NULL THEN ' WITH CHECK ('||with_check||')' ELSE '' END)
    FROM pg_policies WHERE schemaname='public'
    ORDER BY tablename, policyname;
  "
  echo ""

  # 10) Grants efetivos (via has_table_privilege) — captura grants herdados
  #     de PUBLIC / role membership que information_schema.role_table_grants
  #     não retorna. Sem isso, um restore fresco ficaria sem acesso ao
  #     PostgREST mesmo com RLS e policies corretas.
  echo "-- ============ GRANTS ============"
  psql_ro -c "
    WITH targets AS (
      SELECT c.oid, c.relname, r.rolname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) AS r(rolname)
      WHERE n.nspname='public' AND c.relkind IN ('r','v')
    ),
    privs AS (
      SELECT relname, rolname, unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS priv, oid
      FROM targets
    )
    SELECT format('GRANT %s ON public.%I TO %I;',
      string_agg(priv, ', ' ORDER BY priv), relname, rolname)
    FROM privs
    WHERE has_table_privilege(rolname, oid, priv)
    GROUP BY relname, rolname
    ORDER BY relname, rolname;
  "
  echo ""

  # 11) Grants em sequences (necessário para colunas serial/identity via API)
  echo "-- ============ SEQUENCE GRANTS ============"
  psql_ro -c "
    WITH targets AS (
      SELECT c.oid, c.relname, r.rolname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) AS r(rolname)
      WHERE n.nspname='public' AND c.relkind='S'
    )
    SELECT format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO %I;', relname, rolname)
    FROM targets
    WHERE has_sequence_privilege(rolname, oid, 'USAGE');
  "
  echo ""

  # 12) Grants em funções (execute)
  echo "-- ============ FUNCTION GRANTS ============"
  psql_ro -c "
    WITH targets AS (
      SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args, r.rolname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) AS r(rolname)
      WHERE n.nspname='public'
    )
    SELECT format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO %I;', proname, args, rolname)
    FROM targets
    WHERE has_function_privilege(rolname, oid, 'EXECUTE');
  " | head -2000
  echo ""


  echo "COMMIT;"
} > "$TMP"

mkdir -p "$(dirname "$OUT")"
mv "$TMP" "$OUT"
LINES=$(wc -l < "$OUT")
SIZE=$(du -h "$OUT" | cut -f1)
echo ">> OK: $OUT ($LINES linhas, $SIZE)"
