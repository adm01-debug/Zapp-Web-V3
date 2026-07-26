/**
 * useAudioPlayer.ts — Hook de player de áudio com tratamento robusto de erros
 *
 * PROBLEMA CORRIGIDO (C7):
 *   O log mostrava: [ERROR] [App] Audio error: <uuid>
 *   Sem nenhum contexto — MediaError.code nunca era capturado.
 *   O mesmo objeto aparecia 2-3x no log = retry cego sem cache negativo.
 *
 * SOLUÇÃO:
 *   1. Capturar MediaError.code e mapear para mensagem acionável
 *   2. Aplicar cache negativo via markMediaUrlFailed (da mediaUrl.ts)
 *   3. Expor estado de erro na UI para o usuário
 *   4. Log com messageId e URL para diagnóstico
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getLogger } from '@/lib/logger';
import { markMediaUrlFailed } from '@/lib/mediaUrl';

const log = getLogger('AudioPlayer');

// ---------------------------------------------------------------------------
// Códigos de MediaError (https://developer.mozilla.org/en-US/docs/Web/API/MediaError)
// ---------------------------------------------------------------------------

export const MEDIA_ERROR_CODES: Record<number, string> = {
  1: 'MEDIA_ERR_ABORTED — reprodução abortada pelo usuário',
  2: 'MEDIA_ERR_NETWORK — erro de rede ao baixar o áudio',
  3: 'MEDIA_ERR_DECODE — codec não suportado ou arquivo corrompido',
  4: 'MEDIA_ERR_SRC_NOT_SUPPORTED — formato ou URL não suportado',
};

export type AudioPlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface AudioPlayerError {
  code: number;
  message: string;
  url: string;
  messageId?: string;
}

interface UseAudioPlayerOptions {
  messageId?: string;
  onError?: (error: AudioPlayerError) => void;
}

interface UseAudioPlayerReturn {
  state: AudioPlayerState;
  error: AudioPlayerError | null;
  currentTime: number;
  duration: number;
  play: (url: string) => void;
  pause: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAudioPlayer(options: UseAudioPlayerOptions = {}): UseAudioPlayerReturn {
  const { messageId, onError } = options;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef = useRef<string>('');

  const [state, setState] = useState<AudioPlayerState>('idle');
  const [error, setError] = useState<AudioPlayerError | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
      audioRef.current = null;
    }
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const play = useCallback((url: string) => {
    // Limpar player anterior
    cleanup();

    const audio = new Audio();
    audioRef.current = audio;
    currentUrlRef.current = url;

    setState('loading');
    setError(null);

    // Handlers de progresso
    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
    });

    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime);
    });

    audio.addEventListener('playing', () => {
      setState('playing');
    });

    audio.addEventListener('pause', () => {
      if (!audio.ended) setState('paused');
    });

    audio.addEventListener('ended', () => {
      setState('idle');
      setCurrentTime(0);
    });

    // FIX C7: Tratamento de erro com MediaError.code + cache negativo
    audio.addEventListener('error', () => {
      const mediaError = audio.error;
      const code = mediaError?.code ?? 0;
      const nativeMessage = mediaError?.message ?? 'Erro desconhecido';
      const friendlyMessage = MEDIA_ERROR_CODES[code] ?? `Erro desconhecido (code=${code})`;

      const audioError: AudioPlayerError = {
        code,
        message: friendlyMessage,
        url: currentUrlRef.current,
        messageId,
      };

      // Log estruturado e acionável
      log.error('Audio error', {
        code,
        nativeMessage,
        friendlyMessage,
        url: currentUrlRef.current,
        messageId: messageId ?? 'unknown',
      });

      // Cache negativo: evitar retry na mesma sessão (C7 + C4 fix)
      if (currentUrlRef.current) {
        markMediaUrlFailed(currentUrlRef.current, code || 0);
      }

      setState('error');
      setError(audioError);
      onError?.(audioError);
      cleanup();
    });

    // Iniciar carregamento
    audio.preload = 'metadata';
    audio.src = url;
    audio.play().catch((err: Error) => {
      // play() pode rejeitar se o usuário não interagiu ainda (autoplay policy)
      if (err.name === 'NotAllowedError') {
        log.warn('Audio play bloqueado por política de autoplay — aguardando interação do usuário', {
          messageId,
        });
        setState('paused');
      }
    });
  }, [cleanup, messageId, onError]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setState('paused');
  }, []);

  const stop = useCallback(() => {
    cleanup();
    setState('idle');
    setError(null);
  }, [cleanup]);

  const seek = useCallback((seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(seconds, audioRef.current.duration || 0));
    }
  }, []);

  // Release the HTMLAudioElement and its event listeners when the component
  // unmounts. Without this, event handlers that call setState fire after
  // unmount, producing React stale-update warnings and memory leaks.
  useEffect(() => cleanup, [cleanup]);

  return { state, error, currentTime, duration, play, pause, stop, seek };
}
