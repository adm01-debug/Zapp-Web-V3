-- Migration: fk_backing_indexes_wave2_20260711
-- Date: 2026-07-11 (wave 2 — complementa os 8 índices da sessão anterior)
--
-- Remaining FK columns without backing indexes (tables > 32KB):
-- All 12 created successfully. Total FK coverage now complete for zapp/public schemas.

CREATE INDEX IF NOT EXISTS idx_warroom_alerts_dismissed_by ON public.warroom_alerts(dismissed_by);
CREATE INDEX IF NOT EXISTS idx_queues_department_id ON zapp.queues(department_id);
CREATE INDEX IF NOT EXISTS idx_system_connections_created_by ON public.system_connections(created_by);
CREATE INDEX IF NOT EXISTS idx_dept_invitations_created_by ON public.department_invitations(created_by);
CREATE INDEX IF NOT EXISTS idx_dept_invitations_invited_by ON public.department_invitations(invited_by);
CREATE INDEX IF NOT EXISTS idx_sys_health_incidents_created_by ON public.system_health_incidents(created_by);
CREATE INDEX IF NOT EXISTS idx_qr_attempts_connection_id ON zapp.qr_attempts(connection_id);
CREATE INDEX IF NOT EXISTS idx_transfer_comments_agent_id ON zapp.transfer_comments(agent_id);
CREATE INDEX IF NOT EXISTS idx_automations_channel_id ON zapp.automations(channel_id);
CREATE INDEX IF NOT EXISTS idx_automations_department_id ON zapp.automations(department_id);
CREATE INDEX IF NOT EXISTS idx_pwd_reset_requests_reviewed_by ON public.password_reset_requests(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_user_sessions_device_id ON public.user_sessions(device_id);
