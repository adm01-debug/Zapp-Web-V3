// @ts-nocheck
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
    return Promise.all([
      supabase.from('queues').select('id, name, color').eq('is_active', true),
      supabase.from('queue_members').select('queue_id, profile_id').eq('is_active', true),
    ]);
  },

  async fetchActiveChatsCounts() {
    return dbFrom('contacts')
      .select('assigned_to')
      .not('assigned_to', 'is', null);
  },
};