-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: smart_assign_conversation + rpc_upsert_whatsapp_provider
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. whatsapp_provider_settings (singleton settings table) ─────────────────

CREATE TABLE IF NOT EXISTS public.whatsapp_provider_settings (
  id             TEXT PRIMARY KEY DEFAULT 'singleton',
  provider_type  TEXT NOT NULL DEFAULT 'unofficial',
  base_url       TEXT,
  api_key        TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by     UUID REFERENCES auth.users(id)
);

ALTER TABLE public.whatsapp_provider_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage provider settings"
  ON public.whatsapp_provider_settings FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

GRANT SELECT ON public.whatsapp_provider_settings TO authenticated;
GRANT ALL    ON public.whatsapp_provider_settings TO service_role;

-- ── 2. rpc_upsert_whatsapp_provider ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_upsert_whatsapp_provider(
  p_provider_type TEXT,
  p_base_url      TEXT DEFAULT NULL,
  p_api_key       TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO whatsapp_provider_settings (id, provider_type, base_url, api_key, updated_at, updated_by)
  VALUES ('singleton', p_provider_type, p_base_url, p_api_key, now(), auth.uid())
  ON CONFLICT (id) DO UPDATE
    SET provider_type = EXCLUDED.provider_type,
        base_url      = EXCLUDED.base_url,
        -- Preserve existing key when caller passes NULL (no-change intent)
        api_key       = COALESCE(EXCLUDED.api_key, whatsapp_provider_settings.api_key),
        updated_at    = now(),
        updated_by    = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_upsert_whatsapp_provider(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_upsert_whatsapp_provider(TEXT, TEXT, TEXT) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.rpc_upsert_whatsapp_provider(TEXT, TEXT, TEXT) TO service_role;

-- ── 3. smart_assign_conversation ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.smart_assign_conversation(
  p_conversation_id UUID,
  p_workspace_id    UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_contact     contacts%ROWTYPE;
  v_best_agent  UUID;
  v_agent_name  TEXT;
  v_agent_load  BIGINT;
BEGIN
  -- Resolve the contact (conversation)
  SELECT * INTO v_contact FROM contacts WHERE id = p_conversation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'conversation_not_found');
  END IF;

  -- Find active agent with lowest chat load, respecting max_chats.
  -- When the contact has a queue, prefer agents who are queue members.
  SELECT p.id,
         p.name,
         (SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = p.id) AS load
  INTO   v_best_agent, v_agent_name, v_agent_load
  FROM   profiles p
  WHERE  p.is_active = true
    AND  (
           p.max_chats IS NULL
           OR (SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = p.id) < p.max_chats
         )
  ORDER BY
    -- Prefer queue members when the contact has a queue assigned
    CASE
      WHEN v_contact.queue_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM queue_members qm
          WHERE qm.profile_id = p.id
            AND qm.queue_id   = v_contact.queue_id
            AND qm.is_active  = true
        )
      THEN 0 ELSE 1
    END,
    (SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = p.id) ASC
  LIMIT 1;

  IF v_best_agent IS NULL THEN
    RETURN jsonb_build_object('error', 'no_available_agent');
  END IF;

  -- Assign the conversation
  UPDATE contacts
  SET    assigned_to = v_best_agent,
         updated_at  = now()
  WHERE  id = p_conversation_id;

  -- Audit trail
  INSERT INTO conversation_events (contact_id, event_type, to_agent_id, performed_by, metadata)
  VALUES (
    p_conversation_id,
    'smart_assign',
    v_best_agent,
    auth.uid(),
    jsonb_build_object(
      'load',         v_agent_load,
      'workspace_id', p_workspace_id
    )
  );

  RETURN jsonb_build_object(
    'agent_id',   v_best_agent,
    'agent_name', v_agent_name,
    'load',       v_agent_load
  );
END;
$$;

REVOKE ALL ON FUNCTION public.smart_assign_conversation(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.smart_assign_conversation(UUID, UUID) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.smart_assign_conversation(UUID, UUID) TO service_role;
