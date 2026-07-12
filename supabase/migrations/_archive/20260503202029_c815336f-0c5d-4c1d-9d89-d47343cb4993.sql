-- Add status column to team_messages
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_messages' AND column_name = 'status') THEN
        ALTER TABLE public.team_messages ADD COLUMN status TEXT DEFAULT 'sent';
    END IF;
END $$;

-- Update existing messages to 'sent'
UPDATE public.team_messages SET status = 'sent' WHERE status IS NULL;

-- Create an index for performance
CREATE INDEX IF NOT EXISTS idx_team_messages_status ON public.team_messages(status);
