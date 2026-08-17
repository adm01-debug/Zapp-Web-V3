import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type DbResult = { data: unknown; error: unknown };

// ═══════════════════════════════════════════════════════════════════════════
// Teste do fluxo de UPLOAD do usePersonalStickers (pasta pessoal).
//
// Contrato sob teste (wt-g10 / Etapa 44 — stickers):
//   1. upload OK: arquivo válido → supabase.storage.from('stickers').upload()
//      com path `<ownerId>/<uuid>.<ext>` (upsert:false) → insert na tabela
//      `stickers` → toast "Figurinhas adicionadas" → invalida a query
//      ['personal-stickers', ownerId].
//   2. erro bucket HONESTO: falha do storage (ex.: bucket ausente) DEVE
//      chegar ao usuário com a MENSAGEM REAL do erro (err.message), nunca um
//      texto genérico que esconda a causa. Fallback genérico só para erros
//      que não são instância de Error.
//   3. validação antes do upload: não-imagem → toast "Arquivo inválido";
//      > 512KB → toast "Arquivo muito grande"; ambos pulam o arquivo e
//      seguem para o próximo da lista.
// ═══════════════════════════════════════════════════════════════════════════

// ── Mocks ───────────────────────────────────────────────────────────────────
const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
const mockToast = vi.hoisted(() => vi.fn());
const mockUseAuth = vi.hoisted(() => vi.fn());
const mockResolveUrl = vi.hoisted(() => vi.fn());
const mockUpload = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]): Promise<DbResult> => ({
    data: { path: 'owner-1/x.png' },
    error: null,
  }))
);
const mockRemove = vi.hoisted(
  () => vi.fn(async (..._args: unknown[]): Promise<DbResult> => ({ data: null, error: null }))
);
const mockFrom = vi.hoisted(() => vi.fn());
const mockStorageFrom = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]): Promise<DbResult> => ({ data: null, error: null }))
);
const mockUpdateEq = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]): Promise<DbResult> => ({ data: null, error: null }))
);
const mockDeleteEq = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]): Promise<DbResult> => ({ data: null, error: null }))
);

vi.mock('@/lib/logger', () => ({ log: mockLogger }));
vi.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => mockToast(...args),
  useToast: () => ({ toast: mockToast }),
}));
vi.mock('@/features/auth', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@/lib/mediaUrl', () => ({
  resolvePublicStorageUrl: (...args: unknown[]) => mockResolveUrl(...args),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: { from: (...args: unknown[]) => mockStorageFrom(...args) },
  },
}));

import { usePersonalStickers } from '@/hooks/usePersonalStickers';

// ── State compartilhado entre teste e mock ──────────────────────────────────
let selectResult: { data: unknown; error: unknown } = { data: [], error: null };

function makeChain() {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: vi.fn(() => ({ eq: (...args: unknown[]) => mockUpdateEq(...args) })),
    delete: vi.fn(() => ({ eq: (...args: unknown[]) => mockDeleteEq(...args) })),
    then: (
      onfulfilled?: ((value: { data: unknown; error: unknown }) => unknown) | null,
      onrejected?: ((reason: unknown) => unknown) | null
    ) => Promise.resolve(selectResult).then(onfulfilled, onrejected),
  };
  return chain;
}

