import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, X, Check, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QueueItem } from '../../hooks/useMessageQueue';

interface QueueProgressPanelProps {
  queue?: QueueItem[];
  isSending: boolean;
  onRetry?: (id: string) => void;
  onRemoveFromQueue?: (id: string) => void;
}

function getQueueErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Erro desconhecido no envio.';
}

export function QueueProgressPanel({
  queue,
  isSending,
  onRetry,
  onRemoveFromQueue,
}: QueueProgressPanelProps) {
  return (
    <AnimatePresence>
      {(isSending || (queue?.length ?? 0) > 0) && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="border-t border-primary/10 bg-primary/5 px-4 py-1.5"
        >
          {queue?.map((item) => (
            <div key={item.id} className="group mb-2 last:mb-0">
              <div className="mb-1 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {item.status === 'sending' ? (
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  ) : item.status === 'failed' ? (
                    <X className="h-3 w-3 text-destructive" />
                  ) : item.status === 'confirmed' ? (
                    <Check className="h-3 w-3 text-success" />
                  ) : (
                    <Clock className="h-3 w-3 text-muted-foreground/50" />
                  )}
                  <div className="flex flex-col">
                    <span
                      className={cn(
                        'text-[10px] font-bold uppercase tracking-wider',
                        item.status === 'failed'
                          ? 'text-destructive'
                          : item.status === 'confirmed'
                            ? 'text-success'
                            : 'text-primary'
                      )}
                    >
                      {item.status === 'failed'
                        ? 'Erro no envio'
                        : item.status === 'sending'
                          ? 'Enviando...'
                          : item.status === 'confirmed'
                            ? 'Enviado!'
                            : 'Aguardando na fila...'}
                    </span>
                    {item.error !== undefined && item.error !== null && (
                      <span className="line-clamp-1 text-[9px] italic text-destructive/80">
                        {getQueueErrorMessage(item.error)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {item.status === 'failed' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => onRetry?.(item.id)}
                        className="text-primary-accessible rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-black transition-colors hover:text-primary"
                      >
                        Tentar novamente
                      </button>
                      <button
                        onClick={() => onRemoveFromQueue?.(item.id)}
                        className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-black text-destructive transition-colors hover:text-destructive/80"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                  <span
                    className={cn(
                      'text-[10px] font-black tabular-nums',
                      item.status === 'failed' ? 'text-destructive' : 'text-primary'
                    )}
                  >
                    {item.status === 'failed' ? '!' : `${Math.round(item.progress || 0)}%`}
                  </span>
                </div>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-primary/10">
                <motion.div
                  className={cn(
                    'h-full',
                    item.status === 'failed'
                      ? 'bg-destructive'
                      : item.status === 'confirmed'
                        ? 'bg-success'
                        : 'bg-primary'
                  )}
                  initial={{ width: 0 }}
                  animate={{
                    width: item.status === 'failed' ? '100%' : `${item.progress || 0}%`,
                  }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                />
              </div>
              {item.attempts?.length > 0 && (
                <div className="mt-1 hidden border-t border-primary/5 pt-1 group-hover:block">
                  <div className="flex items-center justify-between text-[8px] text-muted-foreground">
                    <span>
                      {item.attempts.length}{' '}
                      {item.attempts.length === 1 ? 'tentativa' : 'tentativas'}
                    </span>
                    {item.attempts[item.attempts.length - 1].duration && (
                      <span>{item.attempts[item.attempts.length - 1].duration}ms</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
