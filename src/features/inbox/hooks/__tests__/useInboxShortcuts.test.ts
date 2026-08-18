/**
 * E40.6/E40.7 — Contrato de atalhos do inbox (useInboxShortcuts).
 *
 * Contrato (docs/audit-2026-08-16/PLANO-100-ETAPAS.md, etapa 40; código-fonte):
 *  - Mod+K (Ctrl+K no Windows/Linux) → onSearchFocus() + preventDefault;
 *  - "/" → onSearchFocus() + preventDefault;
 *  - Mod+E → onArchive(); Mod+Shift+T → onTransfer(); Mod+R → onRefresh();
 *  - Alt+Up → onPrevConversation(); Alt+Down → onNextConversation();
 *  - Mod+F → onSearchFocusChat() (quando fornecido);
 *  - guard de foco: atalho NÃO dispara com o evento originado em input/textarea
 *    (default do react-hotkeys-hook: enableOnFormTags=false);
 *  - cleanup no unmount: atalho NÃO dispara depois que o hook desmonta;
 *  - enabled=false → atalho NÃO dispara.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useInboxShortcuts } from '../useInboxShortcuts';

type Handler = () => void;

interface ShortcutHandlers {
  onSearchFocus: ReturnType<typeof vi.fn<Handler>>;
  onNextConversation: ReturnType<typeof vi.fn<Handler>>;
  onPrevConversation: ReturnType<typeof vi.fn<Handler>>;
  onArchive: ReturnType<typeof vi.fn<Handler>>;
  onTransfer: ReturnType<typeof vi.fn<Handler>>;
  onRefresh: ReturnType<typeof vi.fn<Handler>>;
  onSearchFocusChat: ReturnType<typeof vi.fn<Handler>>;
}

function makeHandlers(): ShortcutHandlers {
  return {
    onSearchFocus: vi.fn<Handler>(),
    onNextConversation: vi.fn<Handler>(),
    onPrevConversation: vi.fn<Handler>(),
    onArchive: vi.fn<Handler>(),
    onTransfer: vi.fn<Handler>(),
    onRefresh: vi.fn<Handler>(),
    onSearchFocusChat: vi.fn<Handler>(),
  };
}

function keydown(init: KeyboardEventInit, target?: Element) {
  // react-hotkeys-hook casa pelo `code` do evento (ex.: 'KeyK', 'Slash') —
  // happy-dom não preenche `code` automaticamente como browsers reais.
  const codeByKey: Record<string, string> = {
    k: 'KeyK',
    '/': 'Slash',
    e: 'KeyE',
    t: 'KeyT',
    r: 'KeyR',
    f: 'KeyF',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
  };
  const code = codeByKey[String(init.key ?? '')] ?? String(init.key ?? '');
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    code,
    ...init,
  });
  if (target) {
    // target explícito (ex.: input) — o listener está no document
    Object.defineProperty(event, 'target', { value: target, configurable: true });
    target.dispatchEvent(event);
  } else {
    document.dispatchEvent(event);
  }
  return event;
}

const ctrlKey = { ctrlKey: true, metaKey: false } as const;

describe('useInboxShortcuts', () => {
  let handlers: ShortcutHandlers;

  beforeEach(() => {
    handlers = makeHandlers();
  });

  it('Mod+K (Ctrl+K) → onSearchFocus + preventDefault', () => {
    renderHook(() => useInboxShortcuts(handlers));
    const ev = keydown({ key: 'k', ...ctrlKey });
    expect(handlers.onSearchFocus).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
    expect(handlers.onArchive).not.toHaveBeenCalled();
  });

  it('"/" → onSearchFocus + preventDefault', () => {
    renderHook(() => useInboxShortcuts(handlers));
    const ev = keydown({ key: '/' });
    expect(handlers.onSearchFocus).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('Mod+E → onArchive; Mod+Shift+T → onTransfer; Mod+R → onRefresh', () => {
    renderHook(() => useInboxShortcuts(handlers));
    keydown({ key: 'e', ...ctrlKey });
    expect(handlers.onArchive).toHaveBeenCalledTimes(1);
    keydown({ key: 't', ...ctrlKey, shiftKey: true });
    expect(handlers.onTransfer).toHaveBeenCalledTimes(1);
    keydown({ key: 'r', ...ctrlKey });
    expect(handlers.onRefresh).toHaveBeenCalledTimes(1);
    expect(handlers.onSearchFocus).not.toHaveBeenCalled();
  });

  it('Alt+Up/Alt+Down → navegação entre conversas', () => {
    renderHook(() => useInboxShortcuts(handlers));
    keydown({ key: 'ArrowUp', altKey: true });
    expect(handlers.onPrevConversation).toHaveBeenCalledTimes(1);
    keydown({ key: 'ArrowDown', altKey: true });
    expect(handlers.onNextConversation).toHaveBeenCalledTimes(1);
  });

  it('Mod+F → onSearchFocusChat quando fornecido', () => {
    renderHook(() => useInboxShortcuts(handlers));
    keydown({ key: 'f', ...ctrlKey });
    expect(handlers.onSearchFocusChat).toHaveBeenCalledTimes(1);
  });

  it('guard de foco: atalho NÃO dispara com foco em input/textarea (composição)', () => {
    renderHook(() => useInboxShortcuts(handlers));
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');

    keydown({ key: 'k', ...ctrlKey }, input);
    keydown({ key: '/', ...ctrlKey }, textarea);
    keydown({ key: 'e', ...ctrlKey }, input);

    expect(handlers.onSearchFocus).not.toHaveBeenCalled();
    expect(handlers.onArchive).not.toHaveBeenCalled();
  });

  it('cleanup no unmount: atalho não dispara depois que o hook desmonta', () => {
    const { unmount } = renderHook(() => useInboxShortcuts(handlers));
    unmount();
    keydown({ key: 'k', ...ctrlKey });
    keydown({ key: 'e', ...ctrlKey });
    expect(handlers.onSearchFocus).not.toHaveBeenCalled();
    expect(handlers.onArchive).not.toHaveBeenCalled();
  });

  it('enabled=false → atalho NÃO dispara', () => {
    renderHook(() => useInboxShortcuts({ ...handlers, enabled: false }));
    keydown({ key: 'k', ...ctrlKey });
    keydown({ key: 'e', ...ctrlKey });
    expect(handlers.onSearchFocus).not.toHaveBeenCalled();
    expect(handlers.onArchive).not.toHaveBeenCalled();
  });
});
