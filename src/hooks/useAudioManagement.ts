import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { getLogger } from '@/lib/logger';
import { log as logLib } from '@/lib/logger';
import { toast } from 'sonner';
import { toast as toastHook } from '@/hooks/use-toast';
import type { MediaRefreshKey } from '@/types/mediaRefresh';
import { audioPlaybackBus } from '@/features/inbox';
import { MAX_PTT_DURATION_SEC } from '@/lib/audio/pttLimits';

const AUDIO_MEMES_KEY = ['audio-memes'] as const;

const log = getLogger('useAudioManagement');

/* ============================================================================
   SECTION 1: useAudioMemes - Audio meme catalog management
   ============================================================================ */

/** Audio Meme Item interface. */
export interface AudioMemeItem {
  id: string;
  name: string;
  audio_url: string;
  category: string;
  duration_seconds: number | null;
  is_favorite: boolean;
  use_count: number;
}

/** Pending Upload interface definition. */
export interface PendingUpload {
  file: File;
  audioUrl: string;
  storagePath: string;
  duration: number | null;
  aiCategory: string;
  selectedCategory: string;
  name: string;
}

/** Manages audio meme library with loading, syncing, categorization, and playback control. */
export function useAudioMemes(open: boolean) {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: memes = [], isLoading: loading } = useQuery({
    queryKey: AUDIO_MEMES_KEY,
    queryFn: async () => {
      const { data, error } = await safeClient.rpc<AudioMemeItem[]>('fn_list_audio_memes_for_user', {
        p_category: null,
        p_only_favorites: false,
        p_search: null,
      });
      if (!error && data) return data;
      if (error) {
        log.error('fetchMemes error', error);
        const { data: basicData } = await supabase
          .from('audio_memes')
          .select('*')
          .order('use_count', { ascending: false });
        return (basicData as AudioMemeItem[]) ?? [];
      }
      return [] as AudioMemeItem[];
    },
    enabled: open,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!open) return;
    setSyncing(true);
    setSyncError(null);

    const catalogChannel = supabase
      .channel('audio-memes-catalog')
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'audio_memes' }, () => {
        log.info('Catalog update received');
        void queryClient.invalidateQueries({ queryKey: AUDIO_MEMES_KEY });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setSyncing(false);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setSyncError('Erro na sincronização do catálogo');
          setSyncing(false);
        }
      });

    const favoritesChannel = supabase
      .channel('audio-memes-favorites')
      .on(
        'postgres_changes',
        { event: '*', schema: 'zapp', table: 'audio_meme_favorites' },
        () => {
          log.info('Favorites update received');
          void queryClient.invalidateQueries({ queryKey: AUDIO_MEMES_KEY });
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setSyncError('Erro na sincronização de favoritos');
        }
      });

    return () => {
      catalogChannel.unsubscribe();
      supabase.removeChannel(catalogChannel);
      favoritesChannel.unsubscribe();
      supabase.removeChannel(favoritesChannel);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [open, queryClient]);

  const handlePreview = useCallback(
    (meme: AudioMemeItem) => {
      if (playingId === meme.id) {
        audioRef.current?.pause();
        setPlayingId(null);
        return;
      }
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(meme.audio_url);
      audio.onended = () => setPlayingId(null);
      audio.play();
      audioRef.current = audio;
      setPlayingId(meme.id);
    },
    [playingId]
  );

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      toast.error('Arquivo não é um áudio válido');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Arquivo excede 5MB');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'mp3';
      const storagePath = `meme_${Date.now()}_${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('audio-memes')
        .upload(storagePath, file, { contentType: file.type, cacheControl: '31536000' });

      if (uploadError) {
        toast.error('Erro ao enviar arquivo');
        return;
      }

      const { data: urlData } = supabase.storage.from('audio-memes').getPublicUrl(storagePath);

      let duration: number | null = null;
      try {
        const tempAudio = new Audio(urlData.publicUrl);
        await new Promise<void>((resolve) => {
          tempAudio.onloadedmetadata = () => {
            duration = isFinite(tempAudio.duration)
              ? Math.round(tempAudio.duration * 100) / 100
              : null;
            resolve();
          };
          tempAudio.onerror = () => resolve();
          setTimeout(resolve, 3000);
        });
      } catch (err) {
        log.error('Unexpected error in useAudioMemes:', err);
      }

      let aiCategory = 'outros';
      try {
        toast.info('🔍 Classificando com IA...');
        const { data: classifyData, error: classifyErr } = await supabase.functions.invoke(
          'classify-audio-meme',
          {
            body: { audio_url: urlData.publicUrl, file_name: file.name },
          }
        );
        if (!classifyErr && classifyData?.category) aiCategory = classifyData.category;
      } catch (err) {
        log.error('Unexpected error in useAudioMemes:', err);
      }

      setPendingUpload({
        file,
        audioUrl: urlData.publicUrl,
        storagePath,
        duration,
        aiCategory,
        selectedCategory: aiCategory,
        name: file.name.replace(/\.[^.]+$/, ''),
      });
    } catch {
      toast.error('Erro ao processar áudio');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  const handleConfirmUpload = useCallback(
    async (pending: PendingUpload) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error: insertError } = await supabase.from('audio_memes').insert({
        name: pending.name,
        audio_url: pending.audioUrl,
        category: pending.selectedCategory,
        duration_seconds: pending.duration,
        uploaded_by: user?.id ?? null,
      });

      if (insertError) {
        log.error('[AudioMeme] Insert error:', insertError);
        toast.error('Erro ao salvar áudio meme');
        return;
      }
      toast.success(`Áudio salvo como "${pending.selectedCategory}"!`);
      setPendingUpload(null);
      await queryClient.invalidateQueries({ queryKey: AUDIO_MEMES_KEY });
    },
    [queryClient]
  );

  const handleCancelUpload = useCallback(async () => {
    if (pendingUpload) {
      await supabase.storage.from('audio-memes').remove([pendingUpload.storagePath]);
    }
    setPendingUpload(null);
  }, [pendingUpload]);

  const handleSend = useCallback(
    async (meme: AudioMemeItem, onSend: (meme: AudioMemeItem) => void, onClose: () => void) => {
      if (audioRef.current) {
        audioRef.current.pause();
        setPlayingId(null);
      }
      onSend(meme);
      onClose();
      queryClient.setQueryData(AUDIO_MEMES_KEY, (prev: AudioMemeItem[] | undefined) =>
        (prev ?? []).map((m) => (m.id === meme.id ? { ...m, use_count: (m.use_count || 0) + 1 } : m))
      );
      const { error: incErr } = await safeClient.rpc('fn_increment_meme_use', {
        p_meme_id: meme.id,
      });
      if (incErr) log.error('fn_increment_meme_use error', incErr);
    },
    [queryClient]
  );

  const toggleFavorite = useCallback(async (e: React.MouseEvent, meme: AudioMemeItem) => {
    e.stopPropagation();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Efetue login para favoritar');
      return;
    }

    const newVal = !meme.is_favorite;
    queryClient.setQueryData(AUDIO_MEMES_KEY, (prev: AudioMemeItem[] | undefined) =>
      (prev ?? []).map((m) => (m.id === meme.id ? { ...m, is_favorite: newVal } : m))
    );

    const { error } = await safeClient.rpc('fn_toggle_user_meme_favorite', {
      p_meme_id: meme.id,
    });

    if (error) {
      log.error('toggleFavorite error', error);
      queryClient.setQueryData(AUDIO_MEMES_KEY, (prev: AudioMemeItem[] | undefined) =>
        (prev ?? []).map((m) => (m.id === meme.id ? { ...m, is_favorite: !newVal } : m))
      );
      toast.error('Erro ao atualizar favorito');
    }
  }, [queryClient]);

  const handleCategoryChange = useCallback(async (meme: AudioMemeItem, newCategory: string) => {
    queryClient.setQueryData(AUDIO_MEMES_KEY, (prev: AudioMemeItem[] | undefined) =>
      (prev ?? []).map((m) => (m.id === meme.id ? { ...m, category: newCategory } : m))
    );
    await supabase.from('audio_memes').update({ category: newCategory }).eq('id', meme.id);
    toast.success(`Categoria alterada`);
  }, [queryClient]);

  const handleDelete = useCallback(async (e: React.MouseEvent, meme: AudioMemeItem) => {
    e.stopPropagation();
    queryClient.setQueryData(AUDIO_MEMES_KEY, (prev: AudioMemeItem[] | undefined) =>
      (prev ?? []).filter((m) => m.id !== meme.id)
    );
    const path = meme.audio_url.split('/audio-memes/')[1];
    if (path) await supabase.storage.from('audio-memes').remove([path]);
    await supabase.from('audio_memes').delete().eq('id', meme.id);
    toast.success('Áudio meme removido');
  }, [queryClient]);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setPlayingId(null);
    }
    setPendingUpload(null);
  }, []);

  return {
    memes,
    loading,
    syncing,
    syncError,
    uploading,
    playingId,
    pendingUpload,
    audioRef,
    fileInputRef,
    handlePreview,
    handleFileSelect,
    handleConfirmUpload,
    handleCancelUpload,
    handleSend,
    toggleFavorite,
    handleCategoryChange,
    handleDelete,
    cleanup,
  };
}

/** format Duration constant. */
export const formatDuration = (seconds: number | null) => {
  if (!seconds) return '--';
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/* ============================================================================
   SECTION 2: useAudioPlayer - Audio playback with quality controls
   ============================================================================ */

interface SeekInput {
  currentTarget: EventTarget & HTMLDivElement;
  clientX: number;
}

interface UseAudioPlayerOptions {
  audioUrl: string | null;
  messageId: string;
  refreshKey?: MediaRefreshKey;
}

/** Manages audio playback with rate control, progress tracking, and URL resolution. */
export function useAudioPlayer({ audioUrl, messageId, refreshKey }: UseAudioPlayerOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [resolvedUrl, setResolvedUrl] = useState<string>(audioUrl ?? '');
  const [volume, setVolumeState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('audio-player:volume');
      const n = saved !== null ? parseFloat(saved) : 1;
      return isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
    } catch {
      return 1;
    }
  });
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastNonZeroVolumeRef = useRef<number>(volume > 0 ? volume : 1);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    if (clamped > 0) lastNonZeroVolumeRef.current = clamped;
    setVolumeState(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
    try {
      localStorage.setItem('audio-player:volume', String(clamped));
    } catch {
      /* noop */
    }
  }, []);

  const toggleMute = useCallback((): { muted: boolean; volume: number } => {
    if (volume > 0) {
      lastNonZeroVolumeRef.current = volume;
      setVolume(0);
      return { muted: true, volume: 0 };
    }
    const restored = lastNonZeroVolumeRef.current || 1;
    setVolume(restored);
    return { muted: false, volume: restored };
  }, [volume, setVolume]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (!isPlaying) {
      audioPlaybackBus.clearActive(messageId);
      return;
    }
    audioPlaybackBus.setActive({
      messageId,
      toggleMute,
      getVolume: () => volume,
    });
    return () => audioPlaybackBus.clearActive(messageId);
  }, [isPlaying, messageId, toggleMute, volume]);

  const waveformHeights = useMemo(
    () => Array.from({ length: 30 }, () => Math.random() * 60 + 20),
    []
  );

  const resolveAudioUrl = useCallback(
    async (url: string | null): Promise<string> => {
      if (!url) return '';
      if (url.includes('/storage/v1/')) {
        try {
          const buckets = ['whatsapp-media', 'audio-messages'];
          for (const bucket of buckets) {
            const marker = `/${bucket}/`;
            const idx = url.indexOf(marker);
            if (idx !== -1) {
              const pathWithQuery = url.substring(idx + marker.length);
              const path = decodeURIComponent(pathWithQuery.split('?')[0]);
              const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 604800); // ✅ fix: 7d TTL (era 1h — URLs quebravam após 1h);
              if (data?.signedUrl) return data.signedUrl;
            }
          }
        } catch (e) {
          logLib.error('Failed to refresh signed URL:', e);
        }
      }

      let urlExpired = false;
      try {
        const resp = await fetch(url, { method: 'HEAD', mode: 'cors' });
        if (resp.ok) return url;
        if (resp.status === 410 || resp.status === 403 || resp.status === 404) urlExpired = true;
      } catch (err) {
        logLib.error('Unexpected error in useAudioPlayer:', err);
      }

      try {
        const buckets = ['whatsapp-media', 'audio-messages'];
        for (const bucket of buckets) {
          const { data: files } = await supabase.storage
            .from(bucket)
            .list('', { search: messageId, limit: 5 });
          if (files && files.length > 0) {
            const { data } = await supabase.storage
              .from(bucket)
              .createSignedUrl(files[0].name, 604800); // ✅ fix: 7d TTL (era 1h — URLs quebravam após 1h);
            if (data?.signedUrl) return data.signedUrl;
          }
        }
      } catch (err) {
        logLib.error('Unexpected error in useAudioPlayer:', err);
      }

      if (refreshKey && urlExpired) {
        try {
          const { data, error } = await supabase.functions.invoke(
            'evolution-api/get-media-base64',
            {
              method: 'POST',
              body: {
                instanceName: refreshKey.instanceName,
                message: {
                  key: {
                    remoteJid: refreshKey.remoteJid,
                    fromMe: refreshKey.fromMe,
                    id: refreshKey.id,
                  },
                },
              },
            }
          );
          if (!error) {
            const payload = (data as { base64?: string; mimetype?: string } | null) ?? null;
            if (payload?.base64) {
              const mime = payload.mimetype || 'audio/ogg';
              return `data:${mime};base64,${payload.base64}`;
            }
          }
        } catch (err) {
          logLib.error('Evolution audio refresh failed:', err);
        }
      }

      return url;
    },
    [messageId, refreshKey]
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    /** Sets the track duration once audio metadata is available and clears loading/error states. */
    const handleLoadedMetadata = () => {
      const d = audio.duration;
      setDuration(isFinite(d) && !isNaN(d) ? d : 0);
      setIsLoading(false);
      setHasError(false);
    };
    /** Synchronizes `currentTime` and `progress` percentage as the audio position advances. */
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration && isFinite(audio.duration))
        setProgress((audio.currentTime / audio.duration) * 100);
    };
    /** Resets playback state when the audio track reaches the end. */
    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    };
    /** Stops playback and marks the element as errored when the browser cannot load or decode the audio. */
    const handleError = () => {
      logLib.error('Audio error:', messageId);
      setIsPlaying(false);
      setIsLoading(false);
      setHasError(true);
    };
    /** Sets loading state while the browser is buffering audio data. */
    const handleWaiting = () => setIsLoading(true);
    /** Clears loading state once the browser has buffered enough to begin playback. */
    const handleCanPlay = () => setIsLoading(false);

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('canplay', handleCanPlay);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [resolvedUrl, messageId]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    if (hasError) {
      setIsLoading(true);
      setHasError(false);
      try {
        const freshUrl = await resolveAudioUrl(audioUrl);
        setResolvedUrl(freshUrl);
        audio.src = freshUrl;
        audio.load();
      } catch {
        setHasError(true);
        setIsLoading(false);
        toastHook({ title: 'Erro ao carregar áudio', variant: 'destructive' });
        return;
      }
    }

    setIsLoading(true);
    try {
      await audio.play();
      setIsPlaying(true);
      setIsLoading(false);
      setHasError(false);
    } catch {
      setIsPlaying(false);
      try {
        const freshUrl = await resolveAudioUrl(audioUrl);
        if (freshUrl !== resolvedUrl) {
          setResolvedUrl(freshUrl);
          audio.src = freshUrl;
          audio.load();
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              cleanup();
              reject();
            }, 15000);
            const cleanup = () => {
              audio.removeEventListener('canplay', onCanPlay);
              audio.removeEventListener('error', onErr);
              clearTimeout(timeout);
            };
            const onCanPlay = () => {
              cleanup();
              resolve();
            };
            const onErr = () => {
              cleanup();
              reject();
            };
            audio.addEventListener('canplay', onCanPlay);
            audio.addEventListener('error', onErr);
          });
          await audio.play();
          setIsPlaying(true);
          setIsLoading(false);
          setHasError(false);
        } else {
          setIsLoading(false);
          setHasError(true);
          toastHook({
            title: 'Erro ao reproduzir',
            description: 'O arquivo de áudio expirou ou foi removido. Tente recarregar a conversa.',
            variant: 'destructive',
          });
        }
      } catch {
        setIsLoading(false);
        setHasError(true);
        toastHook({
          title: 'Erro ao reproduzir',
          description: 'Não foi possível carregar o áudio. Verifique sua conexão.',
          variant: 'destructive',
        });
      }
    }
  }, [isPlaying, hasError, audioUrl, resolvedUrl, resolveAudioUrl]);

  const handleSeek = useCallback(
    (e: SeekInput) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      audio.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
    },
    [duration]
  );

  const cycleSpeed = useCallback(() => {
    const speeds = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75];
    const nextIndex = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const newRate = speeds[nextIndex];
    setPlaybackRate(newRate);
    if (audioRef.current) audioRef.current.playbackRate = newRate;
  }, [playbackRate]);

  /** Formats a seconds value as `m:ss`; returns `'0:00'` for non-finite inputs. */
  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00';
    return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0')}`;
  };

  return {
    audioRef,
    resolvedUrl,
    isPlaying,
    isLoading,
    hasError,
    playbackRate,
    progress,
    duration,
    currentTime,
    waveformHeights,
    volume,
    setVolume,
    toggleMute,
    togglePlay,
    handleSeek,
    cycleSpeed,
    formatTime,
    resolveAudioUrl,
  };
}

