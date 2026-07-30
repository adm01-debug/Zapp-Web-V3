-- Function to mark a conversation as read for an operator
CREATE OR REPLACE FUNCTION public.fn_mark_conversation_as_read(
    p_conversation_id UUID, 
    p_last_message_id TEXT
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.conversation_reads (user_id, conversation_id, last_read_message_id, read_at)
    VALUES (auth.uid(), p_conversation_id, p_last_message_id, now())
    ON CONFLICT (user_id, conversation_id) 
    DO UPDATE SET 
        last_read_message_id = EXCLUDED.last_read_message_id,
        read_at = EXCLUDED.read_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure unique constraint for the upsert
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversation_reads_user_id_conversation_id_key') THEN
        ALTER TABLE public.conversation_reads ADD CONSTRAINT conversation_reads_user_id_conversation_id_key UNIQUE (user_id, conversation_id);
    END IF;
END $$;
