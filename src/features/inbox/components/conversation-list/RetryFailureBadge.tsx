/**
 * RetryFailureBadge
 *
 * Resumo visual no item de conversa do inbox para mensagens outbound em
 * estado de retry ativo (`retrying`) ou falha terminal (`failed`,
 * `failed_auth`, `failed_retries`).
 *
 * Mostra:
 *  - Ícone (RefreshCw spinning para retrying, AlertTriangle/ShieldAlert para falhas).
 *  - Contador "N/M" quando `retry_attempt`/`retry_total` estão preenchidos.
 *  - Motivo curto (ex.: "HTTP 503", "Tempo esgotado") via `useFailureReason`,
 *    consultado lazy só para falhas terminais. Tooltip carrega o motivo
 *    completo + número de tentativas.
 *
 * Não renderiza nada quando a `lastMessage` é inbound, está em estado
 * normal (sent/delivered/read/played) ou está apenas `sending`.
 */
import { RefreshCw, AlertTriangle, ShieldAlert } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useFailureReason, formatFailureReason } from '@/features/inbox';
import type { Message } from '@/types/chat';
import { cn } from '@/lib/utils';

const TERMINAL_FAIL = new Set<Message['status']>(['failed', 'failed_auth', 'failed_retries']);

interface RetryFailureBadgeProps {
  message: Pick<Message, 'id' | 'sender' | 'status' | 'retry_attempt' | 'retry_total'>;
  /** Compact mode hides the textual label (icon + counter only). */
  compact?: boolean;
}

/** Displays a compact retry-progress or terminal-failure badge on an outbound conversation list item. */
export function RetryFailureBadge({ message, compact = false }: RetryFailureBadgeProps) {
  const isOutbound = message.sender === 'agent';
  const isRetrying = message.status === 'retrying';
  const isAuthFail = message.status === 'failed_auth';
  const isTerminalFail = TERMINAL_FAIL.has(message.status);

  // Lazy lookup — only fires for terminal failures (NOT for retrying, since
  // those rows haven't been written to evolution_retry_metrics yet).
  const { data: failure } = useFailureReason(
    isOutbound && isTerminalFail && !isAuthFail ? message.id : undefined,
    isOutbound && isTerminalFail && !isAuthFail,
  );

  if (!isOutbound) return null;
  if (!isRetrying && !isTerminalFail) return null;

  const attempt = message.retry_attempt ?? undefined;
  const total = message.retry_total ?? undefined;
  const counterText =
    typeof attempt === 'number' && typeof total === 'number' ? `${attempt}/${total}` : null;

  const Icon = isRetrying ? RefreshCw : isAuthFail ? ShieldAlert : AlertTriangle;
  const colorClass = isRetrying
    ? 'text-[hsl(var(--warning))] border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.1)]'
    : 'text-destructive border-destructive/40 bg-destructive/10';

  const shortReason = isAuthFail
    ? 'Auth'
    : failure?.reason
      ? formatFailureReason(failure.reason)
      : null;

  const labelParts: string[] = [];
  if (isRetrying) labelParts.push('Reenviando');
  else if (isAuthFail) labelParts.push('Falha de auth');
  else if (message.status === 'failed_retries') labelParts.push('Sem mais tentativas');
  else labelParts.push('Falhou');
  if (counterText) labelParts.push(counterText);
  if (shortReason && !isRetrying) labelParts.push(`· ${shortReason}`);

  const tooltipText = [
    isRetrying ? 'Tentando reenviar' : 'Envio falhou',
    counterText ? `Tentativa ${counterText}` : null,
    failure?.reason ? `Motivo: ${formatFailureReason(failure.reason)}` : null,
    failure?.attempts ? `Total executado: ${failure.attempts}` : null,
    isAuthFail ? 'Verifique a conexão WhatsApp' : null,
  ].filter(Boolean).join(' · ');

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-1.5 py-[1px] text-[10px] font-medium',
              colorClass,
            )}
          >
            <Icon className={cn('w-2.5 h-2.5', isRetrying && 'animate-spin')} />
            {!compact && <span className="truncate max-w-[140px]">{labelParts.join(' ')}</span>}
            {compact && counterText && <span>{counterText}</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-xs">
          {tooltipText || 'Status de envio'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
