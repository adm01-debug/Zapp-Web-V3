-- Create a quarantine bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('quarantine', 'quarantine', false)
ON CONFLICT (id) DO NOTHING;

-- Create a log table for virus scans
CREATE TABLE IF NOT EXISTS public.file_scan_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  bucket_id TEXT NOT NULL,
  status TEXT NOT NULL, -- 'clean', 'malicious', 'error'
  provider TEXT NOT NULL,
  provider_response JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on logs
ALTER TABLE public.file_scan_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view logs (can be restricted further if needed)
CREATE POLICY "Users can view scan logs" 
ON public.file_scan_logs 
FOR SELECT 
USING (auth.role() = 'authenticated');

-- Storage policies for quarantine bucket
CREATE POLICY "Internal service access to quarantine" 
ON storage.objects 
FOR ALL 
USING (bucket_id = 'quarantine' AND auth.role() = 'service_role');
