-- Close cross-tenant exposure on legacy public.whatsapp_connections.
-- Orphan copy from Lovable to self-hosted migration: 0 FKs, 0 views, no app code references it
-- (app uses zapp.whatsapp_connections). service_role and postgres keep access; fully reversible.
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_connections FROM anon;
REVOKE ALL ON public.whatsapp_connections FROM authenticated;
