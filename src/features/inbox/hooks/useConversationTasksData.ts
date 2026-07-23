import { supabase } from '@/integrations/supabase/client';

export async function fetchConversationTasks(contactId: string) {
  const { data } = await supabase
    .from('conversation_tasks')
    .select('*')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

export async function createConversationTask(payload: {
  contact_id: string;
  title: string;
  priority: string;
  created_by: string;
  assigned_to: string;
}) {
  return supabase.from('conversation_tasks').insert(payload);
}

export async function updateConversationTaskStatus(
  id: string,
  status: string,
  completedAt: string | null
) {
  return supabase
    .from('conversation_tasks')
    .update({ status, completed_at: completedAt })
    .eq('id', id);
}

export async function deleteConversationTask(id: string) {
  return supabase.from('conversation_tasks').delete().eq('id', id);
}
