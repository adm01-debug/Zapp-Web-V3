-- 1. ADR-007: Audit & Recovery Model
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sequence_number BIGSERIAL;
CREATE INDEX IF NOT EXISTS idx_messages_sequence ON public.messages(sequence_number);

CREATE TABLE IF NOT EXISTS public.reprocess_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    payload JSONB,
    error_log TEXT,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    status TEXT DEFAULT 'pending',
    next_run_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.evolution_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- 2. Optimistic Locking
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS version BIGINT DEFAULT 1;

-- 3. Feature Flags (Ajustado para 'enabled')
CREATE TABLE IF NOT EXISTS public.feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT false,
    rollout_percentage INTEGER DEFAULT 100,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reprocess_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active flags" ON public.feature_flags FOR SELECT USING (enabled = true);
CREATE POLICY "Admins manage flags" ON public.feature_flags FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage reprocess" ON public.reprocess_jobs FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage outbox" ON public.evolution_outbox FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Triggers
CREATE TRIGGER update_reprocess_jobs_updated_at BEFORE UPDATE ON public.reprocess_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_feature_flags_updated_at BEFORE UPDATE ON public.feature_flags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
