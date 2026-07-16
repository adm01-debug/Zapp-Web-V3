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
    total: () => [...queryKeys.contacts.all(), 'total'] as const,
    searchResults: (search?: string, tab?: string, company?: string, jobTitle?: string, tag?: string, dateFrom?: string | null, sortField?: string, sortDir?: string, page?: number) =>
      ['contacts-search', search, tab, company, jobTitle, tag, dateFrom, sortField, sortDir, page] as const,
    searchRoot: () => ['contacts-search'] as const,
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
    healthFor: (id?: string) => [...queryKeys.connections.all(), 'health', id] as const,
    search: (query?: string) => [...queryKeys.connections.all(), 'search', query] as const,
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
    search: (query?: string) => [...queryKeys.queues.all(), 'search', query] as const,
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
    conversationLists: () => [...queryKeys.messages.all(), 'conversation-list'] as const,
    conversationList: (filters?: Record<string, unknown>) =>
      [...queryKeys.messages.conversationLists(), { filters }] as const,
    conversationDetails: () => [...queryKeys.messages.all(), 'conversation-detail'] as const,
    conversationDetail: (id: string) =>
      [...queryKeys.messages.conversationDetails(), id] as const,
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
    byStatus: (status?: string) => [...queryKeys.users.all(), 'status', status] as const,
    teamMembers: () => ['team-members'] as const,
    searchUsers: (query?: string) => [...queryKeys.users.all(), 'search-users', query] as const,
    searchAgents: (query?: string) => [...queryKeys.users.all(), 'search-agents', query] as const,
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

  // Admin
  admin: {
    all: () => ['admin'] as const,
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
    agents: (agentId?: string | null) => ['dashboard-agents', agentId] as const,
    contacts: (filters?: unknown) => ['dashboard-contacts', filters] as const,
    contactsFiltered: (dateRange?: unknown, queueId?: string | null, agentId?: string | null) =>
      ['dashboard-contacts', dateRange, queueId, agentId] as const,
    messages: (filters?: unknown) => ['dashboard-messages', filters] as const,
    queues: () => ['dashboard-queues'] as const,
    queuesFiltered: (queueId?: string | null) => ['dashboard-queues', queueId] as const,
    contactsPerQueue: () => ['dashboard-contacts-per-queue'] as const,
    sla: () => ['dashboard-sla'] as const,
  },

  // CSAT Surveys
  csat: {
    surveysRoot: () => ['csat-surveys'] as const,
    surveys: (period?: string) => ['csat-surveys', period] as const,
    statsRoot: () => ['csat-stats'] as const,
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
    agentSkillsRoot: () => ['agent-skills'] as const,
    agentSkills: (profileId?: string) => ['agent-skills', profileId] as const,
    queueRequirementsRoot: () => ['queue-skill-requirements'] as const,
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
    contact: (contactId?: string) => ['scheduled-messages', contactId] as const,
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
    contact: (remoteJid: string | undefined, instance?: string) =>
      ['delivery-stats', remoteJid, instance] as const,
  },

  // Business Hours
  businessHours: {
    all: () => ['business-hours'] as const,
    connection: (connectionId: string) => ['business-hours', connectionId] as const,
    check: () => ['business-hours-check'] as const,
    checkConnection: (connectionId: string | null | undefined) => ['business-hours-check', connectionId] as const,
  },

  // Away Message / Auto-reply
  awayMessage: {
    all: () => ['away-message'] as const,
    connection: (connectionId: string) => ['away-message', connectionId] as const,
  },

  // SLA
  sla: {
    timeline: (conversationId?: string) => ['sla-timeline', conversationId] as const,
    timelineDetailed: (remoteJid?: string, contactId?: string) => ['sla-timeline', remoteJid, contactId] as const,
    configurations: () => ['sla-configurations'] as const,
    configurationsDefault: () => ['sla-configurations-default'] as const,
    rules: () => ['sla-rules'] as const,
    rulesForScope: (scope?: string) => ['sla-rules', scope] as const,
    rulesActive: () => ['sla-rules-active'] as const,
    rulesCounts: () => ['sla-rules-counts'] as const,
    alertHistory: () => ['sla-alert-history'] as const,
    history: (period?: string) => ['sla-history', period] as const,
    metrics: (period?: string) => ['sla-metrics', period] as const,
    deliveryConfig: (contactId: string | undefined) =>
      ['sla-delivery-config', contactId] as const,
    deliveryViolations: (statusFilter?: string) =>
      ['sla-delivery-violations', statusFilter] as const,
    contact: (contactId?: string) => ['contact-sla', contactId] as const,
    applicable: (params?: unknown) => ['applicable-sla', params] as const,
    contactNames: (contactIds?: unknown) => ['sla-contact-names', contactIds] as const,
    queueNames: (queueIds?: unknown) => ['sla-queue-names', queueIds] as const,
    agentNames: (agentIds?: unknown) => ['sla-agent-names', agentIds] as const,
  },

  // Follow-up Sequences
  followupSequences: {
    all: () => ['followup-sequences'] as const,
    executionsRoot: () => ['followup-executions'] as const,
    executions: (contactId?: string) => ['followup-executions', contactId] as const,
  },

  // Evolution Fallback Stats
  evolutionFallback: {
    stats: () => ['evolution-fallback-stats'] as const,
    statsWindowed: (windowHours?: number) => ['evolution-fallback-stats', windowHours] as const,
  },

  // Evolution external conversations (sidebar)
  evolutionConversations: {
    all: () => ['external-evolution', 'conversations'] as const,
    sidebar: (daysBack: number, limit: number, instance: string) =>
      ['external-evolution', 'conversations', daysBack, limit, instance] as const,
    contact: (remoteJid?: string) => ['external-evolution', 'contact', remoteJid] as const,
    contactAll: () => ['external-evolution', 'contact'] as const,
  },

  // Conversation history / ticket events
  conversationHistory: {
    events: (contactId: string | null | undefined) =>
      ['conversation-events', contactId] as const,
    auditLogs: (contactId: string | null | undefined) =>
      ['conversation-audit-logs', contactId] as const,
    queuePosition: (contactId: string) =>
      ['queue-position', contactId] as const,
  },

  // Team profiles (names lookup)
  teamProfiles: {
    names: () => ['team-profiles-names'] as const,
    active: () => ['team-profiles-active'] as const,
    forChat: () => ['team-profiles-for-chat'] as const,
    forAddMembers: () => ['team-profiles-for-add-members'] as const,
    memberProfile: (profileId?: string) => ['team-member-profile', profileId] as const,
  },

  // Team Chat (internal team messaging)
  teamChat: {
    conversations: () => ['team-conversations'] as const,
    conversationList: (profileId?: string) => ['team-conversations', profileId] as const,
    messages: (conversationId?: string, searchQuery?: string) =>
      ['team-messages', conversationId, searchQuery] as const,
    allMessages: (conversationId?: string) => ['team-messages', conversationId] as const,
    reactions: (conversationId?: string) => ['team-reactions', conversationId] as const,
    files: (conversationId?: string) => ['team-files', conversationId] as const,
    groupMembers: (conversationId?: string) => ['team-group-members', conversationId] as const,
  },

  // Message Reactions
  messageReactions: {
    message: (messageId?: string) => ['message-reactions', messageId] as const,
    myProfile: (userId?: string) => ['my-profile-reactions', userId] as const,
    participantStats: () => ['participant-stats'] as const,
    participantStatsDetailed: (conversationId?: string, simMode?: boolean) =>
      ['participant-stats', conversationId, simMode] as const,
  },

  // Failed Messages (DLQ / retry)
  failedMessages: {
    all: () => ['failed-messages'] as const,
    filtered: (filters?: unknown) => ['failed-messages', filters] as const,
    stats: () => ['failed-messages-stats'] as const,
    metricsBatch: (key: string) => ['failure-metrics-batch', key] as const,
    reason: (messageId?: string) => ['message-failure-reason', messageId] as const,
  },

  // Agent Gamification
  agentGamification: {
    stats: (profileId?: string) => ['agent-stats', profileId] as const,
    achievements: (profileId?: string) => ['agent-achievements', profileId] as const,
    pendingCounts: () => ['agent-pending-counts'] as const,
    recentSends: () => ['agent-recent-sends'] as const,
    withStats: () => ['agents-with-stats'] as const,
    ranking: () => ['agent-performance-ranking'] as const,
  },

  // Stickers
  stickers: {
    all: () => ['stickers-manager'] as const,
  },

  // Quick Replies
  quickReplies: {
    all: () => ['quick-replies'] as const,
    user: (userId?: string) => ['quick-replies', userId] as const,
  },

  // Whispers
  whispers: {
    all: () => ['whispers'] as const,
    contact: (contactId?: string) => ['whispers', contactId] as const,
  },

  // Internal Notes
  internalNotes: {
    contact: (contactId?: string) => ['internal-notes', contactId] as const,
  },

  // Media Gallery
  mediaGallery: {
    contact: (contactId?: string) => ['media-gallery', contactId] as const,
    preview: (contactId?: string) => ['media-gallery-preview', contactId] as const,
    previewPaged: (contactId?: string, pageSize?: number) => ['media-gallery-preview', contactId, pageSize] as const,
    count: (contactId?: string) => ['shared-media-count', contactId] as const,
  },

  // Message Details / History
  messageDetails: {
    detail: (messageId?: string) => ['message-details', messageId] as const,
    sendHistory: (messageId?: string) => ['message-send-history', messageId] as const,
  },

  // Reports
  reports: {
    contacts: (period?: string) => ['reports-contacts', period] as const,
    contactsFiltered: (period?: string, agent?: string, tag?: string) => ['reports-contacts', period, agent, tag] as const,
    contactsPrevious: (period?: string) => ['reports-contacts-previous', period] as const,
    contactsPreviousFiltered: (period?: string, agent?: string) => ['reports-contacts-previous', period, agent] as const,
    messages: (period?: string) => ['reports-messages', period] as const,
    messagesFiltered: (period?: string, agent?: string) => ['reports-messages', period, agent] as const,
    messagesPrevious: (period?: string) => ['reports-messages-previous', period] as const,
    messagesPreviousFiltered: (period?: string, agent?: string) => ['reports-messages-previous', period, agent] as const,
  },

  // Goals / Targets
  goals: {
    config: () => ['goals-config'] as const,
    configForProfile: (profileId?: string) => ['goals-config', profileId] as const,
    messagesRoot: () => ['goals-messages'] as const,
    messages: (period?: string) => ['goals-messages', period] as const,
    contacts: (period?: string) => ['goals-contacts', period] as const,
    contactsFiltered: (period?: string, profileId?: string) => ['goals-contacts', period, profileId] as const,
  },

  // TalkX (bulk messaging)
  talkx: {
    blacklist: () => ['talkx-blacklist'] as const,
    campaignLive: () => ['talkx-campaign-live'] as const,
    campaignLiveById: (campaignId?: string) => ['talkx-campaign-live', campaignId] as const,
    recipientsList: () => ['talkx-recipients-list'] as const,
    recipientsListForCampaign: (campaignId?: string) => ['talkx-recipients-list', campaignId] as const,
    contactsForBlacklist: () => ['contacts-for-blacklist'] as const,
    contactsTalkx: () => ['contacts-talkx'] as const,
    waConnections: () => ['wa-connections-talkx'] as const,
  },

  // Scheduled Reports
  scheduledReports: {
    configs: () => ['scheduled-report-configs'] as const,
  },

  // Contacts extended (per-contact sub-queries)
  contactDetails: {
    notes: (contactId?: string) => ['contact-notes', contactId] as const,
    aiTags: (contactId?: string) => ['contact-ai-tags', contactId] as const,
    enriched: (contactId?: string) => ['contact-enriched', contactId] as const,
    localId: (contactId?: string) => ['contact-local-id', contactId] as const,
    intelligence: (contactId?: string) => ['contact-intelligence', contactId] as const,
    tagsMap: () => ['contact-tags-map'] as const,
    transfersPaginated: (contactId?: string) => ['transfers-paginated', contactId] as const,
    singleContactRoot: () => ['contact'] as const,
    singleContact: (remoteJid?: string) => ['contact', remoteJid] as const,

    typeCounts: () => ['contacts-type-counts'] as const,
    inboxScopes: () => ['inbox-custom-scopes'] as const,
    agentForHandoff: () => ['agents-for-handoff'] as const,
    agentForMention: () => ['agents-for-mention'] as const,
  },

  // User Profile (self)
  userProfile: {
    me: () => ['my-profile'] as const,
    meById: (userId?: string) => ['my-profile', userId] as const,
    byId: (userId?: string) => ['user-profile', userId] as const,

    visibleAgentIdsForUser: (userId?: string) => ['visible-agent-ids', userId] as const,
    forPermissions: () => ['profiles-for-permissions'] as const,
    forUsage: () => ['profiles-for-usage'] as const,
    permissionsList: () => ['permissions-list'] as const,
  },

  // Department extended
  departmentChat: {
    list: () => ['departments-list'] as const,
    agents: (deptId?: string) => ['department-agents', deptId] as const,
  },

  // Calls History
  calls: {
    history: (contactId?: string) => ['calls-history', contactId] as const,
  },

  // Chatbot Flows extended
  chatbot: {
    executions: (contactId?: string) => ['chatbot-executions', contactId] as const,
    l1Flow: (instanceId?: string) => ['chatbot-l1-flow', instanceId] as const,
  },

  // AI Features
  aiFeatures: {
    tagStats: () => ['ai-tag-stats'] as const,
    usageLogs: (filters?: unknown) => ['ai-usage-logs', filters] as const,
    statsWidget: () => ['ai-stats-widget'] as const,
    statsWidgetPeriod: (period?: string) => ['ai-stats-widget', period] as const,
    providerHealth: () => ['ai-provider-health'] as const,
  },

  // Admin extended sub-keys
  adminOps: {
    stsDashboard: () => [...queryKeys.admin.all(), 'sts-commercial-dashboard'] as const,
    publicApi: () => [...queryKeys.admin.all(), 'public-api-dashboard'] as const,
    visibilityGrants: () => [...queryKeys.admin.all(), 'visibility-grants'] as const,
    qrAttempts: (status?: string, instance?: string) =>
      [...queryKeys.admin.all(), 'qr-attempts', status, instance] as const,
    playbooks: () => [...queryKeys.admin.all(), 'playbooks'] as const,
    crisisRoom: () => [...queryKeys.admin.all(), 'crisis-room'] as const,
    inboxScopes: () => [...queryKeys.admin.all(), 'inbox-custom-scopes'] as const,
    sicoobBridge: () => [...queryKeys.admin.all(), 'sicoob-bridge-dashboard'] as const,
    emailWebhook: () => [...queryKeys.admin.all(), 'email-webhook-monitor'] as const,
    rateLimitLogs: (page?: string) =>
      [...queryKeys.admin.all(), 'rate-limit-logs', page] as const,
    diagnostics: () => [...queryKeys.admin.all(), 'diagnostics'] as const,
    agentVersions: () => ['admin-agent-versions-list'] as const,
    alertHistory: () => ['admin-alert-history'] as const,
    alertHistoryFiltered: (hoursBack?: string | number, statusFilter?: string, typeFilter?: string, instanceFilter?: string) =>
      ['admin-alert-history', hoursBack, statusFilter, typeFilter, instanceFilter] as const,
    evolutionApiLogs: () => ['admin-evolution-api-logs'] as const,
    evolutionApiLogsFiltered: (hoursBack?: string | number, statusFilter?: string, actionSearch?: string, instanceFilter?: string) =>
      ['admin-evolution-api-logs', hoursBack, statusFilter, actionSearch, instanceFilter] as const,
    webhookOverview: () => ['admin-webhook-overview'] as const,
    webhookOverviewFiltered: (hours?: string | number, includeUnprocessed?: boolean) =>
      ['admin-webhook-overview', hours, includeUnprocessed] as const,
    webhookInstances: () => ['webhook-instances-list'] as const,
    webhookRecentEvents: (instanceId?: string) =>
      ['webhook-recent-events', instanceId] as const,
    webhookSecretStatus: () => ['webhook-secret-status'] as const,
    webhookEvents: () => ['admin-webhook-events'] as const,
    webhookEventsFiltered: (hours?: string | number, eventType?: string, instance?: string, messageType?: string, status?: string, remoteJidFilter?: string, pushNameFilter?: string) =>
      ['admin-webhook-events', hours, eventType, instance, messageType, status, remoteJidFilter, pushNameFilter] as const,
    kbArticleCount: () => ['kb-article-count'] as const,
    dlqAuditLog: () => ['dlq-audit-log'] as const,
    dlqAuditLogFiltered: (params?: unknown) => ['dlq-audit-log', params] as const,
    userRoles: () => ['user-roles-overview'] as const,
    realtimeMonitor: () => ['realtime-monitor'] as const,
    realtimeMonitorConnections: () => ['realtime-monitor', 'connections'] as const,
    realtimeMonitorEvents: (windowHours?: number) => ['realtime-monitor', 'events', windowHours] as const,
    warroom: {
      agents: () => ['warroom-agents'] as const,
      queues: () => ['warroom-queues'] as const,
    },
    csatAutoConfig: () => ['csat-auto-config'] as const,
    whatsappConnectionsCsat: () => ['whatsapp-connections-csat'] as const,
    scheduledReportConfigs: () => ['scheduled-report-configs'] as const,
    searchInsights: () => ['search-insights'] as const,
    activityHeatmap: (filters?: unknown) => ['activity-heatmap', filters] as const,
    conversationHeatmap: (filters?: unknown) => ['conversation-heatmap', filters] as const,
    conversationTimeline: (filters?: unknown) => ['conversation-timeline', filters] as const,
    sentimentTrend: (filters?: unknown) => ['sentiment-trend', filters] as const,
    authEventSummary: (filters?: unknown) => ['auth-event-summary', filters] as const,
    authEventSummaryDetailed: (hours?: number, filter?: string) => ['auth-event-summary', hours, filter] as const,
    authEventTrend: (filters?: unknown) => ['auth-event-trend', filters] as const,
    authEventTrendDetailed: (hours?: number, filter?: string) => ['auth-event-trend', hours, filter] as const,
    hmacAudit: () => ['hmac-selftest-audit'] as const,
    hmacAuditFiltered: (range?: unknown, instanceFilter?: string) => ['hmac-selftest-audit', range, instanceFilter] as const,
    hmacAuditInstances: () => ['hmac-selftest-audit-instances'] as const,
    hmacAuditInstancesRange: (range?: unknown) => ['hmac-selftest-audit-instances', range] as const,
    idempotencyMiss: () => ['idempotency-miss'] as const,
    incidentEvents: () => ['incident-events'] as const,
    incidentEventsDetailed: (pauseId?: string, sinceMin?: number) => ['incident-events', pauseId, sinceMin] as const,
    instancePauses: () => ['instance-pauses'] as const,
    instancePausesActive: () => ['instance-pauses', 'active'] as const,
    instancePausesHistory: () => ['instance-pauses', 'history'] as const,
    evoApiHealth: () => ['evo-api-health'] as const,
    evoApiHealthDashboard: () => ['evo-api-health', 'dashboard'] as const,
    evoApiHealthAlertsActive: () => ['evo-api-health', 'alerts-active'] as const,
    evoApiHealthHistory: () => ['evo-api-health', 'history'] as const,
    evoApiHealthChannels: () => ['evo-api-health', 'channels'] as const,
    evoApiHealthDrRunbook: () => ['evo-api-health', 'dr-runbook'] as const,
    evoApiHealthDrHealth: () => ['evo-api-health', 'dr-health'] as const,
    rateLimitLogsStats: () => ['admin', 'rate-limit-logs', 'stats'] as const,
    idempotencyMissLastHour: () => ['idempotency-miss', 'last-hour'] as const,
    transfersPaginated: (filters?: unknown) => ['transfers-paginated', filters] as const,
    deliveryStats: () => ['delivery-stats'] as const,
    operationsLogsAll: () => ['operations-logs'] as const,
    evolutionRetryMetrics: () => ['evolution-retry-metrics'] as const,
    evolutionRetryMetricsFiltered: (filters?: unknown) => ['evolution-retry-metrics', filters] as const,
    alertInstanceDetail: (alertId?: string) =>
      ['alert-instance-detail', alertId] as const,
    operationsLogs: (filters?: unknown) => ['operations-logs', filters] as const,
    telemetry: (severityFilter?: string, timeFilter?: string, dateFrom?: string, dateTo?: string) =>
      ['query-telemetry', severityFilter, timeFilter, dateFrom, dateTo] as const,
  },

  // Dispatch Error Logs (append-only audit trail)
  dispatchErrorLogs: {
    all: () => ['dispatch-error-logs'] as const,
    filtered: (filters?: unknown) => ['dispatch-error-logs', filters] as const,
  },

  // Entity Versions (audit/restore)
  versions: {
    all: () => ['versions'] as const,
    forEntity: (entityType: string, entityId: string) =>
      ['versions', entityType, entityId] as const,
  },

};

/**
 * Utility function to invalidate related queries
 *
 * Usage:
 * queryClient.invalidateQueries({ queryKey: queryKeys.contacts.lists() })
 * queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all() }) // Invalidates all contacts queries
 */
