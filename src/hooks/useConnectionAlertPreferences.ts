import { supabase } from '@/integrations/supabase/client';

export interface ConnectionAlertPrefs {
  push_enabled: boolean;
  email_enabled: boolean;
  alert_on_degraded: boolean;
  alert_on_disconnected: boolean;
}

export async function fetchConnectionAlertPrefs(
  userId: string,
): Promise<ConnectionAlertPrefs | null> {
  const { data } = await supabase
    .from('connection_alert_preferences')
    .select('push_enabled, email_enabled, alert_on_degraded, alert_on_disconnected')
    .eq('user_id', userId)
    .maybeSingle();
  return data as ConnectionAlertPrefs | null;
}

export async function upsertConnectionAlertPrefs(
  userId: string,
  prefs: ConnectionAlertPrefs,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase
    .from('connection_alert_preferences')
    .upsert(
      {
        user_id: userId,
        alert_type: 'connection',
        push_enabled: prefs.push_enabled,
        email_enabled: prefs.email_enabled,
        alert_on_degraded: prefs.alert_on_degraded,
        alert_on_disconnected: prefs.alert_on_disconnected,
      },
      { onConflict: 'user_id' },
    );
  return { error };
}
