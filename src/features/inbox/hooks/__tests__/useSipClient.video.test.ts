/**
 * Testes do VÍDEO SIP — useSipClient (TDD RED, contrato futuro).
 *
 * O hook atual (2026-08-17) só suporta áudio (`constraints: { audio: true, video: false }`
 * hardcoded). Estes testes codificam o CONTRATO do vídeo que o hook deve implementar:
 *
 *   makeCall(number, options?: { video?: boolean })
 *
 * Contrato testado aqui:
 *   1. makeCall(num, { video: true }) → chama navigator.mediaDevices.getUserMedia
 *      com { audio: true, video: true } E cria Inviter com
 *      sessionDescriptionHandlerOptions.constraints = { audio: true, video: true }.
 *   2. Falha de câmera (getUserMedia rejeita) → FALLBACK audio-only: o hook NÃO
 *      quebra; cria Inviter com constraints = { audio: true, video: false } e
 *      segue com invite() normalmente (callStatus 'calling').
 *   3. Chamada estabelecida com vídeo → stream remoto é anexado a um elemento
 *      <video id="sip-remote-video" autoplay> criado e anexado ao document.body
 *      (srcObject contém os tracks remotos do peerConnection). No unmount o
 *      elemento é removido.
 *
 * Mocks: sip.js inteiro (UserAgent/Inviter/SessionState/Web), useSipConnection,
 * supabase client, sonner, @tanstack/react-query (useQueryClient).
 *
 * Estado esperado: RED contra o hook atual (getUserMedia nunca é chamado,
 * Inviter usa video:false, e o elemento remoto é <audio>, não <video>).
 *
 * NOTA: TS2554 (Expected 1 arguments, but got 2) em makeCall(PHONE, { video: true })
 * é ESPERADO neste estado RED — a assinatura atual aceita só `number`. O implementador
 * deve estender para `makeCall(number, options?: { video?: boolean })`; o erro de tipo
 * some junto com a implementação.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSipClient } from '../useSipClient';

// ── Mocks hoisted (padrão da casa: variáveis prefixadas com `mock`) ───────────

const mocks = vi.hoisted(() => {
  const mockGetUserMedia = vi.fn();
  const mockMakeURI = vi.fn(() => ({ host: 'voip.example.com' }));
  const mockInvalidateQueries = vi.fn();

  /** Inviter mock: captura constructor args e permite emitir estados. */
  const inviterInstances: MockInviter[] = [];

  class MockInviter {
    ua: unknown;
    target: unknown;
    options: { sessionDescriptionHandlerOptions?: { constraints?: { audio?: boolean; video?: boolean } } };
    state = 'initial';
    sessionDescriptionHandler: { peerConnection?: { getReceivers?: () => Array<{ track: unknown }> } } | null = null;
    invite = vi.fn(async () => undefined);
    bye = vi.fn(async () => undefined);
    cancel = vi.fn(async () => undefined);
    private listeners: Array<(state: string) => void> = [];
    stateChange = {
      addListener: (cb: (state: string) => void) => {
        this.listeners.push(cb);
      },
    };

    constructor(
      ua: unknown,
      target: unknown,
      options: { sessionDescriptionHandlerOptions?: { constraints?: { audio?: boolean; video?: boolean } } }
    ) {
      this.ua = ua;
      this.target = target;
      this.options = options;
      inviterInstances.push(this);
    }

    emit(state: string) {
      this.state = state;
      for (const listener of this.listeners) listener(state);
    }
  }

  const mockUa = {
    configuration: { uri: { host: 'voip.example.com' } },
    transport: { onDisconnect: null as null | (() => void) },
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
  };

  return {
    mockGetUserMedia,
    mockMakeURI,
    mockInvalidateQueries,
    MockInviter,
    inviterInstances,
    mockUa,
  };
});

vi.mock('sip.js', () => ({
  UserAgent: { makeURI: mocks.mockMakeURI },
  Inviter: mocks.MockInviter,
  SessionState: {
    Establishing: 'Establishing',
    Established: 'Established',
    Terminated: 'Terminated',
  },
  Web: { SessionDescriptionHandler: class SessionDescriptionHandler {} },
}));

vi.mock('@/features/inbox/hooks/sip/useSipConnection', () => ({
  useSipConnection: () => ({
    sipStatus: 'registered',
    uaRef: { current: mocks.mockUa },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.mockInvalidateQueries }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  const chainable = {
    select: vi.fn(() => chainable),
    or: vi.fn(() => chainable),
    eq: vi.fn(() => chainable),
    ilike: vi.fn(() => chainable),
    limit: vi.fn(() => chainable),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    insert: vi.fn(async () => ({ error: null })),
  };
  return {
    supabase: {
      from: vi.fn(() => chainable),
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
    },
  };
});

// ── helpers ───────────────────────────────────────────────────────────────────

// happy-dom MediaStream não implementa getTracks() (só getAudioTracks/getVideoTracks).
// Fix de ambiente para o teste 3 poder inspecionar os tracks do srcObject.
const HappyMediaStream = (globalThis as { MediaStream?: { prototype: { getTracks?: () => unknown } } })
  .MediaStream;
if (HappyMediaStream && typeof HappyMediaStream.prototype.getTracks !== 'function') {
  HappyMediaStream.prototype.getTracks = function getTracks() {
    const stream = this as {
      getAudioTracks(): Array<{ kind?: string }>;
      getVideoTracks(): Array<{ kind?: string }>;
    };
    return [...stream.getAudioTracks(), ...stream.getVideoTracks()];
  };
}

const PHONE = '5511999999999';

function mediaDevicesStub() {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: mocks.mockGetUserMedia },
  });
}

