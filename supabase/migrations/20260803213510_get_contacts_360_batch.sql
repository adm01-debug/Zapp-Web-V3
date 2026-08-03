-- Migration: get_contacts_360_batch — batch RPC for contact 360 lookups
-- Reduces N individual RPC calls to 1 batch call for inbox load
-- Created: 2026-08-03

CREATE OR REPLACE FUNCTION zapp.get_contacts_360_batch(p_phones text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp', 'auth', 'extensions'
AS $$
DECLARE
  v_result          jsonb;
  v_phone           text;
  v_contact_record  jsonb;
  v_workspace_id    uuid;
  v_phone_results   jsonb[] := ARRAY[]::jsonb[];
BEGIN
  -- Workspace isolation guard
  IF auth.uid() IS NOT NULL THEN
    SELECT workspace_id INTO v_workspace_id
    FROM zapp.workspace_members
    WHERE user_id = auth.uid()
    LIMIT 1;

    IF v_workspace_id IS NULL THEN
      RAISE EXCEPTION 'unauthorized: user has no workspace membership'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Process each phone
  FOREACH v_phone IN ARRAY p_phones
  LOOP
    SELECT jsonb_build_object(
      'contact',         CASE WHEN c.id IS NOT NULL THEN row_to_json(c) ELSE NULL END,
      'conversation_id', (
        SELECT ec.id
        FROM evo.evolution_conversations ec
        WHERE (
          ec.remote_jid = v_phone
          OR ec.remote_jid = (replace(v_phone, '@s.whatsapp.net', '') || '@s.whatsapp.net')
        )
        ORDER BY ec.created_at DESC
        LIMIT 1
      ),
      'phone',           v_phone,
      'found',           c.id IS NOT NULL
    ) INTO v_contact_record
    FROM zapp.contacts c
    WHERE (
      c.phone = v_phone
      OR c.phone = replace(v_phone, '@s.whatsapp.net', '')
      OR (v_phone || '@s.whatsapp.net') = c.phone
    )
    AND (v_workspace_id IS NULL OR c.workspace_id = v_workspace_id)
    LIMIT 1;

    -- Fallback: phone not found
    IF v_contact_record IS NULL THEN
      v_contact_record := jsonb_build_object(
        'contact',         NULL,
        'conversation_id', NULL,
        'phone',           v_phone,
        'found',           false
      );
    END IF;

    v_phone_results := array_append(v_phone_results, v_contact_record);
  END LOOP;

  RETURN jsonb_build_object(
    'results', array_to_json(v_phone_results),
    'count',   array_length(v_phone_results, 1)
  );
END;
$$;
