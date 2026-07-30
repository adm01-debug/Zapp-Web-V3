-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260730000000_baseline_schema.sql
-- Purpose  : Baseline documental do estado atual do schema.
--
-- Contexto:
--   O projeto ZAPP-WEB nasceu no Lovable (Supabase Cloud) e migrou para
--   Supabase self-hosted (VPS AtomicaBR) via dump/restore em 2026-07-16.
--   O dump criou todos os objetos no DB, mas não registrou as migrations.
--
--   Em 2026-07-30, 967 migrations antigas foram arquivadas em
--   supabase/migrations/archive/. As 53 migrations restantes são as que
--   foram efetivamente aplicadas e registradas em supabase_migrations.
--
--   Esta migration baseline documenta o estado atual do schema para
--   referência futura. NÃO contém DDL executável — os objetos já existem.
--
-- Schemas:
--   zapp (321 tables, 406 views, 701 RLS policies)  — app canônico
--   evo  (189 tables, 16 views, 411 RLS policies)   — Evolution/WhatsApp
--   public (1 table, 539 views)                       — camada de API
--   financeiro (16 tables), vendas (14), email_app (33), ai (31),
--   bpm (41), ops (20), archive (25), artes (2), logistica (3)
--
-- Migrations ativas (53 arquivos):
--   - 16/07/2026: schema hardening v1-v6, fix public→zapp, RLS hardening
--   - 17/07/2026: fix DLQ RPCs, missing functions, schema hardening v4-v6
--   - 20/07/2026: fix settings realtime publication
--   - 24/07/2026: evo schema housekeeping, realtime publications,
--                 evolution_sentiment_analysis, secdef hardening
--   - 27/07/2026: QA round 2-3, contacts idx, pipeline health RPCs,
--                 backfill contact_id, secdef hardening, webhook idx
--   - 28/07/2026: DDL event trigger, autofix schemas, rate limit guards,
--                 explicit policies, pgbouncer hardening
--   - 29/07/2026: drop FKs evo→zapp, secdef hardening (6+106+7),
--                 reactivate cron analytics-log-retention
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- Esta migration é puramente documental. Todos os objetos já existem
-- no DB self-hosted. Nenhum DDL é executado.

DO $$
BEGIN
  RAISE NOTICE 'Baseline 2026-07-30: schema documentado em 53 migrations ativas + 967 arquivadas em archive/.';
END $$;