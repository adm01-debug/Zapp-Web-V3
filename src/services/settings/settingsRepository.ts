/**
 * Settings Repository
 *
 * Data access layer for user and workspace settings.
 * Direct Supabase access only - no business logic.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/schema';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { DisposableChannel } from '@/integrations/supabase/safe-queries';

/**
 * Anexa um disposer ao RealtimeChannel retornado pelas funções `subscribeTo*`
 * (retrocompatível — o retorno continua sendo o próprio canal, callers antigos
 * seguem funcionando). O disposer executa o padrão de cleanup do repo:
 * `channel.unsubscribe()` + `supabase.removeChannel(channel)`.
 *
 * LEAK FIX (REALTIME_CHANNELS_AUDIT): antes desta mudança os canais criados aqui
 * NUNCA eram removidos do cliente (não havia removeChannel em lugar nenhum do
 * arquivo), vazando uma entrada em `supabase.channels` a cada subscribe.
 *
 * Uso: `const ch = settingsRepository.subscribeToUserSettings(id, cb); ... ch.dispose();`
 */
function attachChannelDisposer(channel: RealtimeChannel): DisposableChannel {
  (channel as DisposableChannel).dispose = () => {
    channel.unsubscribe();
    supabase.removeChannel(channel);
  };
  return channel as DisposableChannel;
}

/**
 * User Settings interface — alinhada ao schema `zapp` (canônico do client),
 * tabela `user_settings` (created_at/id/onboarding_completed/updated_at/user_id NOT NULL).
 */
export interface UserSettings {
  auto_assignment_enabled: boolean | null;
  auto_assignment_method: string | null;
  auto_transcription_enabled: boolean | null;
  away_message: string | null;
  browser_notifications_enabled: boolean | null;
  business_hours_enabled: boolean | null;
  business_hours_end: string | null;
  business_hours_start: string | null;
  closing_message: string | null;
  compact_mode: boolean | null;
  created_at: string;
  goal_sound_type: string | null;
  id: string;
  inactivity_timeout: number | null;
  inbox_filters: Json | null;
  language: string | null;
  mention_sound_type: string | null;
  message_sound_type: string | null;
  onboarding_completed: boolean;
  quiet_hours_enabled: boolean | null;
  quiet_hours_end: string | null;
  quiet_hours_start: string | null;
  sentiment_alert_enabled: boolean | null;
  sentiment_alert_threshold: number | null;
  sentiment_consecutive_count: number | null;
  sla_sound_type: string | null;
  sound_enabled: boolean | null;
  theme: string | null;
  transcription_notification_enabled: boolean | null;
  transcription_sound_type: string | null;
  tts_speed: number | null;
  tts_voice_id: string | null;
  updated_at: string;
  user_id: string;
  welcome_message: string | null;
  work_days: string[] | null;
}

/**
 * Workspace Settings interface — alinhada ao schema `zapp` (canônico do client),
 * tabela `workspace_settings` (created_at/id/name/updated_at/workspace_id NOT NULL).
 */
export interface WorkspaceSettings {
  created_at: string;
  default_queue: string | null;
  description: string | null;
  id: string;
  logo_url: string | null;
  name: string;
  settings: Json | null;
  timezone: string | null;
  updated_at: string;
  working_hours_end: string | null;
  working_hours_start: string | null;
  workspace_id: string;
}

/** settings Repository constant. */
export const settingsRepository = {
  // User Settings
  async getUserSettings(userId: string): Promise<UserSettings | null> {
    const { data } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;

    return data;
  },

  async updateUserSettings(userId: string, updates: Partial<UserSettings>) {
    const { data, error } = await supabase
      .from('user_settings')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;

    return { data, error };
  },

  async upsertUserSettings(userId: string, settings: Partial<UserSettings>) {
    const { data, error } = await supabase
      .from('user_settings')
      .upsert({
        ...settings,
        user_id: userId,
      })
      .select()
      .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;

    return { data, error };
  },

  // Workspace Settings
  async getWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettings | null> {
    const { data, error } = await supabase
      .from('workspace_settings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;

    if (error) return null;
    return data;
  },

  async updateWorkspaceSettings(workspaceId: string, updates: Partial<WorkspaceSettings>) {
    const { data, error } = await supabase
      .from('workspace_settings')
      .update(updates)
      .eq('workspace_id', workspaceId)
      .select()
      .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;

    return { data, error };
  },

  async upsertWorkspaceSettings(workspaceId: string, settings: Partial<WorkspaceSettings>) {
    const { data, error } = await supabase
      .from('workspace_settings')
      .upsert({
        ...settings,
        // Insert do schema zapp exige name/workspace_id (NOT NULL)
        name: settings.name ?? '',
        workspace_id: workspaceId,
      })
      .select()
      .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;

    return { data, error };
  },

  // Realtime subscriptions
  subscribeToUserSettings: (userId: string, callback: (settings: UserSettings) => void): DisposableChannel => {
    const channel = supabase
      .channel(`user_settings:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'zapp', table: 'user_settings', filter: `user_id=eq.${userId}` },
        (payload) => callback(payload.new as UserSettings)
      )
      .subscribe();

    // LEAK FIX (REALTIME_CHANNELS_AUDIT): expõe cleanup retrocompatível via
    // `channel.dispose()` — ver attachChannelDisposer acima.
    return attachChannelDisposer(channel);
  },

  subscribeToWorkspaceSettings: (
    workspaceId: string,
    callback: (settings: WorkspaceSettings) => void
  ): DisposableChannel => {
    const channel = supabase
      .channel(`workspace_settings:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'zapp',
          table: 'workspace_settings',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => callback(payload.new as WorkspaceSettings)
      )
      .subscribe();

    // LEAK FIX (REALTIME_CHANNELS_AUDIT): expõe cleanup retrocompatível via
    // `channel.dispose()` — ver attachChannelDisposer acima.
    return attachChannelDisposer(channel);
  },
};
