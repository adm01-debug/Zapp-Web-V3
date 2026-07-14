-- ============================================================================
-- Incident Runbook (E10-04)
-- Auditoria 2026-07-10
--
-- E10-04 — Runbook incompleto descoberto em drill de incidente
--   O drill de 2026-07-09 revelou que não existe runbook estruturado para os
--   cenários de falha mais prováveis da stack Evolution API + Baileys + Docker
--   Swarm + RabbitMQ. A equipe teve que improvisar steps durante o drill.
--
--   Solução: evo.evolution_incident_runbook persiste 10 runbooks completos
--   com steps sequenciais, comandos exatos, critérios de sucesso e escalação.
--   fn_get_incident_runbook(p_type) retorna o runbook como jsonb para uso
--   direto em alerts/dashboards/Slack bots.
--
-- Runbooks incluídos:
--   1. container_crash       — Evolution container caiu / orphan task
--   2. baileys_auth_conflict — nova task falha healthcheck (auth conflict)
--   3. qr_repaid             — QR re-pair necessário após conflito de sessão
--   4. rabbitmq_queue_loss   — filas RMQ perdidas após crash/restart
--   5. api_key_rotation      — rotação de API key com zero-downtime
--   6. dlq_overflow          — DLQ acumulando mensagens poison
--   7. redis_stale_session   — sessão Redis obsoleta pós-restart
--   8. backup_restore        — restauração de backup com validação 7-checks
--   9. burnin_reset          — burn-in reiniciado por alerta crítico (E10-03)
--  10. full_rollback         — rollback completo para versão anterior
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + upsert ON CONFLICT.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- Runbook table
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evo.evolution_incident_runbook (
  id              TEXT         PRIMARY KEY,
  title           TEXT         NOT NULL,
  severity        TEXT         NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  category        TEXT         NOT NULL,
  triggers        TEXT[]       NOT NULL,
  steps           jsonb        NOT NULL,
  success_criteria TEXT[]      NOT NULL,
  escalation      TEXT,
  estimated_minutes INT,
  last_drilled_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE evo.evolution_incident_runbook IS
  'E10-04: Structured incident runbooks for Evolution API + Baileys + Docker Swarm + RMQ stack. '
  'Use fn_get_incident_runbook(id) to retrieve as JSONB.';

CREATE INDEX IF NOT EXISTS idx_evo_incident_runbook_severity
  ON evo.evolution_incident_runbook (severity);

CREATE INDEX IF NOT EXISTS idx_evo_incident_runbook_category
  ON evo.evolution_incident_runbook (category);

-- ──────────────────────────────────────────────────────────────────────────────
-- Runbook entries (upsert — idempotent re-runs update content, keep drill date)
-- ──────────────────────────────────────────────────────────────────────────────
INSERT INTO evo.evolution_incident_runbook
  (id, title, severity, category, triggers, steps, success_criteria, escalation, estimated_minutes)
VALUES

-- 1. container_crash
('container_crash',
 'Evolution container caiu / orphan task no Swarm',
 'critical', 'INFRA',
 ARRAY['Container exits unexpectedly','Portainer shows 0/1 replicas','healthcheck failing > 3 min','orphan task visible in docker service ps'],
 '[
   {"step":1,"action":"Verificar status do serviço","cmd":"docker service ps evolution --no-trunc","expected":"lista de tasks com estado"},
   {"step":2,"action":"Forçar remoção de tasks orphan","cmd":"docker service update --force evolution","expected":"nova task iniciada, orphan removida"},
   {"step":3,"action":"Aguardar healthcheck passar","cmd":"docker service ps evolution","expected":"1/1 Running, healthcheck OK"},
   {"step":4,"action":"Verificar logs de boot","cmd":"docker service logs evolution --since 2m","expected":"[logpatch] T1-T5 OK no log"},
   {"step":5,"action":"Confirmar conexão Baileys","cmd":"SELECT state, created_at FROM evo.evolution_connection_history ORDER BY created_at DESC LIMIT 5","expected":"state=open ou connected"},
   {"step":6,"action":"Verificar DLQ por mensagens acumuladas","cmd":"SELECT COUNT(*) FROM evo.evolution_webhook_dlq WHERE status=''pending'' AND created_at > now()-interval ''10 min''","expected":"0 ou baixo (< 50)"},
   {"step":7,"action":"Marcar incidente resolvido","cmd":"INSERT INTO zapp.webhook_health_alerts (alert_type,severity,message) VALUES (''container_crash_resolved'',''low'',''container_crash runbook executed — service restored'')","expected":"INSERT 1"}
 ]'::jsonb,
 ARRAY['Service shows 1/1 replicas','healthcheck passing','Baileys state=open','DLQ not accumulating'],
 'Se container crash > 2 vezes em 1h: escalar para ops + verificar CVE em imagem',
 15),

