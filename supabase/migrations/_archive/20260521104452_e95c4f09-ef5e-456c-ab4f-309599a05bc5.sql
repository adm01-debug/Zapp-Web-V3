-- 1. Colunas ausentes
ALTER TABLE public.qr_attempts ADD COLUMN IF NOT EXISTS instance_id TEXT;
ALTER TABLE public.department_invitations ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- 2. Tabelas de Auditoria e DLQ
CREATE TABLE IF NOT EXISTS public.failed_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_name TEXT,
    message_id TEXT,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispatch_error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_name TEXT,
    error_type TEXT,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dlq_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT,
    item_id UUID,
    performed_by UUID REFERENCES auth.users(id),
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. RPCs de Monitoramento de Autenticação
CREATE OR REPLACE FUNCTION public.rpc_instance_auth_event_trend(p_instance TEXT, p_hours INTEGER DEFAULT 24)
RETURNS TABLE (bucket TIMESTAMPTZ, success_count BIGINT, failure_count BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        date_trunc('hour', created_at) as bucket,
        count(*) FILTER (WHERE event_type = 'auth.success') as success_count,
        count(*) FILTER (WHERE event_type = 'auth.failure') as failure_count
    FROM public.instance_auth_events
    WHERE (p_instance IS NULL OR instance_name = p_instance)
      AND created_at > now() - (p_hours || ' hours')::interval
    GROUP BY 1 ORDER BY 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.rpc_instance_auth_event_summary(p_instance TEXT)
RETURNS TABLE (event_type TEXT, total BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT instance_auth_events.event_type, count(*) as total
    FROM public.instance_auth_events
    WHERE (p_instance IS NULL OR instance_name = p_instance)
    GROUP BY 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPCs de Auditoria de DLQ e Logs de Erro
CREATE OR REPLACE FUNCTION public.rpc_list_dispatch_error_logs(p_limit INTEGER DEFAULT 100)
RETURNS SETOF public.dispatch_error_logs AS $$
BEGIN
    RETURN QUERY SELECT * FROM public.dispatch_error_logs ORDER BY created_at DESC LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.rpc_dlq_list_audit(p_limit INTEGER DEFAULT 100)
RETURNS SETOF public.dlq_audit_log AS $$
BEGIN
    RETURN QUERY SELECT * FROM public.dlq_audit_log ORDER BY created_at DESC LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.rpc_list_failed_messages(p_limit INTEGER DEFAULT 100)
RETURNS SETOF public.failed_messages AS $$
BEGIN
    RETURN QUERY SELECT * FROM public.failed_messages ORDER BY created_at DESC LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RLS e Políticas
ALTER TABLE public.failed_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dlq_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view audit" ON public.failed_messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor'))
);
CREATE POLICY "Admins view logs" ON public.dispatch_error_logs FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor'))
);
CREATE POLICY "Admins view dlq" ON public.dlq_audit_log FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor'))
);
