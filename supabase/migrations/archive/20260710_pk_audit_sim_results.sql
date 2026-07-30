-- ============================================================
-- MIGRATION: 20260710_pk_audit_sim_results.sql
-- Bug encontrado durante testes exaustivos finais:
-- public._audit_sim_results criada sem PRIMARY KEY
-- (tabela de resultados de simulacao criada automaticamente)
--
-- Causa: pk_integrity dimensao detectou 1 tabela sem PK
-- Score: 98.8/A+ (158/160) → 100.0/A+ (160/160)
--
-- Fix: adicionar coluna id BIGINT GENERATED ALWAYS AS IDENTITY
-- como PK surrogate (natural key battery+test_id tem duplicatas
-- por ser tabela de multiplas execucoes de simulacoes)
-- ============================================================

-- FIX: adicionar PK surrogate na tabela de simulacoes
ALTER TABLE public._audit_sim_results
  ADD COLUMN IF NOT EXISTS id bigint GENERATED ALWAYS AS IDENTITY;

ALTER TABLE public._audit_sim_results
  ADD CONSTRAINT _audit_sim_results_pkey PRIMARY KEY (id);

-- VERIFICACAO POS-FIX
SELECT
  (SELECT COUNT(*)=0 FROM information_schema.tables t
   WHERE t.table_schema IN ('evo','zapp','public') AND t.table_type='BASE TABLE'
   AND NOT EXISTS(SELECT 1 FROM information_schema.table_constraints tc
     WHERE tc.table_schema=t.table_schema AND tc.table_name=t.table_name
     AND tc.constraint_type='PRIMARY KEY')) AS zero_tables_no_pk,
  (fn_system_health_score()->'breakdown'->'pk_integrity'->>'score')::int = 5 AS pk_5pts,
  (fn_system_health_score()->>'score')::numeric = 100.0 AS score_100;
-- Esperado: todos true
