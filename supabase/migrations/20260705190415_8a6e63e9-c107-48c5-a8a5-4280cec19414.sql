CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action text,
  p_entity_type text DEFAULT NULL,
  p_entity_id text DEFAULT NULL,
  p_details jsonb DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_entity_uuid uuid;
  v_details jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  v_details := COALESCE(p_details, '{}'::jsonb);

  -- Try to coerce entity_id to UUID; if it fails, keep NULL and preserve raw text in details.
  IF p_entity_id IS NOT NULL AND length(trim(p_entity_id)) > 0 THEN
    BEGIN
      v_entity_uuid := p_entity_id::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_entity_uuid := NULL;
      v_details := v_details || jsonb_build_object('entity_id_text', p_entity_id);
    END;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details, user_agent)
  VALUES (v_user_id, p_action, p_entity_type, v_entity_uuid, v_details, p_user_agent);
EXCEPTION WHEN OTHERS THEN
  -- Never break business flows because of audit logging.
  RETURN;
END;
$function$;