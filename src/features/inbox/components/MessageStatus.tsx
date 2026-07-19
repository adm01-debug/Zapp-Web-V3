import React from 'react';
import { Check, CheckCheck, Clock, AlertCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type {
  MessageStatusDetailFields,
  MessageUIStatus,
} from '@/types/messageStatus';

/**
 * Backwards-compat alias: this component historically exported its own
 * `MessageStatusValue` union. It is now the same as `MessageUIStatus`
 * coming from the shared contract.
 */
export type MessageStatusValue = MessageUIStatus;

interface MessageStatusProps {
  status: MessageStatusValue;
  className?: string;
  showLabel?: boolean;
  /**
   * Extra payload (attempts + error info) — same shape as
   * `Omit<MessageStatusDetail, 'status'>` returned by `useMessageStatus`'
   * `getMessageStatusDetail`. Sharing the type guarantees the hook output
   * can be spread into this component without manual mapping.
   */
  detail?: MessageStatusDetailFields;
}

const statusConfig: Record<MessageStatusValue, { icon: typeof Check; label: string; color: string; iconClass?: string }> = {
  pending: { icon: Clock, label: 'Enviando…', color: 'text-muted-foreground' },
  sending: { icon: Clock, label: 'Enviando…', color: 'text-muted-foreground' },
  retrying: { icon: RefreshCw, label: 'Tentando reenviar…', color: 'text-warning', iconClass: 'animate-spin' },
  sent: { icon: Check, label: 'Enviada', color: 'text-muted-foreground/30' },
  delivered: { icon: CheckCheck, label: 'Entregue', color: 'text-muted-foreground/40' },
  read: { icon: CheckCheck, label: 'Visualizada', color: 'text-primary/70' },
  played: { icon: CheckCheck, label: 'Reproduzida', color: 'text-primary/70' },
  failed: { icon: AlertCircle, label: 'Falha no envio', color: 'text-destructive' },
  failed_auth: { icon: ShieldAlert, label: 'Falha de autenticação', color: 'text-destructive' },
  failed_retries: { icon: AlertCircle, label: 'Falhou após várias tentativas', color: 'text-destructive' },
};

/**
 * Coerce a possibly-malformed runtime value (object, array, function, NaN,
 * null) into a safe display string. Returns `null` when the value is not
 * meaningful for the user — callers MUST treat `null` as "skip this field"
 * to avoid emitting `[object Object]`, `NaN`, `()` or empty separators in
 * the rendered badge / tooltip.
 */
function safeDisplay(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) && value !== 0 ? String(value) : null;
  }
  // Objects, arrays, functions, symbols, booleans → not safely displayable.
  return null;
}

function buildLabel(status: MessageStatusValue, detail?: MessageStatusProps['detail']): string {
  const base = statusConfig[status]?.label ?? '';
  const attempt = safeDisplay(detail?.attempt);
  const totalRetries = safeDisplay(detail?.totalRetries);
  const errorCode = safeDisplay(detail?.errorCode);
  const errorReason = safeDisplay(detail?.errorReason);

  if (status === 'retrying' && attempt && totalRetries) {
    return `Tentando ${attempt}/${totalRetries}…`;
  }
  if (status === 'failed_auth' && errorCode) {
    return `Falha de autenticação (${errorCode})`;
  }
  if (status === 'failed_retries' && totalRetries) {
    return `Falhou após ${totalRetries} tentativas`;
  }
  if ((status === 'failed' || status === 'failed_auth' || status === 'failed_retries') && errorReason) {
    return `${base} — ${errorReason}`;
  }
  return base;
}

/** Message Status constant. */
export const MessageStatus: React.FC<MessageStatusProps> = ({
  status,
  className,
  showLabel = false,
  detail,
}) => {
  const config = statusConfig[status] || statusConfig.sent;
  const Icon = config.icon;
  const label = buildLabel(status, detail);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('inline-flex items-center gap-1 transition-opacity duration-300', className)}>
            <Icon className={cn('h-3 w-3', config.color, config.iconClass)} />
            {showLabel && (
              <span className={cn('text-xs', config.color)}>{label}</span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
