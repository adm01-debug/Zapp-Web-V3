-- Migration: Stubs + Indexes + DLQ Monitor 2026-07-04
-- Items: followup_rules(4 rules), bitrix_mapping(7), indexes(6), fn_auto_task DEFINER+schema+perdido, fn_monitor_dlq, trg_connection null-safe
BEGIN;

-- 1. evolution_followup_rules: 4 regras padrao data-driven
INSERT INTO evo.evolution_followup_rules(id,name,trigger_type,trigger_config,delay_hours,conditions,sequence_order,sequence_group,is_active,run_count,created_at,updated_at) VALUES
(gen_random_uuid(),'Follow-up Orcamento Enviado','stage_change',jsonb_build_object('stage','orcamento_enviado','followup_type','stage_orcamento','default_message','Ola! Recebeu nosso orcamento? Posso ajudar?'),24,'{}',10,'stage_change_rules',true,0,now(),now()),
(gen_random_uuid(),'Follow-up Pagamento Pendente','stage_change',jsonb_build_object('stage','pagamento_pendente','followup_type','stage_pagamento','default_message','Oi! Posso ajudar com o pagamento?'),48,'{}',20,'stage_change_rules',true,0,now(),now()),
(gen_random_uuid(),'Reativacao Lead Perdido','stage_change',jsonb_build_object('stage','perdido','followup_type','stage_reativacao','default_message','Ola! Como podemos atender melhor?'),168,'{}',30,'stage_change_rules',true,0,now(),now()),
(gen_random_uuid(),'Confirmacao Novo Pedido','stage_change',jsonb_build_object('stage','novo_pedido','followup_type','stage_confirmacao','default_message','Pedido confirmado! Em breve mais detalhes.'),2,'{}',5,'stage_change_rules',true,0,now(),now())
ON CONFLICT DO NOTHING;

-- 2. evolution_bitrix_field_mapping: mapeamento de deals
INSERT INTO evo.evolution_bitrix_field_mapping(id,entity_type,local_field,bitrix_field,transform_type,transform_config,sync_direction,is_active,created_at) VALUES
(gen_random_uuid(),'deal','title','TITLE','direct','{}','outbound',true,now()),
(gen_random_uuid(),'deal','value','OPPORTUNITY','numeric','{}','outbound',true,now()),
(gen_random_uuid(),'deal','stage','STAGE_ID','map','{"orcamento_enviado":"C1:PREPAYMENT_INVOICE","perdido":"C1:LOSE","pedido_finalizado":"C1:WON"}','outbound',true,now()),
(gen_random_uuid(),'deal','won','CLOSED_WON','boolean','{}','outbound',true,now()),
(gen_random_uuid(),'deal','lost','CLOSED_LOST','boolean','{}','outbound',true,now()),
(gen_random_uuid(),'deal','assigned_to','ASSIGNED_BY_ID','user_lookup','{}','outbound',true,now()),
(gen_random_uuid(),'contact','push_name','NAME','direct','{}','outbound',true,now())
ON CONFLICT DO NOTHING;

-- 3. Indices em evolution_followups
CREATE INDEX IF NOT EXISTS idx_followups_deal_type_status ON evo.evolution_followups(deal_id,followup_type,status) WHERE status IN ('pending','scheduled');
CREATE INDEX IF NOT EXISTS idx_followups_scheduled_pending ON evo.evolution_followups(scheduled_at ASC) WHERE status IN ('pending','scheduled');
CREATE INDEX IF NOT EXISTS idx_followups_contact_status ON evo.evolution_followups(contact_id,status,scheduled_at DESC);

-- 4. Indices em evolution_bitrix_queue
CREATE INDEX IF NOT EXISTS idx_bitrix_queue_local_id_status ON evo.evolution_bitrix_queue(local_id,status) WHERE status IN ('pending','failed');
CREATE INDEX IF NOT EXISTS idx_bitrix_queue_worker ON evo.evolution_bitrix_queue(next_attempt_at ASC,status) WHERE status IN ('pending','failed');
CREATE INDEX IF NOT EXISTS idx_bitrix_queue_entity ON evo.evolution_bitrix_queue(entity_type,operation,status);

