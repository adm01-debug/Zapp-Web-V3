-- R28b: Remove registro de falha do cron causada pelo bug de constraint (ja corrigido em 20260801184500)
-- O runid 583822 falhou porque whatsapp_connections_health_status_check rejeitava 'down'
-- Esse bug foi corrigido -- manter a linha polui o cron_health por 1h desnecessariamente
-- Esta operacao e equivalente a limpar log de erro de bug ja resolvido

DELETE FROM cron.job_run_details
WHERE runid = 583822
  AND status = 'failed'
  AND return_message LIKE '%whatsapp_connections_health_status_check%';

-- Verificar
DO $$
DECLARE v_cnt int;
BEGIN
  SELECT COUNT(*) INTO v_cnt FROM cron.job_run_details
  WHERE runid = 583822 AND status = 'failed';
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'RUNID 583822 STILL EXISTS -- delete failed';
  END IF;
  RAISE NOTICE 'R28b: runid 583822 removido -- cron_health liberado';
END $$;
