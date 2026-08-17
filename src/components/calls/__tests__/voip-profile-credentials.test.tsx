/**
 * voip-profile-credentials.test.tsx — RED contra contrato futuro (Etapa 75/76 — VoIP)
 *
 * ─── CONTRATO FUTURO (já implementado no backend pelo builder wt-g6) ─────────
 * 1. Migration zapp.voip_profile_credentials (profile_id UNIQUE, sip_user,
 *    sip_password, sip_server?, ws_port DEFAULT 8089, is_active) — RLS dono/admin,
 *    SEM GRANT para PostgREST (único caminho de leitura: edge service_role).
 * 2. Edge `zapp-get-sip-credentials` (v1, substitui get-sip-password):
 *      GET autenticado (requireUser + profile ativo + rate-limit) →
 *      - linha ATIVA do dono: { profileId, legacy: false, user, password, server?, wsPort? }
 *      - sem linha ativa:      { profileId, legacy: true,  password }   (fallback LEGADO
 *        = senha compartilhada SIP_PASSWORD; flag `legacy: true` marca o fallback)
 * 3. Frontend (VoIPPanel.handleSipConnect / VideoCallDialog.autoConnectAndCall):
 *      - invoca 'zapp-get-sip-credentials' (NUNCA mais 'get-sip-password');
 *      - legacy:false → sip.connect usa o ramal DO DONO (data.user) e, quando
 *        presentes, server/wsPort do perfil — não o 'phone1' do localStorage;
 *      - legacy:true  → mantém server/user do localStorage + senha compartilhada.
 *
 * ─── ESTADO RED ESPERADO ─────────────────────────────────────────────────────
 * VoIPPanel/VideoCallDialog AINDA chamam 'get-sip-password' e ignoram
 * `user`/`server`/`wsPort`/`legacy` da resposta. Os testes marcados [RED]
 * falham por behavior ausente (invoke com nome errado; connect com user
 * errado). Os demais documentam invariantes que já valem e devem continuar
 * valendo (fallback legado, erros honestos). TS sem erros esperados (assinatura
 * de connect/useSipClient não muda).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VoIPPanel } from '../VoIPPanel';
import { VideoCallDialog } from '../VideoCallDialog';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const sipState = vi.hoisted(() => ({
  sipStatus: 'disconnected' as const,
  callStatus: 'idle' as const,
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

// VoIPPanel e VideoCallDialog importam useSipClient do BARREL '@/features/inbox'
// (o mock de '@/hooks/useSipClient' NÃO intercepta — pitfall conhecido 75.6).
vi.mock('@/features/inbox', () => ({
  useSipClient: () => sipState,
}));

const supabaseClientMock = vi.hoisted(() => ({
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { password: 'test-pass' }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }),
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

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <VoIPPanel />
    </QueryClientProvider>
  );
}

const CONTACT = { name: 'Fulano', phone: '5511999999' };

function renderDialog(props: Partial<ComponentProps<typeof VideoCallDialog>> = {}) {
  const onOpenChange = vi.fn();
  const utils = render(<VideoCallDialog open onOpenChange={onOpenChange} contact={CONTACT} {...props} />);
  return { onOpenChange, ...utils };
}

async function clickConnectSip() {
  await act(async () => {
    fireEvent.click(screen.getByText('Conectar SIP'));
  });
}

describe('VoIP credenciais por perfil — zapp-get-sip-credentials (contrato futuro)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseClientMock.supabase.functions.invoke.mockResolvedValue({
      data: { profileId: 'p1', legacy: false, user: 'ext-200', password: 'own-secret' },
      error: null,
    });
    localStorage.clear();
  });

  describe('VoIPPanel.handleSipConnect', () => {
    it('[RED] invoca a edge zapp-get-sip-credentials (não get-sip-password)', async () => {
      renderPanel();
      await clickConnectSip();
      expect(supabaseClientMock.supabase.functions.invoke).toHaveBeenCalledWith(
        'zapp-get-sip-credentials'
      );
    });

    it('[RED] legacy:false → connect usa o ramal DO DONO (data.user), não o phone1 do localStorage', async () => {
      renderPanel();
      await clickConnectSip();
      await waitFor(() => expect(sipState.connect).toHaveBeenCalled());
      expect(sipState.connect).toHaveBeenCalledWith(
        expect.objectContaining({ user: 'ext-200', password: 'own-secret' })
      );
    });

    it('[RED] legacy:false com server/wsPort do perfil → connect usa os overrides do perfil', async () => {
      supabaseClientMock.supabase.functions.invoke.mockResolvedValue({
        data: {
          profileId: 'p1',
          legacy: false,
          user: 'ext-200',
          password: 'own-secret',
          server: 'sip.own.example.com',
          wsPort: 9090,
        },
        error: null,
      });
      renderPanel();
      await clickConnectSip();
      await waitFor(() => expect(sipState.connect).toHaveBeenCalled());
      expect(sipState.connect).toHaveBeenCalledWith(
        expect.objectContaining({ server: 'sip.own.example.com', wsPort: 9090 })
      );
    });

    it('legacy:true → fallback mantém server/user do localStorage + senha compartilhada', async () => {
      supabaseClientMock.supabase.functions.invoke.mockResolvedValue({
        data: { profileId: 'p1', legacy: true, password: 'shared-secret' },
        error: null,
      });
      renderPanel();
      await clickConnectSip();
      await waitFor(() => expect(sipState.connect).toHaveBeenCalled());
      expect(sipState.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          server: 'ip.b24-9441-1552764901.bitrixphone.com',
          user: 'phone1',
          password: 'shared-secret',
          wsPort: 8089,
        })
      );
    });

    it('erro na edge → toast.error e connect NÃO é chamado', async () => {
      supabaseClientMock.supabase.functions.invoke.mockResolvedValue({
        data: null,
        error: { message: 'boom' },
      });
      renderPanel();
      await clickConnectSip();
      expect(toastMock.error).toHaveBeenCalledWith('Erro ao buscar senha SIP.');
      expect(sipState.connect).not.toHaveBeenCalled();
    });

    it('sem password → toast de não configurada e connect NÃO é chamado', async () => {
      supabaseClientMock.supabase.functions.invoke.mockResolvedValue({
        data: { profileId: 'p1', legacy: true },
        error: null,
      });
      renderPanel();
      await clickConnectSip();
      expect(toastMock.error).toHaveBeenCalledWith(
        'Senha SIP não configurada. Adicione o segredo SIP_PASSWORD.'
      );
      expect(sipState.connect).not.toHaveBeenCalled();
    });
  });

  describe('VideoCallDialog.autoConnectAndCall', () => {
    it('[RED] invoca a edge zapp-get-sip-credentials ao auto-conectar', async () => {
      renderDialog();
      await waitFor(() =>
        expect(supabaseClientMock.supabase.functions.invoke).toHaveBeenCalledWith(
          'zapp-get-sip-credentials'
        )
      );
    });

    it('[RED] legacy:false → connect usa o ramal DO DONO da resposta', async () => {
      renderDialog();
      await waitFor(() => expect(sipState.connect).toHaveBeenCalled());
      expect(sipState.connect).toHaveBeenCalledWith(
        expect.objectContaining({ user: 'ext-200', password: 'own-secret' })
      );
    });
  });
});