-- 2. baileys_auth_conflict
('baileys_auth_conflict',
 'Nova task falha healthcheck — Baileys auth conflict',
 'critical', 'APP',
 ARRAY['healthcheck failing','log shows auth conflict','QR code requested unexpectedly','state=close after open'],
 '[
   {"step":1,"action":"Identificar conflito nos logs","cmd":"docker service logs evolution --since 5m | grep -i ''conflict\\|auth\\|qr''","expected":"mensagem de conflict ou QR request"},
   {"step":2,"action":"Remover sessão Redis obsoleta","cmd":"redis-cli SCAN 0 MATCH ''evolution:*'' COUNT 1000 | xargs redis-cli DEL","expected":"chaves removidas"},
   {"step":3,"action":"Forçar redeploy para nova sessão limpa","cmd":"docker service update --force evolution","expected":"container reiniciado sem sessão stale"},
   {"step":4,"action":"Acompanhar boot — aguardar QR na UI","cmd":"docker service logs evolution -f --since 10s","expected":"QR code emitido no log"},
   {"step":5,"action":"Realizar re-pair via UI Portainer/Evolution","cmd":"Acesse a URL da API: GET /instance/connect/{instanceName}","expected":"status: connecting > open"},
   {"step":6,"action":"Confirmar estado aberto","cmd":"SELECT state FROM evo.evolution_connection_history ORDER BY created_at DESC LIMIT 1","expected":"state = open"},
   {"step":7,"action":"Verificar burn-in não resetado","cmd":"SELECT burn_in_start, burn_in_passed FROM evo.evolution_burnin_tracker WHERE id=1","expected":"burn_in_passed=false, novo burn_in_start após incidente"}
 ]'::jsonb,
 ARRAY['healthcheck passing','Baileys state=open','No QR requests in last 30min','burn-in clock reset and running'],
 'Se re-pair falhar 3 vezes: escalar — possível problema no número WhatsApp ou bloqueio',
 25),

-- 3. qr_repaid
('qr_repaid',
 'QR re-pair necessário após conflito de sessão',
 'high', 'APP',
 ARRAY['WhatsApp desconectado','state=close após restart','usuário reporta mensagens não entregues'],
 '[
   {"step":1,"action":"Confirmar estado atual","cmd":"SELECT state, previous_state, duration_seconds FROM evo.evolution_connection_history ORDER BY created_at DESC LIMIT 3","expected":"state=close ou disconnected"},
   {"step":2,"action":"Verificar se é conflito de sessão ou bloqueio","cmd":"docker service logs evolution --since 5m | grep -iE ''stream|conflict|401|403''","expected":"identificar causa raiz"},
   {"step":3,"action":"Limpar cache Redis da instância","cmd":"redis-cli DEL evolution:session evolution:auth evolution:baileys:creds","expected":"(integer) 3 ou menos"},
   {"step":4,"action":"Restart controlado do container","cmd":"docker service update --force evolution","expected":"novo container iniciado"},
   {"step":5,"action":"Scanear QR code em até 60s","cmd":"GET /instance/connect/{instanceName} → exibir QR","expected":"QR escaneado com sucesso pelo telefone"},
   {"step":6,"action":"Aguardar state=open","cmd":"SELECT state FROM evo.evolution_connection_history ORDER BY created_at DESC LIMIT 1","expected":"open"},
   {"step":7,"action":"Testar envio de mensagem de teste","cmd":"POST /message/sendText — número de teste interno","expected":"mensagem entregue, status=200"}
 ]'::jsonb,
 ARRAY['state=open in evolution_connection_history','Test message delivered successfully','DLQ not growing'],
 'Se QR não conectar em 3 tentativas: verificar se número foi banido pelo WhatsApp',
 20),

