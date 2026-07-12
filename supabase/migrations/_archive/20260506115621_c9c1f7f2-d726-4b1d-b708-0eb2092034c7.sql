-- Hardening the claim function
CREATE OR REPLACE FUNCTION public.claim_next_voice_task(p_worker_id TEXT)
RETURNS SETOF public.voice_conversion_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    UPDATE public.voice_conversion_queue
    SET 
        status = 'processing',
        updated_at = now(),
        attempts = attempts + 1,
        payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object('worker_id', p_worker_id)
    WHERE id = (
        SELECT id 
        FROM public.voice_conversion_queue 
        WHERE status = 'pending' 
        AND attempts < max_attempts
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    RETURNING *;
END;
$$;

-- Function to record telemetry with duration calculation
CREATE OR REPLACE FUNCTION public.record_voice_telemetry(
    p_queue_id UUID,
    p_duration_ms INTEGER,
    p_status public.voice_conversion_status,
    p_error_type TEXT DEFAULT NULL,
    p_error_detail TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_preset_id TEXT;
    v_agent_id UUID;
BEGIN
    SELECT preset_id, user_id INTO v_preset_id, v_agent_id
    FROM public.voice_conversion_queue
    WHERE id = p_queue_id;

    INSERT INTO public.voice_conversion_telemetry (
        queue_id,
        preset_id,
        duration_ms,
        status,
        error_type,
        error_detail,
        agent_id
    ) VALUES (
        p_queue_id,
        v_preset_id,
        p_duration_ms,
        p_status,
        p_error_type,
        p_error_detail,
        v_agent_id
    );

    -- Update queue with processed_at if success
    IF p_status = 'completed' THEN
        UPDATE public.voice_conversion_queue
        SET processed_at = now(), status = 'completed'
        WHERE id = p_queue_id;
    ELSIF p_status = 'failed' THEN
        UPDATE public.voice_conversion_queue
        SET status = 'failed', error_message = p_error_type
        WHERE id = p_queue_id;
    END IF;
END;
$$;
