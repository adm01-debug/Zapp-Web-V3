/**
 * BUG-05 / BUG-08 — Regression tests for real interactive messages in useProductHandlers.
 *
 * Antes: handleSendInteractiveMessage so exibia um toast fake — nunca chamava
 * a API. Agora: envia via whatsapp.sendInteractive com JID montado a partir do
 * contactPhone (somente digitos) e so mostra sucesso apos o await resolver.
 * BUG-08: handleInteractiveButtonClick responde no chat enviando o titulo do
 * botao como mensagem via onSendMessage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProductHandlers } from '../useProductHandlers';
import { whatsapp } from '@/lib/whatsappAdapter';
import type { InteractiveButton } from '@/types/chat';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ toast: (p: unknown) => mockToast(p) }));

vi.mock('@/lib/whatsappAdapter', () => ({
  whatsapp: { sendInteractive: vi.fn() },
}));

const mockInsert = vi.fn(() => Promise.resolve({ data: null, error: null }));
vi.mock('@/integrations/datasource/db', () => ({
  dbFrom: vi.fn(() => ({ insert: mockInsert })),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CONTACT_PHONE = '+55 (11) 99988-7766';

type OnSendMessage = (content: string) => void | Promise<void>;

function makeHandlers(overrides: Partial<Parameters<typeof useProductHandlers>[0]> = {}) {
  return renderHook(() =>
    useProductHandlers({
      contactId: '123e4567-e89b-12d3-a456-426614174000',
      contactPhone: CONTACT_PHONE,
      instanceName: 'wpp2',
      onSendMessage: vi.fn<OnSendMessage>(() => Promise.resolve()),
      ...overrides,
    })
  );
}

const sendInteractiveMock = whatsapp.sendInteractive as unknown as ReturnType<typeof vi.fn>;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useProductHandlers — handleSendInteractiveMessage (BUG-05)', () => {
  beforeEach(() => {
    mockToast.mockReset();
    sendInteractiveMock.mockReset();
    sendInteractiveMock.mockResolvedValue({ key: { id: 'int-1' } });
    mockInsert.mockReset();
    mockInsert.mockResolvedValue({ data: null, error: null });
  });

  it('envia mensagem interativa real com JID montado e botoes (tipo buttons)', async () => {
    const { result } = makeHandlers();

    await act(async () => {
      await result.current.handleSendInteractiveMessage({
        type: 'buttons',
        body: 'Escolha uma opcao:',
        header: { type: 'text', text: 'Promocao' },
        footer: 'Toque em um botao',
        buttons: [{ type: 'reply', id: 'b1', title: 'Sim' }],
      });
    });

    expect(sendInteractiveMock).toHaveBeenCalledTimes(1);
    expect(sendInteractiveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        remoteJid: '5511999887766@s.whatsapp.net',
        instance: 'wpp2',
        type: 'buttons',
        body: 'Escolha uma opcao:',
        buttons: [{ type: 'reply', id: 'b1', title: 'Sim' }],
      })
    );
    // Toast de sucesso so apos o await resolver.
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Mensagem interativa enviada!' })
    );
  });

  it('so mostra toast de sucesso apos o envio realmente resolver', async () => {
    let resolveSend: (value: unknown) => void = () => {};
    sendInteractiveMock.mockImplementation(
      () => new Promise((res) => { resolveSend = res; })
    );
    const { result } = makeHandlers();

    let sendPromise: Promise<void> | undefined;
    await act(async () => {
      sendPromise = result.current.handleSendInteractiveMessage({
        type: 'buttons',
        body: 'Escolha uma opcao:',
        buttons: [{ type: 'reply', id: 'b1', title: 'Sim' }],
      });
      // Flush de microtasks: o handler fica pausado no await do sendInteractive.
      await Promise.resolve();
    });

    // Envio ainda pendente — nenhum toast de sucesso pode ter aparecido.
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Mensagem interativa enviada!' })
    );

    await act(async () => {
      resolveSend({ key: { id: 'int-1' } });
      await sendPromise!;
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Mensagem interativa enviada!' })
    );
  });

  it('toast destructive quando o envio falha (sem toast de sucesso)', async () => {
    sendInteractiveMock.mockRejectedValue(new Error('instancia offline'));
    const { result } = makeHandlers();

    await act(async () => {
      await result.current.handleSendInteractiveMessage({
        type: 'buttons',
        body: 'Escolha uma opcao:',
        buttons: [{ type: 'reply', id: 'b1', title: 'Sim' }],
      });
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Erro ao enviar mensagem interativa',
        description: 'instancia offline',
        variant: 'destructive',
      })
    );
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Mensagem interativa enviada!' })
    );
  });

  it('nao envia e mostra toast destructive quando contato sem telefone', async () => {
    const { result } = makeHandlers({ contactPhone: 'sem telefone cadastrado' });

    await act(async () => {
      await result.current.handleSendInteractiveMessage({
        type: 'buttons',
        body: 'Escolha uma opcao:',
        buttons: [{ type: 'reply', id: 'b1', title: 'Sim' }],
      });
    });

    expect(sendInteractiveMock).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({
      title: 'Contato sem telefone',
      variant: 'destructive',
    });
  });
});

describe('useProductHandlers — handleInteractiveButtonClick (BUG-08)', () => {
  beforeEach(() => {
    mockToast.mockReset();
    sendInteractiveMock.mockReset();
    mockInsert.mockReset();
  });

  it('envia o titulo do botao como mensagem via onSendMessage', () => {
    const onSendMessage = vi.fn<OnSendMessage>(() => Promise.resolve());
    const { result } = makeHandlers({ onSendMessage });

    act(() => {
      result.current.handleInteractiveButtonClick({ type: 'reply', id: 'b1', title: 'Sim, quero!' });
    });

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith('Sim, quero!');
    // Nao ha mais toast fake de "Botao clicado".
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Botao clicado' })
    );
  });

  it('usa o id como fallback quando o botao nao tem titulo', () => {
    const onSendMessage = vi.fn<OnSendMessage>(() => Promise.resolve());
    const { result } = makeHandlers({ onSendMessage });
    const buttonWithoutTitle = { type: 'reply', id: 'b1' } as unknown as InteractiveButton;

    act(() => {
      result.current.handleInteractiveButtonClick(buttonWithoutTitle);
    });

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith('b1');
  });
});
