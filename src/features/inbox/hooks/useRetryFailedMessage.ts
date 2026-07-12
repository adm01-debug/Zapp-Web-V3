/**
 * Mutation que dispara a RPC `rpc_dlq_retry_now` para reenfileirar uma
 * mensagem falhada. Cobre:
 *   - Guard de auth (bloqueia antes da RPC)
 *   - Rate-limit local por messageId (30s) contra double-click / storm
 *   - Optimistic append de `AuditEntry` no cache do TanStack
 *   - Rollback + toast em erro, com mensagens específicas para
 *     `42501` (sem permissão) e `PGRST116` (item ausente da DLQ).
 */
import { useCallback, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { getLogger } from '@/lib/logger';
import type { AuditEntry, MessageSendHistory } from './useMessageSendHistory';

const log = getLogger('useRetryFailedMessage');
const RATE_LIMIT_MS = 30_000;

export interface RetryFailedMessageInput {
  /** UUID do registro na `failed_messages` (aceita p_id/p_item_id). */
  failedMessageId: string;
  /** ID lógico da mensagem, usado como cache key do histórico. */
  messageId: string;
}

interface RpcError extends Error {
  code?: string;
}

function messageForError(err: unknown): string {
  const e = err as RpcError | undefined;
  if (e?.code === '42501') return 'Sem permissão para reenviar esta mensagem.';
  if (e?.code === 'PGRST116') return 'Mensagem não está mais na fila de reenvio.';
  return 'Falha ao reenviar a mensagem. Tente novamente em instantes.';
}

export function useRetryFailedMessage() {
  const queryClient = useQueryClient();
  const lastAttemptAt = useRef<Map<string, number>>(new Map());

  const isRateLimited = useCallback((messageId: string) => {
    const prev = lastAttemptAt.current.get(messageId);
    if (!prev) return false;
    return Date.now() - prev < RATE_LIMIT_MS;
  }, []);

  return useMutation({
    mutationFn: async (input: RetryFailedMessageInput) => {
      const { failedMessageId, messageId } = input;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        const err: RpcError = new Error('Autenticação requerida.');
        err.code = '42501';
        throw err;
      }
      if (isRateLimited(messageId)) {
        throw new Error(
          `Aguarde ${Math.ceil(RATE_LIMIT_MS / 1000)}s antes de tentar novamente.`,
        );
      }
      lastAttemptAt.current.set(messageId, Date.now());

      const { data, error } = await supabase.rpc('rpc_dlq_retry_now', {
        p_id: failedMessageId,
      });
      if (error) {
        const err: RpcError = new Error(error.message);
        err.code = error.code;
        throw err;
      }
      return data;
    },
    onMutate: async ({ messageId }) => {
      const queryKey = ['message-send-history', messageId] as const;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<MessageSendHistory>(queryKey);

      const optimistic: AuditEntry = {
        id: `optimistic-${Date.now()}`,
        action: 'retry_requested',
        createdAt: new Date().toISOString(),
        details: { source: 'client_optimistic' },
      };

      queryClient.setQueryData<MessageSendHistory>(queryKey, (curr) => {
        if (!curr) return { metric: null, auditEntries: [optimistic] };
        return { ...curr, auditEntries: [optimistic, ...curr.auditEntries] };
      });

      return { previous, queryKey };
    },
    onError: (err, _vars, context) => {
      if (context?.previous !== undefined && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
      log.error('retry failed', err);
      toast({
        title: 'Reenvio falhou',
        description: messageForError(err),
        variant: 'destructive',
      });
    },
    onSuccess: (_data, { messageId }) => {
      queryClient.invalidateQueries({ queryKey: ['message-send-history', messageId] });
      toast({ title: 'Reenvio enfileirado', description: 'A mensagem entrou novamente na fila.' });
    },
  });
}
