-- =============================================================================
-- FIX CRON 27 — whatsapp_reconcile_dispatch (lote LIMIT + janela + guard)
-- 2026-08-17 | audit 20260816 | ONDA-G13 (construção #13)
--
-- PROBLEMA (estado 37 A5 + CRON_FAILURES_7D §3.1/§3.4):
--   Job 27 falhou 91/701 execuções (13%) com `job startup timeout` (start_time
--   NULL) + 1 run travado em `connecting` — saturação do scheduler pg_cron
--   (211+ jobs ativos, muitos em */2 e */5) agravada pelo despacho
--   INCONDICIONAL a cada 5 min: quando o apply (job 30) atrasa ou a resposta
--   do pg_net expira (retenção ~6h), a fila evo.evolution_reconcile_jobs
--   empilha sem teto (1 request/5min = 288/dia) e cada run do apply fica mais
--   pesado → mais pressão no scheduler → mais startup timeouts.
--
-- DIAGNÓSTICO (o que o job 27 chama):
--   cron.job 27: SELECT zapp.fn_reconcile_dispatch(); (schedule 0-59/5)
--   → ops.fn_provider_call('GET','/instance/fetchInstances',NULL,8000) [E85]
--   → ops.log_pgnet_call(...) [E86, aditivo]
--   → evo.rpc_boundary_reconcile_enqueue(v_req_id)
--   Consumidor: job 30 whatsapp_reconcile_apply → zapp.fn_reconcile_apply()
--   → evo.rpc_boundary_reconcile_pending(50) por run.
--   Estado vivo 17/08 18:35Z: fila 1560 total / 0 pendentes (saudável) —
--   fix é PREVENTIVO (teto de fila + cooldown), não correção de estado.
--
-- FIX (3 partes, idempotentes):
--   1. lote LIMIT: fn_reconcile_dispatch NÃO enfileira quando há >= 5 jobs
--      pendentes (backpressure — para o empilhamento na fonte).
--   2. janela: cooldown de 4 min — não despacha se o request anterior ainda
--      está em voo (applied_at IS NULL e dispatched_at < 4min atrás). Com
--      schedule de 5 min, a fila nunca passa de ~1-2 em pipeline saudável e o
--      job vira no-op barato (NOTICE + NULL) quando o apply atrasa.
--   3. guard UPDATE jobid=27 (padrão A — preserva jobid): comando-alvo já é o
--      vivo em prod → re-run = UPDATE 0.
--
-- CORPO FONTE: pg_get_functiondef() de prod em 2026-08-17 18:40Z (E85/E86),
--   única mudança: guards lote LIMIT + janela adicionados (DB-as-source).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PASSO 1: CREATE OR REPLACE com lote LIMIT + janela (idempotente)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.fn_reconcile_dispatch()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'public', 'pg_catalog'
AS $function$
DECLARE v_req_id bigint;
        v_pending int;
BEGIN
  -- G13-27 lote LIMIT: backpressure — não empilha quando o apply está atrasado.
  SELECT count(*) INTO v_pending
  FROM evo.evolution_reconcile_jobs
  WHERE applied_at IS NULL;
  IF v_pending >= 5 THEN
    RAISE NOTICE '[fn_reconcile_dispatch] fila cheia (% pendentes >= 5) — skip', v_pending;
    RETURN NULL;
  END IF;

  -- G13-27 janela: cooldown — não despacha se o request anterior ainda está
  -- em voo (não aplicado há < 4 min). Reduz pressão no scheduler/apply.
  IF EXISTS (
    SELECT 1 FROM evo.evolution_reconcile_jobs
    WHERE applied_at IS NULL
      AND dispatched_at > now() - interval '4 minutes'
  ) THEN
    RAISE NOTICE '[fn_reconcile_dispatch] dispatch anterior ainda em voo — skip (janela 4min)';
    RETURN NULL;
  END IF;

  v_req_id := ops.fn_provider_call('GET', '/instance/fetchInstances', NULL, 8000);
  -- E86: egress log ADITIVO (falha de log NUNCA altera o reconcile)
  BEGIN
    PERFORM ops.log_pgnet_call(p_caller := 'fn_reconcile_dispatch',
      p_url := ops.fn_evo_url()||'/instance/fetchInstances',
      p_method := 'GET', p_via_gateway := true, p_note := 'via gateway E85');
  EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM evo.rpc_boundary_reconcile_enqueue(v_req_id);
  RETURN v_req_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[fn_reconcile_dispatch] erro: %', SQLERRM;
  RETURN NULL;
END $function$;

-- ---------------------------------------------------------------------------
-- PASSO 2: guard idempotente do comando (padrão A — preserva jobid 27)
--   Em prod o comando JÁ é o alvo (conferido 18:35Z) -> re-run = UPDATE 0.
-- ---------------------------------------------------------------------------
UPDATE cron.job
SET command = 'SELECT zapp.fn_reconcile_dispatch();'
WHERE jobid = 27
  AND command NOT LIKE 'SELECT zapp.fn_reconcile_dispatch()';
