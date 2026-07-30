-- Migration: move batch-2 public tables to zapp schema — Part 2 (tables 27–52)
-- Continuation of 20260724000044. Same idempotent 5-step pattern.
--
-- SECURITY FIX included:
--   sicoob_contact_mapping had FOR ALL TO anon USING(true) — banking data
--   exposed to unauthenticated users. Replaced with authenticated-only access.

-- ===========================================================================
-- 27. knowledge_base_articles
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='knowledge_base_articles' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='knowledge_base_articles' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.knowledge_base_articles';
    EXECUTE 'ALTER TABLE public.knowledge_base_articles SET SCHEMA zapp';
    RAISE NOTICE 'MOVED knowledge_base_articles to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='knowledge_base_articles' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'knowledge_base_articles already in zapp';
  ELSE RAISE NOTICE 'knowledge_base_articles not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='knowledge_base_articles') THEN
    EXECUTE 'ALTER TABLE zapp.knowledge_base_articles ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='knowledge_base_articles'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.knowledge_base_articles', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='knowledge_base_articles') THEN
    EXECUTE $p$CREATE POLICY "knowledge_base_articles_all_auth" ON zapp.knowledge_base_articles
      FOR ALL TO authenticated USING (true) WITH CHECK (true)$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.knowledge_base_articles TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.knowledge_base_articles TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 28. meta_capi_events
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='meta_capi_events' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='meta_capi_events' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.meta_capi_events';
    EXECUTE 'ALTER TABLE public.meta_capi_events SET SCHEMA zapp';
    RAISE NOTICE 'MOVED meta_capi_events to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='meta_capi_events' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'meta_capi_events already in zapp';
  ELSE RAISE NOTICE 'meta_capi_events not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='meta_capi_events') THEN
    EXECUTE 'ALTER TABLE zapp.meta_capi_events ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='meta_capi_events'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.meta_capi_events', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='meta_capi_events') THEN
    EXECUTE $p$CREATE POLICY "meta_capi_events_all_auth" ON zapp.meta_capi_events
      FOR ALL TO authenticated USING (true) WITH CHECK (true)$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.meta_capi_events TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.meta_capi_events TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 29. nps_surveys
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='nps_surveys' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='nps_surveys' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.nps_surveys';
    EXECUTE 'ALTER TABLE public.nps_surveys SET SCHEMA zapp';
    RAISE NOTICE 'MOVED nps_surveys to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='nps_surveys' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'nps_surveys already in zapp';
  ELSE RAISE NOTICE 'nps_surveys not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='nps_surveys') THEN
    EXECUTE 'ALTER TABLE zapp.nps_surveys ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='nps_surveys'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.nps_surveys', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='nps_surveys') THEN
    EXECUTE $p$CREATE POLICY "nps_surveys_all_auth" ON zapp.nps_surveys
      FOR ALL TO authenticated USING (true) WITH CHECK (true)$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.nps_surveys TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.nps_surveys TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 30. number_reputation
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='number_reputation' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='number_reputation' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.number_reputation';
    EXECUTE 'ALTER TABLE public.number_reputation SET SCHEMA zapp';
    RAISE NOTICE 'MOVED number_reputation to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='number_reputation' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'number_reputation already in zapp';
  ELSE RAISE NOTICE 'number_reputation not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='number_reputation') THEN
    EXECUTE 'ALTER TABLE zapp.number_reputation ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='number_reputation'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.number_reputation', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='number_reputation') THEN
    EXECUTE $p$CREATE POLICY "number_reputation_select_all" ON zapp.number_reputation
      FOR SELECT TO authenticated USING (true)$p$;
    EXECUTE $p$CREATE POLICY "number_reputation_insert_all" ON zapp.number_reputation
      FOR INSERT TO authenticated WITH CHECK (true)$p$;
    EXECUTE $p$CREATE POLICY "number_reputation_update_all" ON zapp.number_reputation
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true)$p$;
    EXECUTE $p$CREATE POLICY "number_reputation_delete_admin" ON zapp.number_reputation
      FOR DELETE TO authenticated USING (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.number_reputation TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.number_reputation TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 31. sales_pipeline_stages
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='sales_pipeline_stages' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='sales_pipeline_stages' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.sales_pipeline_stages';
    EXECUTE 'ALTER TABLE public.sales_pipeline_stages SET SCHEMA zapp';
    RAISE NOTICE 'MOVED sales_pipeline_stages to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='sales_pipeline_stages' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'sales_pipeline_stages already in zapp';
  ELSE RAISE NOTICE 'sales_pipeline_stages not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='sales_pipeline_stages') THEN
    EXECUTE 'ALTER TABLE zapp.sales_pipeline_stages ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='sales_pipeline_stages'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.sales_pipeline_stages', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='sales_pipeline_stages') THEN
    EXECUTE $p$CREATE POLICY "sales_pipeline_stages_all_auth" ON zapp.sales_pipeline_stages
      FOR ALL TO authenticated USING (true) WITH CHECK (true)$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.sales_pipeline_stages TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.sales_pipeline_stages TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 32. stickers
