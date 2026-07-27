import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
// Tooltip removido aqui para evitar composição instável (Tooltip + Popover em mesmo trigger).
import { cn } from '@/lib/utils';
import { AudioLines, Loader2, Play, Square, Send, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { ELEVENLABS_VOICES, type ElevenLabsVoice } from './VoiceSelector';

interface TextToAudioButtonProps {
  inputValue: string;
  onAudioReady: (blob: Blob) => void;
  disabled?: boolean;
}

/** Text To Audio Button component. */
export function TextToAudioButton({ inputValue, onAudioReady, disabled }: TextToAudioButtonProps) {
  const [open, setOpen] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<ElevenLabsVoice | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [convertedBlob, setConvertedBlob] = useState<Blob | null>(null);
  const [convertedUrl, setConvertedUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const convertAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      convertAbortRef.current?.abort();
    };
  }, []);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    if (convertedUrl) {
      URL.revokeObjectURL(convertedUrl);
    }
    setConvertedUrl(null);
    setConvertedBlob(null);
    setSelectedVoice(null);
  }, [convertedUrl]);

  const handleConvert = async (voice: ElevenLabsVoice) => {
    if (!inputValue.trim()) {
      toast.error('Digite uma mensagem primeiro');
      return;
    }

    // Abort any in-flight conversion and start a new one
    convertAbortRef.current?.abort();
    convertAbortRef.current = new AbortController();
    const { signal } = convertAbortRef.current;

    // Cleanup previous
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (convertedUrl) URL.revokeObjectURL(convertedUrl);
    setConvertedUrl(null);
    setConvertedBlob(null);
    setSelectedVoice(voice);
    setIsConverting(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            text: inputValue.trim(),
            voiceId: voice.id,
          }),
          signal,
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(err.error || `Erro ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setConvertedBlob(blob);
      setConvertedUrl(url);

      // Auto-play preview
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => {
        setIsPlaying(false);
        toast.error('Erro ao reproduzir preview');
      };
      await audio.play();
      setIsPlaying(true);

      toast.success(`Áudio gerado com a voz ${voice.name}!`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error(`Erro ao gerar áudio: ${msg}`);
      setSelectedVoice(null);
    } finally {
      setIsConverting(false);
    }
  };

  const handleSendAudio = () => {
    if (!convertedBlob) return;
    onAudioReady(convertedBlob);
    setOpen(false);
    cleanup();
    toast.success('Áudio enviado!');
  };

  const togglePlayback = () => {
    if (!audioRef.current || !convertedUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const hasText = (inputValue || '').trim().length > 0;

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) cleanup();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-9 w-9 shrink-0 transition-colors',
            hasText
              ? 'text-primary hover:bg-primary/10 hover:text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
          disabled={disabled || !hasText}
          aria-label="Texto para Áudio (TTS)"
          title="Texto para Áudio (TTS)"
        >
          <AudioLines className="h-[18px] w-[18px]" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[300px] border-border bg-popover p-0"
        align="end"
        side="top"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <AudioLines className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Enviar como Áudio</h4>
          <span className="ml-auto text-[10px] text-muted-foreground">ElevenLabs</span>
        </div>

        {/* Text preview */}
        <div className="border-b border-border bg-muted/30 px-3 py-2">
          <p className="line-clamp-2 text-xs text-muted-foreground">
            "{inputValue.trim().substring(0, 120)}
            {inputValue.trim().length > 120 ? '...' : ''}"
          </p>
        </div>

        {/* Voice list */}
        <div className="max-h-[240px] overflow-y-auto p-1.5">
          {ELEVENLABS_VOICES.map((voice) => {
            const isSelected = selectedVoice?.id === voice.id;
            const isLoading = isConverting && isSelected;

            return (
              <motion.button
                key={voice.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => !isConverting && handleConvert(voice)}
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
              </motion.button>
            );
          })}
        </div>

        {/* Footer */}
        <AnimatePresence>
          {convertedUrl && selectedVoice && (
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
                  onClick={togglePlayback}
                  aria-label={isPlaying ? 'Parar áudio' : 'Reproduzir áudio'}
                >
                  {isPlaying ? (
                    <Square className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                </Button>
                <span className="flex-1 text-xs text-muted-foreground">
                  Voz: <span className="font-medium text-foreground">{selectedVoice.name}</span>
                </span>
                <Button
                  size="sm"
                  className="h-7 gap-1 bg-primary text-xs hover:bg-primary/90"
                  onClick={handleSendAudio}
                >
                  <Send className="h-3 w-3" />
                  Enviar Áudio
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </PopoverContent>
    </Popover>
  );
}
