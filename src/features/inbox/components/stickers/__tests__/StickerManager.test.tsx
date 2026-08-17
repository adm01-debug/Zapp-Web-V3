import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StickerItem, PendingUpload } from '../StickerTypes';

// ═══════════════════════════════════════════════════════════════════════════
// Testes do StickerManager (figurinhas compartilhadas) — wt-g10 / Etapa 44.
//
// Contrato sob teste:
//   - Busca de stickers compartilhados via fetchStickers (query 'stickers-manager')
//     e estatísticas (total / favoritas) nos badges do header.
//   - Filtros: busca por nome (case-insensitive), categoria, favoritas,
//     RECENTES (Etapa 44/A7 — ordenação por created_at do DB).
//   - Ações: enviar (onSend + incrementStickerUseCount com log honesto de falha),
//     favoritar (updateStickerFavorite com valor invertido), excluir
//     (deleteStickerById + toast), mudar categoria (updateStickerCategory).
//   - Upload de compartilhadas (Etapa 44/A8): seleção → uploadStickerFile
//     (bucket stickers) → preview → insertStickerRow → invalida query;
//     cancelamento remove o objeto do storage.
//   - Erros honestos (Etapa 44.5): falha de query → banner com a causa real;
//     falha de upload → toast com a MENSAGEM REAL do bucket, sem preview.
//
// StickerGrid/StickerUploadPreview são stubs de captura (padrão do repo): os
// callbacks capturados são os closures REAIS do StickerManager, então as
// asserções exercitam a lógica real de wiring, não uma reimplementação.
// ═══════════════════════════════════════════════════════════════════════════

// ── Mocks ───────────────────────────────────────────────────────────────────
const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
const mockFetchStickers = vi.hoisted(() => vi.fn());
const mockUpdateFavorite = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ data: null, error: null }))
);
const mockDeleteSticker = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ data: null, error: null }))
);
const mockUpdateCategory = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ data: null, error: null }))
);
const mockIncrementUseCount = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ data: null, error: null }))
);
// Etapa 44/A8: helper canônico de upload (mockado para isolar o wiring).
const mockUploadStickerFile = vi.hoisted(() => vi.fn());
const mockInsertStickerRow = vi.hoisted(() => vi.fn());
const mockRemoveStickerObject = vi.hoisted(() => vi.fn());

type GridProps = {
  stickers: StickerItem[];
  loading: boolean;
  search: string;
  gridSize: 'sm' | 'md' | 'lg';
  onSend: (sticker: StickerItem) => void;
  onToggleFavorite: (e: React.SyntheticEvent, sticker: StickerItem) => void;
  onDelete: (e: React.MouseEvent, sticker: StickerItem) => void;
  onCategoryChange: (sticker: StickerItem, cat: string) => void;
  onAddClick: () => void;
};

type PreviewProps = {
  pending: PendingUpload;
  onConfirm: (p: PendingUpload) => void;
  onCancel: () => void;
};

const gridPropsHolder = vi.hoisted(() => ({ current: undefined as GridProps | undefined }));
const previewPropsHolder = vi.hoisted(() => ({ current: undefined as PreviewProps | undefined }));

