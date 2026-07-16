/* eslint-disable react-refresh/only-export-components */
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
  '🔥',
  '🎉',
  '👏',
  '💯',
  '✅',
  '❌',
  '👀',
  '🤔',
  '😍',
  '😎',
  '🚀',
  '💪',
  '🙌',
  '👌',
  '✨',
  '⭐',
  '💡',
  '☕',
];

interface Props {
  messageId: string;
  reactions: AggregatedReaction[];
  isMine: boolean;
  isToggling: boolean;
  onToggle: (emoji: string) => void;
}

export const MessageReactions = memo(function MessageReactions({
  messageId,
  reactions,
  isMine,
  isToggling,
  onToggle,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const handlePick = useCallback(
    (emoji: string) => {
      onToggle(emoji);
      setPickerOpen(false);
    },
    [onToggle]
  );

  return (
    <div
      className={cn(
        'absolute -bottom-3 z-10 flex items-center gap-0.5',
        isMine ? 'right-2' : 'left-2'
      )}
      role="group"
      aria-label="Reações da mensagem"
      data-is-toggling={isToggling}
      data-testid={`reactions-container-${messageId}`}
    >
      {reactions.map((r) => (
        <button
          type="button"
          key={r.emoji}
          onClick={() => onToggle(r.emoji)}
          className={cn(
            'flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] outline-none transition-all focus-visible:ring-1 focus-visible:ring-primary',
            'shadow-sm hover:scale-110 active:scale-95',
            r.reactedByMe
              ? 'border-primary/20 bg-primary font-bold text-primary-foreground'
              : 'border-border/50 bg-background text-foreground hover:bg-muted/80'
          )}
          aria-pressed={r.reactedByMe}
          aria-label={`${r.emoji}, ${r.count} reações. ${r.reactedByMe ? 'Você reagiu.' : 'Clique para reagir.'}`}
          data-testid={`reaction-${messageId}-${r.emoji}`}
        >
          <span className="text-[11px] leading-none" aria-hidden="true">
            {r.emoji}
          </span>
          {r.count > 1 && (
            <span className="ml-0.5 text-[9px] font-semibold tabular-nums">{r.count}</span>
          )}
        </button>
      ))}

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'transition-all focus-visible:opacity-100',
              'rounded-full p-1 outline-none focus-visible:ring-2 focus-visible:ring-primary',
              'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
              reactions.length === 0
                ? 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100'
                : 'opacity-60 hover:opacity-100'
            )}
            aria-label="Adicionar reação"
            data-testid={`reaction-trigger-${messageId}`}
          >
            <SmilePlus className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align={isMine ? 'end' : 'start'}
          className="w-auto border-border bg-popover p-2 shadow-xl duration-150 animate-in fade-in zoom-in"
          role="dialog"
          aria-label="Escolher um emoji"
        >
          <div className="grid grid-cols-6 gap-1 sm:grid-cols-8" role="grid">
            {EXTENDED_EMOJIS.map((emoji) => (
              <Button
                key={emoji}
                size="icon"
                variant="ghost"
                className="h-9 w-9 text-xl transition-all hover:scale-125 hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
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
  messageId: _messageId,
  isMine,
  onToggle,
  reactions = [],
}: {
  messageId: string;
  isMine: boolean;
  onToggle: (emoji: string) => void;
  reactions?: AggregatedReaction[];
}) {
  const [showPicker, setShowPicker] = useState(false);

  const handleReact = useCallback(
    (emoji: string) => {
      onToggle(emoji);
      setShowPicker(false);
    },
    [onToggle]
  );

  const hasReacted = useCallback(
    (emoji: string) => {
      return reactions.some((r) => r.emoji === emoji && r.reactedByMe);
    },
    [reactions]
  );

  return (
    <div
      className={cn(
        'absolute -top-9 z-20 flex items-center transition-all duration-200',
        'opacity-0 group-focus-within/msg:opacity-100 group-hover/msg:opacity-100',
        showPicker && 'opacity-100',
        isMine ? 'right-0' : 'left-0'
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <motion.div
        initial={{ opacity: 0, y: 4, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.12 }}
        className="flex items-center gap-0.5 rounded-full border border-border/40 bg-card/95 px-1 py-1 shadow-xl backdrop-blur-md dark:bg-[hsl(var(--card)/0.95)]"
      >
        {QUICK_EMOJIS.map((emoji) => (
          <button
            type="button"
            key={emoji}
            onClick={() => handleReact(emoji)}
            aria-label={`Reagir com ${emoji}`}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full text-sm outline-none transition-all hover:scale-125 hover:bg-muted/80 focus-visible:ring-1 focus-visible:ring-primary',
              hasReacted(emoji) && 'bg-primary/10 ring-1 ring-primary/30'
            )}
          >
            {emoji}
          </button>
        ))}

        <Popover open={showPicker} onOpenChange={setShowPicker}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground outline-none transition-all hover:bg-muted/80 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Mais reações"
            >
              <SmilePlus className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto border-border bg-popover p-2 shadow-xl duration-150 animate-in fade-in zoom-in"
            align={isMine ? 'end' : 'start'}
            sideOffset={4}
            role="dialog"
            aria-label="Escolher reações estendidas"
          >
            <div className="grid grid-cols-6 gap-1 outline-none" role="grid">
              {EXTENDED_EMOJIS.map((emoji) => (
                <button
                  type="button"
                  key={emoji}
                  role="gridcell"
                  aria-label={`Reagir com ${emoji}`}
                  onClick={() => handleReact(emoji)}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-md text-lg outline-none transition-all hover:scale-125 hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary',
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
