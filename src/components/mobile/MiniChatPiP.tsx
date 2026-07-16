import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, MessageSquare, Minimize2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface MiniChatPiPProps {
  contactName: string;
  contactAvatar?: string;
  lastMessage?: string;
  isVisible: boolean;
  onExpand: () => void;
  onDismiss: () => void;
  onQuickReply?: (text: string) => void;
}

export function MiniChatPiP({
  contactName,
  contactAvatar,
  lastMessage,
  isVisible,
  onExpand,
  onDismiss,
  onQuickReply,
}: MiniChatPiPProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [replyText, setReplyText] = useState('');

  const initials = contactName
    ? contactName
        .split(' ')
        .map((n) => n[0])
        .filter(Boolean)
        .join('')
        .slice(0, 2)
        .toUpperCase() || '??'
    : '??';

  const handleSendReply = useCallback(() => {
    if (replyText.trim() && onQuickReply) {
      onQuickReply(replyText.trim());
      setReplyText('');
      setIsExpanded(false);
    }
  }, [replyText, onQuickReply]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendReply();
      }
    },
    [handleSendReply]
  );

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 80, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 80, scale: 0.8 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          drag
          dragMomentum={false}
          dragElastic={0.1}
          dragConstraints={{ left: -100, right: 100, top: -200, bottom: 100 }}
          className={cn(
            'fixed bottom-20 right-3 z-50 overflow-hidden rounded-2xl border border-border bg-card shadow-lg',
            isExpanded ? 'w-72' : 'w-auto'
          )}
          style={{ touchAction: 'none' }}
        >
          {/* Header — always visible */}
          <div
            tabIndex={0}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Minimizar chat' : 'Expandir chat'}
            className="flex cursor-pointer items-center gap-2.5 bg-card px-3 py-2.5 transition-colors hover:bg-muted/50"
            onClick={() => {
              if (!isExpanded) {
                onExpand();
              } else {
                setIsExpanded(false);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                if (!isExpanded) onExpand();
                else setIsExpanded(false);
              }
            }}
          >
            <div className="relative">
              <Avatar className="h-8 w-8">
                <AvatarImage src={contactAvatar} alt={contactName} />
                <AvatarFallback className="bg-primary/15 text-[10px] font-semibold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-[hsl(var(--success))]" />
            </div>

            {isExpanded ? (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">{contactName}</p>
                <p className="truncate text-[10px] text-muted-foreground">{lastMessage}</p>
              </div>
            ) : (
              <div className="min-w-0 max-w-[140px] flex-1">
                <p className="truncate text-xs font-medium text-foreground">{contactName}</p>
              </div>
            )}

            <div className="flex items-center gap-1">
              {isExpanded && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(false);
                  }}
                  aria-label="Minimizar chat"
                >
                  <Minimize2 className="h-3 w-3" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss();
                }}
                aria-label="Fechar chat"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Expanded: quick reply */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                {/* Last message preview */}
                {lastMessage && (
                  <div className="border-t border-border/50 bg-muted/30 px-3 py-2">
                    <p className="line-clamp-2 text-[11px] text-muted-foreground">{lastMessage}</p>
                  </div>
                )}

                {/* Quick reply input */}
                {onQuickReply && (
                  <div className="flex items-center gap-1.5 border-t border-border/50 p-2">
                    <Input
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Resposta rápida..."
                      className="h-8 rounded-full border-0 bg-muted/50 text-xs focus-visible:ring-1"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSendReply();
                      }}
                      disabled={!replyText.trim()}
                      aria-label="Enviar resposta rápida"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}

                {/* Open full chat */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExpand();
                  }}
                  className="flex w-full items-center justify-center gap-1.5 border-t border-border/50 px-3 py-2 text-[11px] text-primary transition-colors hover:bg-primary/5"
                >
                  <MessageSquare className="h-3 w-3" />
                  Abrir conversa completa
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Collapsed: tap to expand inline */}
          {!isExpanded && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(true);
              }}
              className="w-full border-t border-border/50 px-3 py-1.5 text-[10px] text-primary transition-colors hover:bg-primary/5"
            >
              Toque para responder
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