-- Note: public.stickers is a separate table from zapp.personal_stickers.
--       DROP VIEW IF EXISTS zapp.stickers handles a possible view proxy.
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='stickers' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='stickers' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.stickers';
    EXECUTE 'ALTER TABLE public.stickers SET SCHEMA zapp';
    RAISE NOTICE 'MOVED stickers to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='stickers' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'stickers already in zapp';
  ELSE RAISE NOTICE 'stickers not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='stickers') THEN
    EXECUTE 'ALTER TABLE zapp.stickers ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='stickers'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.stickers', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='stickers') THEN
    EXECUTE $p$CREATE POLICY "stickers_all_auth" ON zapp.stickers
      FOR ALL TO authenticated USING (true) WITH CHECK (true)$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.stickers TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.stickers TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 33. whatsapp_groups
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='whatsapp_groups' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='whatsapp_groups' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.whatsapp_groups';
    EXECUTE 'ALTER TABLE public.whatsapp_groups SET SCHEMA zapp';
    RAISE NOTICE 'MOVED whatsapp_groups to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='whatsapp_groups' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'whatsapp_groups already in zapp';
  ELSE RAISE NOTICE 'whatsapp_groups not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='whatsapp_groups') THEN
    EXECUTE 'ALTER TABLE zapp.whatsapp_groups ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='whatsapp_groups'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.whatsapp_groups', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='whatsapp_groups') THEN
    EXECUTE $p$CREATE POLICY "whatsapp_groups_all_auth" ON zapp.whatsapp_groups
      FOR ALL TO authenticated USING (true) WITH CHECK (true)$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.whatsapp_groups TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.whatsapp_groups TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 34. campaign_ab_variants
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='campaign_ab_variants' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='campaign_ab_variants' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.campaign_ab_variants';
    EXECUTE 'ALTER TABLE public.campaign_ab_variants SET SCHEMA zapp';
    RAISE NOTICE 'MOVED campaign_ab_variants to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='campaign_ab_variants' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'campaign_ab_variants already in zapp';
  ELSE RAISE NOTICE 'campaign_ab_variants not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='campaign_ab_variants') THEN
    EXECUTE 'ALTER TABLE zapp.campaign_ab_variants ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='campaign_ab_variants'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.campaign_ab_variants', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='campaign_ab_variants') THEN
    EXECUTE $p$CREATE POLICY "campaign_ab_variants_all_auth" ON zapp.campaign_ab_variants
      FOR ALL TO authenticated USING (true) WITH CHECK (true)$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.campaign_ab_variants TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.campaign_ab_variants TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 35. auto_close_config
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='auto_close_config' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='auto_close_config' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.auto_close_config';
    EXECUTE 'ALTER TABLE public.auto_close_config SET SCHEMA zapp';
    RAISE NOTICE 'MOVED auto_close_config to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='auto_close_config' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'auto_close_config already in zapp';
  ELSE RAISE NOTICE 'auto_close_config not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='auto_close_config') THEN
    EXECUTE 'ALTER TABLE zapp.auto_close_config ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='auto_close_config'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.auto_close_config', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='auto_close_config') THEN
    EXECUTE $p$CREATE POLICY "auto_close_config_select_all" ON zapp.auto_close_config
      FOR SELECT TO authenticated USING (true)$p$;
    EXECUTE $p$CREATE POLICY "auto_close_config_admin_write" ON zapp.auto_close_config
      FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.auto_close_config TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.auto_close_config TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 36. query_telemetry
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='query_telemetry' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='query_telemetry' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.query_telemetry';
    EXECUTE 'ALTER TABLE public.query_telemetry SET SCHEMA zapp';
    RAISE NOTICE 'MOVED query_telemetry to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='query_telemetry' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'query_telemetry already in zapp';
  ELSE RAISE NOTICE 'query_telemetry not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='query_telemetry') THEN
    EXECUTE 'ALTER TABLE zapp.query_telemetry ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='query_telemetry'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.query_telemetry', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='query_telemetry') THEN
    EXECUTE $p$CREATE POLICY "query_telemetry_select_all" ON zapp.query_telemetry
      FOR SELECT TO authenticated USING (true)$p$;
    EXECUTE $p$CREATE POLICY "query_telemetry_insert_all" ON zapp.query_telemetry
      FOR INSERT TO authenticated WITH CHECK (true)$p$;
    EXECUTE $p$CREATE POLICY "query_telemetry_delete_admin" ON zapp.query_telemetry
      FOR DELETE TO authenticated USING (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.query_telemetry TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.query_telemetry TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 37. csat_surveys
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='csat_surveys' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='csat_surveys' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.csat_surveys';
    EXECUTE 'ALTER TABLE public.csat_surveys SET SCHEMA zapp';
    RAISE NOTICE 'MOVED csat_surveys to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='csat_surveys' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'csat_surveys already in zapp';
  ELSE RAISE NOTICE 'csat_surveys not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='csat_surveys') THEN
    EXECUTE 'ALTER TABLE zapp.csat_surveys ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='csat_surveys'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.csat_surveys', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='csat_surveys') THEN
    EXECUTE $p$CREATE POLICY "csat_surveys_select_all" ON zapp.csat_surveys
      FOR SELECT TO authenticated USING (true)$p$;
    EXECUTE $p$CREATE POLICY "csat_surveys_insert_all" ON zapp.csat_surveys
      FOR INSERT TO authenticated WITH CHECK (true)$p$;
    EXECUTE $p$CREATE POLICY "csat_surveys_update_admin" ON zapp.csat_surveys
      FOR UPDATE TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())$p$;
    EXECUTE $p$CREATE POLICY "csat_surveys_delete_admin" ON zapp.csat_surveys
      FOR DELETE TO authenticated USING (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.csat_surveys TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.csat_surveys TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 38. contact_phones  (MISSING RLS in original — added here)
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='contact_phones' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='contact_phones' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.contact_phones';
    EXECUTE 'ALTER TABLE public.contact_phones SET SCHEMA zapp';
    RAISE NOTICE 'MOVED contact_phones to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='contact_phones' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'contact_phones already in zapp';
  ELSE RAISE NOTICE 'contact_phones not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='contact_phones') THEN
    EXECUTE 'ALTER TABLE zapp.contact_phones ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='contact_phones'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.contact_phones', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='contact_phones') THEN
    EXECUTE $p$CREATE POLICY "contact_phones_select_all" ON zapp.contact_phones
      FOR SELECT TO authenticated USING (true)$p$;
    EXECUTE $p$CREATE POLICY "contact_phones_insert_all" ON zapp.contact_phones
      FOR INSERT TO authenticated WITH CHECK (true)$p$;
    EXECUTE $p$CREATE POLICY "contact_phones_update_all" ON zapp.contact_phones
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true)$p$;
    EXECUTE $p$CREATE POLICY "contact_phones_delete_all" ON zapp.contact_phones
      FOR DELETE TO authenticated USING (true)$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.contact_phones TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.contact_phones TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 39. sicoob_contact_mapping  (SECURITY FIX: remove anon access)
