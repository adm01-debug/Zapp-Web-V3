import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
// Tooltip removido para evitar loop de refs Tooltip+Popover (Radix Slot).
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Loader2, Play, Pause, Send, X, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const VOICE_PRESETS = [
  // Masculinas
  { id: 'grave', emoji: '🎤', label: 'Grave', cat: 'masc' },
  { id: 'roger', emoji: '🎙️', label: 'Narrador', cat: 'masc' },
  { id: 'animado', emoji: '🤩', label: 'Animado', cat: 'masc' },
  { id: 'misterioso', emoji: '🕵️', label: 'Misterioso', cat: 'masc' },
  { id: 'brian', emoji: '🧔', label: 'Brian', cat: 'masc' },
  { id: 'bill', emoji: '👴', label: 'Bill', cat: 'masc' },
  { id: 'eric', emoji: '😎', label: 'Eric', cat: 'masc' },
  { id: 'will', emoji: '🤠', label: 'Will', cat: 'masc' },
  { id: 'callum', emoji: '🎩', label: 'Callum', cat: 'masc' },
  { id: 'charlie', emoji: '🧑', label: 'Charlie', cat: 'masc' },
  // Femininas
  { id: 'feminina', emoji: '👩', label: 'Sarah', cat: 'fem' },
  { id: 'laura', emoji: '💃', label: 'Laura', cat: 'fem' },
  { id: 'alice', emoji: '👱‍♀️', label: 'Alice', cat: 'fem' },
  { id: 'matilda', emoji: '👩‍🦰', label: 'Matilda', cat: 'fem' },
  { id: 'jessica', emoji: '💁‍♀️', label: 'Jessica', cat: 'fem' },
  { id: 'lily', emoji: '🌸', label: 'Lily', cat: 'fem' },
  // Neutras/Especiais
  { id: 'river', emoji: '🌊', label: 'River', cat: 'special' },
  { id: 'robo', emoji: '🤖', label: 'Robô', cat: 'special' },
  { id: 'glitch', emoji: '👾', label: 'Glitch', cat: 'special' },
  // Temáticas
  { id: 'santa', emoji: '🎅', label: 'Papai Noel', cat: 'theme' },
  { id: 'mrs_claus', emoji: '🤶', label: 'Mamãe Noel', cat: 'theme' },
  { id: 'elf', emoji: '🧝', label: 'Elfo', cat: 'theme' },
  { id: 'reindeer', emoji: '🦌', label: 'Rena', cat: 'theme' },
] as const;

interface VoiceChangerPickerProps {
  onSendAudio: (audioUrl: string) => void;
  disabled?: boolean;
}