-- 4. rabbitmq_queue_loss
('rabbitmq_queue_loss',
 'Filas RabbitMQ perdidas após crash/restart',
 'critical', 'MSG',
 ARRAY['Consumer sem mensagens após restart RMQ','evolution_webhook_events sem novos registros','DLQ vazia mas webhook events pararam'],
 '[
   {"step":1,"action":"Verificar filas existentes no RMQ","cmd":"rabbitmqctl list_queues name durable messages","expected":"lista de filas — verificar se durable=true"},
   {"step":2,"action":"Recriar filas não-durable se perdidas","cmd":"Via RabbitMQ Management UI: criar evolution, evolution_error, evolution_dead como durable=true","expected":"filas recriadas com durable=true"},
   {"step":3,"action":"Reiniciar consumer para reconectar","cmd":"docker service update --force evolution","expected":"consumer reconecta e começa a processar"},
   {"step":4,"action":"Reprocessar mensagens perdidas via webhook replay","cmd":"SELECT COUNT(*) FROM evo.evolution_webhook_events WHERE created_at > now()-interval ''1h'' AND status=''pending''","expected":"identificar janela de perda"},
   {"step":5,"action":"Verificar producer reconectado","cmd":"SELECT COUNT(*) FROM evo.evolution_webhook_events WHERE created_at > now()-interval ''5 min''","expected":"novos eventos chegando"},
   {"step":6,"action":"Monitorar DLQ por mensagens que falharam durante outage","cmd":"SELECT COUNT(*), status FROM evo.evolution_webhook_dlq GROUP BY status","expected":"sem aumento em poison/failed"}
 ]'::jsonb,
 ARRAY['All queues present and durable=true','New webhook events arriving','Consumer processing normally','DLQ not growing'],
 'Perda persistente de mensagens: verificar se exchange também foi perdido (E8-07)',
 30),

-- 5. api_key_rotation
('api_key_rotation',
 'Rotação de API key Evolution com zero-downtime',
 'high', 'SEC',
 ARRAY['Key comprometida detectada','Key expirada','Auditoria de segurança requer rotação'],
 '[
   {"step":1,"action":"Gerar nova API key no Evolution","cmd":"POST /auth/key/refresh — anotar nova key em local seguro (não em terminal)","expected":"nova key UUID recebida"},
   {"step":2,"action":"Atualizar Docker secret (não env var)","cmd":"echo NEW_KEY | docker secret create evolution_api_key_v2 - && docker service update --secret-rm evolution_api_key --secret-add evolution_api_key_v2 evolution","expected":"service updated sem downtime"},
   {"step":3,"action":"Verificar novo container usando nova key","cmd":"docker service logs evolution --since 1m | grep -i ''api.*key\\|auth.*ok''","expected":"sem erros 401/403"},
   {"step":4,"action":"Remover referências à key antiga em painéis/n8n","cmd":"Atualizar credencial Evolution no n8n; Atualizar painéis de compras/financeiro","expected":"sem requisições com key antiga nos próximos 5 min"},
   {"step":5,"action":"Purgar key antiga de logs históricos","cmd":"SELECT public.fn_purge_api_key_from_logs(''<KEY-ANTIGA>'')","expected":"JSON com contagem de rows redacted"},
   {"step":6,"action":"Revogar key antiga","cmd":"DELETE /auth/key/<KEY-ANTIGA> ou via UI Evolution","expected":"key antiga retorna 401"},
   {"step":7,"action":"Excluir Docker secret antigo","cmd":"docker secret rm evolution_api_key","expected":"secret removido"}
 ]'::jsonb,
 ARRAY['New key working (no 401 errors)','Old key revoked (returns 401)','Logs purged via fn_purge_api_key_from_logs','No references to old key in n8n/dashboards'],
 'Se n8n workflows continuam 401: verificar cache de credencial no n8n (restart worker)',
 40),

