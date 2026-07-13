export interface QueueConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  jitter: boolean;
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  jitter: true,
};

export interface QueueItem {
  id: string;
  contactId: string;
  content: string;
  type: 'text' | 'attachment' | 'audio';
  attachments?: File[];
  onProgress?: (p: number) => void;
  status: 'pending' | 'sending' | 'failed' | 'confirmed';
  error?: unknown;
  retryCount: number;
  progress?: number;
  externalId?: string;
  createdAt: number;
  completedAt?: number;
  nextRetryAt?: number;
  attempts: Array<{
    timestamp: number;
    error?: string;
    duration?: number;
  }>;
}

export interface QueueMetrics {
  totalSent: number;
  totalFailed: number;
  totalRetries: number;
  averageLatency: number;
  byType: Record<string, { sent: number; failed: number; latency: number[] }>;
  byConversation: Record<string, { sent: number; failed: number; latency: number[] }>;
}