vi.mock('@/lib/logger', () => ({ getLogger: () => mockLogger }));
vi.mock('sonner', () => ({ toast: mockToast }));
vi.mock('framer-motion', () => ({
  AnimatePresence: (props: { children?: unknown }) => props?.children ?? null,
}));
vi.mock('@/features/inbox/hooks/useStickerMutations', () => ({
  fetchStickers: (...args: unknown[]) => mockFetchStickers(...args),
  updateStickerFavorite: (...args: unknown[]) => mockUpdateFavorite(...args),
  deleteStickerById: (...args: unknown[]) => mockDeleteSticker(...args),
  updateStickerCategory: (...args: unknown[]) => mockUpdateCategory(...args),
  incrementStickerUseCount: (...args: unknown[]) => mockIncrementUseCount(...args),
}));
vi.mock('@/features/inbox/components/stickers/PersonalStickers', () => ({
  PersonalStickers: () => null,
}));
vi.mock('@/features/inbox/components/stickers/StickerUploadPreview', () => ({
  StickerUploadPreview: (props: PreviewProps) => {
    previewPropsHolder.current = props;
    return null;
  },
}));
vi.mock('@/features/inbox/components/stickers/StickerGrid', () => ({
  StickerGrid: (props: GridProps) => {
    gridPropsHolder.current = props;
    return null;
  },
}));
vi.mock('@/features/inbox/components/stickers/stickerUpload', () => ({
  uploadStickerFile: (...args: unknown[]) => mockUploadStickerFile(...args),
  insertStickerRow: (...args: unknown[]) => mockInsertStickerRow(...args),
  removeStickerObject: (...args: unknown[]) => mockRemoveStickerObject(...args),
}));

import { StickerManager } from '../StickerManager';

