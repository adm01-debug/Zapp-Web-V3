// Re-export from consolidated useAnalyticsManagement module (ETAPA 39 consolidation)
import { useMessageAttemptsManagement } from '@/hooks/useAnalyticsManagement';

export function useMessageAttempts(messageId: string) {
  return useMessageAttemptsManagement(messageId);
}
  retry_count: number;
  max_retries: number;
  error_code: string | null;
  error_message: string | null;
  http_status: number | null;
  last_retry_reason: string | null;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  succeeded_at: string | null;
  created_at: string;
  updated_at: string;
}

const EPOCH = new Date(0).toISOString();

function normalizeAttempt(
  r: Partial<MessageAttemptRow> | null | undefined
): MessageAttemptRow | null {
  if (!r || typeof r !== 'object') return null;
  return {
    id: r.id ?? '',
    status: normalizeStatus(r.status),
    retry_count: r.retry_count ?? 0,
    max_retries: r.max_retries ?? 0,
    error_code: r.error_code ?? null,
    error_message: r.error_message ?? null,
    http_status: r.http_status ?? null,
    last_retry_reason: r.last_retry_reason ?? null,
    last_attempt_at: r.last_attempt_at ?? null,
    next_attempt_at: r.next_attempt_at ?? null,
    succeeded_at: r.succeeded_at ?? null,
    created_at: r.created_at ?? EPOCH,
    updated_at: r.updated_at ?? EPOCH,
  };
}

export function useMessageAttempts(messageRowId: string | null, opts: { enabled?: boolean } = {}) {
  const enabled = !!messageRowId && opts.enabled !== false;

  return useQuery<MessageAttemptRow | null, Error>({
    queryKey: ['message-attempts', messageRowId],
    enabled,
    staleTime: 15_000,
    refetchInterval: (query) => {
      // Mantém polling enquanto a tentativa estiver em andamento.
      const row = query.state.data as MessageAttemptRow | null | undefined; // ignore-audit: narrows Supabase query result to local interface
      if (!row) return false;
      return row.status === 'pending' || row.status === 'retrying' ? 5_000 : false;
    },
    queryFn: async () => {
      if (!messageRowId) return null;

      const SELECT_COLS =
        'id,status,retry_count,max_retries,error_code,error_message,http_status,last_retry_reason,last_attempt_at,next_attempt_at,succeeded_at,created_at,updated_at';

      // Tentativa primária: idempotency_key padrão `msg:<id>`.
      const primaryKey = `msg:${messageRowId}`;
      const { data: byKeyArr, error: keyErr } = await safeClient.from('failed_messages', (q) =>
        q
          .select(SELECT_COLS)
          .eq('idempotency_key', primaryKey)
          .order('created_at', { ascending: false })
          .limit(1)
      );

      // 42501/permission/RLS → trata como "sem permissão", não erro.
      if (keyErr && !RLS_ERROR_RE.test(keyErr.message)) {
        throw keyErr;
      }
      const byKeyRows = (byKeyArr ?? []) as Partial<MessageAttemptRow>[];
      const byKey = normalizeAttempt(byKeyRows[0]);
      if (byKey) return byKey;

      // Fallback: payload->>'message_id' (reprocessos legados).
      const { data: byPayloadArr, error: pErr } = await safeClient.from('failed_messages', (q) =>
        q
          .select(SELECT_COLS)
          .eq('payload->>message_id', messageRowId)
          .order('created_at', { ascending: false })
          .limit(1)
      );

      if (pErr && !RLS_ERROR_RE.test(pErr.message)) {
        throw pErr;
      }
      const byPayloadRows = (byPayloadArr ?? []) as Partial<MessageAttemptRow>[];
      return normalizeAttempt(byPayloadRows[0]);
    },
  });
}
