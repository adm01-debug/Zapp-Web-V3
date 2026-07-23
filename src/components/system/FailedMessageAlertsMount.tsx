/**
 * Componente headless: monta no shell todos os alertas globais ligados ao
 * ciclo de vida de envio de mensagens. Não renderiza nada.
 *
 *  - `useFailedMessageAlerts`: avisa quando uma mensagem é abandonada na DLQ.
 *  - `useRetryResolutionAlerts`: avisa quando uma mensagem que estava em
 *    `retrying` resolveu (sent/failed_retries/failed_auth) — útil quando o
 *    agente fechou a conversa antes do desfecho.
 */
import { useFailedMessageAlerts } from '@/features/inbox';
import { useRetryResolutionAlerts } from '@/features/inbox';

/** Headless component that activates failed-message and retry-resolution toast alerts; renders nothing. */
export function FailedMessageAlertsMount(): null {
  useFailedMessageAlerts(true);
  useRetryResolutionAlerts(true);
  return null;
}
