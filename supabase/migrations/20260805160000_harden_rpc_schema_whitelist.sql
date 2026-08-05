-- Migration: 20260805160000_harden_rpc_schema_whitelist.sql
--
-- MEDIUM gap fix: rpc_schema_tables and rpc_schema_columns previously used a
-- WHERE clause filter (silent empty-array for non-whitelisted schemas) instead
-- of an explicit RAISE.  This converts both to plpgsql so unauthorized schemas
-- get a clear 42501 permission-denied error rather than a confusingly empty [].
--
-- search_path is pinned to pg_catalog + information_schema only — no pg_temp,
-- no zapp — preventing any shadow-function attack vector.

-- ─────────────────────────────────────────────────────────────
-- 1. rpc_schema_tables — explicit whitelist RAISE
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.rpc_schema_tables(p_schema text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, information_schema
AS $$
BEGIN
  IF p_schema NOT IN ('zapp', 'evo', 'public') THEN
    RAISE EXCEPTION 'permission denied: schema not allowed: %', p_schema
      USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
               jsonb_build_object(
                 'table_name', table_name::text,
                 'table_type', table_type::text
               )
               ORDER BY table_name
             )
      FROM information_schema.tables
      WHERE table_schema = p_schema
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION zapp.rpc_schema_tables(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_schema_tables(text) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2. rpc_schema_columns — explicit whitelist RAISE
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.rpc_schema_columns(p_schema text, p_table text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, information_schema
AS $$
BEGIN
  IF p_schema NOT IN ('zapp', 'evo', 'public') THEN
    RAISE EXCEPTION 'permission denied: schema not allowed: %', p_schema
      USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
               jsonb_build_object(
                 'column_name',  column_name::text,
                 'data_type',    data_type::text,
                 'is_nullable',  is_nullable::text,
                 'column_default', column_default::text
               )
               ORDER BY ordinal_position
             )
      FROM information_schema.columns
      WHERE table_schema = p_schema
        AND table_name   = p_table
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION zapp.rpc_schema_columns(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_schema_columns(text, text) TO authenticated;
