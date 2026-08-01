-- 20260801000001 — P0: reanexar trigger anti-escalonamento de privilégio
-- Aplicado em produção: 2026-08-01 (auditoria etapa 8)
-- Rollback: DROP TRIGGER IF EXISTS on_profile_update_prevent_escalation ON zapp.profiles;

BEGIN;

DROP TRIGGER IF EXISTS on_profile_update_prevent_escalation ON zapp.profiles;

CREATE TRIGGER on_profile_update_prevent_escalation
BEFORE UPDATE ON zapp.profiles
FOR EACH ROW EXECUTE FUNCTION zapp.prevent_profile_privilege_escalation();

COMMIT;

-- Validação pós-aplicação (esperado: tgenabled='O'):
-- SELECT tgname, tgenabled FROM pg_trigger
-- WHERE tgrelid='zapp.profiles'::regclass AND NOT tgisinternal ORDER BY tgname;
