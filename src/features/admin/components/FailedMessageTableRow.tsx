import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MessageSquare, Eye, RotateCw, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableCell, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { FailedMessageStatusBadge } from '@/features/admin';
import { cn } from '@/lib/utils';
import { classifyRootCause, getRootCauseMeta } from '@/lib/failureRootCause';
import { FailedMessageRow } from '@/features/admin';
import { formatDateTimeCompact } from '@/lib/formatters';

const ROOT_CAUSE_TONE_CLASS: Record<'warning' | 'destructive' | 'info' | 'muted', string> = {
  warning: 'bg-warning/15 text-warning-foreground border-warning/40',
  destructive: 'bg-destructive/15 text-destructive border-destructive/40',
  info: 'bg-primary/15 text-primary border-primary/40',
  muted: 'bg-muted text-muted-foreground border-border',
};

function shortJid(jid: string | null) {
  if (!jid) return '—';
  return jid.replace('@s.whatsapp.net', '').replace('@g.us', ' (grupo)');
}

interface FailedMessageTableRowProps {
  row: FailedMessageRow;
  canEdit: boolean;
  isSelected: boolean;
  onToggle: (id: string) => void;
  onSelect: (row: FailedMessageRow) => void;
  onViewInChat: (row: FailedMessageRow) => void;
  onRetry: (id: string) => void;
  onAbandon: (id: string) => void;
  isRetrying: boolean;
  isAbandoning: boolean;
}

export function FailedMessageTableRow({
  row,
  canEdit,
  isSelected,
  onToggle,
  onSelect,
  onViewInChat,
  onRetry,
  onAbandon,
  isRetrying,
  isAbandoning,
}: FailedMessageTableRowProps) {
  return (
    <TableRow
      key={row.id}
      data-testid="failed-message-row"
      data-remote-jid={row.remote_jid ?? ''}
      data-status={row.status ?? ''}
      data-state={isSelected ? 'selected' : undefined}
      className="cursor-pointer"
      onClick={() => onSelect(row)}
    >
      {canEdit && (
        <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggle(row.id)}
            aria-label="Selecionar item"
            data-testid="failed-message-select-checkbox"
          />
        </TableCell>
      )}
      <TableCell data-testid="failed-message-status">
        <FailedMessageStatusBadge status={row.status} />
      </TableCell>
      <TableCell className="text-xs" data-testid="failed-message-instance">
        {row.instance_name}
      </TableCell>
      <TableCell className="text-xs" data-testid="failed-message-jid">
        {shortJid(row.remote_jid)}
      </TableCell>
      <TableCell className="max-w-[280px]" data-testid="failed-message-error">
        <div className="flex flex-col gap-1">
          {(() => {
            const cause = classifyRootCause(row);
            const meta = getRootCauseMeta(cause);
            return (
              <Badge
                variant="outline"
                className={cn('w-fit px-1.5 py-0 text-[10px]', ROOT_CAUSE_TONE_CLASS[meta.tone])}
                title={meta.hint}
                data-testid="failed-message-root-cause"
              >
                {meta.label}
              </Badge>
            );
          })()}
          <span className="text-xs font-medium" data-testid="failed-message-error-code">
            {row.error_code ?? (row.http_status ? `HTTP ${row.http_status}` : '—')}
          </span>
          {row.error_message && (
            <span
              className="truncate text-xs text-muted-foreground"
              title={row.error_message}
              data-testid="failed-message-error-message"
            >
              {row.error_message}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-center text-xs" data-testid="failed-message-retry-count">
        {row.retry_count}/{row.max_retries}
      </TableCell>
      <TableCell
        className="text-xs"
        title={row.last_attempt_at ?? undefined}
        data-testid="failed-message-last-attempt"
      >
        {row.last_attempt_at
          ? formatDistanceToNow(new Date(row.last_attempt_at), { addSuffix: true, locale: ptBR })
          : '—'}
      </TableCell>
      <TableCell
        className="text-xs"
        title={row.next_attempt_at ?? undefined}
        data-testid="failed-message-next-attempt"
      >
        {row.next_attempt_at
          ? formatDistanceToNow(new Date(row.next_attempt_at), { addSuffix: true, locale: ptBR })
          : '—'}
      </TableCell>
      <TableCell className="text-xs" data-testid="failed-message-created-at">
        {formatDateTimeCompact(row.created_at)}
      </TableCell>
      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end gap-1">
          {row.remote_jid && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onViewInChat(row)}
              title="Ver no chat"
              data-testid="failed-message-view-in-chat-button"
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onSelect(row)}
            title="Ver detalhes"
            data-testid="failed-message-details-button"
          >
            <Eye className="h-4 w-4" />
          </Button>
          {canEdit &&
            (row.status === 'pending' ||
              row.status === 'retrying' ||
              row.status === 'abandoned') && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onRetry(row.id)}
                disabled={isRetrying}
                title="Reprocessar agora"
                data-testid="failed-message-retry-button"
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            )}
          {canEdit && (row.status === 'pending' || row.status === 'retrying') && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onAbandon(row.id)}
              disabled={isAbandoning}
              title="Abandonar"
              data-testid="failed-message-abandon-button"
            >
              <Ban className="h-4 w-4" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
