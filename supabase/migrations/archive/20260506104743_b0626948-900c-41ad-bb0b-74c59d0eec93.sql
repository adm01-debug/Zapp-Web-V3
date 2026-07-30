-- Add message and conversation references to the queue
ALTER TABLE public.voice_conversion_queue 
ADD COLUMN message_id UUID,
ADD COLUMN conversation_id UUID,
ADD COLUMN started_at TIMESTAMP WITH TIME ZONE;

-- Create an index for faster status lookups
CREATE INDEX idx_voice_queue_status_user ON public.voice_conversion_queue(status, user_id);
CREATE INDEX idx_voice_queue_message ON public.voice_conversion_queue(message_id);

-- Function to claim the next pending task for a user, ensuring no other task is 'processing'
CREATE OR REPLACE FUNCTION public.claim_next_voice_task(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    voice_preset TEXT,
    input_audio_url TEXT,
    attempts INTEGER
) AS $$
DECLARE
    v_processing_count INTEGER;
    v_task_id UUID;
BEGIN
    -- Check if there's already a task being processed for this user
    SELECT count(*) INTO v_processing_count 
    FROM public.voice_conversion_queue 
    WHERE user_id = p_user_id AND status = 'processing';

    IF v_processing_count > 0 THEN
        RETURN;
    END IF;

    -- Find the next task (either pending or failed but eligible for retry)
    -- Eligible for retry means: attempts < MAX_ATTEMPTS AND now() > last_attempt_at + backoff
    -- Simplified: pick the oldest pending first
    SELECT q.id INTO v_task_id
    FROM public.voice_conversion_queue q
    WHERE q.user_id = p_user_id 
      AND (
          q.status = 'pending' 
          OR (q.status = 'failed' AND q.attempts < 3 AND (q.last_attempt_at IS NULL OR q.last_attempt_at < now() - interval '1 minute'))
      )
    ORDER BY q.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_task_id IS NOT NULL THEN
        UPDATE public.voice_conversion_queue
        SET status = 'processing',
            started_at = now(),
            last_attempt_at = now(),
            attempts = attempts + 1
        WHERE public.voice_conversion_queue.id = v_task_id
        RETURNING public.voice_conversion_queue.id, public.voice_conversion_queue.voice_preset, public.voice_conversion_queue.input_audio_url, public.voice_conversion_queue.attempts INTO id, voice_preset, input_audio_url, attempts;
        
        RETURN NEXT;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the existing increment function if it exists or create a new one for better retry control
CREATE OR REPLACE FUNCTION public.increment_voice_task_attempt(task_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.voice_conversion_queue
    SET attempts = attempts + 1,
        last_attempt_at = now(),
        status = 'failed' -- Set to failed so the worker can pick it up again if eligible
    WHERE id = task_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
