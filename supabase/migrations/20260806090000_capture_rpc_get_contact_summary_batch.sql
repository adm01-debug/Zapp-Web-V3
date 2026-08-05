-- ============================================================================
-- CAPTURE MIGRATION — zapp.rpc_get_contact_summary_batch
-- ============================================================================
-- Tipo: CAPTURA (versiona o que JÁ EXISTE em produção; não é uma alteração).
--
-- DÍVIDA TÉCNICA (2026-08-05, plano 30 etapas):
--   Esta função foi aplicada DIRETAMENTE no banco de produção, FORA do
--   versionamento de migrations (aparece em types.ts:75865 e é chamada pelo
--   frontend via Supabase RPC). Esta migration apenas REGISTRA a definição
--   viva de produção (coletada via pg_get_functiondef em 2026-08-05), para
--   que o schema versionado volte a refletir a realidade do banco.
--
-- NÃO criar outras migrations para este escopo:
--   * O índice parcial idx_zapp_whisper_unread (contact_id) WHERE is_read=false
--     JÁ EXISTE em zapp.whisper_messages — não criar duplicado.
--   * A função JÁ ESTÁ OTIMIZADA (SQL puro, agregações em 2 CTEs + LEFT JOINs
--     sobre unnest; usa os índices existentes) — não reescrever.
--   * zapp.conversation_tasks.status='pending' é coberto pelo índice existente.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- zapp.rpc_get_contact_summary_batch
-- Caller: frontend (contatos/inbox) — batch de contadores por contato:
--         whispers não lidos + tasks pendentes.
-- Definição copiada literalmente da produção (pg_get_functiondef, 2026-08-05).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.rpc_get_contact_summary_batch(p_contact_ids uuid[])
 RETURNS TABLE(contact_id uuid, unread_whispers integer, pending_tasks integer)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
WITH unread_w AS (
  SELECT contact_id, COUNT(*)::int AS cnt
  FROM zapp.whisper_messages
  WHERE contact_id = ANY(p_contact_ids) AND is_read = false
  GROUP BY contact_id
), pending_t AS (
  SELECT contact_id, COUNT(*)::int AS cnt
  FROM zapp.conversation_tasks
  WHERE contact_id = ANY(p_contact_ids) AND status = 'pending'
  GROUP BY contact_id
)
SELECT ids.id AS contact_id,
       COALESCE(uw.cnt, 0) AS unread_whispers,
       COALESCE(pt.cnt, 0) AS pending_tasks
FROM unnest(p_contact_ids) AS ids(id)
LEFT JOIN unread_w uw ON uw.contact_id = ids.id
LEFT JOIN pending_t pt ON pt.contact_id = ids.id
$function$
;

-- Reforço de privilégios (idempotente): só authenticated (app) e service_role
-- (edge functions / backend) podem executar. anon e PUBLIC ficam bloqueados.
REVOKE ALL ON FUNCTION zapp.rpc_get_contact_summary_batch(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.rpc_get_contact_summary_batch(uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION zapp.rpc_get_contact_summary_batch(uuid[]) IS
'CAPTURA (2026-08-05, plano 30 etapas): função aplicada fora do versionamento em produção e agora registrada em migration. Retorna, por contact_id: unread_whispers (whisper_messages com is_read=false) e pending_tasks (conversation_tasks com status=pending). SQL puro STABLE executado com privilégios do definidor e search_path fixo em zapp. Índices de apoio (idx_zapp_whisper_unread) já existem em produção — nenhum índice novo é criado por esta migration.';
