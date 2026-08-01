-- 20260801010005 — Integridade: arquivar tabelas de backup do cutover (auditoria etapa 32)
-- Aplicado em produção: 2026-08-01
-- Mover (não remover) — a etapa 34 e rollbacks podem precisar delas.
-- Rollback:
--   ALTER TABLE archive._grant_backup_20260730 SET SCHEMA zapp;
--   ALTER TABLE archive._rls_backup_20260731 SET SCHEMA zapp;

BEGIN;

ALTER TABLE zapp._grant_backup_20260730 SET SCHEMA archive;
ALTER TABLE zapp._rls_backup_20260731 SET SCHEMA archive;

COMMENT ON TABLE archive._rls_backup_20260731 IS 'Backup pre-cutover. Retencao ate 2026-10-31.';

COMMIT;
