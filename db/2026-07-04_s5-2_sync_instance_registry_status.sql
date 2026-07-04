-- S5-2 (sessão 5, 2026-07-04): zapp.instance_registry.status estava stale desde 13/06
-- ('inactive' para todas as instâncias, incluindo as conectadas). Nenhum job sincronizava
-- o campo, mas funções de health leem a tabela. Esta função espelha o status a partir de
-- public.whatsapp_connections (mantida fresca pelo ciclo de reconcile de 5 min) e marca
-- instâncias nunca provisionadas na Evolution como 'not_provisioned'. Linhas com
-- status='test' (instâncias de QA — S5-3) são preservadas.
-- Aplicado em produção em 2026-07-04 ~11:02 UTC. Agendado no pg_cron (jobid 96):
--   SELECT cron.schedule('sync-instance-registry-status', '2-59/5 * * * *',
--     'SELECT zapp.fn_sync_instance_registry_status()');

CREATE OR REPLACE FUNCTION zapp.fn_sync_instance_registry_status()
RETURNS TABLE(sincronizadas int, sem_conexao int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, public, pg_catalog
AS $$
DECLARE v_sync int; v_orfas int;
BEGIN
  -- 1) Instancias com linha viva em public.whatsapp_connections (fonte: reconcile 5min)
  UPDATE zapp.instance_registry ir
  SET status = wc.status, updated_at = now()
  FROM public.whatsapp_connections wc
  WHERE wc.instance_name = ir.instance_name
    AND ir.status IS DISTINCT FROM wc.status;
  GET DIAGNOSTICS v_sync = ROW_COUNT;

  -- 2) Instancias registradas mas nunca provisionadas na Evolution (sem linha em whatsapp_connections)
  UPDATE zapp.instance_registry ir
  SET status = 'not_provisioned', updated_at = now()
  WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_connections wc WHERE wc.instance_name = ir.instance_name)
    AND ir.status IS DISTINCT FROM 'not_provisioned'
    AND ir.status IS DISTINCT FROM 'test';
  GET DIAGNOSTICS v_orfas = ROW_COUNT;

  RETURN QUERY SELECT v_sync, v_orfas;
END $$;

COMMENT ON FUNCTION zapp.fn_sync_instance_registry_status() IS
  'S5-2 (2026-07-04): sincroniza zapp.instance_registry.status a partir de public.whatsapp_connections (mantida fresca pelo reconcile). Instancias sem conexao viram not_provisioned; status=test e preservado.';
