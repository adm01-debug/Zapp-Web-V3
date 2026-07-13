import { motion } from 'framer-motion';
import { Sparkles, Volume2, CheckCircle2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AudioTranscriptionPanelProps {
  isProcessing: boolean;
  transcription: string | null;
  isSent: boolean;
  onRetry: () => void;
}

export function AudioTranscriptionPanel({
  isProcessing,
  transcription,
  isSent,
  onRetry,
}: AudioTranscriptionPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'rounded-lg border p-3 text-xs',
        isSent
          ? 'border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground/90'
          : 'border-border/30 bg-muted/50 text-foreground/80'
      )}
    >
      {isProcessing ? (
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          >
            <Sparkles className="h-4 w-4 text-primary" />
          </motion.div>
          <div className="flex-1">
            <p className="font-medium">Transcrevendo áudio...</p>
            <p className="mt-0.5 text-[10px] opacity-60">A IA está convertendo o áudio em texto</p>
          </div>
          <motion.div className="flex gap-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  isSent ? 'bg-primary-foreground/50' : 'bg-primary/50'
                )}
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </motion.div>
        </div>
      ) : transcription ? (
        <div className="space-y-1">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] opacity-60">
            <Volume2 className="h-3 w-3" />
            <span>Transcrição</span>
            <CheckCircle2 className="ml-auto h-3 w-3 text-success" />
          </div>
          <p className="italic leading-relaxed">"{transcription}"</p>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <span className="opacity-60">Transcrição não disponível</span>
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onRetry}>
            <RefreshCw className="mr-1 h-3 w-3" />
            Tentar novamente
          </Button>
        </div>
      )}
    </motion.div>
  );
}