export function VoiceChangerPicker({ onSendAudio, disabled }: VoiceChangerPickerProps) {
  const [open, setOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('grave');
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [transformedUrl, setTransformedUrl] = useState<string | null>(null);
  const [isTransforming, setIsTransforming] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (transformedUrl) URL.revokeObjectURL(transformedUrl);
    setRecordedBlob(null);
    setTransformedUrl(null);
    setIsRecording(false);
    setIsPlaying(false);
    setIsTransforming(false);
    setIsSending(false);
    chunksRef.current = [];
  }, [transformedUrl]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setTransformedUrl(null);
    } catch {
      toast.error('Não foi possível acessar o microfone');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const transformVoice = useCallback(async () => {
    if (!recordedBlob) return;
    setIsTransforming(true);
    if (transformedUrl) {
      URL.revokeObjectURL(transformedUrl);
      setTransformedUrl(null);
    }

    try {
      const formData = new FormData();
      formData.append('audio', recordedBlob, 'recording.webm');
      formData.append('voice_preset', selectedVoice);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-changer`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errData.error || `Error ${response.status}`);
      }

      const audioBlob = await response.blob();
      const url = URL.createObjectURL(audioBlob);
      setTransformedUrl(url);
      toast.success('Voz transformada! 🎭');
    } catch (err) {
      toast.error(
        `Erro ao transformar voz: ${err instanceof Error ? err.message : 'desconhecido'}`
      );
    } finally {
      setIsTransforming(false);
    }
  }, [recordedBlob, selectedVoice, transformedUrl]);

  const togglePlay = useCallback(() => {
    if (!transformedUrl) return;
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }
    const audio = new Audio(transformedUrl);
    audio.onended = () => setIsPlaying(false);
    audio.play();
    audioRef.current = audio;
    setIsPlaying(true);
  }, [transformedUrl, isPlaying]);

  const handleSend = useCallback(async () => {
    if (!transformedUrl || isSending) return;
    setIsSending(true);
    try {
      const response = await fetch(transformedUrl);
      const blob = await response.blob();
      const path = `voice-changer/${Date.now()}_${crypto.randomUUID()}.mp3`;
      const { error: uploadError } = await supabase.storage
        .from('audio-memes')
        .upload(path, blob, { contentType: 'audio/mpeg', cacheControl: '31536000' });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('audio-memes').getPublicUrl(path);
      onSendAudio(urlData.publicUrl);
      setOpen(false);
      cleanup();
      toast.success('Áudio enviado! 🎤');
    } catch {
      toast.error('Erro ao enviar áudio');
    } finally {
      setIsSending(false);
    }
  }, [transformedUrl, isSending, onSendAudio, cleanup]);

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
          className="h-9 w-9 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
          disabled={disabled}
          aria-label="Voice Changer"
          title="Voice Changer"
        >
          <Wand2 className="h-[18px] w-[18px]" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[320px] border-border bg-popover p-0"
        align="end"
        side="top"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Wand2 className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Voice Changer</h4>
          <span className="ml-auto text-[10px] text-muted-foreground">Powered by ElevenLabs</span>
        </div>

        <div className="space-y-3 p-3">
          {/* Voice Selection */}
          <div>
            <p className="mb-2 text-xs text-muted-foreground">Escolha a voz:</p>
            <div className="max-h-[180px] overflow-y-auto pr-1">
              <div className="grid grid-cols-5 gap-1">
                {VOICE_PRESETS.map((v) => (
                  <button
                    type="button"
                    key={v.id}
                    onClick={() => setSelectedVoice(v.id)}
                    className={cn(
                      'flex flex-col items-center gap-0.5 rounded-lg border p-1.5 text-center transition-colors',
                      selectedVoice === v.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-transparent text-muted-foreground hover:bg-muted'
                    )}
                  >
                    <span className="text-base">{v.emoji}</span>
                    <span className="w-full truncate text-[9px] font-medium leading-tight">
                      {v.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Recording Area */}
          <div className="flex flex-col items-center gap-2 py-2">
            <AnimatePresence mode="wait">
              {!recordedBlob && !isRecording && (
                <motion.div
                  key="idle"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                >
                  <Button
                    onClick={startRecording}
                    size="lg"
                    className="h-16 w-16 rounded-full bg-primary hover:bg-primary/90"
                  >
                    <Mic className="h-7 w-7" />
                  </Button>
                  <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
                    Toque para gravar
                  </p>
                </motion.div>
              )}

              {isRecording && (
                <motion.div
                  key="recording"
                  role="status"
                  aria-live="polite"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="flex flex-col items-center"
                >
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ repeat: Infinity, duration: 1.2 }}
                  >
                    <Button
                      onClick={stopRecording}
                      size="lg"
                      variant="destructive"
                      className="h-16 w-16 rounded-full"
                    >
                      <MicOff className="h-7 w-7" />
                    </Button>
                  </motion.div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <motion.div
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                      className="h-2 w-2 rounded-full bg-destructive"
                    />
                    <span className="text-xs font-medium text-destructive">Gravando...</span>
                  </div>
                </motion.div>
              )}

              {recordedBlob && !isRecording && (
                <motion.div
                  key="recorded"
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="w-full space-y-2"
                >
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRecordedBlob(null);
                        setTransformedUrl(null);
                      }}
                    >
                      <X className="mr-1 h-3.5 w-3.5" />
                      Regravar
                    </Button>
                    <Button
                      size="sm"
                      onClick={transformVoice}
                      disabled={isTransforming}
                      className="bg-primary"
                    >
                      {isTransforming ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Wand2 className="mr-1 h-3.5 w-3.5" />
                      )}
                      {isTransforming ? 'Transformando...' : 'Transformar voz'}
                    </Button>
                  </div>

                  {transformedUrl && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-center gap-2 pt-1"
                    >
                      <Button variant="outline" size="sm" onClick={togglePlay}>
                        {isPlaying ? (
                          <Pause className="mr-1 h-3.5 w-3.5" />
                        ) : (
                          <Play className="mr-1 h-3.5 w-3.5" />
                        )}
                        {isPlaying ? 'Pausar' : 'Ouvir'}
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSend}
                        disabled={isSending}
                        className="bg-primary hover:bg-primary/90"
                      >
                        {isSending ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="mr-1 h-3.5 w-3.5" />
                        )}
                        Enviar
                      </Button>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="border-t border-border/30 px-3 py-1.5">
          <p className="text-center text-[10px] text-muted-foreground">
            Grave → Escolha a voz → Transforme → Envie 🎭
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
