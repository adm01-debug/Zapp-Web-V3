import { supabase } from '@/integrations/supabase/client';
import { mapStickerRow, type StickerItem } from '@/features/inbox/components/stickers/StickerTypes';

/**
 * Busca as figurinhas compartilhadas no DB real (ordenadas por uso).
 *
 * Erros HONESTOS (Etapa 44): em falha de query o erro é LANÇADO para o
 * React Query (estado `isError` visível na UI) — nunca retorna [] silencioso
 * que simula "não há figurinhas".
 */
export async function fetchStickers(): Promise<StickerItem[]> {
  const { data, error } = await supabase
    .from('stickers')
    .select('*')
    .order('use_count', { ascending: false });

  if (error) throw error;

  const validated = (data ?? []).map(mapStickerRow).filter((s): s is StickerItem => s !== null);
  return validated;
}

export async function updateStickerFavorite(id: string, isFavorite: boolean) {
  return supabase.from('stickers').update({ is_favorite: isFavorite }).eq('id', id);
}

export async function deleteStickerById(id: string) {
  return supabase.from('stickers').delete().eq('id', id);
}

export async function updateStickerCategory(id: string, category: string) {
  return supabase.from('stickers').update({ category }).eq('id', id);
}

export async function incrementStickerUseCount(id: string, currentCount: number) {
  return supabase
    .from('stickers')
    .update({ use_count: currentCount + 1 })
    .eq('id', id);
}
