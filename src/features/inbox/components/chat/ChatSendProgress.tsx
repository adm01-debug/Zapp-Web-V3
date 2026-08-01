import { motion, AnimatePresence } from '@/components/ui/motion';

interface ChatSendProgressProps {
  isSending: boolean;
  sendProgress: number;
}

/** Chat Send Progress component for the chat section. */
export function ChatSendProgress({ isSending, sendProgress }: ChatSendProgressProps) {
  // Barra com progresso REAL: permanece visível enquanto a fila de envio
  // reporta 0 < progresso < 100 (upload de mídia), mesmo depois de isSending
  // cair ao finalizar o enfileiramento.
  const showBar = isSending || (sendProgress > 0 && sendProgress < 100);
  return (
    <AnimatePresence>
      {showBar && (
        <motion.div
          key="send-progress-bar"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="border-t border-primary/10 bg-primary/5 px-4 py-1.5"
        >
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="text-[10px] font-medium uppercase tracking-wider text-primary">
              Enviando...
            </span>
            <span className="text-[10px] font-bold text-primary">{Math.min(100, Math.round(sendProgress))}%</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-primary/10">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${sendProgress}%` }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
