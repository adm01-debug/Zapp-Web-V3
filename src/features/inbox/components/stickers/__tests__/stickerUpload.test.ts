import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// Testes do helper canônico de upload de figurinhas — wt-g10 / Etapa 44 (A8).
//
// Contrato sob teste:
//   - validateStickerFile: tipo não-imagem, tipo fora da allowlist do bucket
//     (jpeg é REJEITADO pelo bucket `stickers` em produção), tamanho > 500KB.
//   - uploadStickerFile: SEMPRE para o bucket `stickers` (nunca whatsapp-media),
//     path `sticker_<ts>_<uuid>.<ext>`, URL resolvida via getSignedMediaUrl.
//   - Erros honestos (Etapa 44.5): a MENSAGEM REAL do storage chega ao caller;
//     falha de resolução de URL limpa o objeto órfão.
//   - insertStickerRow / removeStickerObject: erros reais propagados.
// ═══════════════════════════════════════════════════════════════════════════

const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
const mockUpload = vi.hoisted(() =>
  vi.fn((..._a: unknown[]) => Promise.resolve({ data: null as { path: string } | null, error: null as Error | null }))
);
const mockRemove = vi.hoisted(() => vi.fn((..._a: unknown[]) => Promise.resolve({ error: null as Error | null })));
const mockFrom = vi.hoisted(() => vi.fn());
const mockStorageFrom = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() =>
  vi.fn((..._a: unknown[]) => Promise.resolve({ data: null, error: null as Error | null }))
);
const mockGetSignedMediaUrl = vi.hoisted(() => vi.fn());

vi.mock('@/lib/logger', () => ({ getLogger: () => mockLogger }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: { from: (...args: unknown[]) => mockStorageFrom(...args) },
  },
}));
vi.mock('@/lib/storageSignedUrls', () => ({
  getSignedMediaUrl: (...args: unknown[]) => mockGetSignedMediaUrl(...args),
}));

import {
  STICKER_BUCKET,
  MAX_STICKER_SIZE,
  ACCEPTED_STICKER_TYPES,
  validateStickerFile,
  uploadStickerFile,
  insertStickerRow,
  removeStickerObject,
} from '../stickerUpload';

// ── Setup ───────────────────────────────────────────────────────────────────
function makeFile(name: string, type: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockImplementation(() => ({ insert: (...a: unknown[]) => mockInsert(...a) }));
  mockStorageFrom.mockImplementation(() => ({
    upload: (...a: unknown[]) => mockUpload(...a),
    remove: (...a: unknown[]) => mockRemove(...a),
  }));
  mockGetSignedMediaUrl.mockResolvedValue(
    'https://supabase.atomicabr.com.br/storage/v1/object/public/stickers/sticker_1_x.webp'
  );
});

// ── Constantes ──────────────────────────────────────────────────────────────
describe('stickerUpload — constantes', () => {
  it('bucket canônico é "stickers" (correção A8: nunca whatsapp-media)', () => {
    expect(STICKER_BUCKET).toBe('stickers');
  });

  it('allowlist alinhada ao bucket real: webp/gif/png (jpeg fora)', () => {
    expect(ACCEPTED_STICKER_TYPES).toEqual(['image/webp', 'image/gif', 'image/png']);
    expect(ACCEPTED_STICKER_TYPES).not.toContain('image/jpeg');
  });

  it('guarda de tamanho é 500KB', () => {
    expect(MAX_STICKER_SIZE).toBe(500 * 1024);
  });
});

// ── validateStickerFile ─────────────────────────────────────────────────────
describe('validateStickerFile', () => {
  it('arquivo não-imagem → erro honesto com nome do arquivo', () => {
    expect(validateStickerFile(makeFile('nota.txt', 'text/plain', 10))).toBe(
      '"nota.txt" não é uma imagem.'
    );
  });

  it('tipo fora da allowlist do bucket (jpeg) → erro com o motivo real', () => {
    const msg = validateStickerFile(makeFile('foto.jpg', 'image/jpeg', 10));
    expect(msg).toContain('image/jpeg');
    expect(msg).toContain('PNG, WEBP ou GIF');
  });

  it('arquivo > 500KB → erro de tamanho', () => {
    expect(
      validateStickerFile(makeFile('grande.png', 'image/png', 600 * 1024))
    ).toContain('excede 500KB');
  });

  it('arquivos válidos (webp/gif/png, ≤500KB) → null', () => {
    expect(validateStickerFile(makeFile('a.webp', 'image/webp', 100))).toBeNull();
    expect(validateStickerFile(makeFile('b.gif', 'image/gif', 100))).toBeNull();
    expect(validateStickerFile(makeFile('c.png', 'image/png', MAX_STICKER_SIZE))).toBeNull();
  });
});

