import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Loader2, MessageCircle } from 'lucide-react';
import type { VoiceAgentPhase } from '@/features/inbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface VoiceTranscriptAreaProps {
  phase: VoiceAgentPhase;
  partialTranscript: string;
  finalTranscript: string;
  agentResponse: string;
  error: string;
  colors: {
    primary: string;
    secondary: string;
    glow1: string;
    glow2: string;
  };
}

export function VoiceTranscriptArea({
  phase,
  partialTranscript,
  finalTranscript,
  agentResponse,
  error,
  colors: _colors,
}: VoiceTranscriptAreaProps) {
  const prefersReduced = useReducedMotion();

  return (
    <div className="min-h-[56px] w-full space-y-2" aria-live="polite" aria-atomic="true">
      <AnimatePresence mode="wait">
        {partialTranscript && (
          <motion.div
            key="partial"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center text-sm italic text-muted-foreground/50"
          >
            "{partialTranscript}"
          </motion.div>
        )}

        {finalTranscript && !partialTranscript && (
          <motion.div
            key="final"
            initial={{ opacity: 0, y: prefersReduced ? 0 : 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center text-sm font-medium text-foreground/80"
          >
            🎤 "{finalTranscript}"
          </motion.div>
        )}

        {agentResponse && (
          <motion.div
            key="response"
            initial={{ opacity: 0, y: prefersReduced ? 0 : 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="shadow-glow-primary/5 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-center text-sm font-medium text-foreground"
          >
            <MessageCircle className="mr-2 inline-block h-4 w-4 text-primary opacity-70" />
            {agentResponse}
          </motion.div>
        )}

        {(phase === 'processing' || phase === 'booting') && !agentResponse && (
          <motion.div
            key={phase}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground/50"
          >
            <Loader2 className="h-4 w-4 animate-spin text-primary/60" />
            {phase === 'processing' ? 'Processando com IA...' : 'Conectando microfone...'}
          </motion.div>
        )}

        {error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Alert variant="destructive" className="border-destructive/20 bg-destructive/5 py-3">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="mb-1 text-xs font-bold uppercase tracking-wider">
                Erro de Voz
              </AlertTitle>
              <AlertDescription className="text-xs opacity-90">
                {error}
                <div className="mt-2 text-[10px] font-normal text-muted-foreground">
                  Toque no orbe para tentar novamente
                </div>
              </AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
