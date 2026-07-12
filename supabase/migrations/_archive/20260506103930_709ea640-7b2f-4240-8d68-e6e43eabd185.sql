CREATE OR REPLACE FUNCTION public.increment_voice_task_attempt(task_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.voice_conversion_queue
    SET attempts = attempts + 1,
        last_attempt_at = now()
    WHERE id = task_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.increment_voice_task_attempt(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_voice_task_attempt(UUID) TO authenticated;