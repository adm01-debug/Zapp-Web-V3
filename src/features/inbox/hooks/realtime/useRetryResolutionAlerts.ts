/**
 * useRetryResolutionAlerts
 *
 * Notifica o agente sempre que uma mensagem que estava em `retrying`
 * é resolvida — seja com sucesso (`sent`) ou esgotamento de tentativas
 * (`failed_retries`/`failed_auth`).
 *
 * Por que existe:
 *  - O badge "2/3" no balão só aparece com a conversa aberta. Se o agente
 *    saiu da tela durante o retry, ele não percebe quando a mensagem
 *    finalmente entrega ou desiste.
 *  - O alerta de falha terminal (`useTerminalSendFailureAlerts`) cobre só
 *    o caminho de erro. Aqui também avisamos no caminho de sucesso, para
 *    fechar o ciclo visual ("estava reenviando… agora foi").
 *
 * Fontes de evento (redundantes, deduplicadas por messageId):
 *  1. `subscribeAllSendStatus` (in-memory bus) — feedback imediato na aba
 *     em que o envio aconteceu.
 *  2. Postgres Realtime em `messages` — captura a transição mesmo se o
 *     usuário trocou de aba ou se outro agente reenviou no backend.
 *
 * O alerta nunca repete para o mesmo messageId. Soft cap de 500 para evitar
 * crescimento ilimitado do Set em sessões longas.
 */
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { subscribeAllSendStatus, type SendUIStatus } from './sendStatusBus';
import { getLogger } from '@/lib/logger';

const log = getLogger('RetryResolutionAlerts');

const SOFT_CAP = 500;
const TERMINAL_OK: SendUIStatus[] = ['sent'];
const TERMINAL_FAIL: SendUIStatus[] = ['failed_retries', 'failed_auth'];

interface MessageRowMinimal {
  id: string;
  status: string | null;
  contact_id: string | null;
  retry_attempt: number | null;
  retry_total: number | null;
  error_reason: string | null;
}

function pruneIfNeeded(set: Set<string>) {
  if (set.size <= SOFT_CAP) return;
  // Remove the oldest ~20% of entries (insertion order on Set is preserved).
  const drop = Math.floor(SOFT_CAP * 0.2);
  let i = 0;
  for (const id of set) {
    if (i++ >= drop) break;
    set.delete(id);
  }
}

export function useRetryResolutionAlerts(enabled = true): void {
  const navigate = useNavigate();
  const seenRef = useRef<Set<string>>(new Set());
  // Tracks messages we observed in `retrying` so we only alert on a true
  // retrying→terminal transition (not on first-shot success).
  const wasRetryingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;

    const notifySuccess = (
      messageId: string,
      contactId: string | null,
      attempt?: number,
      total?: number
    ) => {
      if (seenRef.current.has(messageId)) return;
      seenRef.current.add(messageId);
      pruneIfNeeded(seenRef.current);
      const counter = attempt && total ? ` (${attempt}/${total})` : '';
      toast.success(`Mensagem entregue após retentativa${counter}`, {
        description: 'A reentrega automática foi concluída com sucesso.',
        duration: 6_000,
        action: contactId
          ? {
              label: 'Abrir conversa',
              onClick: () => navigate(`/chat-popup/${contactId}`),
            }
          : undefined,
      });
      log.info('[retry-resolved] success', { messageId, contactId });
    };

    const notifyFailure = (
      messageId: string,
      contactId: string | null,
      finalStatus: SendUIStatus | string,
      reason?: string | null,
      attempt?: number,
      total?: number
    ) => {
      if (seenRef.current.has(messageId)) return;
      seenRef.current.add(messageId);
      pruneIfNeeded(seenRef.current);
      const isAuth = finalStatus === 'failed_auth';
      const counter = attempt && total ? ` (${attempt}/${total})` : '';
      toast.error(
        isAuth
          ? 'Falha de autenticação após retentativas'
          : `Mensagem falhou após esgotar retentativas${counter}`,
        {
          description: isAuth
            ? 'Verifique a conexão WhatsApp para retomar os envios.'
            : reason || 'Todas as tentativas automáticas falharam.',
          duration: 12_000,
          action: contactId
            ? {
                label: 'Abrir conversa',
                onClick: () => navigate(`/chat-popup/${contactId}`),
              }
            : undefined,
        }
      );
      log.warn('[retry-resolved] failure', { messageId, contactId, finalStatus, reason });
    };

    // ── Source 1: in-memory bus ────────────────────────────────────────────
    const unsubBus = subscribeAllSendStatus((messageId, detail) => {
      if (detail.status === 'retrying') {
        wasRetryingRef.current.add(messageId);
        return;
      }
      if (!wasRetryingRef.current.has(messageId)) return;

      if (TERMINAL_OK.includes(detail.status)) {
        wasRetryingRef.current.delete(messageId);
        notifySuccess(messageId, null, detail.attempt, detail.totalRetries);
      } else if (TERMINAL_FAIL.includes(detail.status)) {
        wasRetryingRef.current.delete(messageId);
        notifyFailure(
          messageId,
          null,
          detail.status,
          detail.errorReason,
          detail.attempt,
          detail.totalRetries
        );
      }
    });

    // ── Source 2: Postgres realtime (cross-tab / cross-agent) ──────────────
    const channel = supabase
      .channel('retry_resolution_alerts')
      .on<MessageRowMinimal>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'evo', table: 'evolution_messages' },
        (payload) => {
          const next = payload.new;
          const prev = payload.old;
          if (!next || !prev) return;

          // Only react when prior status was 'retrying' and now resolved.
          if (prev.status !== 'retrying') return;
          if (next.status === 'retrying' || next.status === 'sending') return;

          const attempt = next.retry_attempt ?? undefined;
          const total = next.retry_total ?? undefined;

          if (next.status === 'sent') {
            notifySuccess(next.id, next.contact_id, attempt, total);
          } else if (
            next.status === 'failed_retries' ||
            next.status === 'failed' ||
            next.status === 'failed_auth'
          ) {
            notifyFailure(next.id, next.contact_id, next.status, next.error_reason, attempt, total);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') log.warn('[retry-resolved] channel error');
      });

    return () => {
      unsubBus();
      channel.unsubscribe();
    };
  }, [enabled, navigate]);
}
