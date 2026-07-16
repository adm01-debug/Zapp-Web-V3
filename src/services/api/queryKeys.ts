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
    list: (filters?: Record<string, unknown>) =>
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
    list: (filters?: Record<string, unknown>) =>
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
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.queues.lists(), { filters }] as const,
    details: () => [...queryKeys.queues.all(), 'detail'] as const,
    detail: (id: string) =>
      [...queryKeys.queues.details(), id] as const,
    analytics: (id: string) =>
      [...queryKeys.queues.all(), 'analytics', id] as const,
    forRouting: () => [...queryKeys.queues.all(), 'for-routing'] as const,
  },

  // Messages
  messages: {
    all: () => ['messages'] as const,
    lists: () => [...queryKeys.messages.all(), 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
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
    list: (filters?: Record<string, unknown>) =>
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
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.automations.lists(), { filters }] as const,
    details: () => [...queryKeys.automations.all(), 'detail'] as const,
    detail: (id: string) =>
      [...queryKeys.automations.details(), id] as const,
    autoClose: () => [...queryKeys.automations.all(), 'auto-close-config'] as const,
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
    logs: (filters?: Record<string, unknown>) =>
      [...queryKeys.admin.all(), 'logs', { filters }] as const,
    webhooks: () => [...queryKeys.admin.all(), 'webhooks'] as const,
  },

  // Tags
  tags: {
    all: () => ['tags'] as const,
    contact: (contactId: string | undefined) =>
      ['contact-tags', contactId] as const,
  },

  // Chatbot Flows
  chatbotFlows: {
    all: () => ['chatbot-flows'] as const,
  },

  // Campaigns
  campaigns: {
    all: () => ['campaigns'] as const,
  },

  // External API / CRM
  external: {
    contact360: (phone: string) => ['external-contact-360', phone] as const,
    contact360Batch: (key: string) => ['external-contact-360-batch', key] as const,
    cargos: () => ['external-cargos'] as const,
    empresas: () => ['external-empresas'] as const,
    catalog: {
      products: (filters?: unknown) => ['external-catalog', 'products', filters] as const,
      categories: () => ['external-catalog', 'categories'] as const,
      suppliers: () => ['external-catalog', 'suppliers'] as const,
      product: (id: string) => ['external-catalog', 'product', id] as const,
    },
    db: (table: string, params?: unknown) => ['external-db', table, params] as const,
    rpc: (rpc: string, params?: unknown) => ['external-db', 'rpc', rpc, params] as const,
  },

  // Dashboard
  dashboard: {
    agents: (agentId?: string) => ['dashboard-agents', agentId] as const,
    contacts: (filters?: unknown) => ['dashboard-contacts', filters] as const,
    messages: (filters?: unknown) => ['dashboard-messages', filters] as const,
    queues: () => ['dashboard-queues'] as const,
    contactsPerQueue: () => ['dashboard-contacts-per-queue'] as const,
    sla: () => ['dashboard-sla'] as const,
  },

  // CSAT Surveys
  csat: {
    surveys: (period?: string) => ['csat-surveys', period] as const,
    stats: (period?: string) => ['csat-stats', period] as const,
  },

  // Omnichannel
  omnichannel: {
    channels: () => ['omnichannel-channels'] as const,
    routingRules: () => ['channel-routing-rules'] as const,
  },

  // Skill-based Routing
  skillRouting: {
    profiles: () => ['skill-routing-profiles'] as const,
    queues: () => ['skill-routing-queues'] as const,
    agentSkills: (profileId?: string) => ['agent-skills', profileId] as const,
    queueRequirements: (queueId?: string) => ['queue-skill-requirements', queueId] as const,
  },

  // Department (Team Chat)
  departments: {
    profiles: (deptId: string) => ['dept-profiles', deptId] as const,
    audit: (deptId: string) => ['dept-audit', deptId] as const,
    invites: (deptId: string) => ['dept-invites', deptId] as const,
  },

  // Scheduled Messages
  scheduledMessages: {
    all: () => ['scheduled-messages'] as const,
  },

  // Alert Management
  alerts: {
    all: () => ['warroom-alerts'] as const,
  },

  // AI Providers
  aiProviders: {
    all: () => ['ai-providers'] as const,
  },

  // Demand Prediction
  demandPrediction: {
    history: () => ['demand-prediction-history'] as const,
  },

  // Delivery Stats
  deliveryStats: {
    contact: (remoteJid: string, instance?: string) =>
      ['delivery-stats', remoteJid, instance] as const,
  },

  // Business Hours
  businessHours: {
    all: () => ['business-hours'] as const,
    check: () => ['business-hours-check'] as const,
  },

  // Away Message / Auto-reply
  awayMessage: {
    all: () => ['away-message'] as const,
  },

  // SLA
  sla: {
    timeline: (conversationId?: string) => ['sla-timeline', conversationId] as const,
  },

  // Follow-up Sequences
  followupSequences: {
    all: () => ['followup-sequences'] as const,
  },

  // Evolution Fallback Stats
  evolutionFallback: {
    stats: () => ['evolution-fallback-stats'] as const,
  },

  // Evolution external conversations (sidebar)
  evolutionConversations: {
    sidebar: (daysBack: number, limit: number, instance: string) =>
      ['external-evolution', 'conversations', daysBack, limit, instance] as const,
  },
};

/**
 * Utility function to invalidate related queries
 *
 * Usage:
 * queryClient.invalidateQueries({ queryKey: queryKeys.contacts.lists() })
 * queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all() }) // Invalidates all contacts queries
 */