// ── uploadStickerFile ───────────────────────────────────────────────────────
describe('uploadStickerFile', () => {
  it('upload OK: bucket "stickers" + path sticker_<ts>_<uuid>.<ext> + URL via helper canônico', async () => {
    const result = await uploadStickerFile(makeFile('figurinha.webp', 'image/webp', 10));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mockStorageFrom).toHaveBeenCalledWith('stickers');
    const [path, file, options] = mockUpload.mock.calls[0] as unknown as [
      string,
      File,
      { contentType: string; cacheControl: string }
    ];
    expect(path).toMatch(/^sticker_\d+_[0-9a-f-]{36}\.webp$/);
    expect(file.type).toBe('image/webp');
    expect(options).toEqual({ contentType: 'image/webp', cacheControl: '31536000' });
    expect(mockGetSignedMediaUrl).toHaveBeenCalledWith('stickers', path, 604800);
    expect(result.url).toContain('/stickers/');
  });

  it('validação falha (jpeg): NENHUMA chamada de storage, erro honesto', async () => {
    const result = await uploadStickerFile(makeFile('foto.jpg', 'image/jpeg', 10));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('PNG, WEBP ou GIF');
    expect(mockStorageFrom).not.toHaveBeenCalled();
  });

  it('erro do bucket: a MENSAGEM REAL chega ao caller (nunca texto genérico)', async () => {
    mockUpload.mockResolvedValueOnce({ data: null, error: new Error('Bucket not found') });

    const result = await uploadStickerFile(makeFile('fig.webp', 'image/webp', 10));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('Bucket not found');
  });

  it('falha de rede (exceção): mensagem real propagada', async () => {
    mockUpload.mockRejectedValueOnce(new Error('network down'));

    const result = await uploadStickerFile(makeFile('fig.webp', 'image/webp', 10));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('network down');
  });

  it('falha na resolução da URL: remove o objeto órfão + erro honesto', async () => {
    mockGetSignedMediaUrl.mockResolvedValueOnce(null);

    const result = await uploadStickerFile(makeFile('fig.webp', 'image/webp', 10));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('resolver a URL');
    // O objeto gravado não pode ficar órfão no bucket
    expect(mockRemove).toHaveBeenCalledWith([expect.stringMatching(/^sticker_/)] as unknown as string[]);
  });
});

// ── insertStickerRow / removeStickerObject ──────────────────────────────────
describe('insertStickerRow / removeStickerObject', () => {
  it('insert OK: grava na tabela stickers com os campos do contrato', async () => {
    const { error } = await insertStickerRow({
      name: 'fig',
      imageUrl: 'https://cdn.example/stickers/x.webp',
      category: 'enviadas',
      uploadedBy: 'user-1',
    });

    expect(error).toBeNull();
    expect(mockFrom).toHaveBeenCalledWith('stickers');
    expect(mockInsert).toHaveBeenCalledWith({
      name: 'fig',
      image_url: 'https://cdn.example/stickers/x.webp',
      category: 'enviadas',
      is_favorite: false,
      use_count: 0,
      uploaded_by: 'user-1',
    });
  });

  it('insert com erro do DB: mensagem real propagada', async () => {
    mockInsert.mockResolvedValueOnce({ data: null, error: new Error('permission denied') });

    const { error } = await insertStickerRow({
      name: 'fig',
      imageUrl: 'https://cdn.example/stickers/x.webp',
      category: 'enviadas',
    });

    expect(error).toBe('permission denied');
  });

  it('removeStickerObject: chama o bucket stickers com o path', async () => {
    const { error } = await removeStickerObject('sticker_1_x.webp');

    expect(error).toBeNull();
    expect(mockStorageFrom).toHaveBeenCalledWith('stickers');
    expect(mockRemove).toHaveBeenCalledWith(['sticker_1_x.webp']);
  });

  it('removeStickerObject com erro: mensagem real propagada', async () => {
    mockRemove.mockResolvedValueOnce({ error: new Error('object not found') });

    const { error } = await removeStickerObject('sticker_1_x.webp');

    expect(error).toBe('object not found');
  });
});
