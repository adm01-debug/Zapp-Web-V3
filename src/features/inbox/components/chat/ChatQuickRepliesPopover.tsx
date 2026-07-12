import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from '@/components/ui/motion';
import { X, Zap, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuickReplyItem {
  id: string;
  title: string;
  shortcut: string;
  content: string;
  category: string;
}

interface ChatQuickRepliesPopoverProps {
  show: boolean;
  replies: QuickReplyItem[];
  onSelect: (reply: QuickReplyItem) => void;
  onClose: () => void;
  selectedIndex?: number;
}

export function ChatQuickRepliesPopover({ show, replies, onSelect, onClose, selectedIndex = 0 }: ChatQuickRepliesPopoverProps) {
  return (
    <AnimatePresence>
      {show && replies.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 15, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 15, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.19, 1, 0.22, 1] }}
          className="absolute bottom-20 left-4 right-4 bg-background/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl p-1 z-50 overflow-hidden "
        >
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/10 bg-muted/20">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[13px] font-bold text-foreground tracking-tight">
                Sugestões Rápidas
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest hidden sm:inline">
                {replies.length} itens encontrados
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="w-7 h-7 rounded-full hover:bg-destructive/10 hover:text-destructive transition-colors"
                onClick={onClose}
                aria-label="Fechar respostas rápidas"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          <div className="space-y-0.5 max-h-[280px] overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-border">
            {replies.map((reply, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <motion.button
                  key={reply.id}
                  onClick={() => onSelect(reply)}
                  whileTap={{ scale: 0.99 }}
                  className={cn(
                    "w-full text-left px-3 py-3 rounded-xl transition-all duration-200 group flex flex-col gap-0.5",
                    isSelected 
                      ? "bg-primary/10 ring-1 ring-primary/20" 
                      : "hover:bg-muted/50 border border-transparent"
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-[14px] font-semibold tracking-tight",
                        isSelected ? "text-primary" : "text-foreground"
                      )}>
                        {reply.title}
                      </span>
                      <Badge variant="outline" className={cn(
                        "text-[9px] font-black px-1.5 py-0 uppercase bg-muted/50 border-border/50",
                        isSelected && "bg-primary/20 border-primary/20 text-primary"
                      )}>
                        {reply.shortcut.replace('/', '')}
                      </Badge>
                    </div>
                    {isSelected && (
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest animate-pulse">
                        Enter para enviar
                      </span>
                    )}
                  </div>
                  <div className="flex items-start gap-2">
                    <MessageSquare className="w-3 h-3 text-muted-foreground/30 mt-1 shrink-0" />
                    <p className={cn(
                      "text-[12.5px] leading-snug line-clamp-2",
                      isSelected ? "text-foreground/90" : "text-muted-foreground"
                    )}>
                      {reply.content}
                    </p>
                  </div>
                </motion.button>
              );
            })}
          </div>
          
          <div className="px-3 py-2 border-t border-border/10 bg-muted/10 flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground font-medium italic">
              Use as setas ↑↓ para navegar e Enter para selecionar
            </p>
            <div className="flex items-center gap-1.5">
               <kbd className="px-1.5 py-0.5 rounded bg-muted text-[9px] font-bold border border-border/50">TAB</kbd>
               <kbd className="px-1.5 py-0.5 rounded bg-muted text-[9px] font-bold border border-border/50">ESC</kbd>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
