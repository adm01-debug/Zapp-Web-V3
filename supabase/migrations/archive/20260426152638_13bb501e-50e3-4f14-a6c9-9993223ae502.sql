CREATE TABLE IF NOT EXISTS public.whatsapp_official_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL UNIQUE REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  phone_number_id text NOT NULL,
  waba_id text,
  business_account_id text,
  access_token text NOT NULL,
  app_secret text NOT NULL,
  verify_token text NOT NULL,
  graph_api_version text NOT NULL DEFAULT 'v21.0',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS idx_woc_phone_number_id ON public.whatsapp_official_credentials(phone_number_id);

ALTER TABLE public.whatsapp_official_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view official credentials"
ON public.whatsapp_official_credentials FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert official credentials"
ON public.whatsapp_official_credentials FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update official credentials"
ON public.whatsapp_official_credentials FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete official credentials"
ON public.whatsapp_official_credentials FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.set_woc_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_woc_updated_at ON public.whatsapp_official_credentials;
CREATE TRIGGER trg_woc_updated_at
BEFORE UPDATE ON public.whatsapp_official_credentials
FOR EACH ROW EXECUTE FUNCTION public.set_woc_updated_at();

-- Lookup function for edge functions (service role bypasses RLS, but secure for any future authenticated calls)
CREATE OR REPLACE FUNCTION public.get_official_credentials_by_phone_id(p_phone_number_id text)
RETURNS TABLE (
  connection_id uuid,
  phone_number_id text,
  access_token text,
  app_secret text,
  verify_token text,
  graph_api_version text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT connection_id, phone_number_id, access_token, app_secret, verify_token, graph_api_version
  FROM public.whatsapp_official_credentials
  WHERE phone_number_id = p_phone_number_id
  LIMIT 1;
$$;