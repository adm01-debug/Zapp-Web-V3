import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/logger');

import { useTextToSpeech } from '@/hooks/useTextToSpeech';

interface MockSpeechErrorEvent {
  error?: string;
}

/** Mock de SpeechSynthesisUtterance (não existe em happy-dom). */
class MockUtterance {
  text: string;
  rate = 1;
  voice: SpeechSynthesisVoice | null = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: MockSpeechErrorEvent) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

/** Mock de window.speechSynthesis. */
function createMockSynth() {
  const synth = {
    cancel: vi.fn(),
    speak: vi.fn(),
    getVoices: vi.fn(() => [] as SpeechSynthesisVoice[]),
    pause: vi.fn(),
    resume: vi.fn(),
  };
  return synth;
}

describe('useTextToSpeech', () => {
  let synth: ReturnType<typeof createMockSynth>;
  let lastUtterance: MockUtterance | null;

  beforeEach(() => {
    vi.clearAllMocks();
    lastUtterance = null;
    synth = createMockSynth();
    synth.speak.mockImplementation((utterance: MockUtterance) => {
      lastUtterance = utterance;
    });

    Object.defineProperty(window, 'speechSynthesis', {
      value: synth,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: MockUtterance,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('speak creates an utterance and calls speechSynthesis.speak', () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.speak('Olá mundo');
    });

    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(lastUtterance?.text).toBe('Olá mundo');
    expect(lastUtterance?.rate).toBe(1);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('speak with no text and no default is a no-op', () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.speak('');
    });

    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('speak uses the legacy default text when called without arguments', () => {
    const { result } = renderHook(() => useTextToSpeech('texto padrão'));

    act(() => {
      result.current.speak();
    });

    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(lastUtterance?.text).toBe('texto padrão');
  });

  it('sets error state when speech synthesis is unsupported', () => {
    Object.defineProperty(window, 'speechSynthesis', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.speak('voz');
    });

    expect(synth.speak).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Speech synthesis not supported');
    expect(result.current.isPlaying).toBe(false);
  });

  it('marks isPlaying on start and resets on end', () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.speak('mensagem', 'msg-42');
    });
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isLoading).toBe(true);

    act(() => {
      lastUtterance?.onstart?.();
    });
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.isLoading).toBe(false);

    act(() => {
      lastUtterance?.onend?.();
    });
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentMessageId).toBeNull();
  });

  it('surfaces errors from the utterance onerror handler', () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.speak('mensagem');
    });

    act(() => {
      lastUtterance?.onerror?.({ error: 'interrupted' });
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.error).toBe('interrupted');
  });

  it('stop cancels the synthesis and resets state', () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.speak('mensagem');
    });
    act(() => {
      lastUtterance?.onstart?.();
    });
    expect(result.current.isPlaying).toBe(true);

    act(() => {
      result.current.stop();
    });

    expect(synth.cancel).toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.currentMessageId).toBeNull();
  });

  it('applies the configured voice by voiceURI', () => {
    const voices = [
      { voiceURI: 'v-pt-br', name: 'Voz PT-BR', lang: 'pt-BR', default: true, localService: true },
    ] as SpeechSynthesisVoice[];
    synth.getVoices.mockReturnValue(voices);
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.setVoiceId('v-pt-br');
    });
    act(() => {
      result.current.speak('com voz');
    });

    expect(lastUtterance?.voice).toBe(voices[0]);
  });

  it('applies the configured voice by name when voiceURI does not match', () => {
    const voices = [
      { voiceURI: 'x', name: 'Voz PT-BR', lang: 'pt-BR', default: true, localService: true },
    ] as SpeechSynthesisVoice[];
    synth.getVoices.mockReturnValue(voices);
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.setVoiceId('Voz PT-BR');
    });
    act(() => {
      result.current.speak('com voz');
    });

    expect(lastUtterance?.voice).toBe(voices[0]);
  });

  it('applies the configured speed to the utterance rate', () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.setSpeed(1.5);
    });
    act(() => {
      result.current.speak('rápido');
    });

    expect(lastUtterance?.rate).toBe(1.5);
  });

  it('notifies voice and speed changes through options callbacks', () => {
    const onVoiceChange = vi.fn();
    const onSpeedChange = vi.fn();
    const { result } = renderHook(() =>
      useTextToSpeech({ initialVoiceId: 'v0', initialSpeed: 0.75, onVoiceChange, onSpeedChange })
    );

    act(() => {
      result.current.setVoiceId('v1');
    });
    act(() => {
      result.current.setSpeed(2);
    });

    expect(onVoiceChange).toHaveBeenCalledWith('v1');
    expect(onSpeedChange).toHaveBeenCalledWith(2);
    expect(result.current.voiceId).toBe('v1');
    expect(result.current.speed).toBe(2);
  });

  it('cancels synthesis on unmount', () => {
    const { unmount } = renderHook(() => useTextToSpeech());

    unmount();

    expect(synth.cancel).toHaveBeenCalled();
  });
});
