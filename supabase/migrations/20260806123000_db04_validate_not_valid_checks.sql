-- ============================================================================
-- Migration: db04 - Validar CHECK constraints NOT VALID de schemas de app
-- Versão:    20260806123000
-- Data:      2026-08-06 12:30
-- Objetivo:  Promover de NOT VALID para VALIDATED as 3 CHECK constraints de
--            schemas de aplicação (vendas/financeiro) que foram criadas como
--            NOT VALID na migração de hardening (db03) para evitar lock
--            prolongado em produção.
--
-- Pré-check executado (todas com 0 violações em 2026-08-06):
--   SELECT count(*) FROM vendas.ordens_compra
--     WHERE ncm IS NOT NULL AND ncm !~ '^[0-9]{8}$';                     -- 0
--   SELECT count(*) FROM financeiro.notas_fiscais
--     WHERE tipo_nota NOT IN ('VENDA','FATURAMENTO','SIMPLES_REMESSA',
--                             'REMESSA','DEVOLUCAO');                    -- 0
--   SELECT count(*) FROM financeiro.notas_fiscais
--     WHERE status NOT IN ('PENDENTE','PROCESSANDO','EMITIDA','ERRO',
--                          'CANCELADA');                                 -- 0
--
-- NOTA: a constraint realtime.messages.messages_payload_exclusive pertence ao
-- schema de PLATAFORMA (realtime) e NÃO é tocada por esta migration.
-- ============================================================================

-- Tabelas pequenas (ordens_compra ~1.4MB, notas_fiscais ~368KB): VALIDATE é
-- rápido (apenas varredura leve) e não bloqueia escrita de forma prolongada.

ALTER TABLE vendas.ordens_compra VALIDATE CONSTRAINT chk_ncm_formato;

ALTER TABLE financeiro.notas_fiscais VALIDATE CONSTRAINT chk_tipo_nota_v2;

ALTER TABLE financeiro.notas_fiscais VALIDATE CONSTRAINT chk_status_v2;