-- 6. dlq_overflow
('dlq_overflow',
 'DLQ acumulando mensagens poison',
 'high', 'MSG',
 ARRAY['fn_flag_poison_messages alert received','DLQ count > 100','Consumer restart loop detectado'],
 '[
   {"step":1,"action":"Verificar contagem e distribuição da DLQ","cmd":"SELECT status, COUNT(*), MAX(retry_count) FROM evo.evolution_webhook_dlq GROUP BY status","expected":"identificar quantas são poison vs pending"},
   {"step":2,"action":"Analisar erro das mensagens poison","cmd":"SELECT error_message, COUNT(*) FROM evo.evolution_webhook_dlq WHERE status=''poison'' GROUP BY error_message ORDER BY COUNT(*) DESC LIMIT 10","expected":"erro dominante identificado"},
   {"step":3,"action":"Corrigir causa raiz (se parseável)","cmd":"Depende do erro: DB inacessível → verificar conexão; payload inválido → patch consumer","expected":"causa raiz eliminada"},
   {"step":4,"action":"Reprocessar mensagens corrigíveis manualmente","cmd":"UPDATE evo.evolution_webhook_dlq SET status=''pending'', retry_count=0 WHERE status=''poison'' AND <condição específica>","expected":"mensagens re-enfileiradas"},
   {"step":5,"action":"Arquivar mensagens irrecuperáveis","cmd":"UPDATE evo.evolution_webhook_dlq SET status=''archived'', error_message=error_message||'' — archived after manual review'' WHERE status=''poison'' AND created_at < now()-interval ''24h''","expected":"mensagens arquivadas, saem da fila ativa"},
   {"step":6,"action":"Confirmar DLQ voltou ao normal","cmd":"SELECT COUNT(*) FROM evo.evolution_webhook_dlq WHERE status=''pending''","expected":"contagem baixa e estável"}
 ]'::jsonb,
 ARRAY['DLQ poison count = 0 or archived','Consumer not in restart loop','New messages processing normally'],
 'DLQ > 1000 mensagens: pausar consumer e investigar antes de re-processar em massa',
 35),

-- 7. redis_stale_session
('redis_stale_session',
 'Sessão Redis obsoleta pós-restart',
 'high', 'CACHE',
 ARRAY['Evolution conecta mas não recebe mensagens','state=open mas DLQ acumula','Redis keys de sessão antiga presentes'],
 '[
   {"step":1,"action":"Listar chaves Redis da instância","cmd":"redis-cli KEYS ''evolution:*''","expected":"ver quais chaves existem"},
   {"step":2,"action":"Inspecionar TTL das chaves","cmd":"redis-cli TTL evolution:session","expected":"TTL > 0 (não expirado) ou -1 (sem TTL — stale)"},
   {"step":3,"action":"Comparar timestamp da chave com último restart","cmd":"redis-cli DEBUG OBJECT evolution:session","expected":"at:timestamp — comparar com docker service ps"},
   {"step":4,"action":"Remover chaves stale identificadas","cmd":"redis-cli DEL evolution:session evolution:auth evolution:baileys:creds evolution:baileys:app-state-sync","expected":"(integer) N keys removed"},
   {"step":5,"action":"Forçar reconexão do consumer","cmd":"docker service update --force evolution","expected":"nova sessão criada no Redis"},
   {"step":6,"action":"Confirmar nova sessão ativa","cmd":"redis-cli TTL evolution:session && SELECT state FROM evo.evolution_connection_history ORDER BY created_at DESC LIMIT 1","expected":"TTL > 0 e state=open"}
 ]'::jsonb,
 ARRAY['Redis keys have fresh TTL','state=open','Messages flowing normally (no DLQ growth)'],
 'Se Redis inacessível: verificar rede Docker overlay entre containers',
 20),

-- 8. backup_restore
('backup_restore',
 'Restauração de backup com validação 7-checks',
 'critical', 'DATA',
 ARRAY['Corrupção de dados detectada','Schema drop acidental','Necessidade de rollback de dados'],
 '[
   {"step":1,"action":"Identificar backup mais recente","cmd":"SELECT last_backup_at, last_backup_file FROM ops.backup_sentinel ORDER BY last_backup_at DESC LIMIT 3","expected":"arquivo de backup < 26h"},
   {"step":2,"action":"Parar consumers para evitar writes durante restore","cmd":"docker service scale evolution=0","expected":"0/0 replicas — sem writes novos"},
   {"step":3,"action":"Restaurar backup no ambiente de destino","cmd":"pg_restore -h HOST -U USER -d DB --clean --if-exists -Fc BACKUP_FILE","expected":"restore sem erros fatais"},
   {"step":4,"action":"Executar 7-checks de integridade","cmd":"SELECT * FROM public.fn_restore_integrity_check()","expected":"overall=PASS ou no máximo WARN em contacts"},
   {"step":5,"action":"Verificar tabelas críticas","cmd":"SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE schemaname IN (''evo'',''public'',''zapp'') ORDER BY n_live_tup DESC LIMIT 20","expected":"contagens próximas ao baseline"},
   {"step":6,"action":"Recriar índices se necessário","cmd":"REINDEX DATABASE postgres","expected":"0 invalid indexes em pg_index"},
   {"step":7,"action":"Religar consumers","cmd":"docker service scale evolution=1","expected":"1/1 replicas, healthcheck OK"},
   {"step":8,"action":"Monitorar DLQ e connection state por 30min","cmd":"SELECT * FROM evo.fn_burnin_disconnection_check()","expected":"PASS sem disconnections longas"}
 ]'::jsonb,
 ARRAY['fn_restore_integrity_check overall=PASS','All 7 checks pass','Consumers processing normally','No data gaps detected'],
 'fn_restore_integrity_check FAIL: investigar cada check antes de ir para produção',
 90),

