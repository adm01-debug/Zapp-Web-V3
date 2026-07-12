-- Audit table for "Testar HMAC" executions (HmacSelfTestButton).
CREATE TABLE IF NOT EXISTS public.hmac_selftest_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance TEXT,
  ok BOOLEAN NOT NULL,
  duration_ms INTEGER,
  error TEXT,
  message TEXT,
  good_accepted BOOLEAN,
  tampered_rejected BOOLEAN,
  executed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hmac_selftest_audit_created_at
  ON public.hmac_selftest_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hmac_selftest_audit_instance_created
  ON public.hmac_selftest_audit (instance, created_at DESC);

ALTER TABLE public.hmac_selftest_audit ENABLE ROW LEVEL SECURITY;

-- Leitura: apenas admin/supervisor (reutiliza has_role).
CREATE POLICY "hmac_selftest_audit_select_admin_supervisor"
ON public.hmac_selftest_audit
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'supervisor'::app_role)
);

-- Gravação: qualquer usuário autenticado pode inserir SUA própria execução.
CREATE POLICY "hmac_selftest_audit_insert_own"
ON public.hmac_selftest_audit
FOR INSERT
TO authenticated
WITH CHECK (executed_by = auth.uid());