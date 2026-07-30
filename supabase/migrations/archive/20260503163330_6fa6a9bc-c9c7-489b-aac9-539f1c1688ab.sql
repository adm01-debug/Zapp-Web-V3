-- Add thread support to whisper_messages
ALTER TABLE public.whisper_messages 
ADD COLUMN IF NOT EXISTS whisper_thread_id UUID REFERENCES public.whisper_messages(id) ON DELETE CASCADE;

-- Create index for faster thread retrieval
CREATE INDEX IF NOT EXISTS idx_whisper_messages_thread_id ON public.whisper_messages(whisper_thread_id);

-- Add whisper support to message_reactions (reusing the table but adding a field for internal notes)
ALTER TABLE public.message_reactions 
ADD COLUMN IF NOT EXISTS whisper_message_id UUID REFERENCES public.whisper_messages(id) ON DELETE CASCADE;

-- Ensure constraints (reaction must be for either a message or a whisper, not both/none)
ALTER TABLE public.message_reactions 
DROP CONSTRAINT IF EXISTS reaction_target_check;

ALTER TABLE public.message_reactions 
ADD CONSTRAINT reaction_target_check 
CHECK (
  (message_id IS NOT NULL AND whisper_message_id IS NULL) OR 
  (message_id IS NULL AND whisper_message_id IS NOT NULL)
);

-- Create whisper_files table
CREATE TABLE IF NOT EXISTS public.whisper_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id TEXT NOT NULL,
  sender_id UUID NOT NULL REFERENCES auth.users(id),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  file_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whisper_files ENABLE ROW LEVEL SECURITY;

-- Policies for whisper_files
CREATE POLICY "Agents and admins can view team files" 
ON public.whisper_files 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('agent', 'supervisor', 'admin')
  )
);

CREATE POLICY "Agents and admins can upload team files" 
ON public.whisper_files 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('agent', 'supervisor', 'admin')
  )
);

-- Trigger for updated_at on whisper_files
CREATE TRIGGER update_whisper_files_updated_at
BEFORE UPDATE ON public.whisper_files
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
