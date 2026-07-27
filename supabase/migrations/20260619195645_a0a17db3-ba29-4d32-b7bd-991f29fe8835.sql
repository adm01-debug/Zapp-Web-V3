-- ============================================================
-- WAVE 2A — Critical RLS hardening (5 findings)  [corrigido p/ schema real]
-- ============================================================

-- 1) whatsapp_official_credentials --------------------------
DROP POLICY IF EXISTS "Admins can manage official credentials" ON public.whatsapp_official_credentials;

DROP POLICY IF EXISTS "Admins can insert official credentials" ON public.whatsapp_official_credentials;
CREATE POLICY "Admins can insert official credentials"
  ON public.whatsapp_official_credentials FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS "Admins can update official credentials" ON public.whatsapp_official_credentials;
CREATE POLICY "Admins can update official credentials"
  ON public.whatsapp_official_credentials FOR UPDATE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete official credentials" ON public.whatsapp_official_credentials;
CREATE POLICY "Admins can delete official credentials"
  ON public.whatsapp_official_credentials FOR DELETE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Admins can read non-secret metadata"
  ON public.whatsapp_official_credentials FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

CREATE OR REPLACE VIEW public.whatsapp_official_credentials_safe
WITH (security_invoker = on) AS
SELECT
  id,
  connection_id,
  phone_number_id,
  waba_id,
  (access_token IS NOT NULL AND length(access_token) > 0) AS has_access_token,
  (app_secret   IS NOT NULL AND length(app_secret)   > 0) AS has_app_secret,
  created_at,
  updated_at
FROM public.whatsapp_official_credentials;

GRANT SELECT ON public.whatsapp_official_credentials_safe TO authenticated;

-- 2) evolution_instance_credentials → apenas service_role ----
DROP POLICY IF EXISTS "Admins can manage evolution credentials" ON public.evolution_instance_credentials;

-- 3) instance_registry → apenas service_role -----------------
DROP POLICY IF EXISTS "Admins and supervisors can view instance registry" ON public.instance_registry;
DROP POLICY IF EXISTS "Enable write for admins only" ON public.instance_registry;

CREATE POLICY "Service role full access on instance_registry"
  ON public.instance_registry FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 4) profiles → bloqueio RESTRICTIVE -------------------------
DROP POLICY IF EXISTS "Block sensitive field changes by non-admins" ON public.profiles;

CREATE POLICY "Block sensitive field changes by non-admins"
  ON public.profiles
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    OR (
      role          IS NOT DISTINCT FROM (SELECT p.role          FROM public.profiles p WHERE p.user_id = auth.uid())
      AND access_level IS NOT DISTINCT FROM (SELECT p.access_level FROM public.profiles p WHERE p.user_id = auth.uid())
      AND permissions  IS NOT DISTINCT FROM (SELECT p.permissions  FROM public.profiles p WHERE p.user_id = auth.uid())
      AND is_active    IS NOT DISTINCT FROM (SELECT p.is_active    FROM public.profiles p WHERE p.user_id = auth.uid())
    )
  );

-- 5) transfer_comments → comparar profile_id correto ---------
DROP POLICY IF EXISTS "Enable insert for transfer participants" ON public.transfer_comments;
DROP POLICY IF EXISTS "Enable read for transfer participants" ON public.transfer_comments;

CREATE POLICY "Enable read for transfer participants"
  ON public.transfer_comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_transfers ct
      WHERE ct.id = transfer_comments.transfer_id
        AND (
          ct.from_agent_id = public.get_profile_id_for_user(auth.uid())
          OR ct.to_agent_id = public.get_profile_id_for_user(auth.uid())
        )
    )
    OR public.is_admin_or_supervisor(auth.uid())
  );

CREATE POLICY "Enable insert for transfer participants"
  ON public.transfer_comments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversation_transfers ct
      WHERE ct.id = transfer_comments.transfer_id
        AND (
          ct.from_agent_id = public.get_profile_id_for_user(auth.uid())
          OR ct.to_agent_id = public.get_profile_id_for_user(auth.uid())
        )
    )
    OR public.is_admin_or_supervisor(auth.uid())
  );