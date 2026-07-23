import { useCallback, useState } from 'react';
import { useVoiceAgent, type VoiceAgentAction } from '@/hooks/useVoiceAgent';
import type { VoiceAgentPhase } from '@/features/inbox';
import { VoiceSearchOverlay } from './VoiceSearchOverlay';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAction?: (action: VoiceAgentAction) => void;
  onError?: (msg: string) => void;
}

/**
 * React component: Voice Search Overlay Connected.
 * Adapter que expõe o contrato completo de `VoiceSearchOverlay` a partir do
 * `useVoiceAgent` consolidado (que hoje só rastreia isActive/responses).
 * Estados de transcrição e resposta ficam locais até a próxima onda de voz.
 */
function VoiceSearchOverlayConnected({ isOpen, onClose, onError }: Props) {
  const voice = useVoiceAgent();
  const [phase, setPhase] = useState<VoiceAgentPhase>('idle');

  const handleStartListening = useCallback(async () => {
    try {
      voice.activate();
      setPhase('listening');
    } catch (err) {
      setPhase('error');
      onError?.(err instanceof Error ? err.message : 'Falha ao iniciar captura de voz');
    }
  }, [voice, onError]);

  const handleStopListening = useCallback(() => {
    voice.deactivate();
    setPhase('idle');
  }, [voice]);

  const handleStopSpeaking = useCallback(() => {
    setPhase('idle');
  }, []);

  const handleClose = useCallback(() => {
    voice.deactivate();
    setPhase('idle');
    onClose();
  }, [voice, onClose]);

  return (
    <VoiceSearchOverlay
      isOpen={isOpen}
      phase={phase}
      partialTranscript=""
      finalTranscript=""
      agentResponse=""
      error=""
      onClose={handleClose}
      onStartListening={handleStartListening}
      onStopListening={handleStopListening}
      onStopSpeaking={handleStopSpeaking}
    />
  );
}

export default VoiceSearchOverlayConnected;