-- Original had FOR ALL TO anon USING(true) — banking integration data must
-- not be accessible to unauthenticated users. Replaced with admin-gated access.
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='sicoob_contact_mapping' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='sicoob_contact_mapping' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.sicoob_contact_mapping';
    EXECUTE 'ALTER TABLE public.sicoob_contact_mapping SET SCHEMA zapp';
    RAISE NOTICE 'MOVED sicoob_contact_mapping to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='sicoob_contact_mapping' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'sicoob_contact_mapping already in zapp';
  ELSE RAISE NOTICE 'sicoob_contact_mapping not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='sicoob_contact_mapping') THEN
    EXECUTE 'ALTER TABLE zapp.sicoob_contact_mapping ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='sicoob_contact_mapping'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.sicoob_contact_mapping', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='sicoob_contact_mapping') THEN
    -- Banking data: authenticated read, admin write
    EXECUTE $p$CREATE POLICY "sicoob_contact_mapping_select_auth" ON zapp.sicoob_contact_mapping
      FOR SELECT TO authenticated USING (true)$p$;
    EXECUTE $p$CREATE POLICY "sicoob_contact_mapping_admin_write" ON zapp.sicoob_contact_mapping
      FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())$p$;
    -- Revoke any lingering anon grant
    EXECUTE 'REVOKE ALL ON TABLE zapp.sicoob_contact_mapping FROM anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.sicoob_contact_mapping TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.sicoob_contact_mapping TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 40. training_sessions
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='training_sessions' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='training_sessions' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.training_sessions';
    EXECUTE 'ALTER TABLE public.training_sessions SET SCHEMA zapp';
    RAISE NOTICE 'MOVED training_sessions to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='training_sessions' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'training_sessions already in zapp';
  ELSE RAISE NOTICE 'training_sessions not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='training_sessions') THEN
    EXECUTE 'ALTER TABLE zapp.training_sessions ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='training_sessions'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.training_sessions', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='training_sessions') THEN
    EXECUTE $p$CREATE POLICY "training_sessions_all_auth" ON zapp.training_sessions
      FOR ALL TO authenticated USING (true) WITH CHECK (true)$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.training_sessions TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.training_sessions TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 41. favorite_contacts  (user-scoped: user_id = auth.uid())
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='favorite_contacts' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='favorite_contacts' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.favorite_contacts';
    EXECUTE 'ALTER TABLE public.favorite_contacts SET SCHEMA zapp';
    RAISE NOTICE 'MOVED favorite_contacts to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='favorite_contacts' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'favorite_contacts already in zapp';
  ELSE RAISE NOTICE 'favorite_contacts not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='favorite_contacts') THEN
    EXECUTE 'ALTER TABLE zapp.favorite_contacts ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='favorite_contacts'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.favorite_contacts', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='favorite_contacts') THEN
    EXECUTE $p$CREATE POLICY "favorite_contacts_own" ON zapp.favorite_contacts
      FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.favorite_contacts TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.favorite_contacts TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 42. passkey_credentials  (user-scoped: user_id = auth.uid())
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='passkey_credentials' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='passkey_credentials' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.passkey_credentials';
    EXECUTE 'ALTER TABLE public.passkey_credentials SET SCHEMA zapp';
    RAISE NOTICE 'MOVED passkey_credentials to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='passkey_credentials' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'passkey_credentials already in zapp';
  ELSE RAISE NOTICE 'passkey_credentials not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='passkey_credentials') THEN
    EXECUTE 'ALTER TABLE zapp.passkey_credentials ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='passkey_credentials'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.passkey_credentials', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='passkey_credentials') THEN
    EXECUTE $p$CREATE POLICY "passkey_credentials_own" ON zapp.passkey_credentials
      FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.passkey_credentials TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.passkey_credentials TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 43. user_devices  (user-scoped: user_id = auth.uid())
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='user_devices' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='user_devices' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.user_devices';
    EXECUTE 'ALTER TABLE public.user_devices SET SCHEMA zapp';
    RAISE NOTICE 'MOVED user_devices to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='user_devices' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'user_devices already in zapp';
  ELSE RAISE NOTICE 'user_devices not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='user_devices') THEN
    EXECUTE 'ALTER TABLE zapp.user_devices ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='user_devices'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.user_devices', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='user_devices') THEN
    EXECUTE $p$CREATE POLICY "user_devices_own" ON zapp.user_devices
      FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.user_devices TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.user_devices TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 44. conversation_snoozes  (user-scoped via profiles join)
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='conversation_snoozes' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='conversation_snoozes' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.conversation_snoozes';
    EXECUTE 'ALTER TABLE public.conversation_snoozes SET SCHEMA zapp';
    RAISE NOTICE 'MOVED conversation_snoozes to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='conversation_snoozes' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'conversation_snoozes already in zapp';
  ELSE RAISE NOTICE 'conversation_snoozes not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='conversation_snoozes') THEN
    EXECUTE 'ALTER TABLE zapp.conversation_snoozes ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='conversation_snoozes'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.conversation_snoozes', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='conversation_snoozes') THEN
    EXECUTE $p$CREATE POLICY "conversation_snoozes_own" ON zapp.conversation_snoozes
      FOR ALL TO authenticated
      USING (snoozed_by IN (SELECT id FROM zapp.profiles WHERE user_id = auth.uid()))
      WITH CHECK (snoozed_by IN (SELECT id FROM zapp.profiles WHERE user_id = auth.uid()))$p$;
    EXECUTE $p$CREATE POLICY "conversation_snoozes_admin" ON zapp.conversation_snoozes
      FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.conversation_snoozes TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.conversation_snoozes TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 45. pinned_conversations  (user-scoped via profiles join)
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='pinned_conversations' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='pinned_conversations' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.pinned_conversations';
    EXECUTE 'ALTER TABLE public.pinned_conversations SET SCHEMA zapp';
    RAISE NOTICE 'MOVED pinned_conversations to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='pinned_conversations' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'pinned_conversations already in zapp';
  ELSE RAISE NOTICE 'pinned_conversations not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='pinned_conversations') THEN
    EXECUTE 'ALTER TABLE zapp.pinned_conversations ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='pinned_conversations'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.pinned_conversations', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='pinned_conversations') THEN
    EXECUTE $p$CREATE POLICY "pinned_conversations_own" ON zapp.pinned_conversations
      FOR ALL TO authenticated
      USING (pinned_by IN (SELECT id FROM zapp.profiles WHERE user_id = auth.uid()))
      WITH CHECK (pinned_by IN (SELECT id FROM zapp.profiles WHERE user_id = auth.uid()))$p$;
    EXECUTE $p$CREATE POLICY "pinned_conversations_admin" ON zapp.pinned_conversations
      FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.pinned_conversations TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.pinned_conversations TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 46. reminders  (user-scoped via profiles join)
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='reminders' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='reminders' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.reminders';
    EXECUTE 'ALTER TABLE public.reminders SET SCHEMA zapp';
    RAISE NOTICE 'MOVED reminders to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='reminders' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'reminders already in zapp';
  ELSE RAISE NOTICE 'reminders not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='reminders') THEN
    EXECUTE 'ALTER TABLE zapp.reminders ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='reminders'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.reminders', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='reminders') THEN
    EXECUTE $p$CREATE POLICY "reminders_own" ON zapp.reminders
      FOR ALL TO authenticated
      USING (profile_id IN (SELECT id FROM zapp.profiles WHERE user_id = auth.uid()))
      WITH CHECK (profile_id IN (SELECT id FROM zapp.profiles WHERE user_id = auth.uid()))$p$;
    EXECUTE $p$CREATE POLICY "reminders_admin" ON zapp.reminders
      FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.reminders TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.reminders TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 47. agent_visibility_grants  (SELECT=own agent_id, ALL=admin)
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='agent_visibility_grants' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='agent_visibility_grants' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.agent_visibility_grants';
    EXECUTE 'ALTER TABLE public.agent_visibility_grants SET SCHEMA zapp';
    RAISE NOTICE 'MOVED agent_visibility_grants to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='agent_visibility_grants' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'agent_visibility_grants already in zapp';
  ELSE RAISE NOTICE 'agent_visibility_grants not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='agent_visibility_grants') THEN
    EXECUTE 'ALTER TABLE zapp.agent_visibility_grants ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='agent_visibility_grants'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.agent_visibility_grants', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='agent_visibility_grants') THEN
    -- Agents can see their own grants; admins can read all and write
    EXECUTE $p$CREATE POLICY "agent_visibility_grants_own_select" ON zapp.agent_visibility_grants
      FOR SELECT TO authenticated
      USING (agent_id IN (SELECT id FROM zapp.profiles WHERE user_id = auth.uid())
             OR zapp.is_admin_or_supervisor())$p$;
    EXECUTE $p$CREATE POLICY "agent_visibility_grants_admin_write" ON zapp.agent_visibility_grants
      FOR ALL TO authenticated
      USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.agent_visibility_grants TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.agent_visibility_grants TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 48. agent_skills  (SELECT=all, ALL=admin)
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='agent_skills' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='agent_skills' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.agent_skills';
    EXECUTE 'ALTER TABLE public.agent_skills SET SCHEMA zapp';
    RAISE NOTICE 'MOVED agent_skills to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='agent_skills' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'agent_skills already in zapp';
  ELSE RAISE NOTICE 'agent_skills not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='agent_skills') THEN
    EXECUTE 'ALTER TABLE zapp.agent_skills ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='agent_skills'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.agent_skills', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='agent_skills') THEN
    EXECUTE $p$CREATE POLICY "agent_skills_select_all" ON zapp.agent_skills
      FOR SELECT TO authenticated USING (true)$p$;
    EXECUTE $p$CREATE POLICY "agent_skills_admin_write" ON zapp.agent_skills
      FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.agent_skills TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.agent_skills TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 49. ai_usage_logs  (complex: admin reads all; users read own)
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='ai_usage_logs' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='ai_usage_logs' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.ai_usage_logs';
    EXECUTE 'ALTER TABLE public.ai_usage_logs SET SCHEMA zapp';
    RAISE NOTICE 'MOVED ai_usage_logs to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='ai_usage_logs' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'ai_usage_logs already in zapp';
  ELSE RAISE NOTICE 'ai_usage_logs not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='ai_usage_logs') THEN
    EXECUTE 'ALTER TABLE zapp.ai_usage_logs ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='ai_usage_logs'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.ai_usage_logs', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='ai_usage_logs') THEN
    -- Two SELECT policies — PostgreSQL OR-combines them automatically
    EXECUTE $p$CREATE POLICY "ai_usage_logs_admin_select" ON zapp.ai_usage_logs
      FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor())$p$;
    EXECUTE $p$CREATE POLICY "ai_usage_logs_own_select" ON zapp.ai_usage_logs
      FOR SELECT TO authenticated USING (user_id = auth.uid())$p$;
    EXECUTE $p$CREATE POLICY "ai_usage_logs_insert_all" ON zapp.ai_usage_logs
      FOR INSERT TO authenticated WITH CHECK (true)$p$;
    EXECUTE $p$CREATE POLICY "ai_usage_logs_delete_admin" ON zapp.ai_usage_logs
      FOR DELETE TO authenticated USING (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.ai_usage_logs TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.ai_usage_logs TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 50. goals_configurations  (own profile_id OR admin)
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='goals_configurations' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='goals_configurations' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.goals_configurations';
    EXECUTE 'ALTER TABLE public.goals_configurations SET SCHEMA zapp';
    RAISE NOTICE 'MOVED goals_configurations to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='goals_configurations' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'goals_configurations already in zapp';
  ELSE RAISE NOTICE 'goals_configurations not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='goals_configurations') THEN
    EXECUTE 'ALTER TABLE zapp.goals_configurations ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='goals_configurations'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.goals_configurations', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='goals_configurations') THEN
    EXECUTE $p$CREATE POLICY "goals_configurations_select" ON zapp.goals_configurations
      FOR SELECT TO authenticated
      USING (profile_id IN (SELECT id FROM zapp.profiles WHERE user_id = auth.uid())
             OR zapp.is_admin_or_supervisor())$p$;
    EXECUTE $p$CREATE POLICY "goals_configurations_write" ON zapp.goals_configurations
      FOR ALL TO authenticated
      USING (profile_id IN (SELECT id FROM zapp.profiles WHERE user_id = auth.uid())
             OR zapp.is_admin_or_supervisor())
      WITH CHECK (profile_id IN (SELECT id FROM zapp.profiles WHERE user_id = auth.uid())
                  OR zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.goals_configurations TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.goals_configurations TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 51. performance_snapshots  (SELECT=admin+own; INSERT=own; DELETE=admin)
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='performance_snapshots' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='performance_snapshots' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.performance_snapshots';
    EXECUTE 'ALTER TABLE public.performance_snapshots SET SCHEMA zapp';
    RAISE NOTICE 'MOVED performance_snapshots to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='performance_snapshots' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'performance_snapshots already in zapp';
  ELSE RAISE NOTICE 'performance_snapshots not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='performance_snapshots') THEN
    EXECUTE 'ALTER TABLE zapp.performance_snapshots ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='performance_snapshots'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.performance_snapshots', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='performance_snapshots') THEN
    EXECUTE $p$CREATE POLICY "performance_snapshots_admin_select" ON zapp.performance_snapshots
      FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor())$p$;
    EXECUTE $p$CREATE POLICY "performance_snapshots_own_select" ON zapp.performance_snapshots
      FOR SELECT TO authenticated
      USING (profile_id IN (SELECT id FROM zapp.profiles WHERE user_id = auth.uid()))$p$;
    EXECUTE $p$CREATE POLICY "performance_snapshots_own_insert" ON zapp.performance_snapshots
      FOR INSERT TO authenticated
      WITH CHECK (profile_id IN (SELECT id FROM zapp.profiles WHERE user_id = auth.uid()))$p$;
    EXECUTE $p$CREATE POLICY "performance_snapshots_admin_delete" ON zapp.performance_snapshots
      FOR DELETE TO authenticated USING (zapp.is_admin_or_supervisor())$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.performance_snapshots TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.performance_snapshots TO service_role';
  END IF;
