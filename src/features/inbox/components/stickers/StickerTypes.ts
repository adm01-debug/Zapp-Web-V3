/** Sticker Item component for the stickers section. */
export interface StickerItem {
  id: string;
  name: string | null;
  image_url: string;
  category: string;
  is_favorite: boolean;
  use_count: number;
  owner_id?: string | null;
  /** Fonte real de recência (Etapa 44/A7): ordenação por created_at do DB. */
  created_at?: string | null;
}

/** Quantos stickers o filtro "Recentes" exibe (Etapa 44/A7). */
export const RECENT_STICKERS_LIMIT = 8;

/**
 * Valida em runtime uma row crua da tabela `stickers` (via PostgREST) e a
 * normaliza para StickerItem. Retorna null se a row não tem os campos mínimos
 * (id + image_url) — em vez de um cast `as StickerItem[]` inseguro.
 */
export function mapStickerRow(row: unknown): StickerItem | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.image_url !== 'string') return null;
  return {
    id: r.id,
    name: typeof r.name === 'string' ? r.name : null,
    image_url: r.image_url,
    category: typeof r.category === 'string' ? r.category : 'outros',
    is_favorite: r.is_favorite === true,
    use_count: typeof r.use_count === 'number' ? r.use_count : 0,
    owner_id: typeof r.owner_id === 'string' ? r.owner_id : null,
    created_at: typeof r.created_at === 'string' ? r.created_at : null,
  };
}

/**
 * Ordenação ESTÁVEL por recência real (created_at do DB, decrescente).
 * Stickers sem created_at (dados legados) ficam no fim, preservando a ordem
 * relativa original entre eles.
 */
export function sortStickersByRecent(stickers: StickerItem[]): StickerItem[] {
  return [...stickers].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : Number.NEGATIVE_INFINITY;
    const tb = b.created_at ? new Date(b.created_at).getTime() : Number.NEGATIVE_INFINITY;
    return tb - ta;
  });
}

/** CATEGORY_LABELS component for the stickers section. */
export const CATEGORY_LABELS: Record<string, { emoji: string; label: string }> = {
  'pessoal': { emoji: '📸', label: 'Pessoal' },
  'comemoração': { emoji: '🎉', label: 'Comemoração' },
  'riso': { emoji: '😂', label: 'Riso' },
  'chorando': { emoji: '😢', label: 'Chorando' },
  'amor': { emoji: '❤️', label: 'Amor' },
  'raiva': { emoji: '😡', label: 'Raiva' },
  'surpresa': { emoji: '😲', label: 'Surpresa' },
  'pensativo': { emoji: '🤔', label: 'Pensativo' },
  'cumprimento': { emoji: '👋', label: 'Cumprimento' },
  'despedida': { emoji: '👋', label: 'Despedida' },
  'concordância': { emoji: '👍', label: 'Concordância' },
  'negação': { emoji: '🙅', label: 'Negação' },
  'sono': { emoji: '😴', label: 'Sono' },
  'fome': { emoji: '🍔', label: 'Fome' },
  'medo': { emoji: '😨', label: 'Medo' },
  'vergonha': { emoji: '🙈', label: 'Vergonha' },
  'deboche': { emoji: '😏', label: 'Deboche' },
  'fofo': { emoji: '🥰', label: 'Fofo' },
  'triste': { emoji: '😔', label: 'Triste' },
  'animado': { emoji: '🤩', label: 'Animado' },
  'engraçado': { emoji: '🤣', label: 'Engraçado' },
  'outros': { emoji: '📦', label: 'Outros' },
  'recebidas': { emoji: '📥', label: 'Recebidas' },
  'enviadas': { emoji: '📤', label: 'Enviadas' },
};

/** ALL_CATEGORIES component for the stickers section. */
export const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS);

/** Pending Upload component for the stickers section. */
export interface PendingUpload {
  file: File;
  imageUrl: string;
  storagePath: string;
  aiCategory: string;
  selectedCategory: string;
  name: string;
}
