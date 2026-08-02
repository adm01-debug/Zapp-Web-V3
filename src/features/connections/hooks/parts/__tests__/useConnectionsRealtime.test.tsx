/**
 * Tests for useConnectionsRealtime() — F6-26 / Etapa 2.
 *
 * Este hook carrega a cicatriz do incidente 2026-07-02 ("cannot add
 * postgres_changes callbacks after subscribe()"): a correção foi usar um topic
 * ÚNICO por mount. Sem teste, nada impede alguém de "simplificar" o nome do
 * canal de volta para uma constante e reintroduzir o loop de remount.
 *
 * O client Supabase é substituído por um canal fake que captura o handler de
 * `postgres_changes`, permitindo disparar payloads sintéticos de UPDATE /
 * INSERT / DELETE sem rede nem websocket.
 *
 * Coberto:
 *   - assina o schema 'zapp', tabela whatsapp_connections, event '*'
 *   - topic é único por mount (dois mounts → dois nomes distintos)
 *   - topic mantém o prefixo whatsapp-connections-changes
 *   - registra o handler UMA vez por mount
 *   - unmount chama unsubscribe E removeChannel
 *   UPDATE
 *     - substitui a conexão correspondente na lista, preservando as demais
 *     - anuncia quando o status passa a 'connected'
 *     - NÃO anuncia se já estava 'connected'
 *     - com dialog aberto na mesma conexão e status connected: limpa o QR
 *     - com dialog aberto e novo qr_code: repõe o QR como pending
 *     - dialog aberto de OUTRA conexão não é tocado
 *     - dialog fechado não é tocado
 *   INSERT — insere no topo da lista
 *   DELETE — remove pelo id
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { QrCodeDialogState, WhatsAppConnection } from '../../types';

const { channelMock, removeChannelMock, handlers, topics } = vi.hoisted(() => ({
  channelMock: vi.fn(),
  removeChannelMock: vi.fn(),
  handlers: [] as Array<(p: unknown) => void>,
  topics: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { channel: channelMock, removeChannel: removeChannelMock },
}));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { useConnectionsRealtime } from '../useConnectionsRealtime';

const unsubscribeMock = vi.fn();
const onCalls: unknown[][] = [];

beforeEach(() => {
  vi.clearAllMocks();
  handlers.length = 0;
  topics.length = 0;
  onCalls.length = 0;
  channelMock.mockImplementation((topic: string) => {
    topics.push(topic);
    const ch: Record<string, unknown> = {};
    ch.on = (...args: unknown[]) => {
      onCalls.push(args);
      handlers.push(args[2] as (p: unknown) => void);
      return ch;
    };
    ch.subscribe = () => ch;
    ch.unsubscribe = unsubscribeMock;
    return ch;
  });
});

function makeDialog(over: Partial<QrCodeDialogState> = {}): QrCodeDialogState {
  return {
    open: false,
    connectionId: '',
    connectionName: '',
    qrCode: null,
    status: 'loading',
    expiresAt: null,
    attemptId: null,
    ttlSeconds: null,
    ttlSource: null,
    ...over,
  };
}

function setup(dialog: QrCodeDialogState = makeDialog()) {
  const setConnections = vi.fn();
  const setQrCodeDialog = vi.fn();
  const announceConnected = vi.fn();
  const view = renderHook(() =>
    useConnectionsRealtime(setConnections, dialog, setQrCodeDialog, announceConnected)
  );
  return { setConnections, setQrCodeDialog, announceConnected, view };
}

function fire(payload: unknown) {
  handlers[handlers.length - 1](payload);
}

function conn(over: Partial<WhatsAppConnection> = {}): WhatsAppConnection {
  return {
    id: 'c1',
    name: 'Suporte',
    phone_number: '55',
    instance_id: null,
    status: 'connected',
    qr_code: null,
    is_default: false,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

// ── inscrição e teardown ──────────────────────────────────────────────────────
describe('useConnectionsRealtime — inscrição', () => {
  it('assina schema zapp / tabela whatsapp_connections / event *', () => {
    setup();
    expect(onCalls[0][0]).toBe('postgres_changes');
    expect(onCalls[0][1]).toEqual({
      event: '*',
      schema: 'zapp',
      table: 'whatsapp_connections',
    });
  });

  it('registra o handler uma única vez por mount', () => {
    setup();
    expect(onCalls).toHaveLength(1);
  });

  it('usa topic ÚNICO por mount — regressão do incidente 2026-07-02', () => {
    setup();
    setup();
    expect(topics).toHaveLength(2);
    expect(topics[0]).not.toBe(topics[1]);
  });

  it('mantém o prefixo whatsapp-connections-changes no topic', () => {
    setup();
    expect(topics[0]).toMatch(/^whatsapp-connections-changes:[a-z0-9]+$/);
  });

  it('unmount faz unsubscribe e removeChannel', () => {
    const { view } = setup();
    view.unmount();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    expect(removeChannelMock).toHaveBeenCalledTimes(1);
  });
});

// ── UPDATE ────────────────────────────────────────────────────────────────────
describe('useConnectionsRealtime — UPDATE', () => {
  it('substitui a conexão correspondente preservando as demais', () => {
    const { setConnections } = setup();
    fire({
      eventType: 'UPDATE',
      new: conn({ id: 'c1', status: 'connected' }),
      old: conn({ id: 'c1', status: 'connecting' }),
    });
    const updater = setConnections.mock.calls[0][0] as (
      p: WhatsAppConnection[]
    ) => WhatsAppConnection[];
    const next = updater([conn({ id: 'c1', status: 'connecting' }), conn({ id: 'c2' })]);
    expect(next[0].status).toBe('connected');
    expect(next[1].id).toBe('c2');
  });

  it('anuncia quando o status passa a connected', () => {
    const { announceConnected } = setup();
    fire({
      eventType: 'UPDATE',
      new: conn({ status: 'connected' }),
      old: conn({ status: 'connecting' }),
    });
    expect(announceConnected).toHaveBeenCalledWith({ id: 'c1', name: 'Suporte' });
  });

  it('NÃO anuncia se já estava connected', () => {
    const { announceConnected } = setup();
    fire({
      eventType: 'UPDATE',
      new: conn({ status: 'connected' }),
      old: conn({ status: 'connected' }),
    });
    expect(announceConnected).not.toHaveBeenCalled();
  });

  it('dialog aberto na mesma conexão + connected: limpa o QR', () => {
    const { setQrCodeDialog } = setup(makeDialog({ open: true, connectionId: 'c1' }));
    fire({
      eventType: 'UPDATE',
      new: conn({ id: 'c1', status: 'connected' }),
      old: conn({ id: 'c1', status: 'connecting' }),
    });
    const updater = setQrCodeDialog.mock.calls[0][0] as (
      p: QrCodeDialogState
    ) => QrCodeDialogState;
    const next = updater(makeDialog({ open: true, connectionId: 'c1', qrCode: 'abc' }));
    expect(next.status).toBe('connected');
    expect(next.qrCode).toBeNull();
    expect(next.expiresAt).toBeNull();
  });

  it('dialog aberto + novo qr_code: repõe o QR como pending', () => {
    const { setQrCodeDialog } = setup(makeDialog({ open: true, connectionId: 'c1' }));
    fire({
      eventType: 'UPDATE',
      new: conn({ id: 'c1', status: 'connecting', qr_code: 'novo-qr' }),
      old: conn({ id: 'c1', status: 'connecting' }),
    });
    const updater = setQrCodeDialog.mock.calls[0][0] as (
      p: QrCodeDialogState
    ) => QrCodeDialogState;
    const next = updater(makeDialog({ open: true, connectionId: 'c1', expiresAt: 999 }));
    expect(next.qrCode).toBe('novo-qr');
    expect(next.status).toBe('pending');
    expect(next.expiresAt).toBe(999);
  });

  it('dialog aberto de OUTRA conexão não é tocado', () => {
    const { setQrCodeDialog } = setup(makeDialog({ open: true, connectionId: 'outra' }));
    fire({
      eventType: 'UPDATE',
      new: conn({ id: 'c1', status: 'connected' }),
      old: conn({ id: 'c1', status: 'connecting' }),
    });
    expect(setQrCodeDialog).not.toHaveBeenCalled();
  });

  it('dialog fechado não é tocado', () => {
    const { setQrCodeDialog } = setup(makeDialog({ open: false, connectionId: 'c1' }));
    fire({
      eventType: 'UPDATE',
      new: conn({ id: 'c1', status: 'connected' }),
      old: conn({ id: 'c1', status: 'connecting' }),
    });
    expect(setQrCodeDialog).not.toHaveBeenCalled();
  });
});

// ── INSERT / DELETE ───────────────────────────────────────────────────────────
describe('useConnectionsRealtime — INSERT e DELETE', () => {
  it('INSERT coloca a nova conexão no topo', () => {
    const { setConnections } = setup();
    fire({ eventType: 'INSERT', new: conn({ id: 'novo' }) });
    const updater = setConnections.mock.calls[0][0] as (
      p: WhatsAppConnection[]
    ) => WhatsAppConnection[];
    const next = updater([conn({ id: 'c1' })]);
    expect(next.map((c) => c.id)).toEqual(['novo', 'c1']);
  });

  it('DELETE remove pelo id', () => {
    const { setConnections } = setup();
    fire({ eventType: 'DELETE', old: { id: 'c1' } });
    const updater = setConnections.mock.calls[0][0] as (
      p: WhatsAppConnection[]
    ) => WhatsAppConnection[];
    const next = updater([conn({ id: 'c1' }), conn({ id: 'c2' })]);
    expect(next.map((c) => c.id)).toEqual(['c2']);
  });
});
