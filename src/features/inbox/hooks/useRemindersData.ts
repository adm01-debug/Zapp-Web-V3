import { supabase } from '@/integrations/supabase/client';

export async function fetchReminders(contactId: string, profileId: string) {
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
  return supabase.from('reminders').insert(payload);
}

export async function dismissReminderById(id: string) {
  return supabase.from('reminders').update({ is_dismissed: true }).eq('id', id);
}

export async function deleteReminderById(id: string) {
  return supabase.from('reminders').delete().eq('id', id);
}
