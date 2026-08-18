/**
 * E40.4/E40.5 — Contrato de deep links do inbox (useInboxDeepLinks).
 *
 * Contrato (docs/audit-2026-08-16/PLANO-100-ETAPAS.md, etapa 40):
 *  - `?contact=<uuid>` no mount → setPendingContactId(uuid.trim());
 *  - `?message=<uuid>` no mount → setPendingMessageId(uuid.trim());
 *  - legacy `window.__pendingOpenContactId` → consumido E limpo (undefined);
 *  - evento custom `open-contact-chat` (detail.contactId/messageId) → setters +
 *    `__cancelPendingOpenLoop()` (para o retry loop de 15 tentativas);
 *  - cleanup no unmount remove o listener do evento;
 *  - consumo ÚNICO: re-execução do efeito com os mesmos params (StrictMode,
 *    handler com identidade instável) NÃO re-dispara o deep link.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInboxDeepLinks } from '../useInboxDeepLinks';

const h = vi.hoisted(() => {
  const holder: { params: URLSearchParams; setParams: ReturnType<typeof vi.fn> } = {
    params: new URLSearchParams(),
    setParams: vi.fn(),
  };
  return holder;
});

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [h.params, h.setParams],
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

function makeHandlers() {
  return {
    setPendingContactId: vi.fn(),
    setPendingMessageId: vi.fn(),
  };
}

describe('useInboxDeepLinks', () => {
  beforeEach(() => {
    h.params = new URLSearchParams();
    h.setParams.mockClear();
    delete (window as Window & { __pendingOpenContactId?: string }).__pendingOpenContactId;
    delete (window as Window & { __cancelPendingOpenLoop?: () => void }).__cancelPendingOpenLoop;
  });

  afterEach(() => {
    delete (window as Window & { __pendingOpenContactId?: string }).__pendingOpenContactId;
    delete (window as Window & { __cancelPendingOpenLoop?: () => void }).__cancelPendingOpenLoop;
  });

  it('?contact=<uuid> → setPendingContactId com o valor trimado', () => {
    h.params = new URLSearchParams('contact=c1-1111-2222');
    const handlers = makeHandlers();
    renderHook(() => useInboxDeepLinks(handlers));
    expect(handlers.setPendingContactId).toHaveBeenCalledTimes(1);
    expect(handlers.setPendingContactId).toHaveBeenCalledWith('c1-1111-2222');
    expect(handlers.setPendingMessageId).not.toHaveBeenCalled();
  });

  it('?message=<uuid> → setPendingMessageId; params simultâneos → ambos os setters', () => {
    h.params = new URLSearchParams('contact=c1&message=m1');
    const handlers = makeHandlers();
    renderHook(() => useInboxDeepLinks(handlers));
    expect(handlers.setPendingContactId).toHaveBeenCalledWith('c1');
    expect(handlers.setPendingMessageId).toHaveBeenCalledWith('m1');
  });

  it('window.__pendingOpenContactId legacy é consumido E limpo', () => {
    (window as Window & { __pendingOpenContactId?: string }).__pendingOpenContactId = 'c2';
    const handlers = makeHandlers();
    renderHook(() => useInboxDeepLinks(handlers));
    expect(handlers.setPendingContactId).toHaveBeenCalledWith('c2');
    expect(
      (window as Window & { __pendingOpenContactId?: string }).__pendingOpenContactId
    ).toBeUndefined();
  });

  it('evento open-contact-chat → setters + cancela o retry loop', () => {
    const cancelLoop = vi.fn();
    (window as Window & { __cancelPendingOpenLoop?: () => void }).__cancelPendingOpenLoop =
      cancelLoop;
    const handlers = makeHandlers();
    renderHook(() => useInboxDeepLinks(handlers));
    handlers.setPendingContactId.mockClear();
    handlers.setPendingMessageId.mockClear();

    act(() => {
      window.dispatchEvent(
        new CustomEvent('open-contact-chat', {
          detail: { contactId: 'c3', messageId: 'm3' },
        })
      );
    });
    expect(handlers.setPendingContactId).toHaveBeenCalledWith('c3');
    expect(handlers.setPendingMessageId).toHaveBeenCalledWith('m3');
    expect(cancelLoop).toHaveBeenCalledTimes(1);
  });

  it('cleanup no unmount remove o listener de open-contact-chat (sem vazamento)', () => {
    const handlers = makeHandlers();
    const { unmount } = renderHook(() => useInboxDeepLinks(handlers));
    unmount();

    act(() => {
      window.dispatchEvent(
        new CustomEvent('open-contact-chat', { detail: { contactId: 'c4' } })
      );
    });
    expect(handlers.setPendingContactId).not.toHaveBeenCalled();
  });

  it('re-execução do efeito com os MESMOS params não re-consome o deep link (guard StrictMode)', () => {
    h.params = new URLSearchParams('contact=c1');
    const handlers = makeHandlers();
    const { rerender } = renderHook(
      ({ handlers: hh }) => useInboxDeepLinks(hh),
      { initialProps: { handlers } }
    );
    expect(handlers.setPendingContactId).toHaveBeenCalledTimes(1);

    // Handler com identidade instável (ex.: callback novo por render) re-executa
    // o efeito — o deep link NÃO pode ser consumido de novo.
    const newHandlers = makeHandlers();
    act(() => {
      rerender({ handlers: newHandlers });
    });
    expect(newHandlers.setPendingContactId).not.toHaveBeenCalled();
    expect(handlers.setPendingContactId).toHaveBeenCalledTimes(1);
  });
});