-- 9. burnin_reset
('burnin_reset',
 'Burn-in reiniciado por alerta crítico (E10-03)',
 'high', 'OPS',
 ARRAY['burnin_critical_alert webhook received','fn_burnin_critical_alert_check returned FAIL','72h clock reset'],
 '[
   {"step":1,"action":"Identificar o alerta crítico que trigou o reset","cmd":"SELECT created_at, message, metadata FROM zapp.webhook_health_alerts WHERE alert_type=''burnin_critical_alert'' ORDER BY created_at DESC LIMIT 3","expected":"alerta com detalhes do incidente"},
   {"step":2,"action":"Resolver o alerta crítico de origem","cmd":"Executar runbook específico para o tipo de alerta (container_crash, baileys_auth_conflict, etc.)","expected":"causa raiz resolvida"},
   {"step":3,"action":"Reconhecer o alerta na tabela de alertas","cmd":"UPDATE evo.evolution_alerts SET acknowledged=true, acknowledged_at=now() WHERE severity=''critical'' AND created_at > now()-interval ''2h'' AND acknowledged IS NULL","expected":"rows updated"},
   {"step":4,"action":"Verificar novo burn_in_start","cmd":"SELECT burn_in_start, last_reset_reason, burn_in_passed FROM evo.evolution_burnin_tracker WHERE id=1","expected":"burn_in_start = now() (recente), burn_in_passed=false"},
   {"step":5,"action":"Confirmar que sistema está estável antes de começar clock","cmd":"SELECT * FROM evo.fn_burnin_monitor()","expected":"disconnection_check.status=PASS, critical_alert_check.status=PASS"},
   {"step":6,"action":"Documentar incidente e estimativa de go-live","cmd":"UPDATE evo.evolution_burnin_tracker SET last_reset_reason=last_reset_reason||'' | RESOLVED: ''||now()::text WHERE id=1","expected":"updated 1 row"},
   {"step":7,"action":"Nova janela de go-live = burn_in_start + 72h","cmd":"SELECT burn_in_start + interval ''72 hours'' AS go_live_earliest FROM evo.evolution_burnin_tracker WHERE id=1","expected":"data futura mínima para go-live"}
 ]'::jsonb,
 ARRAY['Original alert acknowledged','fn_burnin_monitor returns PASS','New 72h window running','Go-live date updated in tracker'],
 'Se burn-in reinicia > 3 vezes na mesma semana: go-live deve ser adiado para investigação profunda',
 45),

-- 10. full_rollback
('full_rollback',
 'Rollback completo para versão anterior da Evolution API',
 'critical', 'INFRA',
 ARRAY['Nova versão causando falhas críticas','Múltiplos restart loops','Baileys incompatibilidade pós-upgrade'],
 '[
   {"step":1,"action":"Identificar SHA da imagem anterior","cmd":"docker service inspect evolution | jq ''.[] | .Spec.TaskTemplate.ContainerSpec.Image''","expected":"image:tag@sha256:HASH atual — anotar o anterior do histórico"},
   {"step":2,"action":"Verificar último backup antes do upgrade","cmd":"SELECT last_backup_at, last_backup_file FROM ops.backup_sentinel ORDER BY last_backup_at DESC LIMIT 3","expected":"backup válido < 26h disponível"},
   {"step":3,"action":"Atualizar service para imagem anterior","cmd":"docker service update --image evolution:VERSAO_ANTERIOR@sha256:HASH_ANTERIOR evolution","expected":"rolling update iniciado"},
   {"step":4,"action":"Monitorar rollback","cmd":"docker service ps evolution","expected":"nova task com imagem anterior Running"},
   {"step":5,"action":"Verificar patches logpatch na versão antiga","cmd":"docker service logs evolution --since 2m | grep logpatch","expected":"T1-T5 presentes conforme fn_logpatch_verify()"},
   {"step":6,"action":"Confirmar conexão Baileys","cmd":"SELECT state FROM evo.evolution_connection_history ORDER BY created_at DESC LIMIT 1","expected":"state=open"},
   {"step":7,"action":"Re-verificar integridade pós-rollback","cmd":"SELECT * FROM public.fn_restore_integrity_check()","expected":"overall=PASS"},
   {"step":8,"action":"Resetar burn-in para nova contagem","cmd":"UPDATE evo.evolution_burnin_tracker SET burn_in_start=now(), burn_in_passed=false, last_reset_reason=''full_rollback to prior version'' WHERE id=1","expected":"updated 1 row"},
   {"step":9,"action":"Documentar motivo do rollback para próximo upgrade","cmd":"INSERT INTO evo.evolution_health_logs (status,error_message,metadata) VALUES (''warn'',''Full rollback executed — investigate before next upgrade'', jsonb_build_object(''reason'',''<MOTIVO>'',''rolled_back_from'',''<VERSAO>''))","expected":"INSERT 1"}
 ]'::jsonb,
 ARRAY['Old image running successfully','healthcheck passing','state=open','fn_restore_integrity_check PASS','burn-in clock reset'],
 'Se rollback também falhar: restaurar último backup completo (runbook: backup_restore)',
 60)

