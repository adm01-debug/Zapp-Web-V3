-- ============================================================
-- MIGRATION: 20260710_validation_round_fixes.sql
-- 3 degradações REAIS descobertas na rodada de validação exaustiva
--
-- Bug 1 (CRÍTICO SEGURANÇA): anon com grants FULL em 2 novas tabelas zapp
--   zapp.agent_achievements + zapp.agent_installed_skills criadas com
--   SELECT/INSERT/UPDATE/DELETE para anon — violação hardening v6.1.1
--   (RLS estava ON com policies via trigger, mas grants diretos anulam defesa em camadas)
--   Fix: REVOKE ALL FROM anon
--
-- Bug 2: cron vacuum-messages-wpp2-2h com 2 statements
--   pg_cron envolve multiplos statements em transacao →
--   "VACUUM cannot run inside a transaction block"
--   Fix: recriado como 2 jobs de statement unico
--   (vacuum-messages-wpp2-2h :25 + vacuum-contacts-2h :35)
--
-- Bug 3: backup 4.3h (>4h threshold) → score 6/10
--   Fix: backup_v4.sh forcado → 20260710_203029.dump (705 tabelas, R2 offsite OK)
--
-- Score: 93.1/A (149/160) → 100.0/A+ (160/160)
-- ============================================================

-- FIX 1: Revogar anon das novas tabelas (CRITICO)
REVOKE ALL ON zapp.agent_achievements FROM anon;
REVOKE ALL ON zapp.agent_installed_skills FROM anon;

-- FIX 2: Cron VACUUM com statement unico (pg_cron nao suporta VACUUM em multi-stmt)
-- Executado: cron.unschedule do job de 2 statements + recriacao:
SELECT cron.schedule(
  'vacuum-messages-wpp2-2h',
  '25 */2 * * *',
  'VACUUM ANALYZE evo.evolution_messages_wpp2'
);
-- vacuum-contacts-2h (35 */2 * * *) ja existia com statement unico

-- FIX 3: backup forcado via sh /backups/backup_v4.sh (nao-SQL, documentado)

-- VERIFICACOES POS-DEPLOY
SELECT COUNT(*)=0 AS anon_zapp_zero
FROM information_schema.role_table_grants
WHERE grantee='anon' AND table_schema='zapp';

SELECT COUNT(*)=2 AS vacuum_crons_ok
FROM cron.job
WHERE jobname IN ('vacuum-messages-wpp2-2h','vacuum-contacts-2h')
  AND active AND command NOT ILIKE '%;%';

SELECT (fn_system_health_score()->>'score')::numeric=100.0 AS score_100;

-- LICAO APRENDIDA:
-- 1. pg_cron: comandos multi-statement rodam em transacao; VACUUM exige job dedicado
-- 2. Novas tabelas criadas por deploys herdam grants default do schema —
--    o trigger rls_auto_enable protege RLS mas NAO revoga grants;
--    considerar ALTER DEFAULT PRIVILEGES IN SCHEMA zapp REVOKE ALL FROM anon
