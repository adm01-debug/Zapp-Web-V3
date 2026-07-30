-- Migration: Create zapp VIEW proxies for 6 tables accessed by frontend but missing from zapp (BUG-45)
--
-- Problem: 6 tables queried via safeClient.from() (which uses the zapp-schema supabase
-- client) have no corresponding view or table in the zapp schema.
-- PostgREST returns PGRST205 at runtime.
--
-- All sources are physical tables in the public schema.
-- All views use security_invoker=on so underlying table RLS still applies.
-- All DO blocks are idempotent: skip if target already exists.
--
-- Affected frontend code:
--   hmac_selftest_audit    → useAdminManagement.ts, HmacSelfTestButton.tsx, useHmacAuditHistory.ts
--   sla_delivery_rules     → SLADeliveryConfigSection.tsx, useSLADelivery.ts
--   whisper_files          → TeamFiles.tsx
--   team_message_reactions → useTeamMessageReactions.ts
--   media_cache            → useMediaUrl.ts
--   dev_diagnostic_logs    → AdminDevDiagnosticsPage.tsx

-- ── 1. hmac_selftest_audit ────────────────────────────────────────────────────
-- Source: public.hmac_selftest_audit  (20260425154422)
-- Used by: useAdminManagement.ts (INSERT), HmacSelfTestButton.tsx (INSERT),
--          useHmacAuditHistory.ts (SELECT)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'hmac_selftest_audit' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.hmac_selftest_audit already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'hmac_selftest_audit' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'source public.hmac_selftest_audit not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.hmac_selftest_audit
        WITH (security_invoker = on)
      AS SELECT * FROM public.hmac_selftest_audit
    $ddl$;
    RAISE NOTICE 'created zapp.hmac_selftest_audit → public.hmac_selftest_audit';
  END IF;
END;
$$;

REVOKE ALL ON zapp.hmac_selftest_audit FROM PUBLIC, anon;
GRANT ALL    ON zapp.hmac_selftest_audit TO service_role;
GRANT SELECT, INSERT ON zapp.hmac_selftest_audit TO authenticated;

-- ── 2. sla_delivery_rules ─────────────────────────────────────────────────────
-- Source: public.sla_delivery_rules  (20260503194004)
-- Used by: SLADeliveryConfigSection.tsx (SELECT, INSERT, UPDATE),
--          useSLADelivery.ts (SELECT)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'sla_delivery_rules' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.sla_delivery_rules already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'sla_delivery_rules' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'source public.sla_delivery_rules not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.sla_delivery_rules
        WITH (security_invoker = on)
      AS SELECT * FROM public.sla_delivery_rules
    $ddl$;
    RAISE NOTICE 'created zapp.sla_delivery_rules → public.sla_delivery_rules';
  END IF;
END;
$$;

REVOKE ALL ON zapp.sla_delivery_rules FROM PUBLIC, anon;
GRANT ALL    ON zapp.sla_delivery_rules TO service_role;
GRANT SELECT, INSERT, UPDATE ON zapp.sla_delivery_rules TO authenticated;

-- ── 3. whisper_files ─────────────────────────────────────────────────────────
-- Source: public.whisper_files  (20260503163330)
-- Used by: TeamFiles.tsx (INSERT, DELETE)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'whisper_files' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.whisper_files already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'whisper_files' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'source public.whisper_files not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.whisper_files
        WITH (security_invoker = on)
      AS SELECT * FROM public.whisper_files
    $ddl$;
    RAISE NOTICE 'created zapp.whisper_files → public.whisper_files';
  END IF;
END;
$$;

REVOKE ALL ON zapp.whisper_files FROM PUBLIC, anon;
GRANT ALL    ON zapp.whisper_files TO service_role;
GRANT SELECT, INSERT, DELETE ON zapp.whisper_files TO authenticated;

-- ── 4. team_message_reactions ─────────────────────────────────────────────────
-- Source: public.team_message_reactions  (20260503180923)
-- Used by: useTeamMessageReactions.ts (INSERT, DELETE)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'team_message_reactions' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.team_message_reactions already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'team_message_reactions' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'source public.team_message_reactions not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.team_message_reactions
        WITH (security_invoker = on)
      AS SELECT * FROM public.team_message_reactions
    $ddl$;
    RAISE NOTICE 'created zapp.team_message_reactions → public.team_message_reactions';
  END IF;
END;
$$;

REVOKE ALL ON zapp.team_message_reactions FROM PUBLIC, anon;
GRANT ALL    ON zapp.team_message_reactions TO service_role;
GRANT SELECT, INSERT, DELETE ON zapp.team_message_reactions TO authenticated;

-- ── 5. media_cache ────────────────────────────────────────────────────────────
-- Source: public.media_cache  (20260506151240)
-- Used by: useMediaUrl.ts (SELECT, INSERT)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'media_cache' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.media_cache already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'media_cache' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'source public.media_cache not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.media_cache
        WITH (security_invoker = on)
      AS SELECT * FROM public.media_cache
    $ddl$;
    RAISE NOTICE 'created zapp.media_cache → public.media_cache';
  END IF;
END;
$$;

REVOKE ALL ON zapp.media_cache FROM PUBLIC, anon;
GRANT ALL    ON zapp.media_cache TO service_role;
GRANT SELECT, INSERT ON zapp.media_cache TO authenticated;

-- ── 6. dev_diagnostic_logs ────────────────────────────────────────────────────
-- Source: public.dev_diagnostic_logs  (20260506121417)
-- Used by: AdminDevDiagnosticsPage.tsx (INSERT)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'dev_diagnostic_logs' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.dev_diagnostic_logs already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'dev_diagnostic_logs' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'source public.dev_diagnostic_logs not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.dev_diagnostic_logs
        WITH (security_invoker = on)
      AS SELECT * FROM public.dev_diagnostic_logs
    $ddl$;
    RAISE NOTICE 'created zapp.dev_diagnostic_logs → public.dev_diagnostic_logs';
  END IF;
END;
$$;

REVOKE ALL ON zapp.dev_diagnostic_logs FROM PUBLIC, anon;
GRANT ALL    ON zapp.dev_diagnostic_logs TO service_role;
GRANT INSERT ON zapp.dev_diagnostic_logs TO authenticated;
