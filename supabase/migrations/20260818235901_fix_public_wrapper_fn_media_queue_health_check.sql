-- Fix 404 (PGRST202) do n8n: evo.fn_media_queue_health_check() existe apenas no schema evo,
-- mas PGRST_DB_SCHEMAS nao inclui evo (public,zapp,storage,graphql_public,artes,vendas,financeiro,logistica)
-- -> chamada POST /rest/v1/rpc/fn_media_queue_health_check falha com "Could not find the function public...".
--
-- Fix: wrapper public SECURITY DEFINER com search_path fixo delegando para evo.fn_media_queue_health_check().
-- Grants seguem o padrao das RPCs do pipeline de midia ja usadas pelo n8n (rpc_claim_media_download_batch etc.):
-- authenticated + service_role, SEM anon (postura de seguranca p/ SECURITY DEFINER).

CREATE OR REPLACE FUNCTION public.fn_media_queue_health_check()
RETURNS TABLE(
  queue_status text,
  pending_count bigint,
  processing_stuck_count bigint,
  failed_exhausted_count bigint,
  oldest_stuck_min numeric,
  recommendation text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = evo, public, pg_catalog
AS $$
  SELECT * FROM evo.fn_media_queue_health_check();
$$;

REVOKE ALL ON FUNCTION public.fn_media_queue_health_check() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_media_queue_health_check() TO authenticated, service_role; -- ignore-lint-ml008: health-check read-only de infra (métricas de fila, sem PII/escrita), chamado pelo n8n — padrão das RPCs do pipeline de mídia