function lastInviter() {
  expect(mocks.inviterInstances.length).toBeGreaterThan(0);
  return mocks.inviterInstances[mocks.inviterInstances.length - 1];
}

beforeEach(() => {
  mocks.inviterInstances.length = 0;
  mocks.mockGetUserMedia.mockReset();
  mocks.mockMakeURI.mockClear();
  mediaDevicesStub();
});

// ── 1) Chamada com vídeo ───────────────────────────────────────────────────────

describe('useSipClient — chamada com vídeo (makeCall com { video: true })', () => {
  it('chama getUserMedia({ audio: true, video: true }) e cria Inviter com video:true', async () => {
    mocks.mockGetUserMedia.mockResolvedValue(new MediaStream());

    const { result } = renderHook(() => useSipClient());

    await act(async () => {
      await result.current.makeCall(PHONE, { video: true });
    });

    // getUserMedia requisitado com vídeo + áudio
    expect(mocks.mockGetUserMedia).toHaveBeenCalledTimes(1);
    expect(mocks.mockGetUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: true, video: true })
    );

    // Inviter criado com constraints de vídeo
    const inviter = lastInviter();
    expect(inviter.options.sessionDescriptionHandlerOptions?.constraints).toEqual({
      audio: true,
      video: true,
    });

    // Chamada segue normalmente
    expect(inviter.invite).toHaveBeenCalledTimes(1);
    expect(result.current.callStatus).toBe('calling');
  });
});

// ── 2) Falha de câmera → fallback audio-only ─────────────────────────────────

describe('useSipClient — falha de câmera', () => {
  it('getUserMedia rejeita → fallback audio-only (Inviter video:false) sem crash', async () => {
    const cameraError = Object.assign(new Error('Requested device not found'), {
      name: 'NotFoundError',
    });
    mocks.mockGetUserMedia.mockRejectedValue(cameraError);

    const { result } = renderHook(() => useSipClient());

    await act(async () => {
      // Não deve lançar: o fallback engole a falha de câmera
      await expect(result.current.makeCall(PHONE, { video: true })).resolves.toBeUndefined();
    });

    // A câmera FOI tentada (vídeo requisitado)…
    expect(mocks.mockGetUserMedia).toHaveBeenCalledTimes(1);
    expect(mocks.mockGetUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ video: true })
    );

    // …mas o Inviter segue só com áudio
    const inviter = lastInviter();
    expect(inviter.options.sessionDescriptionHandlerOptions?.constraints).toEqual({
      audio: true,
      video: false,
    });

    // Sem crash: invite() foi chamado e a chamada continua em 'calling'
    expect(inviter.invite).toHaveBeenCalledTimes(1);
    expect(result.current.callStatus).toBe('calling');
  });
});

// ── 3) Stream remoto attach em <video> ────────────────────────────────────────

describe('useSipClient — stream remoto em <video>', () => {
  it('chamada estabelecida → cria <video id="sip-remote-video"> e anexa o stream remoto', async () => {
    mocks.mockGetUserMedia.mockResolvedValue(new MediaStream());

    const { result, unmount } = renderHook(() => useSipClient());

    await act(async () => {
      await result.current.makeCall(PHONE, { video: true });
    });

    // Peer connection remota entrega tracks de áudio + vídeo
    const inviter = lastInviter();
    const remoteTracks = [{ kind: 'video' }, { kind: 'audio' }];
    inviter.sessionDescriptionHandler = {
      peerConnection: {
        getReceivers: () => remoteTracks.map((track) => ({ track })),
      },
    };

    await act(async () => {
      inviter.emit('Established');
    });

    // Elemento <video> criado e anexado ao body
    const videoEl = document.getElementById('sip-remote-video');
    expect(videoEl).not.toBeNull();
    expect(videoEl!.tagName).toBe('VIDEO');
    expect(document.body.contains(videoEl)).toBe(true);
    expect((videoEl as HTMLVideoElement).autoplay).toBe(true);

    // srcObject recebe o stream com os tracks remotos
    const stream = (videoEl as HTMLVideoElement).srcObject as MediaStream | null;
    expect(stream).not.toBeNull();
    expect(stream!.getTracks()).toHaveLength(2);

    // Cleanup: unmount remove o elemento de vídeo
    unmount();
    expect(document.getElementById('sip-remote-video')).toBeNull();
  });
});
