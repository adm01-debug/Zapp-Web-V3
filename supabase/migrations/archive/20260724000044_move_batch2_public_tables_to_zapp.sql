-- Migration: move batch-2 public tables to zapp schema (52 tables)
--
-- Context:
--   These tables were created in public schema (migration 20260502_create_missing_tables.sql
--   and others) and never moved. The Supabase client sends Accept-Profile: zapp on every
--   request, so any table still in public is invisible to the application → PGRST205.
--
--   Pattern per table (6 steps, all idempotent):
--     1. Move physical table public → zapp (checks pg_class relkind IN ('r','p'))
--     2. Enable RLS on the zapp table
--     3. Drop stale policies carried over from public after SET SCHEMA
--     4. Recreate RLS policies using zapp.is_admin_or_supervisor()
--     5. GRANT SELECT/INSERT/UPDATE/DELETE TO authenticated; ALL TO service_role
--
--   SECURITY FIX: sicoob_contact_mapping had FOR ALL TO anon USING(true)
--   exposing banking integration data to unauthenticated users. Removed.

-- ===========================================================================
-- 1. allowed_countries
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='allowed_countries' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='allowed_countries' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.allowed_countries';
    EXECUTE 'ALTER TABLE public.allowed_countries SET SCHEMA zapp';
    RAISE NOTICE 'MOVED allowed_countries to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='allowed_countries' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'allowed_countries already in zapp';
  ELSE RAISE NOTICE 'allowed_countries not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='allowed_countries') THEN
    EXECUTE 'ALTER TABLE zapp.allowed_countries ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='allowed_countries'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.allowed_countries', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='allowed_countries') THEN
    EXECUTE $p$CREATE POLICY "allowed_countries_select_all" ON zapp.allowed_countries
      FOR SELECT TO authenticated USING (true)$p$;
    EXECUTE $p$CREATE POLICY "allowed_countries_admin_write" ON zapp.allowed_countries
      FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.allowed_countries TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.allowed_countries TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 2. blocked_countries
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='blocked_countries' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='blocked_countries' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.blocked_countries';
    EXECUTE 'ALTER TABLE public.blocked_countries SET SCHEMA zapp';
    RAISE NOTICE 'MOVED blocked_countries to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='blocked_countries' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'blocked_countries already in zapp';
  ELSE RAISE NOTICE 'blocked_countries not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='blocked_countries') THEN
    EXECUTE 'ALTER TABLE zapp.blocked_countries ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='blocked_countries'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.blocked_countries', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='blocked_countries') THEN
    EXECUTE $p$CREATE POLICY "blocked_countries_select_all" ON zapp.blocked_countries
      FOR SELECT TO authenticated USING (true)$p$;
    EXECUTE $p$CREATE POLICY "blocked_countries_admin_write" ON zapp.blocked_countries
      FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.blocked_countries TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.blocked_countries TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 3. blocked_ips
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='blocked_ips' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='blocked_ips' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.blocked_ips';
    EXECUTE 'ALTER TABLE public.blocked_ips SET SCHEMA zapp';
    RAISE NOTICE 'MOVED blocked_ips to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='blocked_ips' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'blocked_ips already in zapp';
  ELSE RAISE NOTICE 'blocked_ips not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='blocked_ips') THEN
    EXECUTE 'ALTER TABLE zapp.blocked_ips ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='blocked_ips'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.blocked_ips', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='blocked_ips') THEN
    EXECUTE $p$CREATE POLICY "blocked_ips_admin_all" ON zapp.blocked_ips
      FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.blocked_ips TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.blocked_ips TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 4. ip_whitelist
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='ip_whitelist' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='ip_whitelist' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.ip_whitelist';
    EXECUTE 'ALTER TABLE public.ip_whitelist SET SCHEMA zapp';
    RAISE NOTICE 'MOVED ip_whitelist to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='ip_whitelist' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'ip_whitelist already in zapp';
  ELSE RAISE NOTICE 'ip_whitelist not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='ip_whitelist') THEN
    EXECUTE 'ALTER TABLE zapp.ip_whitelist ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='ip_whitelist'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.ip_whitelist', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='ip_whitelist') THEN
    EXECUTE $p$CREATE POLICY "ip_whitelist_select_all" ON zapp.ip_whitelist
      FOR SELECT TO authenticated USING (true)$p$;
    EXECUTE $p$CREATE POLICY "ip_whitelist_admin_write" ON zapp.ip_whitelist
      FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.ip_whitelist TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.ip_whitelist TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 5. permissions
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='permissions' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='permissions' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.permissions';
    EXECUTE 'ALTER TABLE public.permissions SET SCHEMA zapp';
    RAISE NOTICE 'MOVED permissions to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='permissions' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'permissions already in zapp';
  ELSE RAISE NOTICE 'permissions not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='permissions') THEN
    EXECUTE 'ALTER TABLE zapp.permissions ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='permissions'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.permissions', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='permissions') THEN
    EXECUTE $p$CREATE POLICY "permissions_select_all" ON zapp.permissions
      FOR SELECT TO authenticated USING (true)$p$;
    EXECUTE $p$CREATE POLICY "permissions_admin_write" ON zapp.permissions
      FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.permissions TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.permissions TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 6. rate_limit_configs
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='rate_limit_configs' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='rate_limit_configs' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.rate_limit_configs';
    EXECUTE 'ALTER TABLE public.rate_limit_configs SET SCHEMA zapp';
    RAISE NOTICE 'MOVED rate_limit_configs to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='rate_limit_configs' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'rate_limit_configs already in zapp';
  ELSE RAISE NOTICE 'rate_limit_configs not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='rate_limit_configs') THEN
    EXECUTE 'ALTER TABLE zapp.rate_limit_configs ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='rate_limit_configs'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.rate_limit_configs', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='rate_limit_configs') THEN
    EXECUTE $p$CREATE POLICY "rate_limit_configs_select_all" ON zapp.rate_limit_configs
      FOR SELECT TO authenticated USING (true)$p$;
    EXECUTE $p$CREATE POLICY "rate_limit_configs_admin_write" ON zapp.rate_limit_configs
      FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.rate_limit_configs TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.rate_limit_configs TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 7. geo_blocking_settings
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='geo_blocking_settings' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='geo_blocking_settings' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.geo_blocking_settings';
    EXECUTE 'ALTER TABLE public.geo_blocking_settings SET SCHEMA zapp';
    RAISE NOTICE 'MOVED geo_blocking_settings to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='geo_blocking_settings' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'geo_blocking_settings already in zapp';
  ELSE RAISE NOTICE 'geo_blocking_settings not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='geo_blocking_settings') THEN
    EXECUTE 'ALTER TABLE zapp.geo_blocking_settings ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='geo_blocking_settings'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.geo_blocking_settings', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='geo_blocking_settings') THEN
    EXECUTE $p$CREATE POLICY "geo_blocking_settings_select_all" ON zapp.geo_blocking_settings
      FOR SELECT TO authenticated USING (true)$p$;
    EXECUTE $p$CREATE POLICY "geo_blocking_settings_admin_write" ON zapp.geo_blocking_settings
      FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.geo_blocking_settings TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.geo_blocking_settings TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 8. route_permissions
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='route_permissions' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='route_permissions' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.route_permissions';
    EXECUTE 'ALTER TABLE public.route_permissions SET SCHEMA zapp';
    RAISE NOTICE 'MOVED route_permissions to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='route_permissions' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'route_permissions already in zapp';
  ELSE RAISE NOTICE 'route_permissions not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='route_permissions') THEN
    EXECUTE 'ALTER TABLE zapp.route_permissions ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='route_permissions'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.route_permissions', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='route_permissions') THEN
    -- anon SELECT allowed — route guard needs to read routes before auth is resolved
    EXECUTE $p$CREATE POLICY "route_permissions_select_all" ON zapp.route_permissions
      FOR SELECT TO authenticated, anon USING (true)$p$;
    EXECUTE $p$CREATE POLICY "route_permissions_admin_write" ON zapp.route_permissions
      FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT ON TABLE zapp.route_permissions TO anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.route_permissions TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.route_permissions TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 9. app_settings  (MISSING RLS in original — added here)
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='app_settings' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='app_settings' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.app_settings';
    EXECUTE 'ALTER TABLE public.app_settings SET SCHEMA zapp';
    RAISE NOTICE 'MOVED app_settings to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='app_settings' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'app_settings already in zapp';
  ELSE RAISE NOTICE 'app_settings not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='app_settings') THEN
    EXECUTE 'ALTER TABLE zapp.app_settings ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='app_settings'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.app_settings', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='app_settings') THEN
    EXECUTE $p$CREATE POLICY "app_settings_select_all" ON zapp.app_settings
      FOR SELECT TO authenticated USING (true)$p$;
    EXECUTE $p$CREATE POLICY "app_settings_admin_write" ON zapp.app_settings
      FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.app_settings TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.app_settings TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 10. away_messages
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='away_messages' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='away_messages' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.away_messages';
    EXECUTE 'ALTER TABLE public.away_messages SET SCHEMA zapp';
    RAISE NOTICE 'MOVED away_messages to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='away_messages' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'away_messages already in zapp';
  ELSE RAISE NOTICE 'away_messages not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='away_messages') THEN
    EXECUTE 'ALTER TABLE zapp.away_messages ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='away_messages'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.away_messages', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='away_messages') THEN
    EXECUTE $p$CREATE POLICY "away_messages_select_all" ON zapp.away_messages
      FOR SELECT TO authenticated USING (true)$p$;
    EXECUTE $p$CREATE POLICY "away_messages_admin_write" ON zapp.away_messages
      FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.away_messages TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.away_messages TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 11. csat_auto_config
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='csat_auto_config' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='csat_auto_config' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.csat_auto_config';
    EXECUTE 'ALTER TABLE public.csat_auto_config SET SCHEMA zapp';
    RAISE NOTICE 'MOVED csat_auto_config to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='csat_auto_config' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'csat_auto_config already in zapp';
  ELSE RAISE NOTICE 'csat_auto_config not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='csat_auto_config') THEN
    EXECUTE 'ALTER TABLE zapp.csat_auto_config ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='csat_auto_config'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.csat_auto_config', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='csat_auto_config') THEN
    EXECUTE $p$CREATE POLICY "csat_auto_config_select_all" ON zapp.csat_auto_config
      FOR SELECT TO authenticated USING (true)$p$;
    EXECUTE $p$CREATE POLICY "csat_auto_config_admin_write" ON zapp.csat_auto_config
      FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.csat_auto_config TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.csat_auto_config TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 12. queue_goals
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='queue_goals' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='queue_goals' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.queue_goals';
    EXECUTE 'ALTER TABLE public.queue_goals SET SCHEMA zapp';
    RAISE NOTICE 'MOVED queue_goals to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='queue_goals' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'queue_goals already in zapp';
  ELSE RAISE NOTICE 'queue_goals not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='queue_goals') THEN
    EXECUTE 'ALTER TABLE zapp.queue_goals ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='queue_goals'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.queue_goals', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='queue_goals') THEN
    EXECUTE $p$CREATE POLICY "queue_goals_select_all" ON zapp.queue_goals
      FOR SELECT TO authenticated USING (true)$p$;
    EXECUTE $p$CREATE POLICY "queue_goals_admin_write" ON zapp.queue_goals
      FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.queue_goals TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.queue_goals TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 13. playbooks
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='playbooks' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='playbooks' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.playbooks';
    EXECUTE 'ALTER TABLE public.playbooks SET SCHEMA zapp';
    RAISE NOTICE 'MOVED playbooks to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='playbooks' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'playbooks already in zapp';
  ELSE RAISE NOTICE 'playbooks not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='playbooks') THEN
    EXECUTE 'ALTER TABLE zapp.playbooks ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='playbooks'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.playbooks', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='playbooks') THEN
    EXECUTE $p$CREATE POLICY "playbooks_select_all" ON zapp.playbooks
      FOR SELECT TO authenticated USING (true)$p$;
    EXECUTE $p$CREATE POLICY "playbooks_admin_write" ON zapp.playbooks
      FOR INSERT TO authenticated WITH CHECK (zapp.is_admin_or_supervisor())$p$;
    EXECUTE $p$CREATE POLICY "playbooks_admin_update" ON zapp.playbooks
      FOR UPDATE TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())$p$;
    EXECUTE $p$CREATE POLICY "playbooks_admin_delete" ON zapp.playbooks
      FOR DELETE TO authenticated USING (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.playbooks TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.playbooks TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 14. scheduled_report_configs  (MISSING RLS in original — added here)
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='scheduled_report_configs' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='scheduled_report_configs' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.scheduled_report_configs';
    EXECUTE 'ALTER TABLE public.scheduled_report_configs SET SCHEMA zapp';
    RAISE NOTICE 'MOVED scheduled_report_configs to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='scheduled_report_configs' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'scheduled_report_configs already in zapp';
  ELSE RAISE NOTICE 'scheduled_report_configs not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='scheduled_report_configs') THEN
    EXECUTE 'ALTER TABLE zapp.scheduled_report_configs ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='scheduled_report_configs'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.scheduled_report_configs', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='scheduled_report_configs') THEN
    EXECUTE $p$CREATE POLICY "scheduled_report_configs_admin_all" ON zapp.scheduled_report_configs
      FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.scheduled_report_configs TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.scheduled_report_configs TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 15. salespeople  (MISSING RLS in original — added here)
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='salespeople' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='salespeople' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.salespeople';
    EXECUTE 'ALTER TABLE public.salespeople SET SCHEMA zapp';
    RAISE NOTICE 'MOVED salespeople to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='salespeople' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'salespeople already in zapp';
  ELSE RAISE NOTICE 'salespeople not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='salespeople') THEN
    EXECUTE 'ALTER TABLE zapp.salespeople ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='salespeople'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.salespeople', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='salespeople') THEN
    EXECUTE $p$CREATE POLICY "salespeople_select_all" ON zapp.salespeople
      FOR SELECT TO authenticated USING (true)$p$;
    EXECUTE $p$CREATE POLICY "salespeople_admin_write" ON zapp.salespeople
      FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.salespeople TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.salespeople TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 16. client_wallet_rules
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='client_wallet_rules' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='client_wallet_rules' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.client_wallet_rules';
    EXECUTE 'ALTER TABLE public.client_wallet_rules SET SCHEMA zapp';
    RAISE NOTICE 'MOVED client_wallet_rules to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='client_wallet_rules' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'client_wallet_rules already in zapp';
  ELSE RAISE NOTICE 'client_wallet_rules not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='client_wallet_rules') THEN
    EXECUTE 'ALTER TABLE zapp.client_wallet_rules ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='client_wallet_rules'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.client_wallet_rules', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='client_wallet_rules') THEN
    EXECUTE $p$CREATE POLICY "client_wallet_rules_select_all" ON zapp.client_wallet_rules
      FOR SELECT TO authenticated USING (true)$p$;
    EXECUTE $p$CREATE POLICY "client_wallet_rules_admin_write" ON zapp.client_wallet_rules
      FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.client_wallet_rules TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.client_wallet_rules TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 17. evolution_health_logs
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='evolution_health_logs' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='evolution_health_logs' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.evolution_health_logs';
    EXECUTE 'ALTER TABLE public.evolution_health_logs SET SCHEMA zapp';
    RAISE NOTICE 'MOVED evolution_health_logs to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='evolution_health_logs' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'evolution_health_logs already in zapp';
  ELSE RAISE NOTICE 'evolution_health_logs not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='evolution_health_logs') THEN
    EXECUTE 'ALTER TABLE zapp.evolution_health_logs ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='evolution_health_logs'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.evolution_health_logs', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='evolution_health_logs') THEN
    EXECUTE $p$CREATE POLICY "evolution_health_logs_admin_select" ON zapp.evolution_health_logs
      FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT ON TABLE zapp.evolution_health_logs TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.evolution_health_logs TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 18. ai_providers
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='ai_providers' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='ai_providers' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.ai_providers';
    EXECUTE 'ALTER TABLE public.ai_providers SET SCHEMA zapp';
    RAISE NOTICE 'MOVED ai_providers to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='ai_providers' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'ai_providers already in zapp';
  ELSE RAISE NOTICE 'ai_providers not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='ai_providers') THEN
    EXECUTE 'ALTER TABLE zapp.ai_providers ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='ai_providers'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.ai_providers', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='ai_providers') THEN
    EXECUTE $p$CREATE POLICY "ai_providers_admin_all" ON zapp.ai_providers
      FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.ai_providers TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.ai_providers TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 19. ai_conversation_tags
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='ai_conversation_tags' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='ai_conversation_tags' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.ai_conversation_tags';
    EXECUTE 'ALTER TABLE public.ai_conversation_tags SET SCHEMA zapp';
    RAISE NOTICE 'MOVED ai_conversation_tags to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='ai_conversation_tags' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'ai_conversation_tags already in zapp';
  ELSE RAISE NOTICE 'ai_conversation_tags not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='ai_conversation_tags') THEN
    EXECUTE 'ALTER TABLE zapp.ai_conversation_tags ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='ai_conversation_tags'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.ai_conversation_tags', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='ai_conversation_tags') THEN
    EXECUTE $p$CREATE POLICY "ai_conversation_tags_all_auth" ON zapp.ai_conversation_tags
      FOR ALL TO authenticated USING (true) WITH CHECK (true)$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.ai_conversation_tags TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.ai_conversation_tags TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 20. contact_custom_fields
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='contact_custom_fields' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='contact_custom_fields' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.contact_custom_fields';
    EXECUTE 'ALTER TABLE public.contact_custom_fields SET SCHEMA zapp';
    RAISE NOTICE 'MOVED contact_custom_fields to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='contact_custom_fields' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'contact_custom_fields already in zapp';
  ELSE RAISE NOTICE 'contact_custom_fields not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='contact_custom_fields') THEN
    EXECUTE 'ALTER TABLE zapp.contact_custom_fields ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='contact_custom_fields'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.contact_custom_fields', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='contact_custom_fields') THEN
    EXECUTE $p$CREATE POLICY "contact_custom_fields_all_auth" ON zapp.contact_custom_fields
      FOR ALL TO authenticated USING (true) WITH CHECK (true)$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.contact_custom_fields TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.contact_custom_fields TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 21. contact_tags
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='contact_tags' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='contact_tags' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.contact_tags';
    EXECUTE 'ALTER TABLE public.contact_tags SET SCHEMA zapp';
    RAISE NOTICE 'MOVED contact_tags to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='contact_tags' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'contact_tags already in zapp';
  ELSE RAISE NOTICE 'contact_tags not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='contact_tags') THEN
    EXECUTE 'ALTER TABLE zapp.contact_tags ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='contact_tags'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.contact_tags', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='contact_tags') THEN
    EXECUTE $p$CREATE POLICY "contact_tags_all_auth" ON zapp.contact_tags
      FOR ALL TO authenticated USING (true) WITH CHECK (true)$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.contact_tags TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.contact_tags TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 22. conversation_closures
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='conversation_closures' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='conversation_closures' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.conversation_closures';
    EXECUTE 'ALTER TABLE public.conversation_closures SET SCHEMA zapp';
    RAISE NOTICE 'MOVED conversation_closures to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='conversation_closures' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'conversation_closures already in zapp';
  ELSE RAISE NOTICE 'conversation_closures not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='conversation_closures') THEN
    EXECUTE 'ALTER TABLE zapp.conversation_closures ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='conversation_closures'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.conversation_closures', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='conversation_closures') THEN
    EXECUTE $p$CREATE POLICY "conversation_closures_select_all" ON zapp.conversation_closures
      FOR SELECT TO authenticated USING (true)$p$;
    EXECUTE $p$CREATE POLICY "conversation_closures_insert_all" ON zapp.conversation_closures
      FOR INSERT TO authenticated WITH CHECK (true)$p$;
    EXECUTE $p$CREATE POLICY "conversation_closures_update_admin" ON zapp.conversation_closures
      FOR UPDATE TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())$p$;
    EXECUTE $p$CREATE POLICY "conversation_closures_delete_admin" ON zapp.conversation_closures
      FOR DELETE TO authenticated USING (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.conversation_closures TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.conversation_closures TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 23. conversation_memory
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='conversation_memory' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='conversation_memory' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.conversation_memory';
    EXECUTE 'ALTER TABLE public.conversation_memory SET SCHEMA zapp';
    RAISE NOTICE 'MOVED conversation_memory to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='conversation_memory' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'conversation_memory already in zapp';
  ELSE RAISE NOTICE 'conversation_memory not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='conversation_memory') THEN
    EXECUTE 'ALTER TABLE zapp.conversation_memory ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='conversation_memory'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.conversation_memory', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='conversation_memory') THEN
    EXECUTE $p$CREATE POLICY "conversation_memory_all_auth" ON zapp.conversation_memory
      FOR ALL TO authenticated USING (true) WITH CHECK (true)$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.conversation_memory TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.conversation_memory TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 24. custom_emojis
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='custom_emojis' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='custom_emojis' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.custom_emojis';
    EXECUTE 'ALTER TABLE public.custom_emojis SET SCHEMA zapp';
    RAISE NOTICE 'MOVED custom_emojis to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='custom_emojis' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'custom_emojis already in zapp';
  ELSE RAISE NOTICE 'custom_emojis not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='custom_emojis') THEN
    EXECUTE 'ALTER TABLE zapp.custom_emojis ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='custom_emojis'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.custom_emojis', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='custom_emojis') THEN
    EXECUTE $p$CREATE POLICY "custom_emojis_all_auth" ON zapp.custom_emojis
      FOR ALL TO authenticated USING (true) WITH CHECK (true)$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.custom_emojis TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.custom_emojis TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 25. deal_activities
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='deal_activities' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='deal_activities' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.deal_activities';
    EXECUTE 'ALTER TABLE public.deal_activities SET SCHEMA zapp';
    RAISE NOTICE 'MOVED deal_activities to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='deal_activities' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'deal_activities already in zapp';
  ELSE RAISE NOTICE 'deal_activities not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='deal_activities') THEN
    EXECUTE 'ALTER TABLE zapp.deal_activities ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='deal_activities'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.deal_activities', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='deal_activities') THEN
    EXECUTE $p$CREATE POLICY "deal_activities_all_auth" ON zapp.deal_activities
      FOR ALL TO authenticated USING (true) WITH CHECK (true)$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.deal_activities TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.deal_activities TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 26. followup_sequences
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='followup_sequences' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='followup_sequences' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.followup_sequences';
    EXECUTE 'ALTER TABLE public.followup_sequences SET SCHEMA zapp';
    RAISE NOTICE 'MOVED followup_sequences to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='followup_sequences' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'followup_sequences already in zapp';
  ELSE RAISE NOTICE 'followup_sequences not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='followup_sequences') THEN
    EXECUTE 'ALTER TABLE zapp.followup_sequences ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='followup_sequences'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.followup_sequences', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='followup_sequences') THEN
    EXECUTE $p$CREATE POLICY "followup_sequences_all_auth" ON zapp.followup_sequences
      FOR ALL TO authenticated USING (true) WITH CHECK (true)$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.followup_sequences TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.followup_sequences TO service_role';
  END IF;
END; $$;
