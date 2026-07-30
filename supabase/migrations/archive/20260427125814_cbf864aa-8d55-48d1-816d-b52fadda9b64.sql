-- Tabela leve para rastrear atividade do webhook oficial WhatsApp Cloud
CREATE TABLE IF NOT EXISTS public.whatsapp_cloud_webhook_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('handshake', 'event', 'invalid_signature', 'invalid_token')),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_cloud_pings_created ON public.whatsapp_cloud_webhook_pings (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_cloud_pings_kind_created ON public.whatsapp_cloud_webhook_pings (kind, created_at DESC);

ALTER TABLE public.whatsapp_cloud_webhook_pings ENABLE ROW LEVEL SECURITY;

-- Apenas admin/supervisor podem ler
CREATE POLICY "wa_cloud_pings_admin_read"
ON public.whatsapp_cloud_webhook_pings FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

-- Inserts apenas via service role (edge function). Sem policy de INSERT para usuários.

-- Limpeza automática: manter só 7 dias
CREATE OR REPLACE FUNCTION public.cleanup_wa_cloud_pings()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.whatsapp_cloud_webhook_pings
  WHERE created_at < now() - interval '7 days';
$$;