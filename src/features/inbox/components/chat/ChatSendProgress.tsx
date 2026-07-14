import { motion, AnimatePresence } from '@/components/ui/motion';

interface ChatSendProgressProps {
  isSending: boolean;
  sendProgress: number;
}

export function ChatSendProgress({ isSending, sendProgress }: ChatSendProgressProps) {
  return (
    <AnimatePresence>
      {isSending && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="border-t border-primary/10 bg-primary/5 px-4 py-1.5"
        >
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="text-[10px] font-medium uppercase tracking-wider text-primary">
              Enviando...
            </span>
            <span className="text-[10px] font-bold text-primary">{Math.round(sendProgress)}%</span>
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
