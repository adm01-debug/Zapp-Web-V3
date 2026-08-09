-- Ligar o modelo de fila (issues #1000/#1001): roteador automatico + dequeue + fila unica.
-- Depende de 20260809179000 (fn_queue_enqueue/dequeue). Aplicado ao vivo 2026-08-09
-- (self-hosted; supabase_apply_migration bugado). Validado em transacao com rollback.
--
-- Comportamento: pg-cron a cada 1min varre contatos SEM agente que tenham inbound
-- <15min OU ja estejam enfileirados; atribui a agente online com folga (menos
-- carregado primeiro); se nenhum disponivel, enfileira em queue_positions.
-- Backlog historico (sem inbound recente e nao enfileirado) fica FORA de escopo.
-- Kill switch: UPDATE zapp.queues SET auto_assign=false WHERE name='Atendimento Geral';
--             ou  SELECT cron.unschedule('queue-autoassign-tick');

-- 1) dequeue on assign (trigger na tabela fisica de contatos)
CREATE OR REPLACE FUNCTION zapp.trg_evocontacts_dequeue_on_assign()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    PERFORM zapp.fn_queue_dequeue(NEW.id);
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_evocontacts_dequeue ON evo.evolution_contacts;
CREATE TRIGGER trg_evocontacts_dequeue
  AFTER UPDATE OF assigned_to ON evo.evolution_contacts
  FOR EACH ROW EXECUTE FUNCTION zapp.trg_evocontacts_dequeue_on_assign();

-- 2) roteador automatico
CREATE OR REPLACE FUNCTION zapp.fn_queue_autoassign_tick(p_limit int DEFAULT 300)
RETURNS TABLE(assigned int, enqueued int) LANGUAGE plpgsql AS $fn$
DECLARE r record; v_agent uuid; v_q uuid; v_a int:=0; v_e int:=0;
BEGIN
  FOR r IN
    SELECT ec.id AS contact_id, q.id AS queue_id
    FROM evo.evolution_contacts ec
    CROSS JOIN LATERAL (
       SELECT id FROM zapp.queues
        WHERE COALESCE(status,'active')='active' AND COALESCE(auto_assign,true) AND COALESCE(is_active,true)
        ORDER BY priority DESC, created_at ASC LIMIT 1
    ) q
    WHERE ec.deleted_at IS NULL AND ec.assigned_to IS NULL
      AND ( ec.id IN (SELECT contact_id FROM zapp.queue_positions)
            OR (ec.last_message_at > now() - interval '15 minutes'
                AND COALESCE(ec.lead_status,'open') NOT IN ('resolved','closed')) )
    LIMIT p_limit
  LOOP
    v_q := r.queue_id;
    SELECT p.user_id INTO v_agent
    FROM zapp.queue_members qm JOIN zapp.profiles p ON p.id=qm.profile_id
    WHERE qm.queue_id=v_q AND COALESCE(qm.is_active,true) AND COALESCE(p.is_active,true) AND COALESCE(p.is_online,false)
      AND ( SELECT count(*) FROM evo.evolution_contacts a WHERE a.assigned_to=p.user_id::text AND COALESCE(a.lead_status,'open') NOT IN ('resolved','closed') )
          < COALESCE(qm.max_simultaneous, p.max_chats, 10)
    ORDER BY ( SELECT count(*) FROM evo.evolution_contacts a WHERE a.assigned_to=p.user_id::text AND COALESCE(a.lead_status,'open') NOT IN ('resolved','closed') ) ASC, random()
    LIMIT 1;
    IF v_agent IS NOT NULL THEN
      UPDATE evo.evolution_contacts SET assigned_to=v_agent::text, queue_id=v_q, updated_at=now() WHERE id=r.contact_id;
      v_a:=v_a+1;
    ELSE
      PERFORM zapp.fn_queue_enqueue(r.contact_id, v_q); v_e:=v_e+1;
    END IF;
    v_agent:=NULL;
  END LOOP;
  RETURN QUERY SELECT v_a, v_e;
END $fn$;

-- 3) fila unica global (idempotente)
INSERT INTO zapp.queues(name, status, auto_assign, is_active, distribution_algorithm, description)
SELECT 'Atendimento Geral','active',true,true,'least_busy','Fila unica - roteamento automatico (#1000/#1001)'
WHERE NOT EXISTS (SELECT 1 FROM zapp.queues WHERE name='Atendimento Geral');

-- 4) membros = agentes ativos (idempotente)
INSERT INTO zapp.queue_members(queue_id, profile_id, is_active)
SELECT q.id, p.id, true
FROM zapp.queues q JOIN zapp.profiles p ON p.role='agent' AND COALESCE(p.is_active,true)
WHERE q.name='Atendimento Geral'
ON CONFLICT (queue_id, profile_id) DO NOTHING;

-- 5) cron 1min
SELECT cron.unschedule('queue-autoassign-tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='queue-autoassign-tick');
SELECT cron.schedule('queue-autoassign-tick','* * * * *','SELECT zapp.fn_queue_autoassign_tick();');
