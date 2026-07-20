import { supabase } from '@/integrations/supabase/client';

export async function fetchStickers() {
  const { data } = await supabase
    .from('stickers')
    .select('*')
    .order('use_count', { ascending: false });
  return data ?? [];
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
