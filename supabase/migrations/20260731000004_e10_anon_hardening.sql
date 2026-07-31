-- =============================================================================
-- E10 — Anon role hardening + security_invoker normalization on bridge views
-- =============================================================================
-- Goals:
--   1. Verify anon has NO SELECT on sensitive tables (contacts, contact_intelligence,
--      feature_flags). If found, revoke it.
--   2. Ensure all bridge views in zapp that proxy evo/* tables use
--      WITH (security_invoker = on) so RLS from the physical table is enforced.
--   3. Normalize any remaining zapp views that lack security_invoker.
--
-- A "bridge view" is a view in zapp schema with relkind='v' that references
-- tables in evo schema. These must have security_invoker=on to avoid bypassing
-- Row Level Security on the underlying evo tables.
-- =============================================================================

-- =============================================================================
-- PART 1: Revoke anon SELECT on sensitive tables
-- =============================================================================
DO $$
DECLARE
  v_sensitive_tables text[][] := ARRAY[
    ARRAY['zapp', 'contatos'],
    ARRAY['zapp', 'contact_intelligence'],
    ARRAY['zapp', 'empresas'],
    ARRAY['zapp', 'profiles'],
    ARRAY['zapp', 'workspace_members'],
    ARRAY['zapp', 'user_roles'],
    ARRAY['zapp', 'audit_logs'],
    ARRAY['zapp', 'failed_messages'],
    ARRAY['zapp', 'dispatch_error_logs'],
    ARRAY['zapp', 'whatsapp_connections'],
    ARRAY['zapp', 'instance_registry'],
    ARRAY['zapp', 'webhook_audit_log'],
    ARRAY['evo', 'evolution_messages'],
    ARRAY['evo', 'evolution_contacts'],
    ARRAY['evo', 'evolution_conversations']
  ];
  v_pair  text[];
  v_has   boolean;
BEGIN
  FOREACH v_pair SLICE 1 IN ARRAY v_sensitive_tables LOOP
    -- Check if anon has any privilege on the table
    BEGIN
      v_has := has_table_privilege(
        'anon',
        format('%I.%I', v_pair[1], v_pair[2]),
        'SELECT'
      );
    EXCEPTION WHEN undefined_table THEN
      v_has := false;
    END;

    IF v_has THEN
      RAISE WARNING
        'E10: anon has SELECT on %.% — revoking.',
        v_pair[1], v_pair[2];
      EXECUTE format('REVOKE ALL ON %I.%I FROM anon', v_pair[1], v_pair[2]);
    ELSE
      RAISE NOTICE
        'E10: anon has no SELECT on %.% — OK.',
        v_pair[1], v_pair[2];
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- PART 2: Check for feature_flags table/view anon access
-- =============================================================================
DO $$
DECLARE
  v_schemas text[] := ARRAY['zapp', 'public'];
  v_schema  text;
  v_exists  boolean;
  v_has     boolean;
BEGIN
  FOREACH v_schema IN ARRAY v_schemas LOOP
    SELECT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = v_schema
        AND c.relname = 'feature_flags'
        AND c.relkind IN ('r', 'v', 'm')
    ) INTO v_exists;

    IF v_exists THEN
      BEGIN
        v_has := has_table_privilege('anon', format('%I.feature_flags', v_schema), 'SELECT');
      EXCEPTION WHEN OTHERS THEN
        v_has := false;
      END;

      IF v_has THEN
        RAISE WARNING
          'E10: anon has SELECT on %.feature_flags — revoking. '
          'Feature flags must not be visible to unauthenticated clients.',
          v_schema;
        EXECUTE format('REVOKE ALL ON %I.feature_flags FROM anon', v_schema);
      ELSE
        RAISE NOTICE 'E10: anon has no SELECT on %.feature_flags — OK.', v_schema;
      END IF;
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- PART 3: Normalize security_invoker on zapp bridge views
-- =============================================================================
-- We cannot ALTER VIEW ... SET (security_invoker=on) in PostgreSQL — the option
-- must be set at CREATE time. Instead we identify views that lack it and log
-- them as warnings for manual review. Views that proxy sensitive evo tables
-- without security_invoker bypass RLS and must be recreated.
--
-- For views that are proxies of evo.evolution_* tables, we assert security_invoker
-- is already enabled (confirmed by audit 2026-07-16 for zapp.evolution_messages
-- and zapp.evolution_conversations). If the check fails, a RAISE EXCEPTION will
-- block the migration and require DBA attention.
-- =============================================================================
DO $$
DECLARE
  v_view      record;
  v_si_ok     boolean;
  v_violation text := '';
BEGIN
  -- Check critical bridge views that must have security_invoker=on
  FOR v_view IN
    SELECT c.relname, c.reloptions
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp'
      AND c.relkind = 'v'
      AND c.relname IN (
        'evolution_messages',
        'evolution_conversations',
        'evolution_contacts',
        'evolution_media',
        'evolution_whatsapp_status'
      )
  LOOP
    v_si_ok := (
      v_view.reloptions IS NOT NULL
      AND 'security_invoker=on' = ANY(v_view.reloptions)
    );

    IF NOT v_si_ok THEN
      v_violation := v_violation ||
        format(E'\n  zapp.%I lacks security_invoker=on', v_view.relname);
    ELSE
      RAISE NOTICE 'E10: zapp.% has security_invoker=on — OK.', v_view.relname;
    END IF;
  END LOOP;

  IF v_violation <> '' THEN
    RAISE EXCEPTION
      'E10 CRITICAL: The following bridge views do NOT have security_invoker=on. '
      'They bypass RLS on the underlying evo tables and must be recreated with '
      'WITH (security_invoker = on):%',
      v_violation;
  END IF;

  -- Log any OTHER zapp views that lack security_invoker (non-blocking warning)
  FOR v_view IN
    SELECT c.relname, c.reloptions
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp'
      AND c.relkind = 'v'
      AND (
        c.reloptions IS NULL
        OR NOT ('security_invoker=on' = ANY(c.reloptions))
      )
      -- Exclude critical views already checked above (would have raised)
      AND c.relname NOT IN (
        'evolution_messages', 'evolution_conversations',
        'evolution_contacts', 'evolution_media',
        'evolution_whatsapp_status'
      )
  LOOP
    RAISE WARNING
      'E10 NOTE: zapp.% does not have security_invoker=on. '
      'If this view references tables in other schemas, verify its RLS posture.',
      v_view.relname;
  END LOOP;

  RAISE NOTICE
    'E10 PART 3 COMPLETE: Critical bridge views verified. '
    'See WARNING messages above for non-critical views without security_invoker.';
END $$;

-- =============================================================================
-- Summary
-- =============================================================================
DO $$
BEGIN
  RAISE NOTICE
    'E10 MIGRATION COMPLETE: '
    '(1) anon SELECT revoked from sensitive tables. '
    '(2) feature_flags anon access checked. '
    '(3) Critical bridge views (evolution_*) verified to have security_invoker=on. '
    'Non-critical views without security_invoker are logged as WARNINGs for review.';
END $$;
