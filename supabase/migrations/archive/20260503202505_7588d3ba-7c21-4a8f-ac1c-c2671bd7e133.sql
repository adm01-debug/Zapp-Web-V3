-- Add SLA fields to conversation_threads
ALTER TABLE public.conversation_threads 
ADD COLUMN IF NOT EXISTS sla_warning_threshold_minutes INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS sla_critical_threshold_minutes INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS sla_notification_message TEXT DEFAULT 'Atenção: Esta conversa requer uma resposta imediata.',
ADD COLUMN IF NOT EXISTS sla_enabled BOOLEAN DEFAULT TRUE;

-- Add global SLA settings to user_settings
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS global_sla_warning_minutes INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS global_sla_critical_minutes INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS global_sla_notification_message TEXT DEFAULT 'Alerta SLA: Tempo limite excedido para resposta.';

-- Create SLA history table
CREATE TABLE IF NOT EXISTS public.sla_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID REFERENCES public.conversation_threads(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('risk', 'violated')),
    alert_time TIMESTAMP WITH TIME ZONE DEFAULT now(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    is_resolved BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sla_history ENABLE ROW LEVEL SECURITY;

-- Policies for sla_history
CREATE POLICY "Users can view SLA history" 
ON public.sla_history FOR SELECT 
USING (true);

CREATE POLICY "Users can update SLA history" 
ON public.sla_history FOR UPDATE 
USING (true);

CREATE POLICY "Users can insert SLA history" 
ON public.sla_history FOR INSERT 
WITH CHECK (true);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_sla_history_thread_id ON public.sla_history(thread_id);
CREATE INDEX IF NOT EXISTS idx_sla_history_status ON public.sla_history(status);
CREATE INDEX IF NOT EXISTS idx_sla_history_is_resolved ON public.sla_history(is_resolved);
