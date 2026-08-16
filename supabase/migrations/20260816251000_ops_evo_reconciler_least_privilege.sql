-- ============================================================================
-- REPLAY CONVERGENTE — evo-reconcile v5: least-privilege + metrica de cobertura
-- Aplicado em prod 2026-08-16 ~20:20 BRT (Claude/claude.ai, aprovado por Joaquim).
-- Faixa 251* escolhida para NAO colidir com a serie 250* do Agente 2.
--
-- CONTEXTO: o container Swarm `evolution-watchdogs_evo-reconcile` e um WRITER
-- EXTERNO — cruza a fronteira evo<->zapp por fora do banco, logo e invisivel
-- para fn_boundary_audit()/I1. Ate aqui conectava como `postgres` (superuser,
-- BYPASSRLS) e fazia INSERT direto em zapp.evo_reconcile_contact_snapshot.
--
-- MUDANCAS:
--   1) Role `evo_reconciler` (LOGIN, NOSUPERUSER, NOBYPASSRLS, conn limit 3).
--      Sem USAGE em zapp/evo: SELECT e INSERT diretos retornam permission denied.
--      Unico privilegio = EXECUTE nas 2 funcoes abaixo.
--   2) ops.rpc_reconcile_mirror_jids() — expoe os remote_jid do espelho para o
--      calculo de cobertura feito no container (comm evo x mir).
--   3) ops.rpc_reconcile_snapshot(...) — recebe os contadores da Evolution,
--      calcula o lado espelho, aplica thresholds e grava o snapshot.
--      Toda a logica de status vive aqui, nao no shell.
--
-- POR QUE A METRICA MUDOU: o script v4 comparava COUNT(*) total de contatos
-- (src 7.708 x mir 19.000 = +147% permanente) com threshold hardcoded de 500%,
-- o que marcava tudo como `healthy` para sempre. A comparacao e invalida por
-- construcao: a Evolution so tem Contact desde 10/07/2026 enquanto o espelho
-- acumula desde 03/2026, e o espelho guarda 4.432 @lid + 103 grupos + 7
-- broadcast que a Evolution nao persiste em "Contact". Nem janela temporal
-- fecha (7d: 742 x 1.340). Substituido por COBERTURA de remoteJid ausentes no
-- espelho, separando @lid (1.312, pendente de resolucao — esperado) de nao-LID
-- (8, dos quais 3 individuais sao falha real de contacts.upsert). Alerta em
-- missing_nonlid > 10.
--
-- FORA DO REPO (Swarm, documentado aqui para rastreio):
--   secret  pg_supa_url_evo_reconciler_v1
--   config  evo_reconcile_v5_749bd16  (fonte: scripts/decouple/evo-reconcile-v5.sh)
--   stack   evolution-watchdogs v12 (240)
-- ============================================================================

-- 1. Role dedicado (idempotente; senha real vive no secret do Swarm)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'evo_reconciler') THEN
    EXECUTE format(
      'CREATE ROLE evo_reconciler LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS CONNECTION LIMIT 3',
      'CHANGE_ME_VIA_SWARM_SECRET'
    );
    RAISE NOTICE 'evo_reconciler criado com senha placeholder — rotacionar via ALTER ROLE + secret pg_supa_url_evo_reconciler_v1';
  END IF;
END $$;

-- 2. Leitura dos JIDs do espelho (para o calculo de cobertura no container)
CREATE OR REPLACE FUNCTION ops.rpc_reconcile_mirror_jids()
RETURNS TABLE(jid text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'ops', 'pg_catalog'
AS $fn$ SELECT remote_jid FROM zapp.evolution_contacts WHERE instance_name = 'wpp2' $fn$;

REVOKE ALL ON FUNCTION ops.rpc_reconcile_mirror_jids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.rpc_reconcile_mirror_jids() TO evo_reconciler;

-- 3. Boundary de escrita do snapshot (thresholds no SQL, nao no shell)
CREATE OR REPLACE FUNCTION ops.rpc_reconcile_snapshot(
  p_src_msg bigint,
  p_src_contacts bigint,
  p_src_chats bigint,
  p_missing_nonlid bigint,
  p_missing_lid bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'ops', 'pg_catalog'
AS $fn$
DECLARE
  v_mir_msg bigint; v_mir_contact bigint; v_mir_conv bigint; v_gap numeric;
  v_pct_msg numeric; v_status text := 'healthy'; v_erros text := '';
BEGIN
  SELECT count(*) INTO v_mir_msg     FROM zapp.evolution_messages_wpp2;
  SELECT count(*) INTO v_mir_contact FROM zapp.evolution_contacts     WHERE instance_name='wpp2';
  SELECT count(*) INTO v_mir_conv    FROM zapp.evolution_conversations WHERE instance_name='wpp2';
  SELECT COALESCE(ROUND(EXTRACT(EPOCH FROM (now()-max(created_at)))/60),999)
    INTO v_gap FROM zapp.evolution_messages_wpp2;

  v_pct_msg := CASE WHEN p_src_msg>0 THEN round(abs(v_mir_msg-p_src_msg)*100.0/p_src_msg,2) ELSE 0 END;

  IF v_pct_msg > 20 THEN
    v_status:='degraded_sender'; v_erros:='delta_msg='||v_pct_msg||'pct';
  END IF;
  IF p_missing_nonlid > 10 THEN
    v_status:='degraded_sender';
    v_erros:=COALESCE(NULLIF(v_erros,'')||' | ','')||'missing_nonlid='||p_missing_nonlid;
  END IF;
  IF v_gap > 60 THEN
    v_status:='degraded_sender';
    v_erros:=COALESCE(NULLIF(v_erros,'')||' | ','')||'gap='||v_gap||'min';
  END IF;

  INSERT INTO zapp.evo_reconcile_contact_snapshot(instance_name,src_contacts,mir_contacts,status,notes)
  VALUES('wpp2', p_src_contacts, v_mir_contact, v_status,
    format('v5 cobertura: missing_nonlid=%s missing_lid=%s | msg src=%s mir=%s (%s pct) | gap=%smin | chats=%s',
      p_missing_nonlid, p_missing_lid, p_src_msg, v_mir_msg, v_pct_msg, v_gap, p_src_chats));

  RETURN jsonb_build_object(
    'status',v_status,'erros',NULLIF(v_erros,''),
    'mir_msg',v_mir_msg,'mir_contacts',v_mir_contact,'mir_conv',v_mir_conv,
    'gap_min',v_gap,'pct_msg',v_pct_msg,
    'missing_nonlid',p_missing_nonlid,'missing_lid',p_missing_lid);
END $fn$;

REVOKE ALL ON FUNCTION ops.rpc_reconcile_snapshot(bigint,bigint,bigint,bigint,bigint) FROM PUBLIC;
GRANT USAGE ON SCHEMA ops TO evo_reconciler;
GRANT EXECUTE ON FUNCTION ops.rpc_reconcile_snapshot(bigint,bigint,bigint,bigint,bigint) TO evo_reconciler;

-- 4. Guard: o role NAO pode ter acesso direto aos schemas de dados
DO $$
BEGIN
  IF has_schema_privilege('evo_reconciler','zapp','USAGE')
     OR has_schema_privilege('evo_reconciler','evo','USAGE') THEN
    RAISE EXCEPTION 'evo_reconciler nao deve ter USAGE em zapp/evo (least-privilege violado)';
  END IF;
END $$;
