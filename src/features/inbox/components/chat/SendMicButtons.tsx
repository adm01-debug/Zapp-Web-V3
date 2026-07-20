import { AnimatePresence, motion } from 'framer-motion';
import { Send, Mic, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SendMicButtonsProps {
  isSending: boolean;
  canSend: boolean;
  isOverLimit: boolean;
  isMicActive: boolean;
  isMobile: boolean;
  isEditing: boolean;
  onSend: () => void;
  onRecordToggle: () => void;
}

/** Send Mic Buttons component for the chat section. */
export function SendMicButtons({
  isSending,
  canSend,
  isOverLimit,
  isMicActive,
  isMobile,
  isEditing,
  onSend,
  onRecordToggle,
}: SendMicButtonsProps) {
  return (
    <div className="mb-[1px] flex shrink-0 items-center gap-2 self-end">
      {isSending && !isMobile && (
        <motion.span
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-[10px] font-black uppercase tracking-tighter text-muted-foreground"
        >
          Enviando...
        </motion.span>
      )}

      {/* Send button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            onClick={onSend}
            disabled={isSending}
            whileHover={!isSending ? { scale: 1.1 } : {}}
            whileTap={!isSending ? { scale: 0.9 } : {}}
            className={cn(
              'inline-flex shrink-0 touch-manipulation items-center justify-center rounded-full outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              canSend
                ? 'bg-primary text-primary-foreground shadow-[0_0_18px_hsl(var(--primary)/0.55),0_0_36px_hsl(var(--primary)/0.35)] ring-2 ring-primary/40 hover:shadow-[0_0_24px_hsl(var(--primary)/0.7),0_0_48px_hsl(var(--primary)/0.45)]'
                : 'cursor-not-allowed bg-muted text-muted-foreground opacity-50 hover:bg-muted/80',
              isMobile ? 'h-11 w-11' : 'h-[46px] w-[46px]'
            )}
            aria-label={isSending ? 'Enviando mensagem...' : 'Enviar mensagem'}
            aria-disabled={isSending || !canSend}
          >
            <AnimatePresence mode="wait">
              {isSending ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                >
                  <Loader2 className="h-6 w-6 animate-spin" />
                </motion.div>
              ) : isEditing ? (
                <motion.div
                  key="edit"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                >
                  <Check className="h-6 w-6" />
                </motion.div>
              ) : (
                <motion.div
                  key="send"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                >
                  <Send className="h-6 w-6" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[200px] rounded-lg border-none bg-primary px-3 py-1.5 text-[10px] font-medium text-primary-foreground shadow-xl"
        >
          {isSending
            ? '🚀 Mensagem sendo processada...'
            : isOverLimit
              ? '⚠️ Limite de caracteres excedido'
              : !canSend
                ? '📎 Clique para anexar arquivo'
                : isEditing
                  ? '✅ Confirmar alterações'
                  : '🚀 Enviar mensagem (Enter)'}
        </TooltipContent>
      </Tooltip>

      {/* Mic button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            onClick={onRecordToggle}
            disabled={isSending || canSend}
            whileHover={!(isSending || canSend) ? { scale: 1.1 } : {}}
            whileTap={!(isSending || canSend) ? { scale: 0.9 } : {}}
            className={cn(
              'inline-flex shrink-0 touch-manipulation items-center justify-center rounded-full outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2',
              isMicActive
                ? 'z-10 scale-110 bg-destructive text-foreground shadow-[0_0_24px_rgba(244,63,94,0.7),0_0_48px_rgba(244,63,94,0.45)] ring-2 ring-rose-400/60 hover:bg-destructive'
                : 'bg-muted text-muted-foreground hover:bg-muted/80',
              !isMicActive && (isSending || canSend) && 'cursor-not-allowed opacity-50',
              isMobile ? 'h-11 w-11' : 'h-[46px] w-[46px]'
            )}
            aria-label={isMicActive ? 'Parar gravação' : 'Gravar áudio'}
            aria-disabled={isSending || canSend}
            aria-pressed={isMicActive}
          >
            <Mic className={cn('h-6 w-6', isMicActive && 'animate-pulse')} />
          </motion.button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[200px] rounded-lg border-none bg-destructive px-3 py-1.5 text-[10px] font-medium text-foreground shadow-xl"
        >
          {isMicActive
            ? '🔴 Gravando... Clique para parar'
            : canSend
              ? '🚫 Limpe o texto para gravar áudio'
              : isSending
                ? '⏳ Aguarde o envio para gravar'
                : '🎤 Gravar áudio (Segure ou clique)'}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
