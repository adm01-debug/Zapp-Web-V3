/**
 * MessageReadStatus — indicador clicável de status para mensagens
 * recebidas (inbound). Abre o `MessageStatusPanel` com timeline
 * "Recebida / Lida por você".
 *
 * Renderiza um par ✓ (recebida) ou ✓✓ azul (lida pelo agente).
 */
import { memo, useEffect, useRef } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('MessageReadStatus');
import { cn } from '@/lib/utils';
import { MessageStatusIcon } from './messageUtils';
import { MessageStatusPanel } from './MessageStatusPanel';
import { MessageStatusTimestamps } from './MessageStatusTimestamps';
import { describeStatus, STAGE_LABEL_UNIFIED } from './messageStatusLanguage';
import { useInboxStatusPref } from '@/features/inbox';
import type { Message } from '@/types/chat';

interface Props {
  message: Pick<Message, 'id' | 'sender' | 'status' | 'timestamp' | 'created_at' | 'updated_at'> & {
    status_updated_at?: string;
    contact_read_at?: string | null;
    error_code?: string | null;
    error_reason?: string | null;
  };
  className?: string;
  forceLabel?: boolean;
}

/** Message Read Status constant. */
export const MessageReadStatus = memo(function MessageReadStatus({
  message,
  className,
  forceLabel,
}: Props) {
  const { showLabel } = useInboxStatusPref();
  const showTextLabel = forceLabel || showLabel;
  const reachedRead = !!message.contact_read_at;
  const wasReadRef = useRef(reachedRead);

  useEffect(() => {
    if (reachedRead && !wasReadRef.current) {
      log.info(`[Read Status] Inbound msg ${message.id.slice(0, 8)} marked as READ by agent`);
      wasReadRef.current = true;
    }
  }, [message.id, reachedRead]);

  return (
    <MessageStatusPanel message={message}>
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-0.5 cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60 hover:opacity-80 transition-opacity',
          className,
        )}
        data-testid="message-read-status"
        data-status={reachedRead ? 'inbound-read' : 'inbound-delivered'}
        aria-label={reachedRead
          ? `Status — ${describeStatus('read', 'inbound')}`
          : `Status — ${describeStatus('delivered', 'inbound')}`}
        title={reachedRead
          ? describeStatus('read', 'inbound')
          : describeStatus('delivered', 'inbound')}
      >
        <MessageStatusIcon status={reachedRead ? 'read' : 'delivered'} />
        {showTextLabel && (
          <span className="text-[10px] font-medium leading-none ml-0.5 opacity-90">
            {reachedRead ? STAGE_LABEL_UNIFIED.read : STAGE_LABEL_UNIFIED.delivered}
          </span>
        )}
        <MessageStatusTimestamps message={message} className="ml-1" />
      </button>
    </MessageStatusPanel>
  );
});
