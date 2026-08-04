import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useSpeechToTextManagement,
  useTextToSpeechManagement,
} from '@/hooks/useVoiceManagement';
import { processVoiceTranscript } from '@/features/inbox/hooks/voice/processTranscript';
import type { VoiceAgentAction } from '@/features/inbox/hooks/voice/types';
import type { VoiceAgentPhase } from '@/features/inbox';
import { VoiceSearchOverlay } from './VoiceSearchOverlay';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAction?: (action: VoiceAgentAction, transcript?: string) => void;
  onError?: (msg: string) => void;
}

// Same resolution as src/integrations/supabase/client.ts (anon key wins).
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string;

/**
 * React component: Voice Search Overlay Connected.
 * Adapter que expõe o contrato completo de `VoiceSearchOverlay`:
 * transcrição local (Web Speech API) → processVoiceTranscript (edge voice-agent)
 * → resposta exibida no overlay + TTS + dispatch da ação reconhecida via onAction.
 */
function VoiceSearchOverlayConnected({ isOpen, onClose, onAction, onError }: Props) {
  const stt = useSpeechToTextManagement('pt-BR');
  const tts = useTextToSpeechManagement('');
  const [phase, setPhase] = useState<VoiceAgentPhase>('idle');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [agentResponse, setAgentResponse] = useState('');
  const [error, setError] = useState('');
  const processingRef = useRef(false);
  const speakingStartedRef = useRef(false);

  // Reflect local interim transcription into the overlay
  useEffect(() => {
    setPartialTranscript(stt.interim);
  }, [stt.interim]);

  // SpeechRecognition errors (permission denied, not supported, ...)
  useEffect(() => {
    if (!stt.error) return;
    setError(stt.error === 'not-allowed' ? 'Microfone bloqueado pelo navegador' : stt.error);
    setPhase('error');
  }, [stt.error]);

  // Return to idle once TTS playback ends (or fails), enabling the next command
  useEffect(() => {
    if (tts.isPlaying) {
      speakingStartedRef.current = true;
      return;
    }
    if (phase === 'speaking' && speakingStartedRef.current) {
      speakingStartedRef.current = false;
      setPhase('idle');
    } else if (phase === 'speaking' && !speakingStartedRef.current && tts.error) {
      setPhase('idle');
    }
  }, [tts.isPlaying, tts.error, phase]);

  const handleStartListening = useCallback(async () => {
    try {
      tts.stop();
      stt.resetTranscript();
      setFinalTranscript('');
      setAgentResponse('');
      setError('');
      setPhase('listening');
      stt.startListening();
    } catch (err) {
      setPhase('error');
      onError?.(err instanceof Error ? err.message : 'Falha ao iniciar captura de voz');
    }
  }, [stt, tts, onError]);

  const handleStopListening = useCallback(() => {
    stt.stopListening();
    const transcript = stt.transcript.trim();
    if (!transcript) {
      setPhase('idle');
      return;
    }
    if (processingRef.current) return;
    processingRef.current = true;

    setFinalTranscript(transcript);
    setPhase('processing');

    processVoiceTranscript(transcript, SUPABASE_URL, SUPABASE_KEY)
      .then((action) => {
        setAgentResponse(action.response);
        setPhase('speaking');
        tts.speak(action.response);
        onAction?.(action, transcript);
      })
      .catch((err) => {
        const message =
          err instanceof Error ? err.message : 'Falha ao processar comando de voz';
        setError(message);
        setPhase('error');
        onError?.(message);
      })
      .finally(() => {
        processingRef.current = false;
        stt.resetTranscript();
      });
  }, [stt, tts, onAction, onError]);

  const handleStopSpeaking = useCallback(() => {
    tts.stop();
    setPhase('idle');
  }, [tts]);

  const handleClose = useCallback(() => {
    tts.stop();
    stt.stopListening();
    stt.resetTranscript();
    setPhase('idle');
    onClose();
  }, [stt, tts, onClose]);

  return (
    <VoiceSearchOverlay
      isOpen={isOpen}
      phase={phase}
      partialTranscript={partialTranscript}
      finalTranscript={finalTranscript}
      agentResponse={agentResponse}
      error={error}
      onClose={handleClose}
      onStartListening={handleStartListening}
      onStopListening={handleStopListening}
      onStopSpeaking={handleStopSpeaking}
    />
  );
}

export default VoiceSearchOverlayConnected;
