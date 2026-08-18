-- ============================================================================
-- SLA AGREGADO (2026-08-19) — zapp.rpc_sla_timeline_aggregate
-- ----------------------------------------------------------------------------
-- RPC leve de timeline SLA: substitui o fetch de 500 mensagens por conversa
-- (rpc_list_messages_lite + cálculo no hook useConversationSLATimeline) por
-- UMA agregação com MIN/MAX FILTER + COUNT(*) em uma única varredura usando o
-- índice existente (remote_jid, created_at DESC) das partições de
-- evo.evolution_messages (raiz física; zapp.evolution_messages é view
-- pass-through 1:1 — mesmo FROM da rpc_list_messages_lite).
--
-- Semântica replicada EXATAMENTE do hook (src/hooks/useConversationManagement.ts):
--   first_inbound_at  = MIN(created_at) FILTER (from_me = false OR direction = 'inbound')
--   first_outbound_at = MIN(created_at) FILTER (from_me = true  OR direction = 'outbound')
--   last_message_at   = MAX(created_at)
--   total_messages    = COUNT(*)  (hoje o hook via limit 500 → min(500, real))
-- WHERE espelhado da rpc_list_messages_lite: remote_jid = $1 [AND instance_name = $2]
--   AND deleted_at IS NULL. p_instance opcional (DEFAULT NULL) p/ partition
--   pruning — mesma convenção da rpc_list_messages_lite.
--
-- MUDANÇA SEMÂNTICA INTENCIONAL (documentar no relatório p/ o dono do SLA):
--   conversas com >500 msgs (110 em produção) tinham first_inbound/outbound
--   APROXIMADOS (janela das últimas 500). O agregado acha o first_* REAL →
--   firstContactAt/firstResponseAt/awaitingMs/totalMessages podem mudar
--   (mais corretos). Ex. medido: maior conversa (12.895 msgs) → first_inbound
--   real 2026-05-04T17:05 vs aproximado (últimas 500) 2026-08-05T20:59 (~3 meses).
--
-- NULL handling: created_at/remote_jid/instance_name são NOT NULL (pg_attribute)
-- → MIN/MAX nunca operam sobre NULL. from_me/direction são NULL-able e o FILTER
-- replica o JS (`m.from_me === false || m.direction === 'inbound'`): NULLs não
-- casam em nenhum dos dois filtros, igual ao hook.
--
-- Perf medida (EXPLAIN ANALYZE, 18/08): 24,6ms no pior caso (12.895 msgs, bitmap
-- scan via evolution_messages_wpp2_remote_jid_created_at_idx + filter heap);
-- ~1-7ms em conversas típicas/vazias. Sempre 1 linha (agregado sem GROUP BY).
-- ============================================================================
CREATE OR REPLACE FUNCTION zapp.rpc_sla_timeline_aggregate(
  p_remote_jid text,
  p_instance text DEFAULT NULL::text
)
 RETURNS TABLE (
   first_inbound_at  timestamp with time zone,
   first_outbound_at timestamp with time zone,
   last_message_at   timestamp with time zone,
   total_messages    bigint
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_temp'
AS $function$
BEGIN
  PERFORM zapp.fn_require_app_user();

  IF p_instance IS NOT NULL THEN
    RETURN QUERY
      SELECT MIN(created_at) FILTER (WHERE from_me = false OR direction = 'inbound'),
             MIN(created_at) FILTER (WHERE from_me = true  OR direction = 'outbound'),
             MAX(created_at),
             COUNT(*)
      FROM zapp.evolution_messages
      WHERE remote_jid    = p_remote_jid
        AND instance_name = p_instance
        AND deleted_at   IS NULL;
  ELSE
    RETURN QUERY
      SELECT MIN(created_at) FILTER (WHERE from_me = false OR direction = 'inbound'),
             MIN(created_at) FILTER (WHERE from_me = true  OR direction = 'outbound'),
             MAX(created_at),
             COUNT(*)
      FROM zapp.evolution_messages
      WHERE remote_jid  = p_remote_jid
        AND deleted_at IS NULL;
  END IF;
END;
$function$;

-- Reforço de privilégios (idempotente): só authenticated (app) e service_role.
REVOKE ALL ON FUNCTION zapp.rpc_sla_timeline_aggregate(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.rpc_sla_timeline_aggregate(text, text) TO authenticated, service_role;

-- ROLLBACK:
--   DROP FUNCTION zapp.rpc_sla_timeline_aggregate(text, text);
--   (nenhum índice/objeto novo foi criado — reverter é só dropar a função)
