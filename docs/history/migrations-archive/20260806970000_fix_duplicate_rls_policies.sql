-- ============================================================================
-- FIX GAP-RLS — Políticas RLS duplicadas em queues, sla_history, team_message_receipts
-- ============================================================================
-- Tipo: FIX DE CONSISTÊNCIA / SEGURANÇA PREVENTIVA
--
-- PROBLEMA:
--   Migrações anteriores criaram políticas RLS com condições idênticas em tabelas
--   diferentes, duplicando regras sem impacto funcional imediato mas causando:
--     1. Ambiguidade na leitura do modelo de segurança
--     2. Avaliação redundante de condições pelo planner do PG
--     3. Risco de divergência futura (editar uma e esquecer a outra)
--
-- DUPLICATAS CONFIRMADAS (auditoria 2026-08-06, Agente 5):
--
--   zapp.queues — 3 SELECT idênticos para 'authenticated', USING true:
--     authenticated_read_queues (mantida — mais descritiva)
--     q_select       → REMOVER
--     queues_select  → REMOVER
--
--   zapp.sla_history — 3 pares duplicados (PUBLIC, mesma condição):
--     sla_history_insert / sla_hist_insert  → REMOVER sla_hist_insert
--     sla_history_select / sla_hist_select  → REMOVER sla_hist_select
--     sla_history_update / sla_hist_update  → REMOVER sla_hist_update
--
--   zapp.team_message_receipts — INSERT duplicado (PUBLIC, auth.uid() IS NOT NULL):
--     team_receipts_insert / receipts_insert → REMOVER receipts_insert
--
-- BUG ADICIONAL em team_message_receipts.receipts_update (detectado nesta auditoria):
--   USING clause usa `profiles.id = auth.uid()` em vez de `profiles.user_id = auth.uid()`.
--   A coluna `profiles.id` é a PK (gerada), não o user_id do Supabase Auth.
--   A policy irmã `team_receipts_select` usa corretamente `p.user_id = auth.uid()`.
--   CORREÇÃO: Recriar receipts_update com a subquery corrigida.
--   NOTE: team_receipts_update (USING: auth.uid() IS NOT NULL) permanece e já cobre
--   a permissividade; receipts_update passa a ser a guardrail específica por perfil.
--
-- Detectado em: auditoria exaustiva 5 agentes — 2026-08-06
-- ============================================================================

-- ─── 1: Remover SELECTs duplicados em queues ─────────────────────────────────
-- Mantida: authenticated_read_queues (SELECT TO authenticated USING true)
DROP POLICY IF EXISTS q_select      ON zapp.queues;
DROP POLICY IF EXISTS queues_select ON zapp.queues;

-- ─── 2: Remover políticas duplicadas em sla_history ──────────────────────────
-- Mantidas: sla_history_insert / sla_history_select / sla_history_update
DROP POLICY IF EXISTS sla_hist_insert ON zapp.sla_history;
DROP POLICY IF EXISTS sla_hist_select ON zapp.sla_history;
DROP POLICY IF EXISTS sla_hist_update ON zapp.sla_history;

-- ─── 3: Remover INSERT duplicado em team_message_receipts ────────────────────
-- Mantida: team_receipts_insert
DROP POLICY IF EXISTS receipts_insert ON zapp.team_message_receipts;

-- ─── 4: Corrigir receipts_update (bug: profiles.id em vez de profiles.user_id) ──
-- A versão anterior: profile_id = (SELECT profiles.id FROM zapp.profiles WHERE profiles.id = auth.uid())
-- Correto:           profile_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
DROP POLICY IF EXISTS receipts_update ON zapp.team_message_receipts;

CREATE POLICY receipts_update ON zapp.team_message_receipts
  FOR UPDATE
  TO authenticated
  USING (
    profile_id = (
      SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()
    )
  );

COMMENT ON TABLE zapp.team_message_receipts IS
'Tabela de recibos de leitura de mensagens de equipe. RLS ativo.
Policies após FIX GAP-RLS (2026-08-06):
  receipts_select      — SELECT PUBLIC, USING (auth.uid() IS NOT NULL) [acesso amplo]
  team_receipts_select — SELECT authenticated, USING (own profile OR admin)
  receipts_insert      — REMOVIDA (duplicata de team_receipts_insert)
  team_receipts_insert — INSERT PUBLIC, WITH CHECK (auth.uid() IS NOT NULL)
  receipts_update      — UPDATE authenticated, USING (own profile via user_id) [CORRIGIDA: era profiles.id=auth.uid()]
  team_receipts_update — UPDATE PUBLIC, USING (auth.uid() IS NOT NULL)';

COMMENT ON TABLE zapp.queues IS
'Tabela de filas de atendimento. RLS ativo.
Policies após FIX GAP-RLS (2026-08-06):
  authenticated_read_queues — SELECT authenticated, USING true [mantida]
  q_select, queues_select   — REMOVIDAS (duplicatas idênticas)
  queues_admin_write        — ALL authenticated, USING is_admin_or_supervisor()
  q_service                 — ALL service_role, USING true';

COMMENT ON TABLE zapp.sla_history IS
'Tabela de histórico de SLA. RLS ativo.
Policies após FIX GAP-RLS (2026-08-06):
  sla_history_insert — INSERT PUBLIC, WITH CHECK (auth.uid() IS NOT NULL) [mantida]
  sla_history_select — SELECT PUBLIC, USING (auth.uid() IS NOT NULL) [mantida]
  sla_history_update — UPDATE PUBLIC, USING (auth.uid() IS NOT NULL) [mantida]
  sla_hist_insert, sla_hist_select, sla_hist_update — REMOVIDAS (duplicatas)';
