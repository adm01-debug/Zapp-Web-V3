/**
 * VideoCallDialog / VideoCallLauncher — videochamada REAL via SIP (SIM-03).
 *
 * Cobre: start automático com vídeo quando registrado, auto-conexão SIP quando
 * desconectado, tiles local/remoto + controles (mute/vídeo/hangup) em chamada
 * ativa, ocultação do botão de vídeo sem suporte do provedor (F4) e o
 * launcher via evento 'start-video-call'.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { VideoCallDialog, VideoCallLauncher } from '../VideoCallDialog';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const sipState = vi.hoisted(() => ({
  sipStatus: 'registered',
  callStatus: 'idle',
  callDuration: 0,
  isMuted: false,
  isVideoOn: true,
  videoSupported: true,
  localStream: null as unknown,
  remoteStream: null as unknown,
  currentNumber: '',
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(async () => {}),
  makeCall: vi.fn(async () => {}),
  hangUp: vi.fn(),
  toggleMute: vi.fn(),
  toggleVideo: vi.fn(),
  sendDTMF: vi.fn(),
}));

vi.mock('@/features/inbox', () => ({
  useSipClient: () => sipState,
}));

const supabaseClientMock = vi.hoisted(() => ({
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { password: 'test-pass' }, error: null }),
    },
  },
}));

vi.mock('@/integrations/supabase/client', () => supabaseClientMock);

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

// happy-dom valida srcObject contra a classe MediaStream interna — relaxar o
// setter para o teste poder usar objetos simples como streams.
Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
  configurable: true,
  get(this: HTMLMediaElement) {
    return (this as HTMLMediaElement & { _srcObject?: unknown })._srcObject ?? null;
  },
  set(this: HTMLMediaElement, value: unknown) {
    (this as HTMLMediaElement & { _srcObject?: unknown })._srcObject = value;
  },
});

const CONTACT = { name: 'Fulano', phone: '5511999999' };

function renderDialog(props: Partial<ComponentProps<typeof VideoCallDialog>> = {}) {
  const onOpenChange = vi.fn();
  const utils = render(
    <VideoCallDialog
      open
      onOpenChange={onOpenChange}
      contact={CONTACT}
      {...props}
    />
  );
  return { onOpenChange, ...utils };
}

describe('VideoCallDialog — vídeo (SIM-03)', () => {
  beforeEach(() => {
    sipState.sipStatus = 'registered';
    sipState.callStatus = 'idle';
    sipState.isVideoOn = true;
    sipState.videoSupported = true;
    sipState.localStream = null;
    sipState.remoteStream = null;
    sipState.makeCall.mockClear();
    sipState.hangUp.mockClear();
    sipState.toggleMute.mockClear();
    sipState.toggleVideo.mockClear();
    supabaseClientMock.supabase.functions.invoke.mockClear();
    toastMock.error.mockClear();
  });

  it('inicia a videochamada real quando já registrado', () => {
    renderDialog();
    expect(sipState.makeCall).toHaveBeenCalledTimes(1);
    expect(sipState.makeCall).toHaveBeenCalledWith('5511999999', { video: true });
  });

  it('conecta o SIP sozinho e inicia a chamada quando o registro chega', async () => {
    sipState.sipStatus = 'disconnected';
    localStorage.setItem(
      'voip_sip_settings',
      JSON.stringify({ server: 'sip.provider.com', user: 'ramal1', wsPort: 8089, sipEnabled: true, autoRecord: true })
    );
    const { rerender } = renderDialog();
    // Fluxo de conexão disparado
    expect(supabaseClientMock.supabase.functions.invoke).toHaveBeenCalledWith('get-sip-password');
    await act(async () => {
      await Promise.resolve();
    });
    expect(sipState.connect).toHaveBeenCalledWith({
      server: 'sip.provider.com',
      user: 'ramal1',
      password: 'test-pass',
      wsPort: 8089,
    });
    expect(sipState.makeCall).not.toHaveBeenCalled();
    // Registro chega → inicia a videochamada
    sipState.sipStatus = 'registered';
    rerender(
      <VideoCallDialog open onOpenChange={() => {}} contact={CONTACT} />
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(sipState.makeCall).toHaveBeenCalledWith('5511999999', { video: true });
  });

  it('renderiza vídeo local + remoto e controles reais em chamada ativa', () => {
    sipState.callStatus = 'active';
    sipState.localStream = { id: 'local' };
    sipState.remoteStream = { id: 'remote' };
    renderDialog();
    expect(screen.getByTestId('video-call-local')).toBeInTheDocument();
    expect(screen.getByTestId('video-call-remote')).toBeInTheDocument();
    // Mute → toggleMute real
    fireEvent.click(screen.getByLabelText('Silenciar microfone'));
    expect(sipState.toggleMute).toHaveBeenCalled();
    // Vídeo off → toggleVideo real
    fireEvent.click(screen.getByLabelText('Desligar vídeo'));
    expect(sipState.toggleVideo).toHaveBeenCalled();
  });

  it('desliga a chamada real ao clicar em encerrar', () => {
    sipState.callStatus = 'active';
    const { onOpenChange } = renderDialog();
    fireEvent.click(screen.getByLabelText('Encerrar videochamada'));
    expect(sipState.hangUp).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('oculta o botão de vídeo quando o provedor não suporta vídeo (F4)', () => {
    sipState.callStatus = 'active';
    sipState.videoSupported = false;
    renderDialog();
    expect(screen.queryByLabelText('Ligar vídeo')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Desligar vídeo')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Silenciar microfone')).toBeInTheDocument();
  });

  it('mostra erro de conexão com tentar novamente quando o SIP falha', async () => {
    sipState.sipStatus = 'disconnected';
    supabaseClientMock.supabase.functions.invoke.mockResolvedValueOnce({
      data: null,
      error: new Error('boom'),
    });
    renderDialog();
    await act(async () => {
      await Promise.resolve();
    });
    expect(toastMock.error).toHaveBeenCalled();
    expect(screen.getByText('Tentar novamente')).toBeInTheDocument();
    // O dialog também renderiza o botão "Fechar" do Radix (sr-only) — usar getAll
    expect(screen.getAllByText('Fechar').length).toBeGreaterThanOrEqual(1);
  });
});

describe('VideoCallLauncher — evento start-video-call (SIM-03)', () => {
  beforeEach(() => {
    sipState.sipStatus = 'registered';
    sipState.callStatus = 'idle';
    sipState.makeCall.mockClear();
  });

  it('abre a videochamada quando o evento é disparado', () => {
    render(<VideoCallLauncher />);
    expect(sipState.makeCall).not.toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(
        new CustomEvent('start-video-call', { detail: { phone: '55118888', name: 'Maria' } })
      );
    });
    expect(sipState.makeCall).toHaveBeenCalledWith('55118888', { video: true });
  });

  it('ignora evento sem telefone', () => {
    render(<VideoCallLauncher />);
    act(() => {
      window.dispatchEvent(new CustomEvent('start-video-call', { detail: {} }));
    });
    expect(sipState.makeCall).not.toHaveBeenCalled();
  });
});
