/**
 * Inline message status indicator used inside message bubbles.
 *
 * Combines the persisted `message.status` (DB) with the transient send-status
 * bus (in-memory) so that retries surface live next to the message — agents
 * can see "2/3" while a send is being retried, without relying on toasts.
 *
 * Rendering rules:
 *  - bus state wins for transient statuses (sending/retrying)
 *  - bus state wins on terminal statuses if it is more recent than the DB row
 *  - otherwise we fall back to `message.status`
 *  - when the bus has no attempt counters (e.g. after a page reload), we
 *    hydrate from the persisted `retry_attempt` / `retry_total` columns so
 *    the "2/3" badge survives navigation.
 */
import { memo, useEffect, useRef } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getLogger } from '@/lib/logger';

const log = getLogger('MessageStatusInline');
import { cn } from '@/lib/utils';
import type { Message } from '@/types/chat';
import { MessageStatusIcon } from './messageUtils';
import { useMessageSendStatus } from '@/features/inbox';
import { useFailureReason, formatFailureReason } from '@/features/inbox';
import { clearSendStatus } from '@/features/inbox';
import { useInboxStatusPref } from '@/features/inbox';
import { MessageStatusPanel } from './MessageStatusPanel';
import { MessageStatusTimestamps } from './MessageStatusTimestamps';

interface MessageStatusInlineProps {
  message: Pick<
    Message,
    'id' | 'status' | 'sender' | 'timestamp' | 'created_at' | 'updated_at' | 'retry_attempt' | 'retry_total'
  > & {
    status_updated_at?: string;
    error_code?: string | null;
    error_reason?: string | null;
    contact_read_at?: string | null;
  };
  className?: string;
  /** Quando true, exibe sempre o rótulo textual (independente da preferência). */
  forceLabel?: boolean;
}

import { STATUS_LABEL_UNIFIED, describeStatus } from './messageStatusLanguage';

const STATUS_LABELS: Record<string, string> = STATUS_LABEL_UNIFIED;

const TRANSIENT = new Set(['sending', 'retrying']);
const TERMINAL_FAILURES = new Set(['failed', 'failed_auth', 'failed_retries']);
const TERMINAL_DB = new Set([
  'sent', 'delivered', 'read', 'played',
  'failed', 'failed_auth', 'failed_retries',
]);

/** Message Status Inline constant. */
export const MessageStatusInline = memo(function MessageStatusInline({
  message,
  className,
  forceLabel,
}: MessageStatusInlineProps) {
  const { showLabel } = useInboxStatusPref();
  const showTextLabel = forceLabel || showLabel;
  const bus = useMessageSendStatus(message.id);
  const lastStatusRef = useRef(message.status);

  useEffect(() => {
    if (message.status !== lastStatusRef.current) {
      log.info(`[Status Update] Msg ${message.id.slice(0, 8)} changed: ${lastStatusRef.current} -> ${message.status}`);
      lastStatusRef.current = message.status;
    }
  }, [message.id, message.status]);

  // Reconciliation: when the persisted DB status reaches a terminal state but
  // the in-memory bus still holds a stale transient (sending/retrying) — a
  // classic race condition where the DB realtime update arrives after the
  // optimistic bus emission — clear the bus entry so the persisted status wins
  // and the "2/3" badge does not get stuck.
  useEffect(() => {
    if (!message.status || !bus) return;
    if (!TERMINAL_DB.has(message.status)) return;
    // Only clear if the bus is still transient OR contradicts the DB terminal.
    const busIsTransient = TRANSIENT.has(bus.status);
    const busDisagrees = bus.status !== message.status && !TRANSIENT.has(bus.status);
    if (busIsTransient || busDisagrees) {
      clearSendStatus(message.id);
    }
  }, [message.id, message.status, bus]);

  // Decide which status to render
  const effectiveStatus =
    bus && (TRANSIENT.has(bus.status) || bus.status === 'failed_retries' || bus.status === 'failed_auth')
      ? bus.status
      : message.status;

  const isRetrying = effectiveStatus === 'retrying';
  const isTerminalFailure = TERMINAL_FAILURES.has(effectiveStatus);

  // Counters: prefer the live bus, fall back to persisted DB columns.
  const attempt = bus?.attempt ?? message.retry_attempt ?? undefined;
  const totalRetries = bus?.totalRetries ?? message.retry_total ?? undefined;

  const showAttemptBadge =
    isRetrying && typeof attempt === 'number' && typeof totalRetries === 'number';
  const showFailedAfterRetries =
    effectiveStatus === 'failed_retries' && typeof totalRetries === 'number';

  // Lazy lookup do motivo final no evolution_retry_metrics — só roda em falha.
  const { data: failure } = useFailureReason(message.id, isTerminalFailure);

  const baseTooltip = isRetrying
    ? showAttemptBadge
      ? `Tentando reenviar (${attempt}/${totalRetries})…`
      : 'Tentando reenviar…'
    : showFailedAfterRetries
      ? `Falhou após ${totalRetries} tentativas`
      : isTerminalFailure
        ? 'Falha no envio'
        : (effectiveStatus === 'sent' || effectiveStatus === 'delivered' || effectiveStatus === 'read' || effectiveStatus === 'played')
          ? describeStatus(effectiveStatus, 'outbound')
          : undefined;

  const tooltip = isTerminalFailure && failure
    ? `${baseTooltip} — ${formatFailureReason(failure.reason)} (após ${failure.attempts} tentativa${failure.attempts === 1 ? '' : 's'})`
    : baseTooltip;

  const labelText = STATUS_LABELS[effectiveStatus] ?? '';

  return (
    <MessageStatusPanel message={message}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
        type="button"
        className={cn(
          'inline-flex items-center gap-0.5 cursor-pointer rounded-sm focus-visible:outline-none',
          'hover:opacity-80 transition-opacity text-[hsl(var(--muted-foreground))] dark:text-[hsl(var(--muted-foreground))]',
          className,
        )}
        title={tooltip}
        data-testid="message-status-inline"
        data-status={effectiveStatus}
        data-attempt={showAttemptBadge ? attempt : undefined}
        aria-label={`Detalhes de entrega — ${labelText || effectiveStatus}`}
      >
        <MessageStatusIcon status={effectiveStatus} />
        {showAttemptBadge && (
          <span
            className="text-[9px] font-semibold leading-none text-warning tabular-nums px-0.5"
            aria-label={`Tentativa ${attempt} de ${totalRetries}`}
          >
            {attempt}/{totalRetries}
          </span>
        )}
        {showFailedAfterRetries && (
          <span
            className="text-[9px] font-semibold leading-none text-destructive tabular-nums px-0.5"
            aria-label={`Falhou após ${totalRetries} tentativas`}
          >
            ×{totalRetries}
          </span>
        )}
        {showTextLabel && labelText && (
          <span className="text-[10px] font-medium leading-none ml-0.5 opacity-90">
            {labelText}
          </span>
        )}
        <MessageStatusTimestamps message={message} className="ml-1" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-[10px] px-2 py-1 bg-popover/95 border-border/40 backdrop-blur-md">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </MessageStatusPanel>
  );
});
