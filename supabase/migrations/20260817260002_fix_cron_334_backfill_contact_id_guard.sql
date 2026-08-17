-- =============================================================================
-- FIX CRON 334 — backfill-contact-id-ongoing (guard idempotente)
-- 2026-08-17 | audit 20260816 | SIM-4
--
-- PROBLEMA (CRON_FAILURES_7D §3.5): corpo antigo de evo.fn_backfill_contact_id
--   com alias "ec" fora de escopo em UPDATE..FROM(subquery) -> missing
--   FROM-clause entry for table "ec" + deadlock detected (A6).
--
-- ESTADO ATUAL:
--   * Corpo JÁ CORRIGIDO no repo: 20260816141000_decouple_i1_i2_fix2.sql
--     (alias ec2 + ctid + FOR UPDATE OF m2 SKIP LOCKED) — nada a fazer aqui.
--   * Corpo em prod CONFERIDO 17:45Z: ec2 presente, SKIP LOCKED presente,
--     alias antigo ausente (pg_proc.prosrc) — fix2 aplicado.
--   * Comando vivo em prod: SELECT evo.fn_backfill_contact_id(5000)
--     (já o formato-alvo — conferido via cron.job 17:45Z).
--
-- ESTA MIGRATION: guard idempotente (padrão A — preserva jobid 334).
--   Re-run = UPDATE 0 (comando já no formato-alvo).
-- =============================================================================

UPDATE cron.job
SET command = 'SELECT evo.fn_backfill_contact_id(5000)'
WHERE jobid = 334
  AND command NOT LIKE 'SELECT evo.fn_backfill_contact_id%';
