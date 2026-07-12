export interface DashboardFilters {
  dateRange?: { from: Date; to: Date };
  queueId?: string | null;
  agentId?: string | null;
}

export interface QueueStats {
  id: string;
  name: string;
  color: string;
  waitingCount: number;
  onlineAgents: number;
  totalAgents: number;
}

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