ON CONFLICT (id) DO UPDATE
  SET title            = EXCLUDED.title,
      severity         = EXCLUDED.severity,
      category         = EXCLUDED.category,
      triggers         = EXCLUDED.triggers,
      steps            = EXCLUDED.steps,
      success_criteria = EXCLUDED.success_criteria,
      escalation       = EXCLUDED.escalation,
      estimated_minutes = EXCLUDED.estimated_minutes,
      updated_at       = now();

-- ──────────────────────────────────────────────────────────────────────────────
-- Retrieval function
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION evo.fn_get_incident_runbook(p_type text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_type IS NULL THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',                id,
        'title',             title,
        'severity',          severity,
        'category',          category,
        'estimated_minutes', estimated_minutes,
        'triggers',          triggers,
        'success_criteria',  success_criteria
      ) ORDER BY
        CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        id
    ) INTO v_result
    FROM evo.evolution_incident_runbook;

    RETURN jsonb_build_object('runbooks_summary', v_result, 'total', jsonb_array_length(v_result));
  END IF;

  SELECT jsonb_build_object(
    'id',                id,
    'title',             title,
    'severity',          severity,
    'category',          category,
    'triggers',          triggers,
    'steps',             steps,
    'success_criteria',  success_criteria,
    'escalation',        escalation,
    'estimated_minutes', estimated_minutes,
    'last_drilled_at',   last_drilled_at,
    'updated_at',        updated_at
  ) INTO v_result
  FROM evo.evolution_incident_runbook
  WHERE id = p_type;

  IF v_result IS NULL THEN
    RETURN jsonb_build_object(
      'error', format('Runbook not found: %s. Available: container_crash, baileys_auth_conflict, qr_repaid, rabbitmq_queue_loss, api_key_rotation, dlq_overflow, redis_stale_session, backup_restore, burnin_reset, full_rollback', p_type)
    );
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION evo.fn_get_incident_runbook(text) IS
  'E10-04: Returns full incident runbook as JSONB. '
  'Pass NULL to list all runbooks (summary). '
  'Pass runbook ID (e.g. ''container_crash'') for full step-by-step runbook. '
  'Available: container_crash, baileys_auth_conflict, qr_repaid, rabbitmq_queue_loss, '
  'api_key_rotation, dlq_overflow, redis_stale_session, backup_restore, burnin_reset, full_rollback.';

-- ──────────────────────────────────────────────────────────────────────────────
-- Drill timestamp update function
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION evo.fn_record_runbook_drill(p_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, pg_temp
AS $$
DECLARE
  v_rows int;
BEGIN
  UPDATE evo.evolution_incident_runbook
  SET last_drilled_at = now(), updated_at = now()
  WHERE id = p_type;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN jsonb_build_object('error', format('Runbook not found: %s', p_type));
  END IF;

  RETURN jsonb_build_object(
    'drilled', p_type,
    'drilled_at', now(),
    'next_drill_recommended', now() + interval '30 days'
  );
END;
$$;

COMMENT ON FUNCTION evo.fn_record_runbook_drill(text) IS
  'E10-04: Records that a drill was performed for the given runbook type. '
  'Usage: SELECT evo.fn_record_runbook_drill(''container_crash'');';
