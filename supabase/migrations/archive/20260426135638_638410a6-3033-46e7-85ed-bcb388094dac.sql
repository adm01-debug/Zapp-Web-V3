-- Stress test runs — auditoria de testes de carga multimídia
CREATE TABLE public.stress_test_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  target_phone TEXT NOT NULL,
  instance_name TEXT NOT NULL DEFAULT 'wpp2',
  total_planned INT NOT NULL,
  total_sent INT NOT NULL DEFAULT 0,
  total_failed INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','aborted','failed')),
  abort_reason TEXT,
  results JSONB NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.stress_test_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view stress test runs"
  ON public.stress_test_runs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert stress test runs"
  ON public.stress_test_runs FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND started_by = auth.uid());

CREATE POLICY "Admins update stress test runs"
  ON public.stress_test_runs FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_stress_test_runs_started_by ON public.stress_test_runs(started_by, started_at DESC);
CREATE INDEX idx_stress_test_runs_status ON public.stress_test_runs(status) WHERE status = 'running';