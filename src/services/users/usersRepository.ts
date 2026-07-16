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

export interface User {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  role: 'admin' | 'agent' | 'supervisor' | 'viewer';
  status: 'active' | 'inactive' | 'suspended';
  account_id: string;
  last_activity_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: string;
  user_id: string;
  name: string;
  email: string;
  status: 'available' | 'busy' | 'offline' | 'dnd';
  avatar_url?: string;
  bio?: string;
  max_concurrent_chats?: number;
  current_chat_count?: number;
  account_id: string;
  is_bot?: boolean;
  created_at: string;
  updated_at: string;
}

// Base service for users
const usersBaseService = createService<User>('users');
const agentsBaseService = createService<Agent>('agents');

export const usersRepository = {
  // Users
  listUsers: (filters?: Partial<User> & QueryParams) =>
    usersBaseService.list(filters),

  getUser: (id: string) =>
    usersBaseService.get(id),

  searchUsers: (query: string) =>
    usersBaseService.search(query),

  createUser: (data: Partial<User>) =>
    usersBaseService.create(data),

  updateUser: (id: string, updates: Partial<User>) =>
    usersBaseService.update(id, updates),

  deleteUser: (id: string) =>
    usersBaseService.delete(id),

  // Agents
  listAgents: (filters?: Partial<Agent> & QueryParams) =>
    agentsBaseService.list(filters),

  getAgent: (id: string) =>
    agentsBaseService.get(id),

  searchAgents: (query: string) =>
    agentsBaseService.search(query),

  createAgent: (data: Partial<Agent>) =>
    agentsBaseService.create(data),

  updateAgent: (id: string, updates: Partial<Agent>) =>
    agentsBaseService.update(id, updates),

  deleteAgent: (id: string) =>
    agentsBaseService.delete(id),

  // Current user (via auth)
  async getCurrentUser(): Promise<User | null> {
    // This would typically get current user from auth context/session
    // Implementation depends on auth setup
    return null;
  },

  // Agent status
  async getAgentsByStatus(status: Agent['status'], filters?: Partial<QueryParams>) {
    const { data, error, count } = await safeFrom('agents')
      .select('*', { count: 'exact' })
      .eq('status', status)
      .limit(filters?.limit || 50)
      .offset(filters?.offset || 0);

    return { data: data || [], error, count };
  },

  // Realtime subscriptions
  subscribeToUserChanges: (callback: (user: User) => void) =>
    usersBaseService.subscribe(callback),

  subscribeToAgentChanges: (callback: (agent: Agent) => void) =>
    agentsBaseService.subscribe(callback),
};
