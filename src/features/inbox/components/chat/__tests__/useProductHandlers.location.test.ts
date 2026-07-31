/**
 * BUG-06 — Regression tests for real location sending in useProductHandlers.
 *
 * Antes: handleSendLocation so exibia um toast fake — nunca chamava a API.
 * Agora: envia via whatsapp.sendLocation com JID montado a partir do
 * contactPhone (somente digitos), persiste em messages quando contactId e
 * UUID valido e so mostra sucesso apos o await resolver.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProductHandlers } from '../useProductHandlers';
import { whatsapp } from '@/lib/whatsappAdapter';
import { dbFrom } from '@/integrations/datasource/db';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ toast: (p: unknown) => mockToast(p) }));

vi.mock('@/lib/whatsappAdapter', () => ({
  whatsapp: { sendLocation: vi.fn() },
}));

const mockInsert = vi.fn(() => Promise.resolve({ data: null, error: null }));
vi.mock('@/integrations/datasource/db', () => ({
  dbFrom: vi.fn(() => ({ insert: mockInsert })),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

// UUID valido — persiste em messages (FK contact_id exige UUID).
const CONTACT_UUID = '123e4567-e89b-12d3-a456-426614174000';
// JID do WhatsApp — NAO persiste (violaria a FK contact_id).
const CONTACT_JID = '5511999887766@s.whatsapp.net';

function makeHandlers(overrides: Partial<Parameters<typeof useProductHandlers>[0]> = {}) {
  return renderHook(() =>
    useProductHandlers({
      contactId: CONTACT_UUID,
      contactPhone: '+55 (11) 99988-7766',
      instanceName: 'wpp2',
      onSendMessage: vi.fn(() => Promise.resolve()),
      ...overrides,
    })
  );
}

const sendLocationMock = whatsapp.sendLocation as unknown as ReturnType<typeof vi.fn>;
const dbFromMock = dbFrom as unknown as ReturnType<typeof vi.fn>;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useProductHandlers — handleSendLocation (BUG-06)', () => {
  beforeEach(() => {
    mockToast.mockReset();
    sendLocationMock.mockReset();
    sendLocationMock.mockResolvedValue({ key: { id: 'loc-1' } });
    mockInsert.mockReset();
    mockInsert.mockResolvedValue({ data: null, error: null });
    dbFromMock.mockClear();
  });

  it('envia localizacao real com JID montado e persiste quando contactId e UUID', async () => {
    const { result } = makeHandlers();

    await act(async () => {
      await result.current.handleSendLocation({
        latitude: -23.55052,
        longitude: -46.633308,
        name: 'Escritorio Central',
        address: 'Av. Paulista, 1000',
      });
    });

    expect(sendLocationMock).toHaveBeenCalledTimes(1);
    expect(sendLocationMock).toHaveBeenCalledWith({
      remoteJid: '5511999887766@s.whatsapp.net',
      latitude: -23.55052,
      longitude: -46.633308,
      name: 'Escritorio Central',
      address: 'Av. Paulista, 1000',
      instance: 'wpp2',
    });
    expect(dbFromMock).toHaveBeenCalledWith('messages');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_id: CONTACT_UUID,
        content: JSON.stringify({
          latitude: -23.55052,
          longitude: -46.633308,
          name: 'Escritorio Central',
          address: 'Av. Paulista, 1000',
        }),
        message_type: 'location',
        sender: 'agent',
        status: 'sent',
        whatsapp_connection_id: null,
      })
    );
    // Toast de sucesso so apos o await resolver.
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Localizacao enviada!' })
    );
  });

  it('nao persiste quando contactId nao e UUID (JID do WhatsApp)', async () => {
    const { result } = makeHandlers({ contactId: CONTACT_JID });

    await act(async () => {
      await result.current.handleSendLocation({
        latitude: -23.55052,
        longitude: -46.633308,
        name: 'Loja',
      });
    });

    expect(sendLocationMock).toHaveBeenCalledTimes(1);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Localizacao enviada!' })
    );
  });

  it('toast destructive e nao envia quando contato sem telefone', async () => {
    const { result } = makeHandlers({ contactPhone: 'sem telefone cadastrado' });

    await act(async () => {
      await result.current.handleSendLocation({
        latitude: -23.55052,
        longitude: -46.633308,
      });
    });

    expect(sendLocationMock).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({
      title: 'Contato sem telefone',
      variant: 'destructive',
    });
  });

  it('toast destructive quando sendLocation falha (sem toast de sucesso)', async () => {
    sendLocationMock.mockRejectedValue(new Error('instancia offline'));
    const { result } = makeHandlers();

    await act(async () => {
      await result.current.handleSendLocation({
        latitude: -23.55052,
        longitude: -46.633308,
      });
    });

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Erro ao enviar localizacao',
        description: 'instancia offline',
        variant: 'destructive',
      })
    );
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Localizacao enviada!' })
    );
  });
});
