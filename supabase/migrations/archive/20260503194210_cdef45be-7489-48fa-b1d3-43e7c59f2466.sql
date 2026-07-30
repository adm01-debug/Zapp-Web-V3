ALTER TABLE public.sla_delivery_rules 
ADD COLUMN contact_id TEXT,
ADD COLUMN custom_message TEXT;

ALTER TABLE public.sla_delivery_violations 
ADD COLUMN resolved_by UUID REFERENCES auth.users(id),
ADD COLUMN resolution_notes TEXT;

-- Create an index for faster history lookups
CREATE INDEX idx_sla_delivery_violations_contact_date ON public.sla_delivery_violations(contact_id, detected_at);
