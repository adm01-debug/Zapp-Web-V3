/**
 * useFailedMessageAlerts
 *
 * Ouve em realtime a tabela `failed_messages` e dispara um toast de alerta
 * para o agente assim que uma mensagem dele entra no estado terminal `abandoned`
 * (esgotou os retries do reprocessador da DLQ).
 *
 * Por que existe:
 *  - O `DLQPanel` é restrito a admins/supervisores.
 *  - O `MessageStatusInline` mostra "×N" no balão, mas só quando o agente está
 *    com aquela conversa aberta. Se o abandono acontecer com o chat fechado
 *    (cron a cada 15min), o agente perde a sinalização sem este hook.
 *
 * O hook é montado uma única vez no AppShell. Não persiste alerta — apenas
 * notifica via toast. Persistência/auditoria já existem em `failed_messages`.
 *
 * Filtro: assina UPDATE em `failed_messages` e reage somente quando
 * `status='abandoned'`. Isso cobre tanto a transição vinda do reprocessador
 * quanto a marcação manual via `DLQPanel`. Sem `idempotency_key` interno
 * para deduplicar — confiamos na unicidade do `id` por update.
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';

const log = getLogger('FailedMessageAlerts');

interface FailedMessageRowMinimal {
  id: string;
  status: string;
  instance_name: string | null;
  remote_jid: string | null;
  error_code: string | null;
  retry_count: number | null;
}

function describeError(code: string | null): string {
  if (!code) return 'falha repetida';
  if (code === 'timeout') return 'timeout';
  if (code === 'network_error') return 'rede';
  if (code.startsWith('http_')) return code.replace('http_', 'HTTP ');
  return code;
}

export function useFailedMessageAlerts(enabled = true): void {
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel('failed_messages_alerts')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'zapp', table: 'failed_messages' },
        (payload) => {
          const next = payload.new as FailedMessageRowMinimal | null;
          const prev = payload.old as FailedMessageRowMinimal | null;
          if (!next || next.status !== 'abandoned') return;
          // Evita repetir toast caso o realtime reentregue o mesmo update.
          if (seenRef.current.has(next.id)) return;
          // Só alerta na transição (algo→abandoned), não em re-syncs.
          if (prev?.status === 'abandoned') {
            seenRef.current.add(next.id);
            return;
          }
          seenRef.current.add(next.id);

          const reason = describeError(next.error_code);
          const tail = next.remote_jid ? ` para ${next.remote_jid.split('@')[0]}` : '';
          toast.error(
            `Mensagem abandonada após ${next.retry_count ?? '?'} tentativas (${reason})${tail}.`,
            {
              description:
                'O reprocessador da fila esgotou as tentativas. Verifique o painel de mensagens com falha.',
              duration: 12_000,
            },
          );
          log.warn('[dlq-alert] abandoned', {
            id: next.id,
            instance: next.instance_name,
            error_code: next.error_code,
          });
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') log.warn('[dlq-alert] channel error');
      });

    return () => {
      void channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [enabled]);
}
