-- Auditoria pos-fix 2026-08-22 (5 agentes especializados) — 2 gaps de baixo
-- risco confirmados pelo DBA agent, decisao de aplicar tomada pelo dono do
-- produto ("haja como dev senior e escolha por mim").
--
-- 1) public.user_settings (view proxy, security_invoker=on implicito nas
--    ~511 views deste padrao) nao replicava as 4 colunas adicionadas pela
--    migration 20260821010000 (simulation_mode_enabled,
--    global_sla_warning_minutes, global_sla_critical_minutes,
--    global_sla_notification_message). Sem impacto no app web (client.ts usa
--    db.schema:'zapp' direto), mas gap real de consistencia para qualquer
--    consumidor futuro via public (BI/relatorio/dev). CREATE OR REPLACE VIEW
--    com colunas adicionais é operação aditiva e segura — nenhum consumidor
--    existente referencia as novas colunas, entao nada quebra.
--    Definicao das 35 colunas antigas confirmada ao vivo via
--    pg_get_viewdef('public.user_settings') antes de escrever este ALTER.
--
-- 2) Nenhum CHECK constraint garantia global_sla_warning_minutes <
--    global_sla_critical_minutes. Confirmado ao vivo que as 21 linhas de
--    producao atuais ja satisfazem essa relacao (0 violações), entao a
--    constraint entra sem quebrar nenhuma linha existente.

CREATE OR REPLACE VIEW public.user_settings AS
SELECT
  user_settings.auto_assignment_enabled,
  user_settings.auto_assignment_method,
  user_settings.auto_transcription_enabled,
  user_settings.away_message,
  user_settings.browser_notifications_enabled,
  user_settings.business_hours_enabled,
  user_settings.business_hours_end,
  user_settings.business_hours_start,
  user_settings.closing_message,
  user_settings.compact_mode,
  user_settings.created_at,
  user_settings.goal_sound_type,
  user_settings.id,
  user_settings.inactivity_timeout,
  user_settings.inbox_filters,
  user_settings.language,
  user_settings.mention_sound_type,
  user_settings.message_sound_type,
  user_settings.quiet_hours_enabled,
  user_settings.quiet_hours_end,
  user_settings.quiet_hours_start,
  user_settings.sentiment_alert_enabled,
  user_settings.sentiment_alert_threshold,
  user_settings.sentiment_consecutive_count,
  user_settings.sla_sound_type,
  user_settings.sound_enabled,
  user_settings.theme,
  user_settings.transcription_notification_enabled,
  user_settings.transcription_sound_type,
  user_settings.tts_speed,
  user_settings.tts_voice_id,
  user_settings.updated_at,
  user_settings.user_id,
  user_settings.welcome_message,
  user_settings.work_days,
  user_settings.onboarding_completed,
  user_settings.simulation_mode_enabled,
  user_settings.global_sla_warning_minutes,
  user_settings.global_sla_critical_minutes,
  user_settings.global_sla_notification_message
FROM zapp.user_settings;

ALTER TABLE zapp.user_settings
  ADD CONSTRAINT user_settings_sla_thresholds_check
  CHECK (global_sla_warning_minutes < global_sla_critical_minutes);

COMMENT ON CONSTRAINT user_settings_sla_thresholds_check ON zapp.user_settings IS
  'Garante que o alerta de warning de SLA dispara antes do critical. Adicionado na auditoria 2026-08-22 apos achado de que nada impedia a inversao.';

NOTIFY pgrst, 'reload schema';
