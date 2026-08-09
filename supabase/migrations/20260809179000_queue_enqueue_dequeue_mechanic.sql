-- Mecanismo de fila de espera: enqueue/dequeue de zapp.queue_positions.
-- Produtor da fila (issues #1000/#1001). Funcoes INERTES: ainda nao ligadas a
-- gatilho automatico. O wiring (trigger de dequeue em evo.evolution_contacts,
-- roteador automatico de inbound, cron queue-rebalance) vem em migracao separada
-- apos definicao de config de filas/membros/regras.
-- Aplicado ao vivo em 2026-08-09 (self-hosted; supabase_apply_migration bugado).

-- invariante: um contato espera em no maximo uma fila
ALTER TABLE zapp.queue_positions
  ADD CONSTRAINT queue_positions_contact_uniq UNIQUE (contact_id);

CREATE OR REPLACE FUNCTION zapp.fn_queue_dequeue(p_contact_id uuid)
RETURNS boolean LANGUAGE plpgsql AS $fn$
DECLARE v_queue uuid; v_pos integer;
BEGIN
  SELECT queue_id, position INTO v_queue, v_pos
    FROM zapp.queue_positions WHERE contact_id = p_contact_id;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM zapp.queue_positions WHERE contact_id = p_contact_id;
  UPDATE zapp.queue_positions SET position = position - 1
   WHERE queue_id = v_queue AND position > v_pos;
  RETURN true;
END $fn$;

CREATE OR REPLACE FUNCTION zapp.fn_queue_enqueue(p_contact_id uuid, p_queue_id uuid)
RETURNS integer LANGUAGE plpgsql AS $fn$
DECLARE v_pos integer; v_cur_queue uuid;
BEGIN
  IF p_contact_id IS NULL OR p_queue_id IS NULL THEN
    RAISE EXCEPTION 'contact_id e queue_id obrigatorios';
  END IF;
  SELECT queue_id, position INTO v_cur_queue, v_pos
    FROM zapp.queue_positions WHERE contact_id = p_contact_id;
  IF FOUND THEN
    IF v_cur_queue = p_queue_id THEN RETURN v_pos;
    ELSE PERFORM zapp.fn_queue_dequeue(p_contact_id); END IF;
  END IF;
  SELECT COALESCE(MAX(position),0)+1 INTO v_pos
    FROM zapp.queue_positions WHERE queue_id = p_queue_id;
  INSERT INTO zapp.queue_positions(contact_id, queue_id, position, entered_at, created_at, notified)
  VALUES (p_contact_id, p_queue_id, v_pos, now(), now(), false);
  RETURN v_pos;
END $fn$;

COMMENT ON FUNCTION zapp.fn_queue_enqueue(uuid,uuid) IS 'Enfileira contato em queue_positions (FIFO, idempotente, 1 fila por contato). Produtor da fila de espera - issues #1000/#1001. Ainda NAO ligado a gatilho automatico.';
COMMENT ON FUNCTION zapp.fn_queue_dequeue(uuid) IS 'Remove contato de queue_positions e renumera. Contraparte do enqueue - chamar quando o contato e atribuido.';
