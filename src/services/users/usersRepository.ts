/**
 * Users Repository
 *
 * Data access layer for users/agents.
 * Direct Supabase access only - no business logic.
 */

import { supabase } from '@/integrations/supabase/client';
import { safeFrom } from '@/integrations/supabase/safeClient';
import { createService } from '@/services/api/genericService';
import type { QueryParams } from '@/services/api/types';

/** User interface. */
export interface User {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  role: 'admin' | 'agent' | 'supervisor' | 'viewer';
  is_active?: boolean;
  account_id?: string;
  last_activity_at?: string;
  created_at: string;
  updated_at: string;
}

/** Agent interface definition. */
export interface Agent {
  id: string;
  user_id?: string;
  name: string;
  email: string;
  is_active?: boolean;
  online_status?: 'available' | 'busy' | 'offline' | 'dnd';
  avatar_url?: string;
  bio?: string;
  max_chats?: number;
  current_load?: number;
  account_id?: string;
  is_bot?: boolean;
  created_at: string;
  updated_at: string;
}

// Users and agents are both stored in the `profiles` table (role column distinguishes them)
const usersBaseService = createService<User>('profiles');
const agentsBaseService = createService<Agent>('profiles');

/** users Repository constant. */
export const usersRepository = {
  // Users
  listUsers: (filters?: Partial<User> & QueryParams) => usersBaseService.list(filters),

  getUser: (id: string) => usersBaseService.get(id),

  searchUsers: (query: string) => usersBaseService.search(query),

  createUser: (data: Partial<User>) => usersBaseService.create(data),

  updateUser: (id: string, updates: Partial<User>) => usersBaseService.update(id, updates),

  deleteUser: (id: string) => usersBaseService.delete(id),

  // Agents
  listAgents: (filters?: Partial<Agent> & QueryParams) => agentsBaseService.list(filters),

  getAgent: (id: string) => agentsBaseService.get(id),

  searchAgents: (query: string) => agentsBaseService.search(query),

  createAgent: (data: Partial<Agent>) => agentsBaseService.create(data),

  updateAgent: (id: string, updates: Partial<Agent>) => agentsBaseService.update(id, updates),

  deleteAgent: (id: string) => agentsBaseService.delete(id),

  // Current user (via auth + profiles join)
  async getCurrentUser(): Promise<User | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    return data as User | null;
  },

  // Agent availability — agents are profiles; profiles has online_status and is_active, not a combined 'status'
  async getAgentsByStatus(status: Agent['online_status'], filters?: Partial<QueryParams>) {
    let q = safeFrom('profiles')
      .select('*', { count: 'exact' })
      .in('role', ['agent', 'supervisor'])
      .limit(filters?.limit || 50)
      .offset(filters?.offset || 0);

    if (status === 'offline') {
      q = (q as ReturnType<typeof safeFrom>).eq('is_active', false);
    } else if (status) {
      q = (q as ReturnType<typeof safeFrom>).eq('online_status', status).eq('is_active', true);
    }

    const { data, error, count } = await q;
    return { data: data || [], error, count };
  },

  // Realtime subscriptions
  subscribeToUserChanges: (callback: (user: User) => void) => usersBaseService.subscribe(callback),

  subscribeToAgentChanges: (callback: (agent: Agent) => void) =>
    agentsBaseService.subscribe(callback),
};
