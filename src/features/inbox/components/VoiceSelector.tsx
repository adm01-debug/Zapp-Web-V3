/* eslint-disable react-refresh/only-export-components */
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { getLogger } from '@/lib/logger';

const log = getLogger('VoiceSelector');
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Volume2, Check, Play, Square, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/** Eleven Labs Voice component. */
export interface ElevenLabsVoice {
  id: string;
  name: string;
  description: string;
  gender: 'male' | 'female';
  accent?: string;
  sampleText?: string;
}

// Top ElevenLabs voices with sample texts
/** ELEVENLABS_VOICES component. */
export const ELEVENLABS_VOICES: ElevenLabsVoice[] = [
  { id: 'grave', name: 'Grave', description: 'Voz grave', gender: 'male', accent: 'Português' },
  {
    id: 'Sarah',
    name: 'Sarah',
    description: 'Suave e natural',
    gender: 'female',
    accent: 'Americano',
  },
  {
    id: 'Roger',
    name: 'Roger',
    description: 'Profissional e claro',
    gender: 'male',
    accent: 'Americano',
  },
  {
    id: 'Laura',
    name: 'Laura',
    description: 'Amigável e calorosa',
    gender: 'female',
    accent: 'Americano',
  },
  {
    id: 'Charlie',
    name: 'Charlie',
    description: 'Casual e jovem',
    gender: 'male',
    accent: 'Australiano',
  },
  {
    id: 'George',
    name: 'George',
    description: 'Autoritário e confiante',
    gender: 'male',
    accent: 'Britânico',
  },
  {
    id: 'Matilda',
    name: 'Matilda',
    description: 'Acolhedora e gentil',
    gender: 'female',
    accent: 'Americano',
  },
  {
    id: 'Lily',
    name: 'Lily',
    description: 'Elegante e sofisticada',
    gender: 'female',
    accent: 'Britânico',
  },
  {
    id: 'Daniel',
    name: 'Daniel',
    description: 'Narrando e envolvente',
    gender: 'male',
    accent: 'Britânico',
  },
  {
    id: 'Brian',
    name: 'Brian',
    description: 'Profundo e cativante',
    gender: 'male',
    accent: 'Americano',
  },
  {
    id: 'Jessica',
    name: 'Jessica',
    description: 'Expressiva e dinâmica',
    gender: 'female',
    accent: 'Americano',
  },
  {
    id: 'Nina',
    name: 'Nina',
    description: 'Criança doce e gentil',
    gender: 'female',
    accent: 'Português',
  },
  { id: 'Tom', name: 'Tom', description: 'Menino alegre', gender: 'male', accent: 'Português' },
  {
    id: 'Sr. Silva',
    name: 'Sr. Silva',
    description: 'Idoso experiente',
    gender: 'male',
    accent: 'Português',
  },
  {
    id: 'cloned_sample',
    name: 'Celebridade',
    description: 'Voz clonada de celebridade',
    gender: 'female',
    accent: 'Português',
  },
];

interface VoiceSelectorProps {
  selectedVoiceId: string;
  onVoiceChange: (voiceId: string) => void;
  className?: string;
}

/** Voice Selector component. */
export function VoiceSelector({ selectedVoiceId, onVoiceChange, className }: VoiceSelectorProps) {
  const selectedVoice =
    ELEVENLABS_VOICES.find((v) => v.id === selectedVoiceId) || ELEVENLABS_VOICES[0];
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      previewAbortRef.current?.abort();
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, []);

  const stopPreview = () => {
    previewAbortRef.current?.abort();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setPreviewingVoiceId(null);
  };

  const playPreview = async (voice: ElevenLabsVoice, e: React.MouseEvent) => {
    e.stopPropagation();

    // If already playing this voice, stop it
    if (previewingVoiceId === voice.id) {
      stopPreview();
      return;
    }

    // Stop any current preview (also aborts in-flight request)
    stopPreview();

    previewAbortRef.current = new AbortController();
    const { signal } = previewAbortRef.current;

    setLoadingVoiceId(voice.id);

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
            text: voice.sampleText || `Olá! Eu sou ${voice.name}.`,
            voiceId: voice.id,
          }),
          signal,
        }
      );

      if (!response.ok) {
        throw new Error('Erro ao gerar preview');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      audioUrlRef.current = audioUrl;

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onplay = () => setPreviewingVoiceId(voice.id);
      audio.onended = () => {
        setPreviewingVoiceId(null);
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = null;
        }
      };
      audio.onerror = () => {
        setPreviewingVoiceId(null);
        toast.error('Erro ao reproduzir preview');
      };

      await audio.play();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      log.error('Preview error:', error);
      toast.error('Erro ao carregar preview da voz');
    } finally {
      setLoadingVoiceId(null);
    }
  };

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) stopPreview();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn('h-8 gap-2', className)}>
          <Volume2 className="h-3.5 w-3.5" />
          <span className="text-xs">{selectedVoice.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Vozes ElevenLabs</span>
          <span className="text-[10px] font-normal">Clique ▶ para ouvir</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-[350px] overflow-y-auto">
          {ELEVENLABS_VOICES.map((voice) => {
            const isLoading = loadingVoiceId === voice.id;
            const isPlaying = previewingVoiceId === voice.id;

            return (
              <DropdownMenuItem
                key={voice.id}
                onClick={() => onVoiceChange(voice.id)}
                className="flex cursor-pointer items-center justify-between py-2.5"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {/* Preview button */}
                  <button
                    type="button"
                    onClick={(e) => playPreview(voice, e)}
                    className={cn(
                      'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-colors',
                      isPlaying
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-primary/20 hover:text-primary'
                    )}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isPlaying ? (
                      <Square className="h-3 w-3" />
                    ) : (
                      <Play className="ml-0.5 h-3.5 w-3.5" />
                    )}
                  </button>

                  <div className="flex min-w-0 flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{voice.name}</span>
                      <span
                        className={cn(
                          'flex-shrink-0 rounded px-1.5 py-0.5 text-[10px]',
                          voice.gender === 'female'
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-info/10 text-info'
                        )}
                      >
                        {voice.gender === 'female' ? '♀' : '♂'}
                      </span>
                    </div>
                    <span className="truncate text-xs text-muted-foreground">
                      {voice.description} • {voice.accent}
                    </span>
                  </div>
                </div>

                {selectedVoiceId === voice.id && (
                  <Check className="ml-2 h-4 w-4 flex-shrink-0 text-primary" />
                )}
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
