-- Etapa 12: Crons quebrados, no-op e mal escalonados
-- Achados: F2-06..09,12 · F4-24 · F6-09,10 · F7-15 · F8-05,09,14,15

-- ✅ Cron 198 (bpm-check-breached-slas) — UNSCHEDULED (BPM removido ADR-004)
SELECT cron.unschedule(198);

-- ✅ Cron 190 (cleanup_expired_contact_ids zapp) — separado do duplicado evo (189)
SELECT cron.alter_job(190, schedule := '0 3 * * *');

-- 📝 F2-06: 4 pares duplicados — 190/189 resolvido; 54/152, 61/129, 99/216 são cleanup com retenções diferentes (intencional)
-- 📝 F4-24: OBSOLETO (warroom_alerts já tem severity, cron 213 = 6/6 sucesso)
-- 📝 F7-15: ≡ F4-24 (mesmo cron 213)
