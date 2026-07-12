
-- ============================================================
-- Sprint 2 · MED-4 · Índice composto para abertura de chat
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_messages_contact_created_desc
  ON public.messages (contact_id, created_at DESC);

-- ============================================================
-- Sprint 2 · MED-3 · Reescrita de reassign_absent_agents (sem N+1)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reassign_absent_agents(inactive_minutes integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reassigned INTEGER := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor')) THEN
    PERFORM public.log_rls_denied('reassign_absent_agents','admin|supervisor',
      jsonb_build_object('inactive_minutes', inactive_minutes));
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  WITH absent AS (
    SELECT p.id AS agent_id
    FROM public.profiles p
    WHERE p.is_active = true
      AND p.last_seen_at IS NOT NULL
      AND p.last_seen_at < now() - (inactive_minutes || ' minutes')::interval
  ),
  orphaned AS (
    SELECT c.id AS contact_id, c.queue_id, c.assigned_to AS old_agent
    FROM public.contacts c
    JOIN absent a ON a.agent_id = c.assigned_to
  ),
  candidates AS (
    SELECT qm.queue_id, qm.profile_id,
           COUNT(cc.id) AS load
    FROM public.queue_members qm
    JOIN public.profiles p ON p.id = qm.profile_id
    LEFT JOIN public.contacts cc ON cc.assigned_to = qm.profile_id
    WHERE qm.is_active = true
      AND p.is_active = true
      AND (p.last_seen_at IS NULL OR p.last_seen_at > now() - (inactive_minutes || ' minutes')::interval)
    GROUP BY qm.queue_id, qm.profile_id
  ),
  picks AS (
    SELECT o.contact_id, o.old_agent,
           (SELECT c.profile_id
              FROM candidates c
             WHERE (o.queue_id IS NULL OR c.queue_id = o.queue_id)
               AND c.profile_id <> o.old_agent
             ORDER BY c.load ASC
             LIMIT 1) AS new_agent
    FROM orphaned o
  ),
  applied AS (
    UPDATE public.contacts c
       SET assigned_to = p.new_agent
      FROM picks p
     WHERE c.id = p.contact_id
       AND p.new_agent IS NOT NULL
    RETURNING c.id, p.old_agent, p.new_agent
  ),
  logged AS (
    INSERT INTO public.conversation_events (contact_id, event_type, from_agent_id, to_agent_id, metadata)
    SELECT id, 'absence_reassign', old_agent, new_agent,
           jsonb_build_object('reason','agent_inactive','inactive_minutes',inactive_minutes)
    FROM applied
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_reassigned FROM logged;

  RETURN COALESCE(v_reassigned, 0);
END;
$function$;

-- ============================================================
-- Sprint 2 · LOW-3 · Drop stub inseguro
-- ============================================================
DROP FUNCTION IF EXISTS public.rpc_migrate_whatsapp_integration();

-- ============================================================
-- Sprint 2 · LOW-8 · Consolidar sobrecargas duplicadas
--   * fn_accept_transfer(uuid, text)   -> deprecar (mantém uuid,uuid)
--   * fn_complete_transfer(uuid,text,text) -> mantida como oficial
--   * fn_complete_transfer(uuid)       -> deprecar
--   * fn_transfer_comment(uuid,text,text,text) -> deprecar (mantém uuid,uuid,text)
--   * rpc_dlq_abandon(uuid)            -> deprecar (mantém p_item_id/p_id)
--   * rpc_dlq_retry_now(uuid)          -> deprecar
--   * manage_department_member(uuid,uuid,text) -> deprecar
-- ============================================================
DROP FUNCTION IF EXISTS public.fn_accept_transfer(uuid, text);
DROP FUNCTION IF EXISTS public.fn_complete_transfer(uuid);
DROP FUNCTION IF EXISTS public.fn_transfer_comment(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.rpc_dlq_abandon(uuid);
DROP FUNCTION IF EXISTS public.rpc_dlq_retry_now(uuid);
DROP FUNCTION IF EXISTS public.manage_department_member(uuid, uuid, text);

-- ============================================================
-- Sprint 2 · MED-2 · Blindar decrypt_gmail_token contra chamada direta
-- ============================================================
REVOKE ALL ON FUNCTION public.decrypt_gmail_token(bytea) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_gmail_token(bytea) TO service_role;

-- ============================================================
-- Sprint 2 · LOW-1 · Novos usuários entram como 'pending' (opt-in)
--   Adiciona coluna status idempotente; não altera fluxo até UI adotar
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='onboarding_status'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN onboarding_status text NOT NULL DEFAULT 'active'
      CHECK (onboarding_status IN ('pending','active','suspended'));
  END IF;
END $$;
