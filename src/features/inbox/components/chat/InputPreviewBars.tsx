import { AnimatePresence, motion } from 'framer-motion';
import { Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReplyPreview } from '../ReplyQuote';
import { Message } from '@/types/chat';

interface InputPreviewBarsProps {
  replyToMessage: Message | null;
  editingMessage?: Message | null;
  onCancelReply: () => void;
  onCancelEdit?: () => void;
}

export function InputPreviewBars({
  replyToMessage,
  editingMessage,
  onCancelReply,
  onCancelEdit,
}: InputPreviewBarsProps) {
  return (
    <>
      <AnimatePresence>
        {replyToMessage && !editingMessage && (
          <ReplyPreview message={replyToMessage} onCancel={onCancelReply} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingMessage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-4 mt-2"
          >
            <div className="flex items-center gap-3 rounded-xl border-2 border-primary/20 bg-primary/10 px-4 py-2.5 shadow-sm">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20">
                <Pencil className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                  Modo de Edição
                </span>
                <p className="truncate text-sm font-medium text-muted-foreground/80">
                  {editingMessage.content}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 rounded-full border border-destructive/20 px-3 text-xs font-bold text-destructive transition-all hover:bg-destructive/10 hover:text-destructive"
                onClick={onCancelEdit}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Cancelar Edição
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
