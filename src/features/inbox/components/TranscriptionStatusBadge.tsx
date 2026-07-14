import { motion } from 'framer-motion';
import { Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TranscriptionStatusBadgeProps {
  transcriptionStatus: string;
  isSent: boolean;
  transcription: string | null;
  onRetry: () => void;
}

export function TranscriptionStatusBadge({
  transcriptionStatus,
  isSent,
  transcription,
  onRetry,
}: TranscriptionStatusBadgeProps) {
  switch (transcriptionStatus) {
    case 'processing':
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium',
            isSent
              ? 'bg-primary-foreground/20 text-primary-foreground'
              : 'bg-primary/10 text-primary'
          )}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          >
            <Sparkles className="h-3 w-3" />
          </motion.div>
          <span>Transcrevendo...</span>
        </motion.div>
      );
    case 'completed':
      return transcription ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            'flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium',
            isSent ? 'bg-success/20 text-success' : 'bg-success/10 text-success'
          )}
        >
          <CheckCircle2 className="h-3 w-3" />
          <span>Transcrito</span>
        </motion.div>
      ) : null;
    case 'failed':
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            'flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium',
            isSent ? 'bg-destructive/20 text-destructive' : 'bg-destructive/10 text-destructive'
          )}
          onClick={onRetry}
        >
          <AlertCircle className="h-3 w-3" />
          <span>Falhou - Tentar novamente</span>
        </motion.div>
      );
    default:
      return null;
  }
}
