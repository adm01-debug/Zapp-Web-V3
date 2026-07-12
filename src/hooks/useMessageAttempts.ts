// @ts-nocheck
/**
 * useMessageAttempts — hidrata o histórico de tentativas de envio (DLQ) para
 * uma mensagem específica.
 *
 * Como casa uma mensagem com sua linha em `failed_messages`?
 *   - O sender constrói `idempotency_key = "msg:<message-row-id>"` (ver
 *     `buildSendIdempotencyKey`). Esse é o caminho primário.
 *   - Como fallback, tenta `payload->>'message_id'` (alguns reprocessamentos
 *     legados gravam o id WhatsApp ali).
 *
 * RLS: `failed_messages` é restrito a admin/supervisor. Para agentes a query
 * simplesmente retorna vazio — `MessageDetailsDialog` trata como "sem
 * permissão" graciosamente.
 */
import { useQuery } from '@tanstack/react-query';
import { safeClient } from '@/integrations/supabase/safeClient';

export type AttemptStatus = 'pending' | 'retrying' | 'succeeded' | 'failed' | 'abandoned';

export interface MessageAttemptRow {
  id: string;
  status: AttemptStatus;
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

export function useMessageAttempts(messageRowId: string | null, opts: { enabled?: boolean } = {}) {
  const enabled = !!messageRowId && opts.enabled !== false;

  return useQuery<MessageAttemptRow | null, Error>({
    queryKey: ['message-attempts', messageRowId],
    enabled,
    staleTime: 15_000,
    refetchInterval: (query) => {
      // Mantém polling enquanto a tentativa estiver em andamento.
      const row = query.state.data as MessageAttemptRow | null | undefined;
      if (!row) return false;
      return row.status === 'pending' || row.status === 'retrying' ? 5_000 : false;
    },
    queryFn: async () => {
      if (!messageRowId) return null;

      const SELECT_COLS =
        'id,status,retry_count,max_retries,error_code,error_message,http_status,last_retry_reason,last_attempt_at,next_attempt_at,succeeded_at,created_at,updated_at';

      // Tentativa primária: idempotency_key padrão `msg:<id>`.
      const primaryKey = `msg:${messageRowId}`;
      const { data: byKeyArr, error: keyErr } = await safeClient.from<MessageAttemptRow>(
        'failed_messages',
        (q) =>
          q
            .select(SELECT_COLS)
            .eq('idempotency_key', primaryKey)
            .order('created_at', { ascending: false })
            .limit(1)
      );

      // 42501/permission/RLS → trata como "sem permissão", não erro.
      if (keyErr && !/permission|denied|row-level/i.test(keyErr.message)) {
        throw keyErr;
      }
      const byKey = byKeyArr?.[0] ?? null;
      if (byKey) return byKey;

      // Fallback: payload->>'message_id' (reprocessos legados).
      const { data: byPayloadArr, error: pErr } = await safeClient.from<MessageAttemptRow>(
        'failed_messages',
        (q) =>
          q
            .select(SELECT_COLS)
            .eq('payload->>message_id', messageRowId)
            .order('created_at', { ascending: false })
            .limit(1)
      );

      if (pErr && !/permission|denied|row-level/i.test(pErr.message)) {
        throw pErr;
      }
      return byPayloadArr?.[0] ?? null;
    },
  });
}