/* ============================================================================
   SECTION 3: useAudioRecorder - Audio recording & transcription
   ============================================================================ */

interface AudioRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: unknown;
  onerror: unknown;
  start(): void;
  stop(): void;
}
type AudioRecognitionCtor = new () => AudioRecognitionInstance;

interface UseAudioRecorderOptions {
  onRecordingComplete?: (audioBlob: Blob, audioUrl: string) => void;
  maxDuration?: number;
}

/** Manages audio recording with pause/resume, duration limits, and blob generation. */
export function useAudioRecorder(options: UseAudioRecorderOptions = {}) {
  const { onRecordingComplete, maxDuration = MAX_PTT_DURATION_SEC } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcription, setTranscription] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<AudioRecognitionInstance | null>(null);
  const lastBlobRef = useRef<Blob | null>(null);
  const lastTranscriptionRef = useRef<string>('');
  const transcriptionRef = useRef<string>('');
  useEffect(() => {
    transcriptionRef.current = transcription;
  }, [transcription]);

  const startRecording = useCallback(
    async (isRecovery = false) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        streamRef.current = stream;
        chunksRef.current = [];

        const audioContext = new (
          window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        )();

        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }

        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        /** Reads the frequency analyser data each animation frame and updates the normalized audio level (0–1). */
        const updateLevel = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          const sum = dataArray.reduce((acc, val) => acc + val, 0);
          const average = sum / bufferLength;
          setAudioLevel(average / 128);
          animationFrameRef.current = requestAnimationFrame(updateLevel);
        };
        updateLevel();

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus',
        });

        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const url = URL.createObjectURL(audioBlob);
          setAudioUrl(url);

          if (recognitionRef.current) {
            recognitionRef.current.stop();
          }

          if (transcriptionRef.current.trim() === '' && audioBlob.size > 1000) {
            try {
              setIsTranscribing(true);
              const { data, error } = await supabase.functions.invoke('speech-to-text', {
                body: { audio: await blobToBase64(audioBlob) },
              });
              if (!error && data?.text) {
                setTranscription(data.text);
              }
            } catch (err) {
              logLib.error('Backend STT failed:', err);
            } finally {
              setIsTranscribing(false);
            }
          }

          onRecordingComplete?.(audioBlob, url);

          if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
          if (audioContextRef.current) audioContextRef.current.close();
          analyserRef.current = null;
          audioContextRef.current = null;
          setAudioLevel(0);
        };

        mediaRecorder.start(100);
        setIsRecording(true);
        setIsPaused(false);
        if (!isRecovery) {
          setDuration(0);
          setTranscription('');
        }

        const w = window as unknown as {
          SpeechRecognition?: AudioRecognitionCtor;
          webkitSpeechRecognition?: AudioRecognitionCtor;
        };
        const SpeechRecognitionImpl = w.SpeechRecognition ?? w.webkitSpeechRecognition;
        if (SpeechRecognitionImpl) {
          const recognition = new SpeechRecognitionImpl();
          recognition.lang = 'pt-BR';
          recognition.continuous = true;
          recognition.interimResults = true;

          recognition.onresult = (event: SpeechRecognitionEvent) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
              if (event.results[i].isFinal) {
                setTranscription((prev) => (prev + ' ' + event.results[i][0].transcript).trim());
              }
            }
          };

          recognition.onerror = async (event: SpeechRecognitionErrorEvent) => {
            logLib.warn('Speech recognition error:', event.error);
            if (event.error === 'no-speech') return;

            const errCode = event.error as string;
            if (
              errCode === 'network' ||
              errCode === 'service-not-allowed' ||
              errCode === 'service-unavailable'
            ) {
              logLib.info('Local speech recognition unavailable, will use backend STT');
              setIsTranscribing(true);
            } else {
              logLib.error('Unrecoverable speech recognition error:', event.error);
              setIsTranscribing(true);
            }
          };

          recognition.start();
          recognitionRef.current = recognition;
        } else {
          logLib.warn('Web Speech API not supported. Background STT will be used after recording.');
          setIsTranscribing(true);
        }

        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
          setDuration((prev) => {
            if (prev >= maxDuration) {
              stopRecording();
              toastHook({
                title: 'Limite de gravação atingido',
                description: `O áudio foi encerrado em ${Math.floor(maxDuration / 60)} min (limite máximo).`,
              });
              return prev;
            }
            return prev + 1;
          });
        }, 1000);
      } catch (error) {
        logLib.error('Error starting recording:', error);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => {
            track.stop();
          });
          streamRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(() => {
            /* ignore */
          });
          audioContextRef.current = null;
        }
        toastHook({
          title: 'Erro ao gravar',
          description: 'Não foi possível acessar o microfone.',
          variant: 'destructive',
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maxDuration, onRecordingComplete]
  );

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (recognitionRef.current) recognitionRef.current.stop();
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
      if (recognitionRef.current) recognitionRef.current.start();
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      setIsRecording(false);
      setIsPaused(false);
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setIsRecording(false);
    setIsPaused(false);
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const ctx = audioContextRef.current;
      if (ctx && ctx.state !== 'closed') {
        ctx.close().catch(() => {
          /* ignore */
        });
      }
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== 'inactive') {
        try {
          mr.stop();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  const cancelRecording = useCallback(
    (saveForUndo = false) => {
      if (mediaRecorderRef.current && (isRecording || isPaused)) {
        if (saveForUndo) {
          lastBlobRef.current = new Blob(chunksRef.current, { type: 'audio/webm' });
          lastTranscriptionRef.current = transcription;
        }

        mediaRecorderRef.current.stop();
        streamRef.current?.getTracks().forEach((track) => track.stop());

        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }

        chunksRef.current = [];
        setIsRecording(false);
        setIsPaused(false);
        setDuration(0);
        setAudioUrl(null);
      }
    },
    [isRecording, isPaused, transcription]
  );

  const restoreRecording = useCallback(() => {
    if (lastBlobRef.current) {
      const url = URL.createObjectURL(lastBlobRef.current);
      setAudioUrl(url);
      setTranscription(lastTranscriptionRef.current);
      onRecordingComplete?.(lastBlobRef.current, url);
      return true;
    }
    return false;
  }, [onRecordingComplete]);

  const uploadAudio = useCallback(async (blob: Blob, conversationId: string) => {
    const fileName = `${conversationId}/${crypto.randomUUID()}.webm`;

    const { error } = await supabase.storage.from('audio-messages').upload(fileName, blob, {
      contentType: 'audio/webm',
    });

    if (error) {
      throw error;
    }

    const { data: signedData, error: signError } = await supabase.storage
      .from('audio-messages')
      .createSignedUrl(fileName, 604800); // ✅ fix: 7d TTL (era 1h — URLs quebravam após 1h);

    if (signError || !signedData?.signedUrl) {
      throw signError || new Error('Failed to create signed URL');
    }

    return signedData.signedUrl;
  }, []);

  const formatDurationRecorder = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return {
    isRecording,
    isPaused,
    duration,
    audioUrl,
    audioLevel,
    transcription,
    setTranscription,
    isTranscribing,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
    restoreRecording,
    uploadAudio,
    formatDuration: formatDurationRecorder,
  };
}

/** Converts a Blob to a Base64-encoded string (without the data-URL prefix) via FileReader. */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      resolve(base64String.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}