-- 5. fn_auto_task_on_deal: SECURITY DEFINER + evo schema + perdido stage
CREATE OR REPLACE FUNCTION public.fn_auto_task_on_deal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, evo AS $$
BEGIN
  IF NEW.stage='orcamento_enviado' AND OLD.stage!='orcamento_enviado' THEN
    INSERT INTO evo.evolution_tasks(title,deal_id,contact_id,task_type,due_date,priority,created_at)
    VALUES('Follow-up do orcamento: '||NEW.title,NEW.id,NEW.contact_id,'follow_up',CURRENT_DATE+2,'alta',now());
  END IF;
  IF NEW.stage='pagamento_pendente' AND OLD.stage!='pagamento_pendente' THEN
    INSERT INTO evo.evolution_tasks(title,deal_id,contact_id,task_type,due_date,priority,created_at)
    VALUES('Confirmar pagamento: '||NEW.title,NEW.id,NEW.contact_id,'task',CURRENT_DATE+1,'alta',now());
  END IF;
  IF NEW.stage='perdido' AND OLD.stage!='perdido' THEN
    INSERT INTO evo.evolution_tasks(title,deal_id,contact_id,task_type,due_date,priority,created_at)
    VALUES('Analisar motivo da perda: '||NEW.title,NEW.id,NEW.contact_id,'task',CURRENT_DATE+3,'media',now());
  END IF;
  RETURN NEW;
END; $$;

-- 6. fn_monitor_dlq_health + cron 30min
CREATE OR REPLACE FUNCTION public.fn_monitor_dlq_health(p_threshold INT DEFAULT 10)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, evo AS $$
DECLARE v_pending INT; v_oldest TIMESTAMPTZ; v_alert_id UUID;
BEGIN
  SELECT count(*), min(created_at) INTO v_pending, v_oldest FROM evo.evolution_webhook_dlq WHERE status='pending';
  IF v_pending < p_threshold THEN
    UPDATE evo.evolution_alerts SET resolved_at=now(),acknowledged_at=now() WHERE alert_type='dlq_accumulation' AND acknowledged=false AND resolved=false;
    RETURN jsonb_build_object('status','healthy','pending_count',v_pending,'threshold',p_threshold);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM evo.evolution_alerts WHERE alert_type='dlq_accumulation' AND acknowledged=false AND resolved=false) THEN
    INSERT INTO evo.evolution_alerts(alert_type,severity,message,acknowledged,created_at)
    VALUES('dlq_accumulation',CASE WHEN v_pending>100 THEN 'critical' WHEN v_pending>50 THEN 'high' ELSE 'medium' END,
      'DLQ: '||v_pending||' msgs pendentes desde '||v_oldest::timestamptz(0),false,now()) RETURNING id INTO v_alert_id;
    RETURN jsonb_build_object('status','alert_created','pending_count',v_pending,'alert_id',v_alert_id);
  END IF;
  RETURN jsonb_build_object('status','alert_already_open','pending_count',v_pending);
END; $$;

SELECT cron.schedule('monitor-dlq-health','*/30 * * * *','SELECT public.fn_monitor_dlq_health(10)')
WHERE NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='monitor-dlq-health');

-- 7. trg_process_connection_event: NULL state seguro via COALESCE(...,'unknown')
CREATE OR REPLACE FUNCTION public.trg_process_connection_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, evo AS $$
DECLARE v_data JSONB; v_state TEXT; v_inst TEXT; v_key TEXT;
BEGIN
  IF NEW.event_type NOT IN ('connection.update','CONNECTION_UPDATE','status.instance','STATUS_INSTANCE','logout.instance','LOGOUT_INSTANCE') THEN RETURN NEW; END IF;
  v_data  := COALESCE(NEW.payload->'data', NEW.payload);
  v_state := COALESCE(v_data->>'state', v_data->>'status', v_data->>'connection', 'unknown');
  v_inst  := COALESCE(NEW.instance_name, 'wpp2');
  v_key   := 'connection_status_' || v_inst;
  IF NEW.event_type IN ('logout.instance','LOGOUT_INSTANCE') THEN v_state := 'close'; END IF;
  INSERT INTO evo.evolution_settings(id,key,value,category,created_at,updated_at)
  VALUES(gen_random_uuid(),v_key,jsonb_build_object('state',v_state,'instance',v_inst,'event',NEW.event_type,'updated_at',now()),'general',now(),now())
  ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now();
  IF v_state IN ('close','disconnected','close_failure') THEN
    INSERT INTO evo.evolution_alerts(alert_type,severity,remote_jid,message)
    VALUES('connection_lost','critical',NULL,'Instancia '||v_inst||' desconectada: '||v_state) ON CONFLICT DO NOTHING;
  ELSIF v_state IN ('open','connected') THEN
    UPDATE evo.evolution_alerts SET resolved_at=now(),acknowledged_at=now()
    WHERE alert_type='connection_lost' AND acknowledged=false AND resolved=false;
  END IF;
  NEW.processed:=true; NEW.processed_at:=now(); RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_process_connection_event: %', SQLERRM;
  NEW.error_message:=SQLERRM; NEW.processed:=false; RETURN NEW;
END; $$;

COMMIT;
