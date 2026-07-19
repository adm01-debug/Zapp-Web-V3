import { Message } from '@/types/chat';
import { FailureCategory } from './hooks/useChatFilters';

interface FailureFilterBarProps {
  failuresOnly: boolean;
  failureCategory: FailureCategory | null;
  categoryFilteredMessages: Message[];
  failedMessagesCount: number;
  categoryCounts: {
    failed: number;
    failed_auth: number;
    failed_retries: number;
  };
  setFailureCategory: (category: FailureCategory | null) => void;
  setFailuresOnly: (value: boolean) => void;
}

/** Failure Filter Bar component for the chat section. */
export function FailureFilterBar({
  failuresOnly,
  failureCategory,
  categoryFilteredMessages,
  failedMessagesCount,
  categoryCounts,
  setFailureCategory,
  setFailuresOnly,
}: FailureFilterBarProps) {
  if (!failuresOnly) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-xs bg-destructive/10 text-destructive border-b border-destructive/20"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          {categoryFilteredMessages.length === 0
            ? 'Nenhuma mensagem nesta categoria.'
            : `${categoryFilteredMessages.length} ${categoryFilteredMessages.length === 1 ? 'mensagem' : 'mensagens'}`}
        </span>
        <div className="flex items-center gap-1" role="tablist" aria-label="Categoria de falha">
          {([
            { key: null, label: 'Todas', count: failedMessagesCount },
            { key: 'failed' as const, label: 'Sem conexão', count: categoryCounts.failed },
            { key: 'failed_auth' as const, label: 'Auth', count: categoryCounts.failed_auth },
            { key: 'failed_retries' as const, label: 'Esgotadas', count: categoryCounts.failed_retries },
          ]).map(({ key, label, count }) => {
            const isActive = (failureCategory ?? null) === key;
            return (
              <button
                key={key ?? 'all'}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setFailureCategory(key)}
                className={
                  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ' +
                  (isActive
                    ? 'bg-destructive text-destructive-foreground border-destructive'
                    : 'bg-background/40 border-destructive/30 hover:bg-destructive/20')
                }
              >
                {label}
                <span className="opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        className="font-medium underline hover:no-underline"
        onClick={() => setFailuresOnly(false)}
      >
        Limpar filtro
      </button>
    </div>
  );
}