mockFrom.mockImplementation((_table: string) => makeChain());
mockStorageFrom.mockImplementation((_bucket: string) => ({
  upload: (...args: unknown[]) => mockUpload(...args),
  remove: (...args: unknown[]) => mockRemove(...args),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────
const OWNER_ID = 'owner-1';

function makeFile(name: string, type: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function makeFileList(...files: File[]): FileList {
  return files as unknown as FileList;
}

function createHarness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

async function mountHook() {
  const { qc, wrapper } = createHarness();
  const { result } = renderHook(() => usePersonalStickers(), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  return { qc, result };
}

beforeEach(() => {
  vi.clearAllMocks();
  selectResult = { data: [], error: null };
  mockUseAuth.mockReturnValue({ profile: { id: OWNER_ID, name: 'João' } });
  mockResolveUrl.mockImplementation(
    (bucket: string, path: string) => `https://cdn.example/${bucket}/${path}`
  );
});

// ── UPLOAD OK ───────────────────────────────────────────────────────────────
describe('usePersonalStickers.handleUpload — upload OK', () => {
  it('no-op quando files é null ou vazio (sem chamadas de storage/toast)', async () => {
    const { result } = await mountHook();

    await act(async () => {
      await result.current.handleUpload(null);
      await result.current.handleUpload(makeFileList());
    });

    expect(mockStorageFrom).not.toHaveBeenCalled();
    // Nenhum insert além do select do mount
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('no-op quando não há owner (perfil ausente)', async () => {
    mockUseAuth.mockReturnValue({ profile: null });
    const { result } = await mountHook();

    await act(async () => {
      await result.current.handleUpload(makeFileList(makeFile('foto.png', 'image/png', 10)));
    });

    expect(mockStorageFrom).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('upload OK: grava no bucket "stickers" com path ownerId/uuid.ext e insere a row', async () => {
    const { qc, result } = await mountHook();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const file = makeFile('foto.png', 'image/png', 10);

    await act(async () => {
      await result.current.handleUpload(makeFileList(file));
    });

    // Storage: bucket correto + path `<ownerId>/<uuid>.png` + upsert:false
    expect(mockStorageFrom).toHaveBeenCalledWith('stickers');
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^${OWNER_ID}/[0-9a-f-]{36}\\.png$`)),
      file,
      { contentType: 'image/png', upsert: false }
    );

    // DB: insert com os campos esperados e image_url resolvida
    expect(mockResolveUrl).toHaveBeenCalledWith(
      'stickers',
      expect.stringMatching(new RegExp(`^${OWNER_ID}/[0-9a-f-]{36}\\.png$`))
    );
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_id: OWNER_ID,
        name: 'foto',
        category: 'pessoal',
        is_favorite: false,
        use_count: 0,
        image_url: expect.stringMatching(
          new RegExp(`^https://cdn\\.example/stickers/${OWNER_ID}/[0-9a-f-]{36}\\.png$`)
        ),
      })
    );

    // Feedback + invalidação da query pessoal
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Figurinhas adicionadas' })
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['personal-stickers', OWNER_ID],
    });

    // Estado final: uploading desligado
    expect(result.current.uploading).toBe(false);
  });

  it('upload OK com múltiplos arquivos: 1 upload + 1 insert por arquivo', async () => {
    const { result } = await mountHook();
    const f1 = makeFile('a.png', 'image/png', 10);
    const f2 = makeFile('b.webp', 'image/webp', 20);

    await act(async () => {
      await result.current.handleUpload(makeFileList(f1, f2));
    });

    expect(mockUpload).toHaveBeenCalledTimes(2);
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Figurinhas adicionadas' })
    );
    expect(result.current.uploading).toBe(false);
  });

  it('uploading fica true durante o upload e volta a false no fim', async () => {
    const { result } = await mountHook();
    let resolveUpload: ((v: DbResult) => void) | undefined;
    mockUpload.mockImplementationOnce(
      () =>
        new Promise<DbResult>((resolve) => {
          resolveUpload = resolve;
        })
    );
    const file = makeFile('foto.png', 'image/png', 10);

    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.handleUpload(makeFileList(file));
    });
    expect(result.current.uploading).toBe(true);

    await act(async () => {
      resolveUpload?.({ data: { path: 'owner-1/x.png' }, error: null });
      await pending;
    });
    expect(result.current.uploading).toBe(false);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('limpa o value do fileInputRef após o upload', async () => {
    const { result } = await mountHook();
    (result.current.fileInputRef as { current: HTMLInputElement | null }).current = {
      value: 'C:\\fakepath\\foto.png',
    } as HTMLInputElement;

    await act(async () => {
      await result.current.handleUpload(makeFileList(makeFile('foto.png', 'image/png', 10)));
    });

    expect(result.current.fileInputRef.current?.value).toBe('');
  });
});

// ── VALIDAÇÃO ───────────────────────────────────────────────────────────────
describe('usePersonalStickers.handleUpload — validação de arquivo', () => {
  it('arquivo não-imagem: toast "Arquivo inválido" e NENHUM upload para ele', async () => {
    const { result } = await mountHook();
    const textFile = makeFile('nota.txt', 'text/plain', 10);

    await act(async () => {
      await result.current.handleUpload(makeFileList(textFile));
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Arquivo inválido',
        description: 'nota.txt não é uma imagem.',
        variant: 'destructive',
      })
    );
    expect(mockStorageFrom).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    // CONTRATO (hoje RED): com TODOS os arquivos rejeitados, o toast de sucesso
    // "Figurinhas adicionadas / Upload concluído." NÃO deve aparecer — ele
    // roda incondicionalmente após o loop. Fix esperado: disparar o toast de
    // sucesso apenas se ao menos UM arquivo foi enviado (honestidade do
    // feedback, Etapa 44.5).
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Figurinhas adicionadas' })
    );
  });

  it('arquivo > 512KB: toast "Arquivo muito grande" e NENHUM upload para ele', async () => {
    const { result } = await mountHook();
    const bigFile = makeFile('grande.png', 'image/png', 600 * 1024);

    await act(async () => {
      await result.current.handleUpload(makeFileList(bigFile));
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Arquivo muito grande',
        description: 'grande.png excede 512KB.',
        variant: 'destructive',
      })
    );
    expect(mockStorageFrom).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('arquivo inválido + válido na mesma lista: inválido é pulado, válido é enviado', async () => {
    const { result } = await mountHook();
    const textFile = makeFile('nota.txt', 'text/plain', 10);
    const imgFile = makeFile('foto.png', 'image/png', 10);

    await act(async () => {
      await result.current.handleUpload(makeFileList(textFile, imgFile));
    });

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ name: 'foto' }));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Figurinhas adicionadas' })
    );
  });
});

