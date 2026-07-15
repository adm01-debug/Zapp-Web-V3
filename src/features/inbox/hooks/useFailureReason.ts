/**
 * Lookup do motivo de falha terminal de uma mensagem outbound.
 *
 * Cruza `messages.id` com `evolution_retry_metrics.idempotency_key`
 * (formato `msg:<id>`) para extrair o último motivo conhecido quando o
 * envio falhou após todas as tentativas. Usado pelo `MessageStatusInline`
 * para enriquecer o tooltip da bolha com algo acionável (ex.: `http_503`,
 * `timeout`, `network_error`).
 *
 * Lazy: o `enabled` controla quando a query roda — só faz fetch quando o
 * componente sabe que a mensagem está em estado de falha terminal.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MessageFailureReason {
  /** Último motivo registrado (ex.: 'http_503', 'timeout'). */
  reason: string;
  /** Status final do request (status HTTP da última tentativa, se houver). */
  finalHttpStatus: number | null;
  /** Quantidade total de tentativas executadas. */
  attempts: number;
  /** Resultado final no `evolution_retry_metrics`. */
  finalStatus: 'success' | 'failed' | 'exhausted';
}

interface RetryReasonRow {
  attempt_count: number;
  final_status: 'success' | 'failed' | 'exhausted';
  final_http_status: number | null;
  retry_reasons: Array<{ attempt: number; status?: number; reason: string }> | null;
}

const STALE_MS = 60_000;

export function useFailureReason(messageId: string | undefined, enabled: boolean) {
  return useQuery<MessageFailureReason | null>({
    queryKey: ['message-failure-reason', messageId],
    enabled: Boolean(messageId) && enabled,
    staleTime: STALE_MS,
    queryFn: async () => {
      if (!messageId) return null;
      const { data, error } = await supabase
        .from('evolution_retry_metrics')
        .select('attempt_count, final_status, final_http_status, retry_reasons')
        .eq('idempotency_key', `msg:${messageId}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle<RetryReasonRow>();

      if (error || !data) return null;
      if (data.final_status === 'success') return null;

      const reasons = Array.isArray(data.retry_reasons) ? data.retry_reasons : [];
      const last = reasons[reasons.length - 1];
      const reason = last?.reason ?? `http_${data.final_http_status ?? 'error'}`;

      return {
        reason,
        finalHttpStatus: data.final_http_status,
        attempts: data.attempt_count,
        finalStatus: data.final_status,
      };
    },
  });
}

/** Tradução curta para uso em tooltip. */
export function formatFailureReason(reason: string): string {
  if (reason.startsWith('http_')) {
    const code = reason.slice(5);
    return `HTTP ${code}`;
  }
  if (reason === 'timeout') return 'Tempo esgotado';
  if (reason === 'network_error') return 'Erro de rede';
  if (reason === 'auth_failed') return 'Falha de autenticação';
  return reason;
}
