-- Add investigation tracking to instance_processing_pauses
ALTER TABLE public.instance_processing_pauses
  ADD COLUMN IF NOT EXISTS investigated_at timestamptz,
  ADD COLUMN IF NOT EXISTS investigated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS investigation_notes text;

CREATE INDEX IF NOT EXISTS idx_ipp_investigated_at
  ON public.instance_processing_pauses (investigated_at DESC NULLS LAST);

-- RPC: marca pausa como investigada (admin/supervisor)
CREATE OR REPLACE FUNCTION public.mark_pause_investigated(
  p_pause_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS public.instance_processing_pauses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.instance_processing_pauses;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.instance_processing_pauses
     SET investigated_at = now(),
         investigated_by = auth.uid(),
         investigation_notes = COALESCE(NULLIF(trim(p_notes), ''), investigation_notes)
   WHERE id = p_pause_id
   RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'pause_not_found';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_pause_investigated(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_pause_investigated(uuid, text) TO authenticated;