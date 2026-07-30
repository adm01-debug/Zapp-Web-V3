
-- ============================================================
-- PHASE 1: Critical RLS fixes (2 ERRORS + 1 audit forgery WARN)
-- ============================================================

-- Helper: check if current user is an active member of the contact's queue
CREATE OR REPLACE FUNCTION public.is_queue_member_of_contact(_contact_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contacts c
    JOIN public.queue_members qm ON qm.queue_id = c.queue_id
    WHERE c.id = _contact_id
      AND qm.is_active = true
      AND qm.profile_id = public.get_profile_id_for_user(_user_id)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_queue_member_of_contact(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_queue_member_of_contact(uuid, uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- messages: replace permissive policy
-- ------------------------------------------------------------
DROP POLICY IF EXISTS messages_select_policy ON public.messages;

CREATE POLICY messages_select_policy ON public.messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = messages.contact_id
      AND (
        public.is_admin_or_supervisor(auth.uid())
        OR c.assigned_to = public.get_profile_id_for_user(auth.uid())
        OR (
          c.assigned_to IS NULL
          AND public.is_queue_member_of_contact(c.id, auth.uid())
        )
      )
  )
);

-- ------------------------------------------------------------
-- message_reactions: tighten all four policies
-- ------------------------------------------------------------
DROP POLICY IF EXISTS message_reactions_select_policy ON public.message_reactions;
DROP POLICY IF EXISTS message_reactions_insert_policy ON public.message_reactions;
DROP POLICY IF EXISTS message_reactions_update_policy ON public.message_reactions;
DROP POLICY IF EXISTS message_reactions_delete_policy ON public.message_reactions;

CREATE POLICY message_reactions_select_policy ON public.message_reactions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.contacts c ON c.id = m.contact_id
    WHERE m.id = message_reactions.message_id
      AND (
        public.is_admin_or_supervisor(auth.uid())
        OR c.assigned_to = public.get_profile_id_for_user(auth.uid())
        OR (c.assigned_to IS NULL AND public.is_queue_member_of_contact(c.id, auth.uid()))
      )
  )
);

CREATE POLICY message_reactions_insert_policy ON public.message_reactions
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.contacts c ON c.id = m.contact_id
    WHERE m.id = message_reactions.message_id
      AND (
        public.is_admin_or_supervisor(auth.uid())
        OR c.assigned_to = public.get_profile_id_for_user(auth.uid())
        OR (c.assigned_to IS NULL AND public.is_queue_member_of_contact(c.id, auth.uid()))
      )
  )
);

CREATE POLICY message_reactions_update_policy ON public.message_reactions
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.contacts c ON c.id = m.contact_id
    WHERE m.id = message_reactions.message_id
      AND (
        public.is_admin_or_supervisor(auth.uid())
        OR c.assigned_to = public.get_profile_id_for_user(auth.uid())
      )
  )
);

CREATE POLICY message_reactions_delete_policy ON public.message_reactions
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.contacts c ON c.id = m.contact_id
    WHERE m.id = message_reactions.message_id
      AND (
        public.is_admin_or_supervisor(auth.uid())
        OR c.assigned_to = public.get_profile_id_for_user(auth.uid())
      )
  )
);

-- ------------------------------------------------------------
-- audit_logs: remove forgery vector
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert their own audit logs" ON public.audit_logs;
-- Service role + SECURITY DEFINER functions (log_audit_event) continue to write.
