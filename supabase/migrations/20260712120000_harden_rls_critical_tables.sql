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
-- Elevated-role check: all policies use public.is_admin_or_supervisor(auth.uid()) which
-- queries public.user_roles — the authoritative RBAC table.  Inline profiles.role checks
-- are intentionally avoided here to prevent role-split bypasses (profiles.role ≠ user_roles).
--
-- This migration DOES NOT add org_id tenant isolation (single-company deployment).
-- All policies scope within a single Supabase project / company.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. conversations
-- ─────────────────────────────────────────────────────────────────────────────
-- Current: "Users can manage conversations" FOR ALL USING(true) WITH CHECK(true)
-- New:  SELECT stays USING(true); writes require own assignment or elevated role.

DROP POLICY IF EXISTS "Users can manage conversations" ON public.conversations;

-- INSERT: agent can create a conversation only if assigned_to is self, null, or elevated
CREATE POLICY "Agents write own conversations" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    assigned_to IS NULL
    OR assigned_to = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- UPDATE: can mutate rows where currently assigned to self / unassigned / elevated;
--         WITH CHECK ensures the new state also satisfies ownership (no silent reassignment)
CREATE POLICY "Agents update assigned conversations" ON public.conversations
  FOR UPDATE TO authenticated
  USING (
    assigned_to IS NULL
    OR assigned_to = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    OR public.is_admin_or_supervisor(auth.uid())
  )
  WITH CHECK (
    assigned_to IS NULL
    OR assigned_to = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- DELETE: admin/supervisor only
CREATE POLICY "Admin supervisor delete conversations" ON public.conversations
  FOR DELETE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

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
    OR public.is_admin_or_supervisor(auth.uid())
  )
  WITH CHECK (
    created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. sales_deals  (CRM — split per operation; DELETE is admin/supervisor only)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage deals" ON public.sales_deals;

CREATE POLICY "Sales deals read all authenticated" ON public.sales_deals
  FOR SELECT TO authenticated USING (true);

-- INSERT: new row's assigned_to must be self, null, or elevated
CREATE POLICY "Sales deals insert assignee or elevated" ON public.sales_deals
  FOR INSERT TO authenticated
  WITH CHECK (
    assigned_to IS NULL
    OR assigned_to = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- UPDATE: can edit rows assigned to self / unassigned / elevated; WITH CHECK mirrors USING
CREATE POLICY "Sales deals update assignee or elevated" ON public.sales_deals
  FOR UPDATE TO authenticated
  USING (
    assigned_to IS NULL
    OR assigned_to = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    OR public.is_admin_or_supervisor(auth.uid())
  )
  WITH CHECK (
    assigned_to IS NULL
    OR assigned_to = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- DELETE: admin/supervisor only — prevents any agent from deleting unassigned deals
CREATE POLICY "Sales deals delete admin supervisor" ON public.sales_deals
  FOR DELETE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. deal_activities  (CRM activity log — performer or admin/supervisor)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage deal activities" ON public.deal_activities;

CREATE POLICY "Deal activities read all authenticated" ON public.deal_activities
  FOR SELECT TO authenticated USING (true);

-- WITH CHECK enforces that performed_by cannot be forged to another user's id
CREATE POLICY "Deal activities write performer or elevated" ON public.deal_activities
  FOR ALL TO authenticated
  USING (
    performed_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    OR public.is_admin_or_supervisor(auth.uid())
  )
  WITH CHECK (
    performed_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. meta_capi_events  (marketing analytics — writes restricted)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage capi events" ON public.meta_capi_events;

CREATE POLICY "CAPI events read admin supervisor" ON public.meta_capi_events
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "CAPI events write admin supervisor" ON public.meta_capi_events
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. knowledge_base_articles + knowledge_base_files  (team content)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage knowledge base" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "Authenticated users can manage kb files" ON public.knowledge_base_files;

CREATE POLICY "KB articles read all authenticated" ON public.knowledge_base_articles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "KB articles write admin supervisor" ON public.knowledge_base_articles
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "KB files read all authenticated" ON public.knowledge_base_files
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "KB files write admin supervisor" ON public.knowledge_base_files
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. whatsapp_flows  (config — admin/supervisor only)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage whatsapp flows" ON public.whatsapp_flows;

CREATE POLICY "WA flows read all authenticated" ON public.whatsapp_flows
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "WA flows write admin supervisor" ON public.whatsapp_flows
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. login_attempts  (security — service_role only; drop authenticated write)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_full_access" ON public.login_attempts;

-- login_attempts has no user_id column (only email) — allow admin/supervisor read
-- for security monitoring; no authenticated write access (service_role inserts).
CREATE POLICY "Login attempts read admin supervisor" ON public.login_attempts
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. automation_rules  (config — agents read, admin/supervisor write)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_full_access" ON public.automation_rules;

CREATE POLICY "Automation rules read all authenticated" ON public.automation_rules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Automation rules write admin supervisor" ON public.automation_rules
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. whatsapp_cloud_webhook_pings  (service_role only — drop ALL authenticated access)
-- ─────────────────────────────────────────────────────────────────────────────
-- Drop both the generic auth_full_access AND the pre-existing wa_cloud_pings_admin_read
-- (from 20260427125814_cbf864aa...) to ensure no residual permissive path survives.
DROP POLICY IF EXISTS "auth_full_access" ON public.whatsapp_cloud_webhook_pings;
DROP POLICY IF EXISTS "wa_cloud_pings_admin_read" ON public.whatsapp_cloud_webhook_pings;

-- Only admin (not supervisor) can read pings for debugging — no write via authenticated role.
-- Queries user_roles (authoritative RBAC table) — not profiles.role — for consistency.
CREATE POLICY "WA cloud pings read admin" ON public.whatsapp_cloud_webhook_pings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. followup_sequences  (P3 FMEA finding — scope to creator + admin/supervisor)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage followup_sequences" ON public.followup_sequences;

CREATE POLICY "Followup sequences read all authenticated" ON public.followup_sequences
  FOR SELECT TO authenticated USING (true);

-- WITH CHECK enforces created_by cannot be forged to another user's profile id
CREATE POLICY "Followup sequences write creator or elevated" ON public.followup_sequences
  FOR ALL TO authenticated
  USING (
    created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    OR public.is_admin_or_supervisor(auth.uid())
  )
  WITH CHECK (
    created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    OR public.is_admin_or_supervisor(auth.uid())
  );
