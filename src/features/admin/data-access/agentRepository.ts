
import { supabase } from '@/integrations/supabase/client';
import { dbFrom } from '@/integrations/datasource/db';

export interface AgentProfile {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  role: string | null;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  is_active: boolean;
  max_chats: number;
  created_at: string | null;
  updated_at: string | null;
}

export const agentRepository = {
  async fetchProfiles() {
    return supabase
      .from('profiles')
      .select('*')
      .order('name');
  },

  async fetchQueuesAndMembers() {
    // Schema drift: `is_active` existe fisicamente em queues/queue_members mas
    // não aparece nos tipos gerados. Cast controlado para preservar o filtro.
    const db = supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (c: string, v: unknown) => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
    return Promise.all([
      db.from('queues').select('id, name, color').eq('is_active', true) as Promise<{
        data: Array<{ id: string; name: string; color: string }> | null;
        error: { message: string } | null;
      }>,
      db.from('queue_members').select('queue_id, profile_id').eq('is_active', true) as Promise<{
        data: Array<{ queue_id: string; profile_id: string }> | null;
        error: { message: string } | null;
      }>,
    ]);
  },

  async fetchActiveChatsCounts() {
    return dbFrom('contacts')
      .select('assigned_to')
      .not('assigned_to', 'is', null);
  },
};