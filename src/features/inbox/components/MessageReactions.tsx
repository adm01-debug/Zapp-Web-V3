import { memo, useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SmilePlus, X } from 'lucide-react';
import { useMessageReactions } from '@/features/inbox/hooks/useMessageReactions';
import { useReactionMutations } from '@/features/inbox/hooks/reactions/useReactionMutations';

const WHATSAPP_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const EXTENDED_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉', '👏', '💯', '✅', '❌'];

interface MessageReactionsProps {
  messageId: string;
  isSent?: boolean;
  showExtended?: boolean;
  instanceName?: string;
  contactJid?: string;
  externalId?: string;
  senderType?: 'contact' | 'agent';
  refreshKey?: string;
  disableRealtime?: boolean;
}

export const MessageReactions = memo(function MessageReactions({
  messageId,
  isSent,
  showExtended = false,
  instanceName,
  contactJid,
  externalId,
  senderType,
  refreshKey,
  disableRealtime,
}: MessageReactionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const reactionState = useMessageReactions(messageId, {
    instanceName,
    contactJid,
    externalId,
    senderType,
    refreshKey,
    disableRealtime,
  });
  
  const {
    reactions,
    addReaction,
    removeReaction,
    hasReacted,
    currentProfileId,
  } = reactionState;

  const { trackReactionEvent } = useReactionMutations(messageId, currentProfileId);

  const groupedReactions = useMemo(() => {
    return reactions.reduce((acc, reaction) => {
      if (!acc[reaction.emoji]) {
        acc[reaction.emoji] = {
          emoji: reaction.emoji,
          count: 0,
          users: [],
          hasCurrentUser: false,
        };
      }

      acc[reaction.emoji].count++;
      acc[reaction.emoji].users.push(reaction.user_name || 'Usuário');

      if (reaction.user_id === currentProfileId) {
        acc[reaction.emoji].hasCurrentUser = true;
      }

      return acc;
    }, {} as Record<string, { emoji: string; count: number; users: string[]; hasCurrentUser: boolean }>);
  }, [reactions, currentProfileId]);

  const reactionsList = useMemo(() => 
    Object.values(groupedReactions).sort((a, b) => b.count - a.count),
    [groupedReactions]
  );
  
  const availableReactions = showExtended ? EXTENDED_REACTIONS : WHATSAPP_REACTIONS;

  const handleReact = useCallback(async (emoji: string) => {
    const existingReaction = groupedReactions[emoji];

    if (existingReaction?.hasCurrentUser) {
      await removeReaction(emoji);
    } else {
      await addReaction(emoji);
    }
    setIsOpen(false);
  }, [groupedReactions, addReaction, removeReaction]);

  return (
    <div className={cn('flex items-center gap-1 flex-wrap mt-1', isSent ? 'justify-end' : 'justify-start')}>
      <TooltipProvider>
        {reactionsList.map((reaction) => (
          <Tooltip key={reaction.emoji}>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleReact(reaction.emoji)}
                className={cn(
                  'flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-all',
                  'border cursor-pointer hover:scale-110 active:scale-90',
                  reaction.hasCurrentUser
                    ? 'bg-primary/10 border-primary/30 ring-1 ring-primary/20 text-primary font-bold'
                    : 'bg-muted/80 hover:bg-muted border-border/50 text-foreground'
                )}
                aria-pressed={reaction.hasCurrentUser}
                data-testid={`reaction-${messageId}-${reaction.emoji}`}
              >
                <span className="text-sm">{reaction.emoji}</span>
                <motion.span 
                  key={reaction.count}
                  initial={{ scale: 1.2, opacity: 0.8 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-[10px] font-semibold tabular-nums"
                >
                  {reaction.count}
                </motion.span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <div className="max-w-[150px]">
                {reaction.users.slice(0, 5).join(', ')}
                {reaction.users.length > 5 && ` +${reaction.users.length - 5}`}
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </TooltipProvider>

      <Popover open={isOpen} onOpenChange={(open) => {
        if (open === isOpen) return; // Prevent unnecessary state updates
        setIsOpen(open);
        if (open && typeof trackReactionEvent === 'function') {
          trackReactionEvent('open_picker', { messageId });
        }
      }}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              'p-1 rounded-full transition-all hover:scale-110 active:scale-90',
              'hover:bg-muted/80 text-muted-foreground hover:text-foreground',
              reactionsList.length === 0
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
          className="w-auto p-2 bg-popover border-border shadow-xl animate-in fade-in zoom-in duration-150"
          align={isSent ? 'end' : 'start'}
          sideOffset={4}
          role="dialog"
          aria-label="Escolher um emoji"
        >
          <div 
            className="grid grid-cols-4 sm:grid-cols-6 gap-1 outline-none" 
            role="grid"
            onKeyDown={(e) => {
              const buttons = Array.from(e.currentTarget.querySelectorAll('button'));
              const activeIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
              if (activeIndex === -1) return;

              let nextIndex = -1;
              const cols = window.innerWidth < 640 ? 4 : 6;

              if (e.key === 'ArrowRight') nextIndex = (activeIndex + 1) % buttons.length;
              if (e.key === 'ArrowLeft') nextIndex = (activeIndex - 1 + buttons.length) % buttons.length;
              if (e.key === 'ArrowDown') nextIndex = (activeIndex + cols) % buttons.length;
              if (e.key === 'ArrowUp') nextIndex = (activeIndex - cols + buttons.length) % buttons.length;

              if (nextIndex !== -1) {
                e.preventDefault();
                buttons[nextIndex]?.focus();
              }
            }}
          >
            {availableReactions.map((emoji) => {
              const userHasReacted = hasReacted(emoji);

              return (
                <button
                  key={emoji}
                  role="gridcell"
                  aria-label={`Reagir com ${emoji}`}
                  onClick={() => handleReact(emoji)}
                  className={cn(
                    'w-9 h-9 flex items-center justify-center rounded-md transition-all text-xl hover:scale-125 hover:bg-muted relative focus-visible:ring-2 focus-visible:ring-primary outline-none',
                    userHasReacted && 'bg-primary/10 ring-1 ring-primary/30'
                  )}
                >
                  {emoji}
                  {userHasReacted && (
                    <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-primary rounded-full flex items-center justify-center">
                      <X className="w-2 h-2 text-primary-foreground" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
});

interface QuickReactionBarProps extends MessageReactionsProps {
  forceShow?: boolean;
}

export const QuickReactionBar = memo(function QuickReactionBar({
  messageId,
  isSent,
  instanceName,
  contactJid,
  externalId,
  senderType,
  refreshKey,
  disableRealtime,
  forceShow,
}: QuickReactionBarProps) {
  const [showPicker, setShowPicker] = useState(false);
  const reactionState = useMessageReactions(messageId, {
    instanceName,
    contactJid,
    externalId,
    senderType,
    refreshKey,
    disableRealtime,
  });
  
  const { addReaction, removeReaction, hasReacted, currentProfileId } = reactionState;
  
  const { trackReactionEvent } = useReactionMutations(messageId, currentProfileId);

  const handleReact = useCallback(async (emoji: string) => {
    if (hasReacted(emoji)) {
      await removeReaction(emoji);
    } else {
      await addReaction(emoji);
    }
    setShowPicker(false);
  }, [hasReacted, addReaction, removeReaction]);

  return (
    <div 
      className={cn(
        'absolute -top-9 flex items-center transition-all duration-200 z-20',
        'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
        forceShow && 'opacity-100 pointer-events-auto',
        showPicker && 'opacity-100',
        isSent ? 'right-0' : 'left-0'
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <motion.div
        initial={{ opacity: 0, y: 4, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.12 }}
        className="flex items-center gap-0.5 px-1.5 py-1 rounded-full bg-card/95 dark:bg-[hsl(var(--card)/0.95)] border border-border/40 shadow-lg backdrop-blur-sm"
      >
        {WHATSAPP_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => handleReact(emoji)}
            aria-label={`Reagir com ${emoji}`}
            className={cn(
              'w-7 h-7 flex items-center justify-center rounded-full hover:bg-muted/80 hover:scale-125 transition-all text-base focus-visible:ring-2 focus-visible:ring-primary outline-none',
              hasReacted(emoji) && 'bg-primary/10 ring-1 ring-primary/30'
            )}
          >
            {emoji}
          </button>
        ))}

        <Popover open={showPicker} onOpenChange={(open) => {
          if (open === showPicker) return;
          setShowPicker(open);
          if (open && typeof trackReactionEvent === 'function') {
            trackReactionEvent('open_picker', { messageId });
          }
        }}>
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
            align={isSent ? 'end' : 'start'}
            sideOffset={4}
            role="dialog"
            aria-label="Escolher reações estendidas"
          >
            <div 
              className="grid grid-cols-4 gap-1 outline-none" 
              role="grid"
              onKeyDown={(e) => {
                const buttons = Array.from(e.currentTarget.querySelectorAll('button'));
                const activeIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
                if (activeIndex === -1) return;

                let nextIndex = -1;
                if (e.key === 'ArrowRight') nextIndex = (activeIndex + 1) % buttons.length;
                if (e.key === 'ArrowLeft') nextIndex = (activeIndex - 1 + buttons.length) % buttons.length;
                if (e.key === 'ArrowDown') nextIndex = (activeIndex + 4) % buttons.length;
                if (e.key === 'ArrowUp') nextIndex = (activeIndex - 4 + buttons.length) % buttons.length;

                if (nextIndex !== -1) {
                  e.preventDefault();
                  buttons[nextIndex]?.focus();
                }
              }}
            >
              {EXTENDED_REACTIONS.map((emoji) => (
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
