import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { log } from '@/lib/logger';
import { MAX_PTT_DURATION_SEC } from '@/lib/audio/pttLimits';

interface UseAudioRecorderOptions {
  onRecordingComplete?: (audioBlob: Blob, audioUrl: string) => void;
  /** Limite de duração em segundos. Default: limite oficial de PTT (16 min). */
  maxDuration?: number;
}

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
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const lastBlobRef = useRef<Blob | null>(null);
  const lastTranscriptionRef = useRef<string>('');
  // Mirror of the latest transcription so async handlers (onstop) read the
  // current value instead of the stale one captured when startRecording was memoized.
  const transcriptionRef = useRef<string>('');
  useEffect(() => { transcriptionRef.current = transcription; }, [transcription]);

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

        // Audio Level Analyzer
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const updateLevel = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          const sum = dataArray.reduce((acc, val) => acc + val, 0);
          const average = sum / bufferLength;
          setAudioLevel(average / 128); // Normalize to 0-1
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

          // Finalize local transcription if active
          if (recognitionRef.current) {
            recognitionRef.current.stop();
          }

          // If local transcription is empty and we had issues, try backend STT
          // Use transcriptionRef so the closure reads the live value, not the stale
          // one captured when startRecording was memoized.
          if (transcriptionRef.current.trim() === '' && audioBlob.size > 1000) {
            try {
              setIsTranscribing(true);
              const { data } = await supabase.functions.invoke('speech-to-text', {
                body: { audio: await blobToBase64(audioBlob) },
              });
              if (data?.text) {
                setTranscription(data.text);
              }
            } catch (err) {
              log.error('Backend STT failed:', err);
            } finally {
              setIsTranscribing(false);
            }
          }

          onRecordingComplete?.(audioBlob, url);

          // Clean up analyzer
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

        // Enhanced Transcription with Backend Fallback Support
        const win = window as Window & { webkitSpeechRecognition?: typeof SpeechRecognition };
        const SpeechRecognitionImpl = win.SpeechRecognition || win.webkitSpeechRecognition;
        if (SpeechRecognitionImpl) {
          const recognition = new SpeechRecognitionImpl();
          recognition.lang = 'pt-BR';
          recognition.continuous = true;
          recognition.interimResults = true;

          recognition.onresult = (event: any) => { // ignore-audit
            for (let i = event.resultIndex; i < event.results.length; i++) {
              if (event.results[i].isFinal) {
                setTranscription((prev) => (prev + ' ' + event.results[i][0].transcript).trim());
              }
            }
          };

          recognition.onerror = async (event: any) => { // ignore-audit
            log.warn('Speech recognition error:', event.error);
            if (event.error === 'no-speech') return;

            if (event.error === 'network' || event.error === 'service-not-allowed') {
              setIsTranscribing(true); // Indicate background processing
              // When stopping, we'll trigger the backend STT if local failed
            }
          };

          recognition.start();
          recognitionRef.current = recognition;
        } else {
          log.warn('Web Speech API not supported. Background STT will be used after recording.');
          setIsTranscribing(true);
        }

        intervalRef.current = setInterval(() => {
          setDuration((prev) => {
            if (prev >= maxDuration) {
              stopRecording();
              toast({
                title: 'Limite de gravação atingido',
                description: `O áudio foi encerrado em ${Math.floor(maxDuration / 60)} min (limite máximo).`,
              });
              return prev;
            }
            return prev + 1;
          });
        }, 1000);
      } catch (error) {
        log.error('Error starting recording:', error);
        toast({
          title: 'Erro ao gravar',
          description: 'Não foi possível acessar o microfone.',
          variant: 'destructive',
        });
      }
    },
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
      intervalRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
      if (recognitionRef.current) recognitionRef.current.start();
    }
  }, []);

  // Ref-based so it works from stale closures (e.g. the maxDuration interval) and
  // from the memoized startRecording.  Uses mediaRecorderRef.current.state !== 'inactive'
  // instead of the isRecording React state: the state value is captured at creation
  // time and goes stale for a callback with empty deps.
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
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setIsRecording(false);
    setIsPaused(false);
  }, []);

  // Release all hardware/timers if the component unmounts mid-recording. Without
  // this the mic stays live (browser recording indicator on), and interval/rAF and
  // the AudioContext keep running after the hook is gone.
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      try { recognitionRef.current?.stop(); } catch { /* ignore */ }
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      const ctx = audioContextRef.current;
      if (ctx && ctx.state !== 'closed') { ctx.close().catch(() => { /* ignore */ }); }
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== 'inactive') { try { mr.stop(); } catch { /* ignore */ } }
    };
  }, []);

  const cancelRecording = useCallback(
    (saveForUndo = false) => {
      if (mediaRecorderRef.current && (isRecording || isPaused)) {
        if (saveForUndo) {
          // We'll grab the chunks before clearing
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
      // We can't really "resume" a hardware stream after it's been stopped and discarded by the browser
      // but we can present the user with the recovered state.
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
      .createSignedUrl(fileName, 3600); // 1 hour expiry

    if (signError || !signedData?.signedUrl) {
      throw signError || new Error('Failed to create signed URL');
    }

    return signedData.signedUrl;
  }, []);

  const formatDuration = useCallback((seconds: number) => {
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
    formatDuration,
  };
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      resolve(base64String.split(',')[1]); // Remove data:audio/webm;base64,
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
