import { supabase } from '@/integrations/supabase/client';
import { isValidUUID } from '@/utils/uuid';

export async function fetchReminders(contactId: string, profileId: string) {
  if (!isValidUUID(contactId) || !isValidUUID(profileId)) return [];
  const { data } = await supabase
    .from('reminders')
    .select('*')
    .eq('contact_id', contactId)
    .eq('profile_id', profileId)
    .eq('is_dismissed', false)
    .order('remind_at', { ascending: true });
  return data ?? [];
}

export async function createReminder(payload: {
  contact_id: string;
  profile_id: string;
  title: string;
  remind_at: string;
}) {
  // Guard: reminders.contact_id is uuid — reject JID strings silently.
  if (!isValidUUID(payload.contact_id)) {
    return { error: new Error('contact_id must be a UUID'), data: null };
  }
  return supabase.from('reminders').insert(payload);
}

export async function dismissReminderById(id: string) {
  return supabase.from('reminders').update({ is_dismissed: true }).eq('id', id);
}

export async function deleteReminderById(id: string) {
  return supabase.from('reminders').delete().eq('id', id);
}
