-- Create delivery SLA rules table
CREATE TABLE public.sla_delivery_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    warning_threshold_minutes INTEGER NOT NULL DEFAULT 30,
    breach_threshold_minutes INTEGER NOT NULL DEFAULT 60,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sla_delivery_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can view active SLA rules" ON public.sla_delivery_rules FOR SELECT TO authenticated USING (is_active = true);

-- Create violations table
CREATE TABLE public.sla_delivery_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    rule_id UUID REFERENCES public.sla_delivery_rules(id),
    severity TEXT CHECK (severity IN ('warning', 'breached')),
    delivered_at TIMESTAMP WITH TIME ZONE NOT NULL,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    is_resolved BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.sla_delivery_violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view all violations" ON public.sla_delivery_violations FOR SELECT TO authenticated USING (true);

-- Insert default rule
INSERT INTO public.sla_delivery_rules (name, warning_threshold_minutes, breach_threshold_minutes)
VALUES ('Padrão Entrega', 30, 60);
