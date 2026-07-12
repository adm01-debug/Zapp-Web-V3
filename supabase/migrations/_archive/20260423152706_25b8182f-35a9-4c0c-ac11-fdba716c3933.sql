
CREATE TABLE IF NOT EXISTS public.nps_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded BOOLEAN NOT NULL DEFAULT false,
  response_id UUID REFERENCES public.nps_surveys(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nps_invitations_contact ON public.nps_invitations(contact_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_nps_invitations_responded ON public.nps_invitations(responded, sent_at DESC);

ALTER TABLE public.nps_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view NPS invitations"
  ON public.nps_invitations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert NPS invitations"
  ON public.nps_invitations FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Admins can update NPS invitations"
  ON public.nps_invitations FOR UPDATE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));
