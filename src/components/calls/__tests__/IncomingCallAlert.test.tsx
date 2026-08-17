/**
 * IncomingCallAlert — handler "Atender" honesto (nunca no-op).
 *
 * O web app não tem caminho de áudio para chamadas RECEBIDAS (SIP UA é
 * outbound-only — ver voip-security-gaps.test "GAP: No incoming call support";
 * o alerta vem do webhook WhatsApp/Evolution, não de um INVITE SIP). O clique
 * em "Atender" deve SEMPRE exibir o aviso honesto da limitação — nunca abrir
 * uma UI de chamada falsa (timer/controles inertes) e nunca fazer no-op.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import type { IncomingCall } from '@/types/incomingCall';

const callState = vi.hoisted(() => ({
  incomingCall: null as IncomingCall | null,
  dismissCall: vi.fn(),
}));

const sipState = vi.hoisted(() => ({
  sipStatus: 'disconnected' as 'disconnected' | 'connecting' | 'registered' | 'error',
}));

vi.mock('@/features/inbox', () => ({
  useIncomingCallBroadcast: () => ({
    incomingCall: callState.incomingCall,
    dismissCall: callState.dismissCall,
  }),
  useSipClient: () => ({ sipStatus: sipState.sipStatus }),
}));

vi.mock('@/hooks/useIncomingCallListener', () => ({
  useIncomingCallListener: () => ({
    incomingCall: null,
    dismissCall: vi.fn(),
  }),
}));

vi.mock('@/hooks/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: { soundEnabled: false, soundVolume: 70 },
    isQuietHours: () => false,
  }),
}));

import {
  IncomingCallAlert,
} from '../IncomingCallAlert';
import {
  getInboundAnswerNotice,
  INBOUND_ANSWER_UNSUPPORTED_NOTICE,
  INBOUND_ANSWER_NO_VOIP_NOTICE,
} from '../inboundAnswerNotice';

const incomingCall: IncomingCall = {
  id: 'call-1',
  contact_id: null,
  contact_name: 'Maria Silva',
  contact_phone: '+55 11 99999-9999',
  contact_avatar_url: null,
  is_video: false,
  whatsapp_connection_id: null,
  started_at: new Date().toISOString(),
};

describe('getInboundAnswerNotice (veredito honesto do Atender)', () => {
  it('retorna aviso de VoIP desconectado quando o SIP não está registrado', () => {
    expect(getInboundAnswerNotice('disconnected')).toBe(INBOUND_ANSWER_NO_VOIP_NOTICE);
    expect(getInboundAnswerNotice('connecting')).toBe(INBOUND_ANSWER_NO_VOIP_NOTICE);
    expect(getInboundAnswerNotice('error')).toBe(INBOUND_ANSWER_NO_VOIP_NOTICE);
  });

  it('retorna aviso de suporte inexistente quando o SIP está registrado', () => {
    expect(getInboundAnswerNotice('registered')).toBe(INBOUND_ANSWER_UNSUPPORTED_NOTICE);
  });

  it('nunca retorna vazio — Atender sempre tem feedback honesto (nunca no-op)', () => {
    (['disconnected', 'connecting', 'registered', 'error'] as const).forEach((status) => {
      expect(getInboundAnswerNotice(status).trim().length).toBeGreaterThan(0);
    });
  });
});

describe('IncomingCallAlert — handler Atender', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callState.incomingCall = null;
    sipState.sipStatus = 'disconnected';
  });

  it('não renderiza nada sem chamada recebida', () => {
    render(<IncomingCallAlert />);
    expect(screen.queryByText('Atender')).not.toBeInTheDocument();
  });

  it('com SIP desconectado: Atender mostra aviso honesto e NÃO abre dialog de chamada falso', () => {
    callState.incomingCall = incomingCall;
    sipState.sipStatus = 'disconnected';
    render(<IncomingCallAlert />);

    fireEvent.click(screen.getByText('Atender'));

    // Feedback honesto visível (role=alert)
    expect(screen.getByRole('alert')).toHaveTextContent(INBOUND_ANSWER_NO_VOIP_NOTICE);
    // Nunca a UI de chamada falsa do antigo CallDialog
    expect(screen.queryByText(/Chamada recebida/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Chamada em andamento/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Atender chamada' })).not.toBeInTheDocument();
  });

  it('com SIP registrado: Atender mostra aviso honesto de suporte inexistente (nunca no-op)', () => {
    callState.incomingCall = incomingCall;
    sipState.sipStatus = 'registered';
    render(<IncomingCallAlert />);

    fireEvent.click(screen.getByText('Atender'));

    expect(screen.getByRole('alert')).toHaveTextContent(INBOUND_ANSWER_UNSUPPORTED_NOTICE);
    expect(screen.queryByText(/Chamada recebida/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Atender chamada' })).not.toBeInTheDocument();
  });

  it('botão Atender carrega tooltip honesto (title) mesmo antes do clique', () => {
    callState.incomingCall = incomingCall;
    sipState.sipStatus = 'registered';
    render(<IncomingCallAlert />);

    const answerButton = screen.getByRole('button', { name: /Atender/ });
    expect(answerButton).toHaveAttribute('title', INBOUND_ANSWER_UNSUPPORTED_NOTICE);
  });

  it('Recusar continua descartando a chamada', () => {
    callState.incomingCall = incomingCall;
    render(<IncomingCallAlert />);

    fireEvent.click(screen.getByText('Recusar'));

    expect(callState.dismissCall).toHaveBeenCalledTimes(1);
  });
});
