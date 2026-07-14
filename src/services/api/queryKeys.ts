/**
 * Centralized Query Keys Management
 *
 * This file defines all query keys used in the application.
 * Using a centralized location prevents typos and makes it easy to
 * invalidate related queries together.
 *
 * Pattern: queryKeys.domain.resource(params)
 * Example: queryKeys.contacts.list({ archived: false })
 */

export const queryKeys = {
  // Contacts
  contacts: {
    all: () => ['contacts'] as const,
    lists: () => [...queryKeys.contacts.all(), 'list'] as const,
    list: (filters?: Record<string, any>) =>
      [...queryKeys.contacts.lists(), { filters }] as const,
    details: () => [...queryKeys.contacts.all(), 'detail'] as const,
    detail: (id: string) =>
      [...queryKeys.contacts.details(), id] as const,
    search: (query?: string) =>
      [...queryKeys.contacts.all(), 'search', query] as const,
  },

  // Connections
  connections: {
    all: () => ['connections'] as const,
    lists: () => [...queryKeys.connections.all(), 'list'] as const,
    list: (filters?: Record<string, any>) =>
      [...queryKeys.connections.lists(), { filters }] as const,
    details: () => [...queryKeys.connections.all(), 'detail'] as const,
    detail: (id: string) =>
      [...queryKeys.connections.details(), id] as const,
    health: () => [...queryKeys.connections.all(), 'health'] as const,
    qr: (connectionId: string) =>
      [...queryKeys.connections.all(), 'qr', connectionId] as const,
  },

  // Queues
  queues: {
    all: () => ['queues'] as const,
    lists: () => [...queryKeys.queues.all(), 'list'] as const,
    list: (filters?: Record<string, any>) =>
      [...queryKeys.queues.lists(), { filters }] as const,
    details: () => [...queryKeys.queues.all(), 'detail'] as const,
    detail: (id: string) =>
      [...queryKeys.queues.details(), id] as const,
    analytics: (id: string) =>
      [...queryKeys.queues.all(), 'analytics', id] as const,
  },

  // Messages
  messages: {
    all: () => ['messages'] as const,
    lists: () => [...queryKeys.messages.all(), 'list'] as const,
    list: (filters?: Record<string, any>) =>
      [...queryKeys.messages.lists(), { filters }] as const,
    details: () => [...queryKeys.messages.all(), 'detail'] as const,
    detail: (id: string) =>
      [...queryKeys.messages.details(), id] as const,
    thread: (threadId: string) =>
      [...queryKeys.messages.all(), 'thread', threadId] as const,
  },

  // Users/Agents
  users: {
    all: () => ['users'] as const,
    lists: () => [...queryKeys.users.all(), 'list'] as const,
    list: (filters?: Record<string, any>) =>
      [...queryKeys.users.lists(), { filters }] as const,
    details: () => [...queryKeys.users.all(), 'detail'] as const,
    detail: (id: string) =>
      [...queryKeys.users.details(), id] as const,
    me: () => [...queryKeys.users.all(), 'me'] as const,
    online: () => [...queryKeys.users.all(), 'online'] as const,
  },

  // Settings
  settings: {
    all: () => ['settings'] as const,
    user: (userId: string) =>
      [...queryKeys.settings.all(), 'user', userId] as const,
    workspace: () =>
      [...queryKeys.settings.all(), 'workspace'] as const,
  },

  // Automations
  automations: {
    all: () => ['automations'] as const,
    lists: () => [...queryKeys.automations.all(), 'list'] as const,
    list: (filters?: Record<string, any>) =>
      [...queryKeys.automations.lists(), { filters }] as const,
    details: () => [...queryKeys.automations.all(), 'detail'] as const,
    detail: (id: string) =>
      [...queryKeys.automations.details(), id] as const,
  },

  // Analytics
  analytics: {
    all: () => ['analytics'] as const,
    dashboard: () => [...queryKeys.analytics.all(), 'dashboard'] as const,
    metrics: (range?: string) =>
      [...queryKeys.analytics.all(), 'metrics', range] as const,
    reports: () => [...queryKeys.analytics.all(), 'reports'] as const,
  },

  // Admin
  admin: {
    all: () => ['admin'] as const,
    system: () => [...queryKeys.admin.all(), 'system'] as const,
    logs: (filters?: Record<string, any>) =>
      [...queryKeys.admin.all(), 'logs', { filters }] as const,
    webhooks: () => [...queryKeys.admin.all(), 'webhooks'] as const,
  },
};

/**
 * Utility function to invalidate related queries
 *
 * Usage:
 * queryClient.invalidateQueries({ queryKey: queryKeys.contacts.lists() })
 * queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all() }) // Invalidates all contacts queries
 */
