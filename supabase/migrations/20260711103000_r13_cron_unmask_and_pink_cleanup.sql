-- ============================================================================
-- R13 (2026-07-11) — Auditoria Evolution API: desmascaramento cron_health
--                    + limpeza wpp_pink_test + dedup crons + indice parcial
-- Idempotente. Aplicado em producao em 2026-07-11 ~10:35 UTC via MCP.
-- Backups pre-mudanca: ops._fn_backups (tags 'pre-R13-cron-unmask',
--                      'pre-pink-cleanup')
-- ============================================================================

-- 1) Tabela de backups de funcoes (infra de rollback)
CREATE TABLE IF NOT EXISTS ops._fn_backups (
  id bigserial PRIMARY KEY,
  fn_name text NOT NULL,
  def text NOT NULL,
  tag text,
  created_at timestamptz DEFAULT now()
);

-- 2) Indice parcial p/ counts de falha de cron (usado pelo health score R13)
CREATE INDEX IF NOT EXISTS idx_jrd_failed_start
  ON cron.job_run_details (start_time) WHERE status='failed';

-- 3) fn_system_health_score R13 — mudanca aplicada por substituicao validada
--    sobre a base canonica R12 (guardas: exatamente 1 ocorrencia por bloco,
--    corpo nao pode crescer >400 bytes, backup previo obrigatorio).
--    ANTES (mascarava falhas reais — ocultou 114 falhas do incidente
--    pink_test e 48 falhas do probe e2e quebrado):
--      COUNT(*) ... start_time>NOW()-INTERVAL '24 hours'
--        AND return_message NOT LIKE '%does not exist%'
--        AND return_message NOT LIKE '%invalid input value for enum webhook_event_status%'
--    DEPOIS (janela 1h, SEM filtros de mensagem; 24h vira campo informativo):
--      COUNT(*) ... start_time>NOW()-INTERVAL '1 hour'
--      breakdown.cron_health: {score, max, failures_1h, failures_24h}
DO $r13$
DECLARE v_def text; v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.proname='fn_system_health_score' AND n.nspname='public';
  IF position($chk$NOT LIKE '%does not exist%'$chk$ IN v_def) = 0 THEN
    RAISE NOTICE 'R13 ja aplicado — skip';
    RETURN;
  END IF;
  INSERT INTO ops._fn_backups (fn_name, def, tag)
  VALUES ('public.fn_system_health_score', v_def, 'pre-R13-cron-unmask');
  v_new := replace(v_def,
    $o1$SELECT COUNT(*) INTO v FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '24 hours' AND return_message NOT LIKE '%does not exist%' AND return_message NOT LIKE '%invalid input value for enum webhook_event_status%';$o1$,
    $n1$SELECT COUNT(*) INTO v FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '1 hour';$n1$);
  IF v_new = v_def THEN RAISE EXCEPTION 'R13: bloco 1 nao encontrado'; END IF;
  v_def := v_new;
  v_new := replace(v_def,
    $o2$v_bd:=v_bd||jsonb_build_object('cron_health',jsonb_build_object('score',CASE WHEN v=0 THEN 5 WHEN v<5 THEN 3 ELSE 0 END,'max',5,'failures_24h',v));$o2$,
    $n2$v_bd:=v_bd||jsonb_build_object('cron_health',jsonb_build_object('score',CASE WHEN v=0 THEN 5 WHEN v<5 THEN 3 ELSE 0 END,'max',5,'failures_1h',v,'failures_24h',(SELECT COUNT(*) FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '24 hours')));$n2$);
  IF v_new = v_def THEN RAISE EXCEPTION 'R13: bloco 2 nao encontrado'; END IF;
  EXECUTE v_new;
END $r13$;

-- 4) fn_contacts_view_insert: default de instancia era 'wpp_pink_test'
--    (instancia DELETADA em 2026-07-09) => contatos novos sem instance_name
--    caiam em instancia morta. Corrigido para 'wpp2'.
DO $pink$
DECLARE v_def text; v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.proname='fn_contacts_view_insert' AND n.nspname='public';
  IF v_def IS NULL OR position('wpp_pink_test' IN v_def) = 0 THEN
    RAISE NOTICE 'pink default ja corrigido — skip'; RETURN;
  END IF;
  INSERT INTO ops._fn_backups (fn_name, def, tag)
  VALUES ('public.fn_contacts_view_insert', v_def, 'pre-pink-cleanup');
  v_new := replace(v_def,
    $o$COALESCE(NEW.instance_name, 'wpp_pink_test'),  -- instância ATIVA (não mais wpp2)$o$,
    $n$COALESCE(NEW.instance_name, 'wpp2'),  -- R13: default corrigido p/ instância ativa (pink_test removida 2026-07-09)$n$);
  IF v_new <> v_def THEN EXECUTE v_new; END IF;
END $pink$;

-- 5) instance_registry: descomissionar wpp_pink_test (estava is_active=true
--    com phone preenchido => escapava do ghost-check do health score)
UPDATE public.instance_registry
  SET is_active=false, status='decommissioned'
  WHERE instance_name='wpp_pink_test' AND is_active=true;

-- 6) Crons duplicados removidos (executado via cron.unschedule em producao):
--    jobid 155 'external-401-detector'  (== jobid 177 'detect-external-401-bursts')
--    jobid 134 'vacuum-contacts-daily'  (== jobid 169 'vacuum-contacts-2h')
--    jobid 62  'purge_webhook_processed' (removido por sessao paralela; 152 = canonico 3d)
DO $dedup$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobid IN (155,134);
EXCEPTION WHEN OTHERS THEN NULL; -- ja removidos
END $dedup$;
