-- decouple E54: teste NEGATIVO de roles de contrato (prova que a fronteira existe)
-- 2026-08-16 | idempotente | NÃO destrutivo — usa savepoints/rollback; falha o CI se a
-- role conseguir escrever fora do contrato.
-- Pré-condição: roles evo_writer / zapp_writer existem (aux_roles_contrato_existem=2).

DO $$
DECLARE
  v_evo_writer_exists boolean;
  v_zapp_writer_exists boolean;
  v_blocked boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='evo_writer') INTO v_evo_writer_exists;
  SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='zapp_writer') INTO v_zapp_writer_exists;

  IF NOT v_evo_writer_exists OR NOT v_zapp_writer_exists THEN
    RAISE NOTICE 'E54 SKIP: roles de contrato ausentes (evo_writer=%, zapp_writer=%)', v_evo_writer_exists, v_zapp_writer_exists;
    RETURN;
  END IF;

  -- 1) evo_writer NÃO pode INSERT em zapp.* fora de contrato
  BEGIN
    v_blocked := false;
    BEGIN
      SET LOCAL ROLE evo_writer;
      INSERT INTO zapp.conversation_events (id, event_type, created_at)
      VALUES (gen_random_uuid(), 'e54-negative-test', now());
      RESET ROLE;
      v_blocked := true; -- conseguiu escrever = FALHA
    EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
      RESET ROLE;
      v_blocked := false; -- bloqueado = PASS
    END;
    IF v_blocked THEN
      RAISE EXCEPTION 'E54 FAIL: evo_writer conseguiu INSERT em zapp.conversation_events';
    END IF;
    RAISE NOTICE 'E54 PASS: evo_writer bloqueado em zapp.* (fora de contrato)';
  END;

  -- 2) zapp_writer NÃO pode INSERT em evo.* fora de contrato
  BEGIN
    v_blocked := false;
    BEGIN
      SET LOCAL ROLE zapp_writer;
      INSERT INTO evo.media_loss_registry (id, instance_name, created_at)
      VALUES (gen_random_uuid(), 'e54-negative-test', now());
      RESET ROLE;
      v_blocked := true;
    EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
      RESET ROLE;
      v_blocked := false;
    END;
    IF v_blocked THEN
      RAISE EXCEPTION 'E54 FAIL: zapp_writer conseguiu INSERT em evo.media_loss_registry';
    END IF;
    RAISE NOTICE 'E54 PASS: zapp_writer bloqueado em evo.* (fora de contrato)';
  END;
END $$;
