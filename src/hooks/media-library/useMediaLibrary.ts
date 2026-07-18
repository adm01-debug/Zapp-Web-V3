// Re-export from consolidated useMediaLibraryManagement module (ETAPA 21 consolidation)
import { useMediaCrudManagement } from './useMediaLibraryManagement';
import type { UseMediaCrudResult } from './useMediaLibraryManagement';
import type { MediaType } from './useMediaLibraryTypes';

export function useMediaLibrary(type: MediaType): UseMediaCrudResult {
  return useMediaCrudManagement({ type });
}

export type { UseMediaCrudResult };

// Re-export utility functions and constants so consumers can import from this barrel file
export {
  getCategoriesForType,
  getUrlField,
  getBucket,
  extractStoragePath,
  STICKER_CATEGORIES,
  AUDIO_CATEGORIES,
  EMOJI_CATEGORIES,
  MAX_UPLOAD_SIZE_MB,
  MAX_UPLOAD_SIZE_BYTES,
} from './useMediaLibraryTypes';
export type { MediaItem, MediaType } from './useMediaLibraryTypes';
