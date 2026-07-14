export interface MediaItem {
  id: string;
  name: string;
  category: string;
  is_favorite: boolean;
  use_count: number;
  created_at: string;
  uploaded_by: string | null;
  image_url?: string;
  audio_url?: string;
  duration_seconds?: number | null;
}

export type MediaType = 'stickers' | 'audio_memes' | 'custom_emojis';

export const MAX_UPLOAD_SIZE_MB = 10;
export const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

export const STICKER_CATEGORIES: Record<string, string> = {
  memes: '😂',
  reações: '👍',
  amor: '❤️',
  festas: '🎉',
  animais: '🐱',
  comida: '🍕',
  esportes: '⚽',
  trabalho: '💼',
  outros: '📦',
};

export const AUDIO_CATEGORIES: Record<string, string> = {
  risadas: '😂',
  bordões: '🎤',
  efeitos: '💥',
  músicas: '🎵',
  memes: '🤣',
  narração: '📢',
  animais: '🐶',
  outros: '📦',
};

export const EMOJI_CATEGORIES: Record<string, string> = {
  custom: '⭐',
  team: '👥',
  brand: '🏢',
  fun: '🎮',
  outros: '📦',
};

/** Returns category emoji map for the specified media type. */
export function getCategoriesForType(type: MediaType): Record<string, string> {
  switch (type) {
    case 'stickers':
      return STICKER_CATEGORIES;
    case 'audio_memes':
      return AUDIO_CATEGORIES;
    case 'custom_emojis':
      return EMOJI_CATEGORIES;
  }
}

/** Returns the appropriate URL field name for the media type. */
export function getUrlField(type: MediaType): 'image_url' | 'audio_url' {
  return type === 'audio_memes' ? 'audio_url' : 'image_url';
}

/** Returns the storage bucket name for the media type. */
export function getBucket(type: MediaType): string {
  switch (type) {
    case 'stickers':
      return 'stickers';
    case 'audio_memes':
      return 'audio-memes';
    case 'custom_emojis':
      return 'custom-emojis';
  }
}

/** Extracts storage bucket and path from Supabase storage URL, returns null if extraction fails. */
export function extractStoragePath(
  url: string,
  bucket: string
): { bucket: string; path: string } | null {
  try {
    const u = new URL(url);
    const patterns = [
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
      `/storage/v1/render/image/public/${bucket}/`,
    ];
    for (const pattern of patterns) {
      const idx = u.pathname.indexOf(pattern);
      if (idx !== -1) {
        let path = u.pathname.substring(idx + pattern.length);
        path = decodeURIComponent(path);
        return { bucket, path };
      }
    }
    return null;
  } catch {
    return null;
  }
}
