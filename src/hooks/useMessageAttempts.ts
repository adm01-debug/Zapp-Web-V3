// Re-export from consolidated useAnalyticsManagement module (ETAPA 39 consolidation)
import { useMessageAttemptsManagement } from '@/hooks/useAnalyticsManagement';

export type AttemptStatus = 'pending' | 'retrying' | 'succeeded' | 'failed' | 'abandoned';

export interface MessageAttemptRow extends Record<string, unknown> {
  id?: string;
  message_id?: string;
  status: AttemptStatus;
  retry_count: number;
  max_retries: number;
  error_message?: string | null;
  last_retry_reason?: string | null;
  first_attempt_at?: string | null;
  last_attempt_at?: string | null;
  next_retry_at?: string | null;
  created_at?: string;
}

export function useMessageAttempts(messageId: string | null, options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const result = useMessageAttemptsManagement(enabled && messageId ? messageId : '');

  return {
    data: (result.attempts[0] as MessageAttemptRow | undefined) ?? null,
    isLoading: result.loading,
    error: null as Error | null,
  };
}
