import { Ban, Eye, ShieldAlert, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from '@/components/ui/motion';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface DeletedMessagePlaceholderProps {
  isSent: boolean;
  content?: string;
  /** ISO timestamp do soft delete (vem do backend como evolution_messages.deleted_at). */
  deletedAt?: string | null;
}

export function DeletedMessagePlaceholder({ isSent, content, deletedAt }: DeletedMessagePlaceholderProps) {
  const hasOriginalContent = content && content !== '[Mensagem apagada]';
  const deletedDate = deletedAt ? new Date(deletedAt) : null;
  const relativeTime = deletedDate && !Number.isNaN(deletedDate.getTime())
    ? formatDistanceToNow(deletedDate, { addSuffix: true, locale: ptBR })
    : null;
  const absoluteTime = deletedDate && !Number.isNaN(deletedDate.getTime())
    ? deletedDate.toLocaleString('pt-BR')
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn(
        'relative px-3.5 py-2.5 rounded-2xl shadow-sm border-2 border-dashed overflow-hidden',
        isSent
          ? 'rounded-br-md bg-primary/8 border-primary/25'
          : 'rounded-bl-md bg-warning/5 border-warning/20'
      )}
    >
      {/* Subtle pattern overlay */}
      <div className={cn(
        'absolute inset-0 opacity-[0.03]',
        'bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,currentColor_8px,currentColor_9px)]',
        isSent ? 'text-primary' : 'text-warning-foreground'
      )} />

      {/* Content */}
      <div className="relative z-10">
        {/* Deleted indicator badge */}
        <div className={cn(
          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold mb-2',
          isSent
            ? 'bg-primary/10 text-muted-foreground'
            : 'bg-warning/10 text-warning-foreground dark:text-warning-foreground'
        )}>
          {isSent ? (
            <Ban className="w-3 h-3" />
          ) : (
            <ShieldAlert className="w-3 h-3" />
          )}
          <span>{isSent ? 'Você apagou esta mensagem' : 'O contato apagou esta mensagem'}</span>
          {relativeTime && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 ml-1 opacity-70 cursor-help">
                  <Clock className="w-2.5 h-2.5" />
                  <span className="text-[10px] font-normal">{relativeTime}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Apagada em {absoluteTime}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Original content preserved */}
        {hasOriginalContent ? (
          <div>
            {!isSent && (
              <div className="flex items-center gap-1 mb-1.5 text-[10px] text-primary dark:text-primary font-medium">
                <Eye className="w-3 h-3" />
                <span>Conteúdo original preservado</span>
              </div>
            )}
            <p className={cn(
              'text-sm leading-relaxed whitespace-pre-wrap break-words',
              isSent
                ? 'line-through decoration-1 text-primary/40'
                : 'text-muted-foreground/70 italic'
            )}>
              {content}
            </p>
          </div>
        ) : (
          <p className={cn(
            'text-sm italic',
            isSent ? 'text-primary/30' : 'text-muted-foreground/40'
          )}>
            Conteúdo original não disponível
          </p>
        )}
      </div>
    </motion.div>
  );
}
