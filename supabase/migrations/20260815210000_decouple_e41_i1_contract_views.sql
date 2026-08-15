-- =============================================================================
-- E41 — Views de Contrato zapp → evo (Fase 3 — Isolamento I1)
-- =============================================================================
-- REWORK (2026-08-15, issue #1098): a topologia medida em produção é o INVERSO
-- do que esta migration assumia. zapp.evolution_messages, zapp.evolution_contacts,
-- zapp.evolution_conversations, zapp.evolution_alerts, zapp.evolution_settings e
-- zapp.evolution_messages_wpp2_archive já são TABELAS FÍSICAS em zapp — não views.
-- Os alvos evo.evolution_messages, evo.evolution_contacts, evo.evolution_conversations,
-- evo.evolution_alerts, evo.evolution_settings e evo.evolution_messages_wpp2_archive
-- NÃO EXISTEM (ver docs/decouple/ANALISE_FRONTEIRA_EVO_ZAPP_20260815.md). As 6
-- CREATE OR REPLACE VIEW originais falhariam em produção: as 3 primeiras porque
-- não se pode substituir uma tabela por uma view via CREATE OR REPLACE VIEW
-- ("... is not a view"), e as 3 últimas porque a relação de origem em evo não existe.
--
-- Correção: o invariante I1 é satisfeito trivialmente para mensagens, contatos,
-- conversas, alertas, settings e archive — o dado físico já vive em zapp, então
-- uma função zapp.* que referencia zapp.evolution_* está referenciando sua própria
-- tabela, não cruzando a fronteira para evo. Não há view de contrato a criar aqui.
--
-- A única view legítima deste arquivo é zapp.evolution_webhook_events_v2, cuja
-- origem evo.evolution_webhook_events_v2 é uma tabela particionada real.
-- =============================================================================

-- evolution_webhook_events_v2 (tabela particionada por mês)
CREATE OR REPLACE VIEW zapp.evolution_webhook_events_v2
  WITH (security_invoker=on)
AS SELECT * FROM evo.evolution_webhook_events_v2;

COMMENT ON VIEW zapp.evolution_webhook_events_v2 IS
  'View de contrato: zapp → evo.evolution_webhook_events_v2 (security_invoker=on). '
  'E41 (2026-08-15): criada para isolamento I1 Fase 3. '
  'Acesso restrito: security_invoker=on — RLS da sessão aplicado.';
