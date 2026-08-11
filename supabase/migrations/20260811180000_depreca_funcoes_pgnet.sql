-- ============================================================================
-- 20260811180000_depreca_funcoes_pgnet.sql
-- DEPRECAÇÃO das funções evo que dependiam do transporte pg_net (sem headers)
-- ----------------------------------------------------------------------------
-- POR QUÊ:
--   1. evo.fn_sync_groups_from_api(text, integer) — backfill de grupos via
--      pg_net/http. Substituída pela edge function `evolution-group-sync`
--      (PR #1030), disparada pelo cron pg_cron 476 (`sync-groups-daily`,
--      04:10 UTC) via extensions.http_post com headers de autorização.
--   2. evo.fn_check_whatsapp_numbers(integer) — lote IsOnWhatsApp via pg_net.
--      Substituída pela MESMA edge function `evolution-group-sync`, disparada
--      pelo cron pg_cron 477 (`check-whatsapp-numbers`, a cada 15 min).
--   Ambas usavam o transporte pg_net que NÃO enviava headers de autorização
--   (401 na Evolution API) — orfandade confirmada por auditoria prévia (C1).
--   Histórico completo das funções permanece no git (commits de 2026-08-11:
--   20260811130000_grupos.sql / 20260811140000_status_contato.sql).
--
-- NÃO DROPADO:
--   - evo.evolution_instance_credentials (tabela de credenciais) — pode ser
--     usada por outro fluxo; mantida intacta.
--
-- IDEMPOTÊNCIA: DROP FUNCTION IF EXISTS — segura para re-execução.
-- Validado em produção 2026-08-11 via transação com ROLLBACK forçado:
--   antes = (OID 1579052, OID 1579132) | após DROP = (NULL, NULL)
--   pós-ROLLBACK = ambas restauradas (count = 2).
-- ============================================================================

DROP FUNCTION IF EXISTS evo.fn_sync_groups_from_api(text, integer);
DROP FUNCTION IF EXISTS evo.fn_check_whatsapp_numbers(integer);
