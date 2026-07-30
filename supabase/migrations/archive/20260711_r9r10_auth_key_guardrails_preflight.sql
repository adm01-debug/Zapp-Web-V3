-- MIGRATION R9-R10 2026-07-11
-- FIX 1: fn_security_surface_audit v3 (truly_dangerous + cooldown 4h)
-- FIX 2: fn_guardrails_check v2 (Saturday fix DOW 1-5)
-- FIX 5: fn_health_preflight (15 checks em 1 chamada)
-- FIX 6: Cron probe-15min
-- FIX 7: Snapshot force=TRUE
-- (conteudo completo: ver branch infra/evo-auth-key-r9r10-2026-07-11)
SELECT 'migration_r9_r10_placeholder';