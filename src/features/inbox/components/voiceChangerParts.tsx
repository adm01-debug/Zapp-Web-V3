import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Loader2, Play, Square, Check, Volume2, ShieldAlert, Wand2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { type ElevenLabsVoice } from './VoiceSelector';

export function VoiceChangerHeader({
  isConverting,
  conversionProgress,
}: {
  isConverting: boolean;
  conversionProgress: number;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
      <Wand2 className="h-4 w-4 text-primary" />
      <h4 className="text-sm font-semibold text-foreground">Alterar Voz</h4>
      {isConverting && (
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-primary">{conversionProgress}%</span>
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}

export function CloneWarningPanel({
  show,
  onCancel,
  onConfirm,
}: {
  show: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="border-b border-warning/20 bg-warning/10 p-3"
        >
          <Alert variant="default" className="border-none bg-transparent p-0">
            <ShieldAlert className="h-4 w-4 text-warning-foreground" />
            <AlertTitle className="text-xs font-bold text-warning-foreground">
              Aviso de Voz Clonada
            </AlertTitle>
            <AlertDescription className="text-[10px] leading-relaxed text-warning-foreground">
              Esta voz parece ser uma voz clonada ou celebridade. Certifique-se de ter autorização
              legal para uso comercial ou pessoal desta imagem/voz.
            </AlertDescription>
          </Alert>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-6 flex-1 text-[9px]"
              onClick={onCancel}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="h-6 flex-1 bg-warning text-[9px] hover:bg-warning"
              onClick={onConfirm}
            >
              Eu tenho autorização
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function VoiceListItem({
  voice,
  isSelected,
  isConverting,
  convertedAudioUrl,
  onClick,
}: {
  voice: ElevenLabsVoice;
  isSelected: boolean;
  isConverting: boolean;
  convertedAudioUrl: string | null;
  onClick: () => void;
}) {
  const isLoading = isConverting && isSelected;
  return (
    <button
      key={voice.id}
      data-testid={`voice-btn-${voice.id}`}
      onClick={onClick}
      disabled={isConverting}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
        isSelected
          ? 'border border-primary/20 bg-primary/10'
          : 'border border-transparent hover:bg-muted/60',
        isConverting && !isSelected && 'cursor-not-allowed opacity-50'
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors',
          isSelected ? 'bg-primary/20' : 'bg-muted'
        )}
      >
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : isSelected && convertedAudioUrl ? (
          <Check className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">{voice.name}</span>
          <span
            className={cn(
              'rounded px-1 py-0.5 text-[9px]',
              voice.gender === 'female'
                ? 'bg-destructive/10 text-destructive'
                : 'bg-info/10 text-info'
            )}
          >
            {voice.gender === 'female' ? '♀' : '♂'}
          </span>
        </div>
        <span className="block truncate text-[11px] text-muted-foreground">
          {voice.description}
        </span>
      </div>
    </button>
  );
}

export function VoiceChangerFooter({
  show,
  selectedVoiceName,
  isPlaying,
  onTogglePlayback,
  onConfirm,
}: {
  show: boolean;
  selectedVoiceName: string;
  isPlaying: boolean;
  onTogglePlayback: () => void;
  onConfirm: () => void;
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden border-t border-border"
        >
          <div className="flex items-center gap-2 px-3 py-2.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-foreground"
              onClick={onTogglePlayback}
              aria-label={isPlaying ? 'Parar prévia' : 'Ouvir prévia'}
            >
              {isPlaying ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
            <span className="flex-1 text-xs text-muted-foreground">
              Voz: <span className="font-medium text-foreground">{selectedVoiceName}</span>
            </span>
            <Button
              size="sm"
              className="h-7 bg-primary text-xs hover:bg-primary/90"
              onClick={onConfirm}
            >
              Usar esta voz
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