// ── Fixtures ────────────────────────────────────────────────────────────────
const STICKERS: StickerItem[] = [
  {
    id: 's1',
    name: 'Risada',
    image_url: 'https://cdn.example/stickers/s1.webp',
    category: 'riso',
    is_favorite: true,
    use_count: 5,
    created_at: '2026-08-01T10:00:00.000Z',
  },
  {
    id: 's2',
    name: 'Choro',
    image_url: 'https://cdn.example/stickers/s2.webp',
    category: 'chorando',
    is_favorite: false,
    use_count: 0,
    created_at: '2026-08-03T10:00:00.000Z',
  },
  {
    id: 's3',
    name: 'Amor',
    image_url: 'https://cdn.example/stickers/s3.webp',
    category: 'amor',
    is_favorite: false,
    use_count: 2,
    created_at: '2026-08-02T10:00:00.000Z',
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
function renderManager(onSend?: (stickerUrl: string) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
  const utils = render(
    <QueryClientProvider client={qc}>
      <StickerManager onSend={onSend} />
    </QueryClientProvider>
  );
  return { qc, invalidateSpy, ...utils };
}

async function renderLoaded(onSend?: (stickerUrl: string) => void) {
  const out = renderManager(onSend);
  await waitFor(() => expect(gridPropsHolder.current).toBeTruthy());
  await waitFor(() => expect(gridPropsHolder.current?.loading).toBe(false));
  return out;
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeFile(name: string, type: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function selectStickerFile(file: File): void {
  fireEvent.change(screen.getByLabelText('Adicionar figurinha compartilhada'), {
    target: { files: [file] },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchStickers.mockResolvedValue(STICKERS);
  mockUploadStickerFile.mockResolvedValue({
    ok: true,
    path: 'sticker_1_abc.webp',
    url: 'https://cdn.example/stickers/sticker_1_abc.webp',
  });
  mockInsertStickerRow.mockResolvedValue({ error: null });
  mockRemoveStickerObject.mockResolvedValue({ error: null });
});

// ── Render + stats ──────────────────────────────────────────────────────────
describe('StickerManager — render e estatísticas', () => {
  it('busca os stickers compartilhados e repassa ao grid', async () => {
    await renderLoaded();

    expect(mockFetchStickers).toHaveBeenCalledTimes(1);
    expect(gridPropsHolder.current?.stickers).toHaveLength(3);
    expect(gridPropsHolder.current?.loading).toBe(false);
    expect(gridPropsHolder.current?.gridSize).toBe('md');
  });

  it('exibe total e favoritas nos badges do header', async () => {
    await renderLoaded();

    expect(screen.getByText('3 figurinhas')).toBeTruthy();
    expect(screen.getByText('⭐ 1')).toBeTruthy();
  });

  it('estado vazio: grid recebe lista vazia sem quebrar', async () => {
    mockFetchStickers.mockResolvedValue([]);
    await renderLoaded();

    expect(gridPropsHolder.current?.stickers).toEqual([]);
    expect(screen.getByText('0 figurinhas')).toBeTruthy();
  });
});

// ── Filtros ─────────────────────────────────────────────────────────────────
describe('StickerManager — filtros', () => {
  it('busca por nome filtra case-insensitive', async () => {
    await renderLoaded();

    fireEvent.change(screen.getByPlaceholderText('Buscar figurinhas...'), {
      target: { value: 'AMOR' },
    });
    await waitFor(() =>
      expect(gridPropsHolder.current?.stickers.map((s) => s.id)).toEqual(['s3'])
    );

    // Sem correspondência → vazio (o grid mostra "Nenhuma figurinha encontrada")
    fireEvent.change(screen.getByPlaceholderText('Buscar figurinhas...'), {
      target: { value: 'zzz' },
    });
    await waitFor(() => expect(gridPropsHolder.current?.stickers).toEqual([]));
    expect(gridPropsHolder.current?.search).toBe('zzz');
  });

  it('filtro por categoria via barra de categorias', async () => {
    await renderLoaded();

    fireEvent.click(screen.getByRole('tab', { name: 'Riso (1)' }));
    await waitFor(() =>
      expect(gridPropsHolder.current?.stickers.map((s) => s.id)).toEqual(['s1'])
    );

    // Segundo clique desliga o filtro
    fireEvent.click(screen.getByRole('tab', { name: 'Riso (1)' }));
    await waitFor(() => expect(gridPropsHolder.current?.stickers).toHaveLength(3));
  });

  it('filtro de favoritas', async () => {
    await renderLoaded();

    fireEvent.click(screen.getByRole('tab', { name: /Favoritas/ }));
    await waitFor(() =>
      expect(gridPropsHolder.current?.stickers.map((s) => s.id)).toEqual(['s1'])
    );
  });

  it('filtros combinam: favoritas + categoria', async () => {
    await renderLoaded();

    fireEvent.click(screen.getByRole('tab', { name: /Favoritas/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'Riso (1)' }));
    await waitFor(() =>
      expect(gridPropsHolder.current?.stickers.map((s) => s.id)).toEqual(['s1'])
    );

    // Favoritas + categoria sem interseção → vazio
    fireEvent.click(screen.getByRole('tab', { name: 'Amor (1)' }));
    await waitFor(() => expect(gridPropsHolder.current?.stickers).toEqual([]));
  });

  it('RECENTES (A7): ordena por created_at do DB, decrescente, sem mexer nos demais filtros', async () => {
    await renderLoaded();

    // s2 (03/08) > s3 (02/08) > s1 (01/08)
    fireEvent.click(screen.getByRole('tab', { name: /Recentes/ }));
    await waitFor(() =>
      expect(gridPropsHolder.current?.stickers.map((s) => s.id)).toEqual(['s2', 's3', 's1'])
    );

    // Desliga → volta à lista completa na ordem original
    fireEvent.click(screen.getByRole('tab', { name: /Recentes/ }));
    await waitFor(() =>
      expect(gridPropsHolder.current?.stickers.map((s) => s.id)).toEqual(['s1', 's2', 's3'])
    );
  });

  it('RECENTES (A7): stickers sem created_at (legados) ficam no fim, ordem estável', async () => {
    const legacy = STICKERS.map((s) => ({ ...s, created_at: null }));
    mockFetchStickers.mockResolvedValue(legacy);
    await renderLoaded();

    fireEvent.click(screen.getByRole('tab', { name: /Recentes/ }));
    await waitFor(() =>
      expect(gridPropsHolder.current?.stickers.map((s) => s.id)).toEqual(['s1', 's2', 's3'])
    );
  });
});

// ── Ações ───────────────────────────────────────────────────────────────────
describe('StickerManager — ações', () => {
  it('onSend: repassa image_url e incrementa use_count', async () => {
    const onSend = vi.fn();
    await renderLoaded(onSend);

    gridPropsHolder.current?.onSend(STICKERS[0]);

    expect(onSend).toHaveBeenCalledWith('https://cdn.example/stickers/s1.webp');
    expect(mockIncrementUseCount).toHaveBeenCalledWith('s1', 5);
  });

  it('onSend com falha de use_count (error field): log.warn honesto, sem unhandled', async () => {
    const onSend = vi.fn();
    await renderLoaded(onSend);
    mockIncrementUseCount.mockResolvedValueOnce({ data: null, error: new Error('db down') });

    gridPropsHolder.current?.onSend(STICKERS[0]);
    await flushMicrotasks();

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('use_count update failed'),
      expect.any(Error)
    );
  });

  it('onSend com rejeição de rede: log.warn, sem unhandled rejection', async () => {
    const onSend = vi.fn();
    await renderLoaded(onSend);
    mockIncrementUseCount.mockRejectedValueOnce(new Error('network down'));

    gridPropsHolder.current?.onSend(STICKERS[0]);
    await flushMicrotasks();

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('use_count update failed'),
      expect.any(Error)
    );
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('toggleFavorite: updateStickerFavorite com valor invertido + invalida query', async () => {
    const { invalidateSpy } = await renderLoaded();

    // s2 não é favorita → true
    gridPropsHolder.current?.onToggleFavorite(
      { stopPropagation: vi.fn() } as unknown as React.SyntheticEvent,
      STICKERS[1]
    );
    await waitFor(() => expect(mockUpdateFavorite).toHaveBeenCalledWith('s2', true));
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['stickers-manager'] })
    );

    // s1 é favorita → false
    gridPropsHolder.current?.onToggleFavorite(
      { stopPropagation: vi.fn() } as unknown as React.SyntheticEvent,
      STICKERS[0]
    );
    await waitFor(() => expect(mockUpdateFavorite).toHaveBeenCalledWith('s1', false));
  });

  it('toggleFavorite com erro do banco: NÃO invalida (erro não é engolido)', async () => {
    const { invalidateSpy } = await renderLoaded();
    mockUpdateFavorite.mockResolvedValueOnce({ data: null, error: new Error('db down') });

    gridPropsHolder.current?.onToggleFavorite(
      { stopPropagation: vi.fn() } as unknown as React.SyntheticEvent,
      STICKERS[1]
    );
    await flushMicrotasks();

    expect(mockUpdateFavorite).toHaveBeenCalledWith('s2', true);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('delete: deleteStickerById + toast de sucesso + invalida query', async () => {
    const { invalidateSpy } = await renderLoaded();

    gridPropsHolder.current?.onDelete(
      { stopPropagation: vi.fn() } as unknown as React.MouseEvent,
      STICKERS[1]
    );
    await waitFor(() => expect(mockDeleteSticker).toHaveBeenCalledWith('s2'));

    expect(mockToast.success).toHaveBeenCalledWith('Figurinha removida');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['stickers-manager'] });
  });

  it('delete com erro do banco: sem toast de sucesso (mutação falha honestamente)', async () => {
    await renderLoaded();
    mockDeleteSticker.mockResolvedValueOnce({ data: null, error: new Error('fk violation') });

    gridPropsHolder.current?.onDelete(
      { stopPropagation: vi.fn() } as unknown as React.MouseEvent,
      STICKERS[1]
    );
    await flushMicrotasks();

    expect(mockDeleteSticker).toHaveBeenCalledWith('s2');
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('updateCategory: updateStickerCategory(id, categoria)', async () => {
    await renderLoaded();

    gridPropsHolder.current?.onCategoryChange(STICKERS[2], 'fofo');
    await waitFor(() => expect(mockUpdateCategory).toHaveBeenCalledWith('s3', 'fofo'));
  });

  it('onAddClick (A8): abre o seletor de arquivos — upload acessível no manager', async () => {
    await renderLoaded();
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});

    gridPropsHolder.current?.onAddClick();

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(mockToast.info).not.toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('botão Adicionar do header abre o seletor de arquivos', async () => {
    await renderLoaded();
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});

    fireEvent.click(screen.getByRole('button', { name: /Adicionar/ }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });
});

// ── Upload de compartilhadas (Etapa 44/A8) ──────────────────────────────────
describe('StickerManager — upload de compartilhadas', () => {
  it('selecionar arquivo → uploadStickerFile (bucket stickers) → preview com URL resolvida', async () => {
    await renderLoaded();
    const file = makeFile('fig.webp', 'image/webp', 10);

    selectStickerFile(file);

    await waitFor(() => expect(previewPropsHolder.current).toBeTruthy());
    expect(mockUploadStickerFile).toHaveBeenCalledWith(file);
    expect(previewPropsHolder.current?.pending.imageUrl).toBe(
      'https://cdn.example/stickers/sticker_1_abc.webp'
    );
    expect(previewPropsHolder.current?.pending.storagePath).toBe('sticker_1_abc.webp');
    expect(previewPropsHolder.current?.pending.name).toBe('fig');
  });

  it('confirmar preview → insertStickerRow + toast de sucesso + invalida query', async () => {
    const { invalidateSpy } = await renderLoaded();
    selectStickerFile(makeFile('fig.webp', 'image/webp', 10));
    await waitFor(() => expect(previewPropsHolder.current).toBeTruthy());

    previewPropsHolder.current?.onConfirm(previewPropsHolder.current.pending);
    await waitFor(() => expect(mockInsertStickerRow).toHaveBeenCalledTimes(1));
    expect(mockInsertStickerRow).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'fig',
        category: 'enviadas',
        imageUrl: 'https://cdn.example/stickers/sticker_1_abc.webp',
      })
    );
    expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('salva'));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['stickers-manager'] });
    expect(previewPropsHolder.current).toBeUndefined();
  });

  it('cancelar preview → removeStickerObject com o path do objeto', async () => {
    await renderLoaded();
    selectStickerFile(makeFile('fig.webp', 'image/webp', 10));
    await waitFor(() => expect(previewPropsHolder.current).toBeTruthy());

    previewPropsHolder.current?.onCancel();
    await flushMicrotasks();

    expect(mockRemoveStickerObject).toHaveBeenCalledWith('sticker_1_abc.webp');
  });

  it('falha de upload (A8/44.5): toast com a MENSAGEM REAL do bucket, sem preview', async () => {
    mockUploadStickerFile.mockResolvedValueOnce({
      ok: false,
      error: 'The resource was not found',
    });
    await renderLoaded();

    selectStickerFile(makeFile('fig.webp', 'image/webp', 10));

    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith('The resource was not found')
    );
    expect(previewPropsHolder.current).toBeUndefined();
    expect(mockInsertStickerRow).not.toHaveBeenCalled();
  });

  it('falha de INSERT (44.5): toast honesto com a causa real', async () => {
    mockInsertStickerRow.mockResolvedValueOnce({ error: 'permission denied for table stickers' });
    await renderLoaded();
    selectStickerFile(makeFile('fig.webp', 'image/webp', 10));
    await waitFor(() => expect(previewPropsHolder.current).toBeTruthy());

    previewPropsHolder.current?.onConfirm(previewPropsHolder.current.pending);
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith(
        'Erro ao salvar figurinha: permission denied for table stickers'
      )
    );
    expect(mockToast.success).not.toHaveBeenCalled();
    // Preview permanece para o usuário tentar de novo
    expect(previewPropsHolder.current).toBeTruthy();
  });
});

// ── Erros honestos da query (Etapa 44.5) ────────────────────────────────────
describe('StickerManager — erros honestos da busca', () => {
  it('falha na busca: banner visível com a MENSAGEM REAL + retry', async () => {
    mockFetchStickers.mockRejectedValueOnce(new Error('db connection refused'));
    renderManager();

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText(/db connection refused/)).toBeTruthy();

    // Retry refaz a busca (agora OK) e o banner some
    fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }));
    await waitFor(() =>
      expect(screen.queryByRole('alert')).toBeNull()
    );
    expect(mockFetchStickers).toHaveBeenCalledTimes(2);
  });
});
