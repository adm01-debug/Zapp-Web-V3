-- Add instance_name to whatsapp_connections
-- Evolution API routes by NAME (not UUID). This column holds the Evolution-side
-- instance identifier so the frontend can call the API correctly without
-- accidentally passing the internal UUID (which causes phantom instance creation).
ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS instance_name TEXT DEFAULT NULL;

COMMENT ON COLUMN public.whatsapp_connections.instance_name IS
  'Evolution API instance name used in API routes. Distinct from display name (name) and internal UUID (instance_id).';
