/**
 * Users Service
 *
 * Business logic layer for users/agents.
 * Validates data and applies business rules.
 */

import { usersRepository, type User, type Agent } from './usersRepository';
import type { ListResponse, QueryParams } from '@/services/api/types';

/**
 * Email validation helper
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export const usersService = {
  // Users
  listUsers: async (filters?: Partial<User> & QueryParams): Promise<ListResponse<User>> => {
    return usersRepository.listUsers(filters);
  },

  getUser: async (id: string): Promise<User | null> => {
    if (!id) throw new Error('User ID is required');
    return usersRepository.getUser(id);
  },

  searchUsers: async (query: string): Promise<User[]> => {
    if (!query || query.length < 2) return [];
    return usersRepository.searchUsers(query.toLowerCase());
  },

  createUser: async (data: Partial<User>): Promise<User> => {
    if (!data.email || !isValidEmail(data.email)) {
      throw new Error('Valid email is required');
    }
    if (!data.full_name || data.full_name.trim().length === 0) {
      throw new Error('Full name is required');
    }
    if (!data.account_id) {
      throw new Error('Account ID is required');
    }

    return usersRepository.createUser({
      ...data,
      email: data.email.toLowerCase().trim(),
      full_name: data.full_name.trim(),
      status: 'active',
    });
  },

  updateUser: async (id: string, updates: Partial<User>): Promise<User> => {
    if (!id) throw new Error('User ID is required');

    if (updates.email && !isValidEmail(updates.email)) {
      throw new Error('Valid email is required');
    }
    if (updates.full_name && updates.full_name.trim().length === 0) {
      throw new Error('Full name cannot be empty');
    }

    return usersRepository.updateUser(id, {
      ...updates,
      email: updates.email?.toLowerCase().trim(),
      full_name: updates.full_name?.trim(),
    });
  },

  deleteUser: async (id: string): Promise<{ id: string }> => {
    if (!id) throw new Error('User ID is required');
    return usersRepository.deleteUser(id);
  },

  // Agents
  listAgents: async (filters?: Partial<Agent> & QueryParams): Promise<ListResponse<Agent>> => {
    return usersRepository.listAgents(filters);
  },

  getAgent: async (id: string): Promise<Agent | null> => {
    if (!id) throw new Error('Agent ID is required');
    return usersRepository.getAgent(id);
  },

  searchAgents: async (query: string): Promise<Agent[]> => {
    if (!query || query.length < 2) return [];
    return usersRepository.searchAgents(query.toLowerCase());
  },

  createAgent: async (data: Partial<Agent>): Promise<Agent> => {
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Agent name is required');
    }
    if (!data.email || !isValidEmail(data.email)) {
      throw new Error('Valid email is required');
    }
    if (!data.account_id) {
      throw new Error('Account ID is required');
    }

    return usersRepository.createAgent({
      ...data,
      name: data.name.trim(),
      email: data.email.toLowerCase().trim(),
      status: 'offline',
    });
  },

  updateAgent: async (id: string, updates: Partial<Agent>): Promise<Agent> => {
    if (!id) throw new Error('Agent ID is required');

    if (updates.name && updates.name.trim().length === 0) {
      throw new Error('Agent name cannot be empty');
    }
    if (updates.email && !isValidEmail(updates.email)) {
      throw new Error('Valid email is required');
    }

    return usersRepository.updateAgent(id, {
      ...updates,
      name: updates.name?.trim(),
      email: updates.email?.toLowerCase().trim(),
    });
  },

  deleteAgent: async (id: string): Promise<{ id: string }> => {
    if (!id) throw new Error('Agent ID is required');
    return usersRepository.deleteAgent(id);
  },

  // Agent status
  getAgentsByStatus: async (status: Agent['status'], filters?: Partial<QueryParams>) => {
    return usersRepository.getAgentsByStatus(status, filters);
  },

  // Current user
  getCurrentUser: async (): Promise<User | null> => {
    return usersRepository.getCurrentUser();
  },

  // Real-time updates
  onUserChange: (callback: (user: User) => void) => {
    return usersRepository.subscribeToUserChanges(callback);
  },

  onAgentChange: (callback: (agent: Agent) => void) => {
    return usersRepository.subscribeToAgentChanges(callback);
  },
};
