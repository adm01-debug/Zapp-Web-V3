/**
 * useSipClient — suporte a VÍDEO (SIM-03, videochamada real via SIP).
 *
 * Cobre: constraints de vídeo no Inviter, fallback áudio-only em falha de
 * câmera (F1-F3), attach de receivers de vídeo + stream local no Established,
 * degradação quando o provedor não anuncia vídeo (F4), toggleVideo e reset
 * de estado no hangup.
 *
 * Validação: este arquivo roda no vitest (node) — NUNCA `bun vitest`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSipClient } from '../useSipClient';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const sipMock = vi.hoisted(() => {
  class FakeInviter {
    static instances: FakeInviter[] = [];
    stateChange = {
      listeners: [] as Array<(s: string) => void>,
      addListener: (fn: (s: string) => void) => {
        this.stateChange.listeners.push(fn);
      },
    };
    state = 'Establishing';
    sessionDescriptionHandler: {
      peerConnection?: {
        getReceivers?: () => Array<{ track?: { kind?: string } }>;
        getSenders?: () => Array<{ track?: { kind?: string; enabled?: boolean } }>;
      };
      localMediaStream?: unknown;
    } | null = null;
    invite = vi.fn(async () => {});
    bye = vi.fn(async () => {});
    cancel = vi.fn(async () => {});
    constructor(
      public ua: unknown,
      public target: unknown,
      public options: { sessionDescriptionHandlerOptions?: { constraints?: unknown } }
    ) {
      FakeInviter.instances.push(this);
    }
    emit(state: string) {
      this.state = state;
      this.stateChange.listeners.forEach((fn) => fn(state));
    }
  }
  return {
    SessionState: {
      Establishing: 'Establishing',
      Established: 'Established',
      Terminated: 'Terminated',
    },
    FakeInviter,
    UserAgent: { makeURI: (uri: string) => ({ uri }) },
  };
});

vi.mock('sip.js', () => ({
  UserAgent: sipMock.UserAgent,
  Inviter: sipMock.FakeInviter,
  SessionState: sipMock.SessionState,
  Web: {},
}));

const connMock = vi.hoisted(() => ({
  sipStatus: 'registered',
  uaRef: { current: { configuration: { uri: { host: 'sip.example.com' } } } },
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(async () => {}),
}));

vi.mock('@/features/inbox/hooks/sip/useSipConnection', () => ({
  useSipConnection: () => connMock,
}));

const supabaseMock = vi.hoisted(() => ({
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
  from: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: supabaseMock }));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

// ─── Globals: happy-dom MediaStream não tem getTracks — adicionar no prototype ──
const HappyMediaStream = (globalThis as { MediaStream: { prototype: { getTracks?: () => unknown } } })
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

const mediaDevicesMock = vi.hoisted(() => ({ getUserMedia: vi.fn() }));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function supabaseBuilder() {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    or: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return builder as unknown as typeof supabaseMock.from;
}

function setupMediaDevices(resolve: boolean) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: resolve
        ? mediaDevicesMock.getUserMedia.mockResolvedValue({
            getTracks: () => [{ stop: vi.fn() }],
          })
        : mediaDevicesMock.getUserMedia.mockRejectedValue(
            new DOMException('Permission denied', 'NotAllowedError')
          ),
    },
  });
}

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

async function makeVideoCall(phone = '5511999999') {
  const { result } = renderHook(() => useSipClient(), { wrapper });
  await act(async () => {
    await result.current.makeCall(phone, { video: true });
  });
  return result;
}

describe('useSipClient — vídeo (SIM-03)', () => {
  beforeEach(() => {
    sipMock.FakeInviter.instances.length = 0;
    connMock.sipStatus = 'registered';
    connMock.uaRef.current = { configuration: { uri: { host: 'sip.example.com' } } };
    toastMock.error.mockClear();
    toastMock.info.mockClear();
    mediaDevicesMock.getUserMedia.mockClear();
    supabaseMock.from.mockImplementation(() => supabaseBuilder());
  });

  it('makeCall com video:true passa constraints de vídeo e liga isVideoOn', async () => {
    setupMediaDevices(true);
    const result = await makeVideoCall();
    const inviter = sipMock.FakeInviter.instances[0];
    expect(inviter).toBeTruthy();
    const constraints = inviter.options.sessionDescriptionHandlerOptions?.constraints as {
      audio: boolean;
      video: boolean;
    };
    expect(constraints).toEqual({ audio: true, video: true });
    expect(mediaDevicesMock.getUserMedia).toHaveBeenCalledWith({
      audio: true,
      video: true,
    });
    expect(result.current.isVideoOn).toBe(true);
  });

  it('fallback áudio-only + toast quando a câmera é bloqueada (NotAllowedError)', async () => {
    setupMediaDevices(false);
    const result = await makeVideoCall();
    const inviter = sipMock.FakeInviter.instances[0];
    const constraints = inviter.options.sessionDescriptionHandlerOptions?.constraints as {
      video: boolean;
    };
    expect(constraints.video).toBe(false);
    expect(result.current.isVideoOn).toBe(false);
    expect(toastMock.error).toHaveBeenCalledWith('Câmera bloqueada — chamando só voz');
  });

  it('makeCall sem vídeo mantém áudio-only (sem getUserMedia)', async () => {
    setupMediaDevices(true);
    const { result } = renderHook(() => useSipClient(), { wrapper });
    await act(async () => {
      await result.current.makeCall('5511999999');
    });
    const inviter = sipMock.FakeInviter.instances[0];
    const constraints = inviter.options.sessionDescriptionHandlerOptions?.constraints as {
      video: boolean;
    };
    expect(constraints.video).toBe(false);
    expect(mediaDevicesMock.getUserMedia).not.toHaveBeenCalled();
    expect(result.current.isVideoOn).toBe(false);
  });

  it('Established anexa receivers de vídeo + stream local e cria <video> body-level', async () => {
    setupMediaDevices(true);
    const result = await makeVideoCall();
    const inviter = sipMock.FakeInviter.instances[0];
    inviter.sessionDescriptionHandler = {
      peerConnection: {
        getReceivers: () => [{ track: { kind: 'audio' } }, { track: { kind: 'video' } }],
        getSenders: () => [],
      },
      localMediaStream: { id: 'local-stream' },
    };
    await act(async () => {
      inviter.emit('Established');
    });
    expect(result.current.callStatus).toBe('active');
    expect(result.current.remoteStream).toBeTruthy();
    const kinds = result.current.remoteStream!.getTracks().map((t) => t.kind);
    expect(kinds).toContain('video');
    expect(result.current.localStream).toEqual({ id: 'local-stream' });
    expect(result.current.videoSupported).toBe(true);
    expect(document.getElementById('sip-remote-video')).toBeTruthy();
    expect(document.getElementById('sip-remote-audio')).toBeNull();
  });

  it('degrada para voz (F4) quando o provedor não envia vídeo remoto', async () => {
    setupMediaDevices(true);
    const result = await makeVideoCall();
    const inviter = sipMock.FakeInviter.instances[0];
    inviter.sessionDescriptionHandler = {
      peerConnection: {
        getReceivers: () => [{ track: { kind: 'audio' } }],
        getSenders: () => [],
      },
      localMediaStream: { id: 'local-stream' },
    };
    await act(async () => {
      inviter.emit('Established');
    });
    expect(result.current.videoSupported).toBe(false);
    expect(result.current.remoteStream!.getTracks().map((t) => t.kind)).toEqual(['audio']);
    expect(toastMock.info).toHaveBeenCalledWith(
      'Provedor sem suporte a vídeo — chamada em áudio'
    );
    // Áudio-only → elemento <audio> body-level (comportamento legado preservado)
    expect(document.getElementById('sip-remote-audio')).toBeTruthy();
    expect(document.getElementById('sip-remote-video')).toBeNull();
  });

  it('toggleVideo alterna track.enabled dos senders de vídeo', async () => {
    setupMediaDevices(true);
    const result = await makeVideoCall();
    const inviter = sipMock.FakeInviter.instances[0];
    const videoSender = { track: { kind: 'video', enabled: true } };
    inviter.sessionDescriptionHandler = {
      peerConnection: {
        getReceivers: () => [{ track: { kind: 'video' } }],
        getSenders: () => [videoSender],
      },
      localMediaStream: { id: 'local-stream' },
    };
    await act(async () => {
      inviter.emit('Established');
    });
    expect(result.current.isVideoOn).toBe(true);
    // 1º toggle: desliga — track.enabled=false
    act(() => result.current.toggleVideo());
    expect(videoSender.track.enabled).toBe(false);
    expect(result.current.isVideoOn).toBe(false);
    // 2º toggle: religa — track.enabled=true
    act(() => result.current.toggleVideo());
    expect(videoSender.track.enabled).toBe(true);
    expect(result.current.isVideoOn).toBe(true);
  });

  it('toggleVideo sem sender de vídeo não muda estado e avisa', async () => {
    setupMediaDevices(true);
    const result = await makeVideoCall();
    const inviter = sipMock.FakeInviter.instances[0];
    inviter.sessionDescriptionHandler = {
      peerConnection: {
        getReceivers: () => [{ track: { kind: 'audio' } }],
        getSenders: () => [{ track: { kind: 'audio' } }],
      },
      localMediaStream: { id: 'local-stream' },
    };
    await act(async () => {
      inviter.emit('Established');
    });
    act(() => result.current.toggleVideo());
    expect(result.current.isVideoOn).toBe(true);
    expect(toastMock.info).toHaveBeenCalledWith('Vídeo não disponível nesta chamada');
  });

  it('hangUp reseta streams e estado de vídeo', async () => {
    setupMediaDevices(true);
    const result = await makeVideoCall();
    const inviter = sipMock.FakeInviter.instances[0];
    inviter.sessionDescriptionHandler = {
      peerConnection: {
        getReceivers: () => [{ track: { kind: 'video' } }],
        getSenders: () => [],
      },
      localMediaStream: { id: 'local-stream' },
    };
    await act(async () => {
      inviter.emit('Established');
    });
    expect(result.current.localStream).toBeTruthy();
    act(() => result.current.hangUp());
    expect(result.current.isVideoOn).toBe(false);
    expect(result.current.localStream).toBeNull();
    expect(result.current.remoteStream).toBeNull();
    expect(result.current.videoSupported).toBe(true);
  });
});