// ── ERRO BUCKET HONESTO ─────────────────────────────────────────────────────
describe('usePersonalStickers.handleUpload — erro bucket HONESTO', () => {
  it('falha do storage com Error real: toast destrutivo com a MENSAGEM REAL do bucket', async () => {
    const { result } = await mountHook();
    const bucketError = new Error('The resource was not found'); // bucket ausente/404
    mockUpload.mockResolvedValueOnce({ data: null, error: bucketError });

    await act(async () => {
      await result.current.handleUpload(
        makeFileList(makeFile('foto.png', 'image/png', 10))
      );
    });

    // A causa real (ex.: bucket "stickers" não existe) chega ao usuário — NUNCA
    // um texto genérico que esconda o diagnóstico.
    expect(mockToast).toHaveBeenCalledWith({
      title: 'Erro no upload',
      description: 'The resource was not found',
      variant: 'destructive',
    });
    expect(mockLogger.error).toHaveBeenCalledWith('Sticker upload failed:', bucketError);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(result.current.uploading).toBe(false);
  });

  it('falha do storage com StorageError (subclasse de Error): mensagem real preservada', async () => {
    const { result } = await mountHook();
    class StorageError extends Error {}
    const bucketError = new StorageError('Bucket not found');
    mockUpload.mockResolvedValueOnce({ data: null, error: bucketError });

    await act(async () => {
      await result.current.handleUpload(makeFileList(makeFile('foto.png', 'image/png', 10)));
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Erro no upload',
        description: 'Bucket not found',
        variant: 'destructive',
      })
    );
  });

  it('erro de INSERT com Error real: toast com a mensagem real (sem esconder causa)', async () => {
    const { result } = await mountHook();
    const insertError = new Error('permission denied for table stickers');
    mockInsert.mockResolvedValueOnce({ data: null, error: insertError });

    await act(async () => {
      await result.current.handleUpload(makeFileList(makeFile('foto.png', 'image/png', 10)));
    });

    expect(mockUpload).toHaveBeenCalledTimes(1); // storage OK
    expect(mockToast).toHaveBeenCalledWith({
      title: 'Erro no upload',
      description: 'permission denied for table stickers',
      variant: 'destructive',
    });
    expect(mockLogger.error).toHaveBeenCalled();
    expect(result.current.uploading).toBe(false);
  });

  it('erro que NÃO é instância de Error: fallback genérico documentado', async () => {
    const { result } = await mountHook();
    // Objeto puro (ex.: resposta de proxy que não preserva a cadeia Error).
    mockUpload.mockResolvedValueOnce({ data: null, error: { message: 'raw' } });

    await act(async () => {
      await result.current.handleUpload(makeFileList(makeFile('foto.png', 'image/png', 10)));
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: 'Erro no upload',
      description: 'Falha ao enviar figurinhas.',
      variant: 'destructive',
    });
    expect(mockInsert).not.toHaveBeenCalled();
    expect(result.current.uploading).toBe(false);
  });

  it('após erro, o estado uploading volta a false e o próximo upload funciona', async () => {
    const { result } = await mountHook();
    mockUpload.mockResolvedValueOnce({ data: null, error: new Error('bucket down') });

    await act(async () => {
      await result.current.handleUpload(makeFileList(makeFile('a.png', 'image/png', 10)));
    });
    expect(result.current.uploading).toBe(false);

    // Segunda tentativa com o bucket OK
    await act(async () => {
      await result.current.handleUpload(makeFileList(makeFile('b.png', 'image/png', 10)));
    });
    expect(mockUpload).toHaveBeenCalledTimes(2);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Figurinhas adicionadas' })
    );
  });
});
