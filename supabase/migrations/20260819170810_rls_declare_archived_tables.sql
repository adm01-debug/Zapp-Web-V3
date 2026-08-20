-- ============================================================
-- 20260819170810_rls_declare_archived_tables.sql
-- Declara ENABLE ROW LEVEL SECURITY das tabelas cuja migration de
-- origem foi arquivada em docs/history/migrations-archive/ (limpeza
-- 2026-08-19). O auditor estatico (audit-rls-coverage.mjs) so enxerga
-- supabase/migrations/ — sem esta declaracao o quality-gate falha.
-- RLS JA esta ativo no DB (relrowsecurity=true, verificado 2026-08-19);
-- este arquivo e declaratorio e idempotente (no-op no runtime).
-- ============================================================

ALTER TABLE zapp.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.queue_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.talkx_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.talkx_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.team_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.voice_conversion_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapp.webhook_audit_log ENABLE ROW LEVEL SECURITY;
