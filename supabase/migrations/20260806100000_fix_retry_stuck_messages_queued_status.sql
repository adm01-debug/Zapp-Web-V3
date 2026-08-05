-- ============================================================================
-- FIX — zapp.fn_retry_stuck_messages: status 'queued' viola CHECK das partições
-- ============================================================================
-- Tipo: FIX (correção de bug ATIVO em produção — cron job 5, a cada 10 min).
--
-- BUG (observado em produção, 2026-08-05):
--   A cada ciclo do cron job 5 (SELECT zapp.fn_retry_stuck_messages()) eram
--   emitidos ~25 WARNINGs:
--     '[fn_retry_stuck_messages] failed to retry message id=...: new row for
--      relation evolution_messages_wpp2 violates check constraint
--      ...status_check'
--   As mensagens presas (status='pending' há >10 min) NUNCA recuperavam:
--   o UPDATE falhava (violação de CHECK), o EXCEPTION capturava, emitia
--   WARNING e a linha permanecia intacta — retry_attempt nunca incrementava.
--
-- CAUSA RAIZ (evidenciada no banco):
--   1. evo.evolution_messages é tabela PARTICIONADA (relkind 'p') com 23
--      partições filhas (wpp2, default, financeiro, compras, logistica,
--      marketing, comercial_01..15, artes, gravacao).
--   2. Todas as partições carregam o CHECK evolution_messages_status_check
--      que permite APENAS: received, sent, delivered, read, deleted, pending,
--      played, failed — domínio real do Evolution.
--   3. A função setava:
--        status = CASE WHEN v_has_enq THEN 'pending' ELSE 'queued' END
--      Como zapp.fn_enqueue_message_dispatch NÃO EXISTE em produção
--      (SELECT em pg_proc = 0 linhas), v_has_enq = false e TODA mensagem do
--      lote era atualizada para 'queued' → violação do CHECK → WARNING.
--   4. SELECT DISTINCT status em evo.evolution_messages (parent, cobre todas
--      as partições): 0 linhas com 'queued'. A constraint reflete o domínio
--      real; o estado 'queued' é inválido para o modelo Evolution.
--
-- DECISÃO (blast radius mínimo): corrigir a FUNÇÃO, NÃO a constraint.
--   A função agora mantém status = 'pending' (estado válido e de origem):
--   sem dispatcher presente, a mensagem permanece elegível para retry até o
--   limite de retry_attempt < 3, sem nunca gravar estado inválido. Quando
--   fn_enqueue_message_dispatch existir, o fluxo de re-enfileiramento
--   ('pending' + PERFORM fn_enqueue) é preservado intacto.
-- ============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_retry_stuck_messages()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'zapp', 'evo', 'public'
AS $function$
DECLARE
  v_count   INTEGER := 0;
  r         RECORD;
  v_has_enq BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'fn_enqueue_message_dispatch'
  ) INTO v_has_enq;

  FOR r IN
    SELECT id, instance_name, remote_jid,
           COALESCE(retry_attempt, 0) AS attempt
      FROM evo.evolution_messages
     WHERE status        = 'pending'
       AND updated_at    < NOW() - INTERVAL '10 minutes'
       AND (retry_attempt IS NULL OR retry_attempt < 3)
     ORDER BY updated_at
     LIMIT 100
     FOR UPDATE SKIP LOCKED  -- anti-double-processing: execuções concorrentes
                             -- do cron pulam linhas já bloqueadas (achado A3)
  LOOP
    BEGIN
      UPDATE evo.evolution_messages
         SET retry_attempt = r.attempt + 1,
             updated_at    = NOW(),
             status        = 'pending'  -- FIX (2026-08-06): 'queued' NÃO é
                                        -- status válido no CHECK das
                                        -- partições (evolution_messages_
                                        -- status_check permite apenas:
                                        -- received, sent, delivered, read,
                                        -- deleted, pending, played, failed).
                                        -- Sem dispatcher, mantém 'pending'
                                        -- (elegível até 3 tentativas).
       WHERE id = r.id;

      IF v_has_enq THEN
        PERFORM zapp.fn_enqueue_message_dispatch(r.id, r.instance_name);
      END IF;

      v_count := v_count + 1;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[fn_retry_stuck_messages] failed to retry message id=%: %', r.id, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$function$
;

COMMENT ON FUNCTION zapp.fn_retry_stuck_messages() IS
'FIX (2026-08-06, AG-EX-06): função passou a manter status="pending" ao tentar recuperar mensagens presas — antes gravava "queued" quando zapp.fn_enqueue_message_dispatch não existia, violando o CHECK evolution_messages_status_check das partições de evo.evolution_messages (status válidos: received, sent, delivered, read, deleted, pending, played, failed) e gerando ~25 WARNINGs por ciclo no cron job 5. Sem dispatcher, a mensagem permanece elegível para retry (retry_attempt < 3).';
