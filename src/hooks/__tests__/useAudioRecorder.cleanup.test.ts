/**
 * useAudioRecorder — testes de cleanup (vitest puro)
 *
 * Exercita o cleanup REAL do hook em unmount/cancel, cobrindo:
 * - revogação da ObjectURL do blob (URL.revokeObjectURL)
 * - stop de todas as tracks do MediaStream
 * - close do AudioContext + cancel do animation frame
 * - clear do interval de duração
 * - stop do SpeechRecognition e do MediaRecorder ativo (handlers/listeners)
 *
 * O hook em produção é `useAudioRecorder` exportado por `@/hooks/useAudioManagement`
 * (usado via `useAudioRecorderUI` → `AudioRecorder.tsx`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  isSupabaseConfigured: true,
  SUPABASE_RESOLVED_URL: 'http://localhost:54321',
  SUPABASE_RESOLVED_ANON_KEY: 'test-anon-key',
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: { path: 'test.webm' }, error: null }),
        createSignedUrl: vi
          .fn()
          .mockResolvedValue({ data: { signedUrl: 'https://example.com/test.webm' }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/test.webm' } }),
      }),
    },
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestTag: vi.fn(),
}));

import { useAudioRecorder } from '@/hooks/useAudioManagement';

/* ------------------------------------------------------------------ */
/* Mocks de APIs de browser                                            */
/* ------------------------------------------------------------------ */

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  state = 'recording';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start = vi.fn();
  pause = vi.fn();
  resume = vi.fn();
  stop = vi.fn(() => {
    if (this.state !== 'inactive') {
      this.state = 'inactive';
      this.onstop?.();
    }
  });
  constructor(public stream: MediaStream, public options?: MediaRecorderOptions) {
    MockMediaRecorder.instances.push(this);
  }
}

class MockSpeechRecognition {
  static instances: MockSpeechRecognition[] = [];
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: unknown = null;
  onerror: unknown = null;
  start = vi.fn();
  stop = vi.fn();
  constructor() {
    MockSpeechRecognition.instances.push(this);
  }
}

class MockAudioContext {
  static instances: MockAudioContext[] = [];
  state = 'running';
  close = vi.fn().mockResolvedValue(undefined);
  resume = vi.fn().mockResolvedValue(undefined);
  createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
  createAnalyser = vi.fn(() => ({
    fftSize: 0,
    frequencyBinCount: 256,
    getByteFrequencyData: vi.fn(),
  }));
  constructor() {
    MockAudioContext.instances.push(this);
  }
}

let tracks: { stop: ReturnType<typeof vi.fn> }[];
let mockStream: MediaStream;
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
let cancelAnimationFrameMock: ReturnType<typeof vi.fn>;
let clearIntervalSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();

  // MediaStream fake com 2 tracks rastreáveis
  tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
  mockStream = { getTracks: () => tracks } as unknown as MediaStream;

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
  });

  // MediaRecorder
  MockMediaRecorder.instances = [];
  vi.stubGlobal('MediaRecorder', MockMediaRecorder);

  // AudioContext (o hook lê window.AudioContext)
  MockAudioContext.instances = [];
  vi.stubGlobal('AudioContext', MockAudioContext);

  // Animation frame controlado (id fixo 42 para rastrear o cancel)
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 42));
  cancelAnimationFrameMock = vi.fn();
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock);

  // SpeechRecognition
  MockSpeechRecognition.instances = [];
  vi.stubGlobal('SpeechRecognition', MockSpeechRecognition);

  // URL.createObjectURL / revokeObjectURL rastreados
  createObjectURL = vi.fn(() => 'blob:mock-url');
  revokeObjectURL = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: revokeObjectURL,
  });

  clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Monta o hook e inicia uma gravação (getUserMedia mockada). */
async function renderWithRecording() {
  const rendered = renderHook(() => useAudioRecorder());
  await act(async () => {
    await rendered.result.current.startRecording();
  });
  return rendered;
}

describe('useAudioRecorder cleanup', () => {
  it('é no-op seguro no unmount quando nada foi gravado (sem revoke, sem throw)', () => {
    const { unmount } = renderHook(() => useAudioRecorder());
    expect(() => act(() => unmount())).not.toThrow();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(tracks[0].stop).not.toHaveBeenCalled();
    expect(clearIntervalSpy).not.toHaveBeenCalled();
  });

  it('revoga a ObjectURL do blob no unmount após a gravação concluída', async () => {
    const { result, unmount } = await renderWithRecording();

    // stop → onstop do MediaRecorder cria o blob URL
    await act(async () => {
      result.current.stopRecording();
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled(); // ainda montado

    act(() => unmount());
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('para todas as tracks do MediaStream no unmount', async () => {
    const { unmount } = await renderWithRecording();
    act(() => unmount());
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(tracks[1].stop).toHaveBeenCalled();
  });

  it('fecha o AudioContext e cancela o animation frame no unmount', async () => {
    const { unmount } = await renderWithRecording();
    const audioCtx = MockAudioContext.instances[0];
    expect(audioCtx).toBeDefined();

    act(() => unmount());

    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(42);
    // AudioContext fechado (pelo cleanup do unmount e/ou pelo onstop do recorder)
    expect(audioCtx.close).toHaveBeenCalled();
  });

  it('limpa o interval de duração no unmount', async () => {
    const { unmount } = await renderWithRecording();
    act(() => unmount());
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('para o SpeechRecognition e o MediaRecorder ativo no unmount (handlers/listeners)', async () => {
    const { unmount } = await renderWithRecording();
    const recorder = MockMediaRecorder.instances[0];
    const recognition = MockSpeechRecognition.instances[0];
    expect(recorder).toBeDefined();
    expect(recognition).toBeDefined();

    act(() => unmount());

    // Objetos que carregam listeners/eventos são encerrados
    expect(recorder.stop).toHaveBeenCalled(); // state era 'recording'
    expect(recognition.stop).toHaveBeenCalled();
    // E o hook não tenta stopar de novo (recorder já inactive)
    expect(recorder.stop).toHaveBeenCalledTimes(1);
  });

  it('onstop do MediaRecorder dispara uma única vez (sem revogação dupla da URL)', async () => {
    const { result, unmount } = await renderWithRecording();

    await act(async () => {
      result.current.stopRecording();
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    act(() => unmount());
    expect(createObjectURL).toHaveBeenCalledTimes(1); // nenhum novo URL pós-unmount
    expect(revokeObjectURL).toHaveBeenCalledTimes(1); // revogação única
  });

  it('cancelRecording libera o stream, limpa o interval e revoga a URL', async () => {
    const { result, unmount } = await renderWithRecording();

    await act(async () => {
      result.current.cancelRecording();
    });

    expect(tracks[0].stop).toHaveBeenCalled();
    expect(tracks[1].stop).toHaveBeenCalled();
    expect(clearIntervalSpy).toHaveBeenCalled();
    // cancel → onstop cria URL → setBlobUrl(null) revoga
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(result.current.isRecording).toBe(false);
    expect(result.current.audioUrl).toBeNull();

    // unmount posterior é limpo (URL já revogada, sem nova revogação)
    act(() => unmount());
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
