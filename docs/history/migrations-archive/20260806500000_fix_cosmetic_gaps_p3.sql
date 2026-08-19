-- Migration: fix_cosmetic_gaps_p3
-- Applied: 2026-08-06T11:07:57.230Z
-- Recovery: recriado 2026-08-07 (arquivo ausente — C-2 AUDIT_REPORT_2026-08-06.md)
-- Contexto: fixes cosmeticos parte 3 — ajustes de comentarios, COMMENT ON e
-- correcoes de nomenclatura. Conteudo exato nao recuperavel de pg_catalog
-- (DDL de comentarios nao deixa rastro recuperavel). Migration aplicada com
-- sucesso em producao conforme schema_migrations (versao 20260806500000).
SELECT 1; -- migration documental: sem DDL executavel
