import { memo, useState, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { SmilePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import type { AggregatedReaction } from '@/features/inbox/hooks/team-chat/useTeamMessageReactions';

export const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
export const EXTENDED_EMOJIS = [
  ...QUICK_EMOJIS,
  '🔥', '🎉', '👏', '💯', '✅', '❌', '👀', '🤔', '😍', '😎',
  '🚀', '💪', '🙌', '👌', '✨', '⭐', '💡', '☕',
];

interface Props {
  messageId: string;
  reactions: AggregatedReaction[];
  isMine: boolean;
  isToggling: boolean;
  onToggle: (emoji: string) => void;
}

export const MessageReactions = memo(function MessageReactions({ messageId, reactions, isMine, isToggling, onToggle }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const handlePick = useCallback((emoji: string) => {
    onToggle(emoji);
    setPickerOpen(false);
  }, [onToggle]);

  return (
    <div 
      className={cn(
        'absolute -bottom-3 flex items-center gap-0.5 z-10',
        isMine ? 'right-2' : 'left-2'
      )}
      role="group"
      aria-label="Reações da mensagem"
      data-is-toggling={isToggling}
      data-testid={`reactions-container-${messageId}`}
    >
      {reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={() => onToggle(r.emoji)}
          className={cn(
            'flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] border transition-all outline-none focus-visible:ring-1 focus-visible:ring-primary',
            'hover:scale-110 active:scale-95 shadow-sm',
            r.reactedByMe
              ? 'bg-primary border-primary/20 text-primary-foreground font-bold'
              : 'bg-background border-border/50 text-foreground hover:bg-muted/80'
          )}
          aria-pressed={r.reactedByMe}
          aria-label={`${r.emoji}, ${r.count} reações. ${r.reactedByMe ? 'Você reagiu.' : 'Clique para reagir.'}`}
          data-testid={`reaction-${messageId}-${r.emoji}`}
        >
          <span className="text-[11px] leading-none" aria-hidden="true">{r.emoji}</span>
          {r.count > 1 && <span className="text-[9px] tabular-nums font-semibold ml-0.5">{r.count}</span>}
        </button>
      ))}

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              'transition-all focus-visible:opacity-100',
              'p-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary',
              'hover:bg-muted/80 text-muted-foreground hover:text-foreground',
              reactions.length === 0
                ? 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                : 'opacity-60 hover:opacity-100'
            )}
            aria-label="Adicionar reação"
            data-testid={`reaction-trigger-${messageId}`}
          >
            <SmilePlus className="w-3.5 h-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align={isMine ? 'end' : 'start'}
          className="w-auto p-2 bg-popover border-border shadow-xl animate-in fade-in zoom-in duration-150"
          role="dialog"
          aria-label="Escolher um emoji"
        >
          <div className="grid grid-cols-6 sm:grid-cols-8 gap-1" role="grid">
            {EXTENDED_EMOJIS.map((emoji) => (
              <Button
                key={emoji}
                size="icon"
                variant="ghost"
                className="h-9 w-9 text-xl hover:scale-125 hover:bg-muted transition-all focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => handlePick(emoji)}
                aria-label={`Reagir com ${emoji}`}
                role="gridcell"
              >
                {emoji}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
});

export const TeamQuickReactionBar = memo(function TeamQuickReactionBar({
  messageId,
  isMine,
  onToggle,
  reactions = []
}: {
  messageId: string;
  isMine: boolean;
  onToggle: (emoji: string) => void;
  reactions?: AggregatedReaction[];
}) {
  const [showPicker, setShowPicker] = useState(false);

  const handleReact = useCallback((emoji: string) => {
    onToggle(emoji);
    setShowPicker(false);
  }, [onToggle]);

  const hasReacted = useCallback((emoji: string) => {
    return reactions.some(r => r.emoji === emoji && r.reactedByMe);
  }, [reactions]);

  return (
    <div 
      className={cn(
        'absolute -top-9 flex items-center transition-all duration-200 z-20',
        'opacity-0 group-hover/msg:opacity-100 group-focus-within/msg:opacity-100',
        showPicker && 'opacity-100',
        isMine ? 'right-0' : 'left-0'
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <motion.div
        initial={{ opacity: 0, y: 4, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.12 }}
        className="flex items-center gap-0.5 px-1 py-1 rounded-full bg-card/95 dark:bg-[hsl(var(--card)/0.95)] border border-border/40 shadow-xl backdrop-blur-md"
      >
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => handleReact(emoji)}
            aria-label={`Reagir com ${emoji}`}
            className={cn(
              'w-6 h-6 flex items-center justify-center rounded-full hover:bg-muted/80 hover:scale-125 transition-all text-sm focus-visible:ring-1 focus-visible:ring-primary outline-none',
              hasReacted(emoji) && 'bg-primary/10 ring-1 ring-primary/30'
            )}
          >
            {emoji}
          </button>
        ))}

        <Popover open={showPicker} onOpenChange={setShowPicker}>
          <PopoverTrigger asChild>
            <button 
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-muted/80 transition-all text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary outline-none"
              aria-label="Mais reações"
            >
              <SmilePlus className="w-4 h-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-2 bg-popover border-border shadow-xl animate-in fade-in zoom-in duration-150"
            align={isMine ? 'end' : 'start'}
            sideOffset={4}
            role="dialog"
            aria-label="Escolher reações estendidas"
          >
            <div className="grid grid-cols-6 gap-1 outline-none" role="grid">
              {EXTENDED_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  role="gridcell"
                  aria-label={`Reagir com ${emoji}`}
                  onClick={() => handleReact(emoji)}
                  className={cn(
                    'w-9 h-9 flex items-center justify-center rounded-md text-lg hover:bg-muted transition-all hover:scale-125 focus-visible:ring-2 focus-visible:ring-primary outline-none',
                    hasReacted(emoji) && 'bg-primary/10 ring-1 ring-primary/30'
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </motion.div>
    </div>
  );
});
