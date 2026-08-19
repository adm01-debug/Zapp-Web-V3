-- ESPELHO repo×DB — migration aplicada via MCP (supabase_apply_migration) na auditoria Hermes 2026-08-06/07.
-- Registro em supabase_migrations.schema_migrations; este arquivo é o registro histórico (DB-as-source).
-- ARQ-02 (P1) D1: extensao unaccent movida de public para extensions.
ALTER EXTENSION unaccent SET SCHEMA extensions;
-- Validacao pos-move: operadores/funcoes da extensao testados (ver onda2-01-extensoes).
