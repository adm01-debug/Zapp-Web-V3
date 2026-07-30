-- Expandir stress_test_runs para suportar múltiplas filas
ALTER TABLE public.stress_test_runs 
ADD COLUMN IF NOT EXISTS queue_id UUID,
ADD COLUMN IF NOT EXISTS concurrent_agents INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS metrics_summary JSONB DEFAULT '{}'::jsonb;

-- Tabela de métricas detalhadas de estresse
CREATE TABLE IF NOT EXISTS public.stress_test_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES public.stress_test_runs(id) ON DELETE CASCADE,
    queue_id UUID,
    agent_id UUID,
    task_type TEXT NOT NULL,
    latency_ms INTEGER NOT NULL,
    status TEXT NOT NULL,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.stress_test_metrics ENABLE ROW LEVEL SECURITY;

-- Políticas para admin/supervisor
CREATE POLICY "Admins can view stress metrics" 
ON public.stress_test_metrics FOR SELECT 
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR role = 'supervisor')));

CREATE POLICY "Admins can insert stress metrics" 
ON public.stress_test_metrics FOR INSERT 
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR role = 'supervisor')));

-- Função para expurgo de métricas
CREATE OR REPLACE FUNCTION public.cleanup_old_stress_metrics(days_to_keep INTEGER DEFAULT 7)
RETURNS VOID AS $$
BEGIN
    DELETE FROM public.stress_test_metrics 
    WHERE created_at < (now() - (days_to_keep || ' days')::interval);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
