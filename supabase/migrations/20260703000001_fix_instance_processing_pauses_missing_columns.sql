-- Migration: add missing columns to instance_processing_pauses
--            + fix auto_pause_instance_on_auth_spike entity_id type mismatch
--
-- Bug 1: auto_pause_instance_on_auth_spike() references trigger_count,
--   auto_paused and updated_at but the table was created without them:
--   [Warning] [auto-pause] rpc failed: column "trigger_count" does not exist
--
-- Bug 2: The function inserted v_id::text into audit_logs.entity_id (uuid),
--   causing: column "entity_id" is of type uuid but expression is of type text
--
-- Both idempotent (IF NOT EXISTS + CREATE OR REPLACE).

-- ============================================================
-- 1. Base table: add three missing columns
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp'
      AND table_name   = 'instance_processing_pauses'
      AND column_name  = 'trigger_count'
  ) THEN
    ALTER TABLE zapp.instance_processing_pauses
      ADD COLUMN trigger_count integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp'
      AND table_name   = 'instance_processing_pauses'
      AND column_name  = 'auto_paused'
  ) THEN
    ALTER TABLE zapp.instance_processing_pauses
      ADD COLUMN auto_paused boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp'
      AND table_name   = 'instance_processing_pauses'
      AND column_name  = 'updated_at'
  ) THEN
    ALTER TABLE zapp.instance_processing_pauses
      ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END;
$$;

-- ============================================================
-- 2. Repoint view: expose the new columns
-- ============================================================
CREATE OR REPLACE VIEW public.instance_processing_pauses AS
SELECT
  id,
  instance_name,
  paused_by,
  reason,
  paused_at,
  resumed_at,
  paused_until,
  trigger_count,
  auto_paused,
  updated_at
FROM zapp.instance_processing_pauses;

GRANT SELECT, INSERT, UPDATE ON public.instance_processing_pauses TO service_role;
GRANT SELECT ON public.instance_processing_pauses TO anon, authenticated;

-- ============================================================
-- 3. Fix auto_pause_instance_on_auth_spike: v_id::text -> v_id
--    audit_logs.entity_id is uuid; casting to text caused:
--    ERROR: column "entity_id" is of type uuid but expression is of type text
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_pause_instance_on_auth_spike(
  p_instance      text,
  p_reason        text,
  p_trigger_count integer,
  p_minutes       integer DEFAULT 15
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, zapp
AS $$
DECLARE
  v_id       uuid;
  v_existing uuid;
BEGIN
  IF p_minutes <= 0 OR p_minutes > 1440 THEN
    p_minutes := 15;
  END IF;

  -- Se ja ha pausa ativa, estende-a (nao cria duplicata)
  SELECT id INTO v_existing
    FROM public.instance_processing_pauses
   WHERE instance_name = p_instance
     AND paused_until > now()
   ORDER BY paused_until DESC
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.instance_processing_pauses
       SET paused_until  = GREATEST(paused_until, now() + (p_minutes || ' minutes')::interval),
           trigger_count = trigger_count + GREATEST(0, COALESCE(p_trigger_count, 0)),
           reason        = p_reason,
           updated_at    = now()
     WHERE id = v_existing;
    RETURN v_existing;
  END IF;

  INSERT INTO public.instance_processing_pauses (
    instance_name, paused_until, reason, trigger_count, auto_paused
  )
  VALUES (
    p_instance,
    now() + (p_minutes || ' minutes')::interval,
    p_reason,
    GREATEST(0, COALESCE(p_trigger_count, 0)),
    true
  )
  RETURNING id INTO v_id;

  -- Audit log: entity_id e uuid, usar v_id direto (fix: era v_id::text)
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    NULL,
    'instance_auto_paused',
    'instance_processing_pauses',
    v_id,
    jsonb_build_object(
      'instance',      p_instance,
      'minutes',       p_minutes,
      'reason',        p_reason,
      'trigger_count', p_trigger_count
    )
  );

  RETURN v_id;
END;
$$;
