/** Retry and timing configuration for the outbound message queue (max attempts, back-off parameters, jitter). */
export interface QueueConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  jitter: boolean;
}

/** Production defaults: 3 retries, 1s base delay, 30s max, with jitter. */
export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  jitter: true,
};

/** Single item in the outbound message queue, tracking lifecycle status, retry attempts, progress, and timing. */
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

/** Aggregate send metrics for the message queue: totals by type and conversation with latency arrays for P50/P95 computation. */
export interface QueueMetrics {
  totalSent: number;
  totalFailed: number;
  totalRetries: number;
  averageLatency: number;
  byType: Record<string, { sent: number; failed: number; latency: number[] }>;
  byConversation: Record<string, { sent: number; failed: number; latency: number[] }>;
}
