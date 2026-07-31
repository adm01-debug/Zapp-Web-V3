/**
 * BUG-11 / BUG-12 — Testes de regressão do ciclo de vida das object URLs
 * e da geração de ids no useChatInputLogic.
 *
 * - BUG-11a: handleSendWithAnimation DEVE revogar os previews antes de
 *   limpar attachments (estavam vazando memória).
 * - BUG-11b: o unmount do hook DEVE revogar previews que sobraram.
 * - BUG-12: ids gerados usam .slice() — sem .substr() deprecado no módulo chat.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { useChatInputLogic } from '../useChatInputLogic';

// Diretório do arquivo de teste (robusto no Windows, onde import.meta.url
// pode não resolver como file: para new URL relativo)
const testDir = dirname(fileURLToPath(import.meta.url));

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ toast: (p: unknown) => mockToast(p) }));

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

vi.mock('@/utils/whatsappFileTypes', () => ({
  validateFile: vi.fn(() => ({ valid: true, category: 'image', error: undefined })),
}));

// O hook importa apenas o TIPO FileUploaderRef do FileUploader real.
vi.mock('../../FileUploader', () => ({}));

const createObjectURLMock = vi.fn(() => 'blob:mock-preview');
const revokeObjectURLMock = vi.fn();

beforeAll(() => {
  // happy-dom não implementa createObjectURL/revokeObjectURL de forma confiável
  const defineUrlMock = (name: string, fn: (...args: unknown[]) => unknown) => {
    try {
      Object.defineProperty(URL, name, { configurable: true, writable: true, value: fn });
    } catch {
      // URL global não-configurável — tenta substituição direta
      (URL as unknown as Record<string, unknown>)[name] = fn;
    }
  };
  defineUrlMock('createObjectURL', createObjectURLMock);
  defineUrlMock('revokeObjectURL', revokeObjectURLMock);
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

type SendFn = (attachments?: File[]) => void | Promise<void>;

function makeHook(onSend: SendFn) {
  return renderHook(() =>
    useChatInputLogic({
      inputValue: '',
      contactId: 'contact-1',
      editingMessage: null,
      inputRef: { current: null },
      fileUploaderRef: { current: null },
      onSend,
    })
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BUG-11a — revoga previews no envio', () => {
  it('handleSendWithAnimation revoga o preview do anexo antes de limpar', async () => {
    const onSend = vi.fn<SendFn>().mockResolvedValue(undefined);
    const { result } = makeHook(onSend);

    act(() => {
      result.current.handleFileSelect(new File(['x'], 'foto.png', { type: 'image/png' }));
    });
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.handleSendWithAnimation();
    });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-preview');
    expect(result.current.attachments).toEqual([]);
  });
});

describe('BUG-11b — revoga previews no unmount', () => {
  it('unmount do hook revoga os previews restantes', () => {
    const onSend = vi.fn<SendFn>().mockResolvedValue(undefined);
    const { result, unmount } = makeHook(onSend);

    act(() => {
      result.current.handleFileSelect(new File(['x'], 'foto.png', { type: 'image/png' }));
      result.current.handleFileSelect(new File(['x'], 'doc.pdf', { type: 'application/pdf' }));
    });
    expect(createObjectURLMock).toHaveBeenCalledTimes(2);

    unmount();

    expect(revokeObjectURLMock).toHaveBeenCalledTimes(2);
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-preview');
  });
});

describe('BUG-12 — ids sem .substr', () => {
  it('módulo importa OK e ids têm 9 chars (slice)', () => {
    // Assert trivial: o módulo importa sem erro
    expect(useChatInputLogic).toBeTypeOf('function');

    // Math.random determinístico com representação longa em base 36
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
    const onSend = vi.fn<SendFn>().mockResolvedValue(undefined);
    const { result } = makeHook(onSend);

    act(() => {
      result.current.handleFileSelect(new File(['x'], 'a.png', { type: 'image/png' }));
      result.current.handleFileSelect(new File(['x'], 'b.png', { type: 'image/png' }));
    });

    const ids = result.current.attachments.map((a) => a.id);
    expect(ids).toHaveLength(2);
    ids.forEach((id) => {
      expect(id).toHaveLength(9);
      expect(id).toMatch(/^[a-z0-9]{9}$/);
    });
  });

  it('código-fonte do módulo chat não contém .substr(', () => {
    const hookSource = readFileSync(resolve(testDir, '../useChatInputLogic.ts'), 'utf8');
    expect(hookSource).not.toContain('.substr(');

    const inputSource = readFileSync(resolve(testDir, '../ChatMessageInput.tsx'), 'utf8');
    expect(inputSource).not.toContain('.substr(');
  });
});
