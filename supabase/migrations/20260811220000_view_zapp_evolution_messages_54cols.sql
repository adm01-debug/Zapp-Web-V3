-- ============================================================================
-- 20260811220000_view_zapp_evolution_messages_54cols.sql
-- Frente B — MENSAGENS: view zapp.evolution_messages defasada (41 colunas) vs
-- evo.evolution_messages (54 colunas). O handler do webhook insere com as
-- colunas novas (media_bucket, ingest_meta, ...) → PGRST204 no schema cache do
-- PostgREST → mensagens NÃO gravam (erros "[FROM_ME] Error inserting" / "Error
-- inserting message" no supabase_functions).
--
-- Fix: CREATE OR REPLACE VIEW com SELECT * (herda TODAS as colunas atuais da
-- tabela — nunca mais defasa). 100% ADDITIVE: as 41 colunas antigas continuam
-- no mesmo shape; as 13 novas são adicionadas. security_invoker mantido (a
-- tabela evo tem RLS; service_role/authenticated seguem o contrato atual).
--
-- Rollback: CREATE OR REPLACE VIEW zapp.evolution_messages WITH
-- (security_invoker = on) AS SELECT <as 41 colunas originais> FROM
-- evo.evolution_messages; (a definição original está na migration que criou a
-- view; o cache do PostgREST recarrega via restart do supabase_rest).
-- ============================================================================

CREATE OR REPLACE VIEW zapp.evolution_messages
WITH (security_invoker = on)
AS
SELECT * FROM evo.evolution_messages;
