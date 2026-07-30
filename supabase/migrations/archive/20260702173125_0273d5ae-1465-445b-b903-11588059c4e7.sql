-- Fix crítico: log_security_event e log_audit_event(5-arg com event_type)
-- inseriam em colunas inexistentes (event_type/resource/status) da audit_logs.
-- Isso derrubava triggers de user_roles (on_role_change) e qualquer chamada
-- de check_user_permission denied, causando erros 400 no frontend.
--
-- Estratégia: manter a assinatura (evita quebrar callers) e mapear os args
-- para as colunas reais (action, entity_type, details com event_type+status
-- preservados dentro do jsonb para auditoria).

CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type text,
  p_resource   text,
  p_action     text,
  p_status     text,
  p_details    jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, action, entity_type, details)
  VALUES (
    auth.uid(),
    p_action,
    p_resource,
    COALESCE(p_details, '{}'::jsonb)
      || jsonb_build_object('event_type', p_event_type, 'status', p_status)
  );
EXCEPTION WHEN OTHERS THEN
  -- Nunca derrubar operação de negócio por falha de auditoria
  RETURN;
END;
$$;

-- Sobrecarga espelho: 5-arg com event_type primeiro
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_event_type text,
  p_resource   text,
  p_action     text,
  p_status     text,
  p_details    jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, action, entity_type, details)
  VALUES (
    auth.uid(),
    p_action,
    p_resource,
    COALESCE(p_details, '{}'::jsonb)
      || jsonb_build_object('event_type', p_event_type, 'status', p_status)
  );
EXCEPTION WHEN OTHERS THEN
  RETURN;
END;
$$;