/**
 * BUG-03/BUG-04 — Slash commands reais em useInputHandlers.
 *
 * BUG-03: handleSlashCommand deve invocar os callbacks reais (em vez de
 * toasts-fake) e so mostrar toast de sucesso apos o callback resolver.
 * BUG-04: /summary deve abrir o painel de resumo — handleSetActiveTool('summary').
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInputHandlers, slashSnoozeToIso } from '../useInputHandlers';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ toast: (p: unknown) => mockToast(p) }));

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeHandlers() {
  const setInputValue = vi.fn();
  const setIsWhisper = vi.fn();
  const openDialog = vi.fn();
  const closeDialog = vi.fn();
  const handleTypingStart = vi.fn();
  const handleTypingStop = vi.fn();
  const handleSend = vi.fn();
  const handleSetActiveTool = vi.fn();
  const callbacks = {
    onResolveConversation: vi.fn().mockResolvedValue(undefined),
    onSnooze: vi.fn().mockResolvedValue(undefined),
    onStarToggle: vi.fn().mockResolvedValue(undefined),
    onRemind: vi.fn().mockResolvedValue(undefined),
    onAddNote: vi.fn().mockResolvedValue(undefined),
    onAddTag: vi.fn().mockResolvedValue(undefined),
    onTransferDialog: vi.fn(),
    onArchive: vi.fn().mockResolvedValue(undefined),
  };
  const { result } = renderHook(() =>
    useInputHandlers({
      setInputValue,
      setIsWhisper,
      openDialog,
      closeDialog,
      handleTypingStart,
      handleTypingStop,
      handleSend,
      handleSetActiveTool,
      ...callbacks,
    })
  );
  return { result, callbacks, handleSetActiveTool, openDialog, closeDialog, setInputValue };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BUG-03 — /resolve chama onResolveConversation', () => {
  it('invoca o callback e mostra sucesso somente apos resolver', async () => {
    const { result, callbacks } = makeHandlers();
    await act(async () => {
      result.current.handleSlashCommand({ id: 'resolve', label: 'Resolver' });
    });
    expect(callbacks.onResolveConversation).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Conversa Resolvida' })
    );
  });

  it('callback rejeitando mostra toast de erro e NAO mostra sucesso', async () => {
    const { result, callbacks } = makeHandlers();
    callbacks.onResolveConversation.mockRejectedValue(new Error('contato invalido'));
    await act(async () => {
      result.current.handleSlashCommand({ id: 'resolve' });
    });
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Erro', variant: 'destructive' })
    );
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Conversa Resolvida' })
    );
  });
});

describe('BUG-03 — /snooze mapeia subCommand para ISO e chama onSnooze', () => {
  it("'1h' chama onSnooze com ISO ~1 hora a frente", async () => {
    const { result, callbacks } = makeHandlers();
    const before = Date.now();
    await act(async () => {
      result.current.handleSlashCommand({ id: 'snooze', label: 'Adiar' }, '1h');
    });
    expect(callbacks.onSnooze).toHaveBeenCalledTimes(1);
    const until = callbacks.onSnooze.mock.calls[0][0] as string;
    expect(new Date(until).toISOString()).toBe(until); // ISO válido
    const delta = new Date(until).getTime() - before;
    expect(delta).toBeGreaterThan(55 * 60 * 1000); // >= ~55min
    expect(delta).toBeLessThan(65 * 60 * 1000); // <= ~65min
  });

  it('sem subCommand valido mostra toast pedindo o periodo e nao chama callback', async () => {
    const { result, callbacks } = makeHandlers();
    await act(async () => {
      result.current.handleSlashCommand({ id: 'snooze' });
    });
    expect(callbacks.onSnooze).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Adiar Conversa' })
    );
  });

  it('slashSnoozeToIso mapeia 3h/tomorrow/nextweek e retorna null para invalido', () => {
    const before = Date.now();
    const h3 = slashSnoozeToIso('3h');
    const tomorrow = slashSnoozeToIso('tomorrow');
    const nextweek = slashSnoozeToIso('nextweek');
    expect(h3).not.toBeNull();
    expect(tomorrow).not.toBeNull();
    expect(nextweek).not.toBeNull();
    expect(new Date(h3 as string).getTime() - before).toBeGreaterThan(2.9 * 60 * 60 * 1000);
    expect(new Date(nextweek as string).getTime() - before).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
    expect(slashSnoozeToIso(undefined)).toBeNull();
    expect(slashSnoozeToIso('banana')).toBeNull();
  });
});

describe('BUG-03 — /star, /note, /tag, /assign, /remind', () => {
  it('/star chama onStarToggle e mostra sucesso apos resolver', async () => {
    const { result, callbacks } = makeHandlers();
    await act(async () => {
      result.current.handleSlashCommand({ id: 'star' });
    });
    expect(callbacks.onStarToggle).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Conversa Favoritada' })
    );
  });

  it('/note com subCommand chama onAddNote com o conteudo', async () => {
    const { result, callbacks } = makeHandlers();
    await act(async () => {
      result.current.handleSlashCommand({ id: 'note' }, 'cliente pediu reembolso');
    });
    expect(callbacks.onAddNote).toHaveBeenCalledWith('cliente pediu reembolso');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Nota Privada' })
    );
  });

  it('/note sem subCommand mostra toast pedindo o valor e nao chama callback', async () => {
    const { result, callbacks } = makeHandlers();
    await act(async () => {
      result.current.handleSlashCommand({ id: 'note' });
    });
    expect(callbacks.onAddNote).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Digite o texto da nota apos /note.' })
    );
  });

  it('/tag com subCommand chama onAddTag com o nome', async () => {
    const { result, callbacks } = makeHandlers();
    await act(async () => {
      result.current.handleSlashCommand({ id: 'tag' }, 'vip');
    });
    expect(callbacks.onAddTag).toHaveBeenCalledWith('vip');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Tag Adicionada' })
    );
  });

  it('/tag sem subCommand mostra toast pedindo o valor e nao chama callback', async () => {
    const { result, callbacks } = makeHandlers();
    await act(async () => {
      result.current.handleSlashCommand({ id: 'tag' });
    });
    expect(callbacks.onAddTag).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Digite o nome da tag apos /tag.' })
    );
  });

  it('/assign abre o dialog de transferencia via onTransferDialog', async () => {
    const { result, callbacks } = makeHandlers();
    await act(async () => {
      result.current.handleSlashCommand({ id: 'assign' });
    });
    expect(callbacks.onTransferDialog).toHaveBeenCalledTimes(1);
  });

  it('/remind com subCommand chama onRemind com ISO e titulo do subCommand', async () => {
    const { result, callbacks } = makeHandlers();
    const before = Date.now();
    await act(async () => {
      result.current.handleSlashCommand({ id: 'remind' }, 'tomorrow');
    });
    expect(callbacks.onRemind).toHaveBeenCalledTimes(1);
    const [at, title] = callbacks.onRemind.mock.calls[0] as [string, string];
    expect(title).toBe('Lembrete em amanha');
    expect(new Date(at).getTime() - before).toBeGreaterThan(0.9 * 24 * 60 * 60 * 1000);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Lembrete Criado' })
    );
  });
});

describe('BUG-03 — /archive chama o callback real (PR PR 773)', () => {
  it('/archive chama onArchive e confirma com toast de sucesso', async () => {
    const { result, callbacks } = makeHandlers();
    await act(async () => {
      result.current.handleSlashCommand({ id: 'archive' });
    });
    expect(callbacks.onArchive).toHaveBeenCalledTimes(1);
    expect(callbacks.onResolveConversation).not.toHaveBeenCalled();
    expect(callbacks.onStarToggle).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Conversa Arquivada',
      })
    );
  });

  it('/archive sem callback não exibe sucesso inventado (run no-op)', async () => {
    const { result } = renderHook(() =>
      useInputHandlers({
        setInputValue: vi.fn(),
        setIsWhisper: vi.fn(),
        openDialog: vi.fn(),
        closeDialog: vi.fn(),
        handleTypingStart: vi.fn(),
        handleTypingStop: vi.fn(),
        handleSend: vi.fn(),
        handleSetActiveTool: vi.fn(),
      })
    );
    await act(async () => {
      result.current.handleSlashCommand({ id: 'archive' });
    });
    // Sem callback configurado, NÃO exibe sucesso inventado (contrato run()).
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('/priority NAO chama callback e mostra toast informativo', async () => {
    const { result, callbacks } = makeHandlers();
    await act(async () => {
      result.current.handleSlashCommand({ id: 'priority' }, 'high');
    });
    expect(callbacks.onStarToggle).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Prioridade',
        description: 'Prioridade nao disponivel nesta versao.',
      })
    );
  });
});

describe('BUG-04 — /summary abre o painel real de analise', () => {
  it('chama handleSetActiveTool com "aiAssistant" (painel real; "summary" e no-op no ChatToolPanels)', async () => {
    const { result, handleSetActiveTool } = makeHandlers();
    await act(async () => {
      result.current.handleSlashCommand({ id: 'summary' });
    });
    expect(handleSetActiveTool).toHaveBeenCalledWith('aiAssistant');
    expect(handleSetActiveTool).not.toHaveBeenCalledWith('summary');
  });
});

describe('Comandos ja reais permanecem intactos', () => {
  it('/transfer continua abrindo transferDialog via openDialog', async () => {
    const { result, openDialog } = makeHandlers();
    await act(async () => {
      result.current.handleSlashCommand({ id: 'transfer' });
    });
    expect(openDialog).toHaveBeenCalledWith('transferDialog');
  });

  it('/template e /quick abrem quickReplies', async () => {
    const { result, openDialog } = makeHandlers();
    await act(async () => {
      result.current.handleSlashCommand({ id: 'template' });
      result.current.handleSlashCommand({ id: 'quick' });
    });
    expect(openDialog).toHaveBeenCalledWith('quickReplies');
  });

  it('limpa o input e fecha o dialog de slash commands ao executar', async () => {
    const { result, callbacks, setInputValue, closeDialog } = makeHandlers();
    await act(async () => {
      result.current.handleSlashCommand({ id: 'star' });
    });
    expect(setInputValue).toHaveBeenCalledWith('');
    expect(closeDialog).toHaveBeenCalledWith('slashCommands');
    expect(callbacks.onStarToggle).toHaveBeenCalledTimes(1);
  });
});
