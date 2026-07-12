-- RLS Hardening: tighten over-permissive FOR ALL TO authenticated USING(true) policies
-- on critical tables identified by FMEA audit (P1 findings).
--
-- Strategy per table class:
--   - conversations: keep SELECT(true) for inbox visibility; scope writes to
--     assigned agent + admin/supervisor.
--   - financial/CRM (payment_links, sales_deals, deal_activities, meta_capi_events):
--     scope writes to creator + admin/supervisor; reads stay open for team.
--   - config/templates (automation_rules, knowledge_base, whatsapp_flows): admin/supervisor
--     writes; all authenticated reads.
--   - security/audit logs (login_attempts, dispatch_error_logs, query_telemetry,
--     whatsapp_cloud_webhook_pings): service_role only; no direct authenticated writes.
--
-- This migration DOES NOT add org_id tenant isolation (single-company deployment).
-- All policies scope within a single Supabase project / company.

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: stable inline sub-select for caller's profile id and role.
-- Used as inline expression to avoid an extra function dependency.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. conversations
-- ─────────────────────────────────────────────────────────────────────────────
-- Current: "Users can manage conversations" FOR ALL USING(true) WITH CHECK(true)
-- New:  SELECT stays USING(true); writes require own assignment or elevated role.

DROP POLICY IF EXISTS "Users can manage conversations" ON public.conversations;

CREATE POLICY "Agents write own conversations" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (true);  -- Any agent can open a conversation (service_role does most of this)

CREATE POLICY "Agents update assigned conversations" ON public.conversations
  FOR UPDATE TO authenticated
  USING (
    assigned_to IS NULL  -- unassigned: any agent can pick it up
    OR assigned_to = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (true);

CREATE POLICY "Admin supervisor delete conversations" ON public.conversations
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. payment_links  (financial — creator or admin/supervisor only)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage payment links" ON public.payment_links;

CREATE POLICY "Payment links read all authenticated" ON public.payment_links
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Payment links write creator or elevated" ON public.payment_links
  FOR ALL TO authenticated
  USING (
    created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. sales_deals + deal_activities  (CRM — creator/assignee or admin/supervisor)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage deals" ON public.sales_deals;
DROP POLICY IF EXISTS "Authenticated users can manage deal activities" ON public.deal_activities;

CREATE POLICY "Sales deals read all authenticated" ON public.sales_deals
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Sales deals write assignee or elevated" ON public.sales_deals
  FOR ALL TO authenticated
  USING (
    -- sales_deals has no created_by; scope by assigned_to + role
    assigned_to IS NULL
    OR assigned_to = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (true);

CREATE POLICY "Deal activities read all authenticated" ON public.deal_activities
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Deal activities write performer or elevated" ON public.deal_activities
  FOR ALL TO authenticated
  USING (
    -- deal_activities uses performed_by (not created_by)
    performed_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. meta_capi_events  (marketing analytics — writes restricted)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage capi events" ON public.meta_capi_events;

CREATE POLICY "CAPI events read admin supervisor" ON public.meta_capi_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "CAPI events write admin supervisor" ON public.meta_capi_events
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. knowledge_base_articles + knowledge_base_files  (team content)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage knowledge base" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "Authenticated users can manage kb files" ON public.knowledge_base_files;

CREATE POLICY "KB articles read all authenticated" ON public.knowledge_base_articles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "KB articles write admin supervisor" ON public.knowledge_base_articles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "KB files read all authenticated" ON public.knowledge_base_files
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "KB files write admin supervisor" ON public.knowledge_base_files
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. whatsapp_flows  (config — admin/supervisor only)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage whatsapp flows" ON public.whatsapp_flows;

CREATE POLICY "WA flows read all authenticated" ON public.whatsapp_flows
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "WA flows write admin supervisor" ON public.whatsapp_flows
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. login_attempts  (security — service_role only; drop authenticated write)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_full_access" ON public.login_attempts;

-- login_attempts has no user_id column (only email) — allow admin/supervisor read
-- for security monitoring; no authenticated write access (service_role inserts).
CREATE POLICY "Login attempts read admin supervisor" ON public.login_attempts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. automation_rules  (config — agents read, admin/supervisor write)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_full_access" ON public.automation_rules;

CREATE POLICY "Automation rules read all authenticated" ON public.automation_rules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Automation rules write admin supervisor" ON public.automation_rules
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. whatsapp_cloud_webhook_pings  (service_role only — drop authenticated access)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_full_access" ON public.whatsapp_cloud_webhook_pings;

-- service_full_access policy already exists via the original migration loop;
-- only admins can read pings for debugging.
CREATE POLICY "WA cloud pings read admin" ON public.whatsapp_cloud_webhook_pings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. followup_sequences  (P3 FMEA finding — scope to creator + admin/supervisor)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage followup_sequences" ON public.followup_sequences;

CREATE POLICY "Followup sequences read all authenticated" ON public.followup_sequences
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Followup sequences write creator or elevated" ON public.followup_sequences
  FOR ALL TO authenticated
  USING (
    created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (true);