END; $$;

-- ===========================================================================
-- 52. connection_alert_preferences  (all authenticated)
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='connection_alert_preferences' AND c.relkind IN('r','p'))
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='zapp' AND c.relname='connection_alert_preferences' AND c.relkind IN('r','p'))
  THEN
    EXECUTE 'DROP VIEW IF EXISTS zapp.connection_alert_preferences';
    EXECUTE 'ALTER TABLE public.connection_alert_preferences SET SCHEMA zapp';
    RAISE NOTICE 'MOVED connection_alert_preferences to zapp';
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='zapp' AND c.relname='connection_alert_preferences' AND c.relkind IN('r','p'))
  THEN RAISE NOTICE 'connection_alert_preferences already in zapp';
  ELSE RAISE NOTICE 'connection_alert_preferences not found — nothing to move';
  END IF;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='connection_alert_preferences') THEN
    EXECUTE 'ALTER TABLE zapp.connection_alert_preferences ENABLE ROW LEVEL SECURITY';
  END IF;
END; $$;
DO $$ DECLARE pol TEXT; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='zapp' AND tablename='connection_alert_preferences'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.connection_alert_preferences', pol); END LOOP;
END; $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='zapp' AND tablename='connection_alert_preferences') THEN
    EXECUTE $p$CREATE POLICY "connection_alert_preferences_all_auth" ON zapp.connection_alert_preferences
      FOR ALL TO authenticated USING (true) WITH CHECK (true)$p$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE zapp.connection_alert_preferences TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE zapp.connection_alert_preferences TO service_role';
  END IF;
END; $$;
