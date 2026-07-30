-- Add whatsapp integration configuration to team_conversations (or departments if applicable)
-- Since the requirement mentions "troca configurável por equipe", and teams are departments:

ALTER TABLE public.team_conversations 
ADD COLUMN IF NOT EXISTS whatsapp_mode TEXT CHECK (whatsapp_mode IN ('official', 'unofficial')) DEFAULT 'unofficial',
ADD COLUMN IF NOT EXISTS whatsapp_api_key TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_instance_id TEXT;

COMMENT ON COLUMN public.team_conversations.whatsapp_mode IS 'Define se a conversa usa a API oficial do WhatsApp ou uma conexão não-oficial.';

-- Also add to profiles for user preferences if needed, but the request was "por equipe"
-- Add to departments table as well if it exists and is used for scoping
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'departments') THEN
    ALTER TABLE public.departments 
    ADD COLUMN IF NOT EXISTS whatsapp_mode TEXT CHECK (whatsapp_mode IN ('official', 'unofficial')) DEFAULT 'unofficial',
    ADD COLUMN IF NOT EXISTS whatsapp_api_key TEXT,
    ADD COLUMN IF NOT EXISTS whatsapp_instance_id TEXT;
  END IF;
END $$;
