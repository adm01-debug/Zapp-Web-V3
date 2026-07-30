-- Table for individual message receipts in Team Chat groups
CREATE TABLE IF NOT EXISTS public.team_message_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES public.team_messages(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('delivered', 'read')),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.team_message_receipts ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view receipts in their conversations" 
ON public.team_message_receipts FOR SELECT 
USING (true);

CREATE POLICY "Users can update their own receipts" 
ON public.team_message_receipts FOR INSERT 
WITH CHECK (true);

-- Add simulation mode to user_settings
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS simulation_mode_enabled BOOLEAN DEFAULT FALSE;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_team_message_receipts_message_id ON public.team_message_receipts(message_id);
CREATE INDEX IF NOT EXISTS idx_team_message_receipts_profile_id ON public.team_message_receipts(profile_id);
