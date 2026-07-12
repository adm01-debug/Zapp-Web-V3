-- Add api_type to whatsapp_connections to distinguish Official Cloud API vs Evolution (non-official)
ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS api_type text NOT NULL DEFAULT 'evolution';

ALTER TABLE public.whatsapp_connections
  DROP CONSTRAINT IF EXISTS whatsapp_connections_api_type_check;

ALTER TABLE public.whatsapp_connections
  ADD CONSTRAINT whatsapp_connections_api_type_check
  CHECK (api_type IN ('evolution', 'official'));

COMMENT ON COLUMN public.whatsapp_connections.api_type IS
  'evolution = não-oficial (Evolution/Baileys, requer QR Code). official = WhatsApp Cloud API (Meta, sem QR).';