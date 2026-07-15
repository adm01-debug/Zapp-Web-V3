-- ============================================================
-- ZAPP schema bridges — APLICAR NA VPS supabase.atomicabr.com.br
-- ------------------------------------------------------------
-- Contexto: o cliente Supabase do frontend está fixado em
--   db: { schema: 'zapp' }
-- mas as tabelas/funções abaixo vivem em `public` (e uma em `evo`),
-- fazendo o PostgREST responder 401/permission_denied.
--
-- Esta migração cria pontes em `zapp` (views + wrappers de RPC)
-- e concede GRANTs adequados para o role `authenticated`.
--
-- Aplicar via: Painel Supabase self-hosted → SQL Editor
-- ============================================================

BEGIN;

-- 1) evo.evolution_contacts — permitir SELECT ao authenticated
GRANT USAGE  ON SCHEMA evo TO authenticated;
GRANT SELECT ON evo.evolution_contacts TO authenticated;

-- 2) Views em zapp espelhando as tabelas de `public`
CREATE OR REPLACE VIEW zapp.audit_logs
  WITH (security_invoker = on)
  AS SELECT * FROM public.audit_logs;

CREATE OR REPLACE VIEW zapp.email_accounts
  WITH (security_invoker = on)
  AS SELECT * FROM public.email_accounts;

CREATE OR REPLACE VIEW zapp.evolution_health_logs
  WITH (security_invoker = on)
  AS SELECT * FROM public.evolution_health_logs;

-- Ponte read-only para evo.evolution_contacts
CREATE OR REPLACE VIEW zapp.evolution_contacts
  WITH (security_invoker = on)
  AS SELECT * FROM evo.evolution_contacts;

GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.audit_logs             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.email_accounts         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.evolution_health_logs  TO authenticated;
GRANT SELECT                           ON zapp.evolution_contacts   TO authenticated;

GRANT ALL ON zapp.audit_logs, zapp.email_accounts,
             zapp.evolution_health_logs, zapp.evolution_contacts
   TO service_role;

-- 3) Wrappers de RPC em zapp que delegam para public
CREATE OR REPLACE FUNCTION zapp.log_audit_event(
  p_event_type text,
  p_resource   text,
  p_action     text,
  p_status     text,
  p_details    jsonb
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.log_audit_event(p_event_type, p_resource, p_action, p_status, p_details);
$$;

GRANT EXECUTE ON FUNCTION zapp.log_audit_event(text, text, text, text, jsonb)
   TO authenticated, service_role;

-- Stub blindado para rpc_log_email_health (função-alvo ainda não implementada).
-- Escreve o payload em audit_logs para rastreabilidade e nunca lança exceção.
CREATE OR REPLACE FUNCTION zapp.rpc_log_email_health(
  p_status  text DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.log_audit_event(
    'email_health',
    'email_accounts',
    'health_check',
    COALESCE(p_status, 'unknown'),
    COALESCE(p_details, '{}'::jsonb)
  );
EXCEPTION WHEN OTHERS THEN
  RETURN; -- telemetria nunca derruba o fluxo
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.rpc_log_email_health(text, jsonb)
   TO authenticated, service_role;

COMMIT;

-- Recarrega o schema cache do PostgREST para que as novas views/funções
-- fiquem visíveis via API imediatamente.
NOTIFY pgrst, 'reload schema';
