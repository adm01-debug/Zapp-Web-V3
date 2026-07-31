/**
 * BUG-09 — Regression tests for clipboard copy with catch in
 * useMessageReactionHandlers.
 *
 * Antes: handleCopyMessage chamava navigator.clipboard.writeText sem await
 * e sem catch — falha de permissao virava unhandled rejection silencioso e
 * o toast 'Copiado!' aparecia mesmo sem copiar nada.
 * Agora: await com try/catch — sucesso so apos resolver; falha mostra toast
 * destructive 'Falha ao copiar: permissao negada'.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMessageReactionHandlers } from '../useMessageReactionHandlers';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ toast: (p: unknown) => mockToast(p) }));

const mockWriteText = vi.fn();
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText: mockWriteText },
});

vi.mock('@/lib/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/logger')>();
  return {
    ...actual,
    getLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  };
});
vi.mock('../../hooks/realtime/messageSender', () => ({ sendMessageToContact: vi.fn() }));

function makeHandlers() {
  return renderHook(() =>
    useMessageReactionHandlers({
      inputRef: { current: null },
      forwardMessage: null,
      setReplyToMessage: vi.fn(),
      setForwardMessage: vi.fn(),
      openDialog: vi.fn(),
    })
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useMessageReactionHandlers — handleCopyMessage (BUG-09)', () => {
  beforeEach(() => {
    mockToast.mockReset();
    mockWriteText.mockReset();
    mockWriteText.mockResolvedValue(undefined);
  });

  it('mostra toast de sucesso quando clipboard.writeText resolve', async () => {
    const { result } = makeHandlers();

    await act(async () => {
      await result.current.handleCopyMessage('texto copiado');
    });

    expect(mockWriteText).toHaveBeenCalledWith('texto copiado');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Copiado!' })
    );
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Falha ao copiar: permissao negada' })
    );
  });

  it('mostra toast destructive (nao Copiado!) quando clipboard falha', async () => {
    mockWriteText.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));
    const { result } = makeHandlers();

    await act(async () => {
      await result.current.handleCopyMessage('texto copiado');
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Falha ao copiar: permissao negada',
        variant: 'destructive',
      })
    );
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Copiado!' })
    );
  });
});
