/** Hook: Dashboard Filters. */
export interface DashboardFilters {
  dateRange?: { from: Date; to: Date };
  queueId?: string | null;
  agentId?: string | null;
}

/** Hook: Queue Stats. */
export interface QueueStats {
  id: string;
  name: string;
  color: string | null;
  waitingCount: number;
  onlineAgents: number;
  totalAgents: number;
}

/** Hook: Recent Activity. */
export interface RecentActivity {
  id: string;
  contactName: string;
  contactPhone: string;
  contactAvatar: string | null;
  lastMessage: string;
  timestamp: string;
  status: string;
  unreadCount: number;
}

/** Hook: Dashboard Stats. */
export interface DashboardStats {
  openConversations: number;
  pendingConversations: number;
  resolvedToday: number;
  totalConversations: number;
  onlineAgents: number;
  totalAgents: number;
  avgResponseTime: number | null;
  queuesStats: QueueStats[];
  recentActivity: RecentActivity[];
}
