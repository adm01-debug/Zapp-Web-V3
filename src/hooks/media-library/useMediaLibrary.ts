// Re-export from consolidated useMediaLibraryManagement module (ETAPA 21 consolidation)
import { useMediaCrudManagement } from './useMediaLibraryManagement';
import type { UseMediaCrudResult } from './useMediaLibraryManagement';

/** Re-exported module members. */
export { useMediaCrudManagement as useMediaLibrary };
/** Re-exported module members. */
export type { UseMediaCrudParams, UseMediaCrudResult };

// Re-export utilitários puros para testabilidade
/** Re-exported module members. */
export {
  getCategoriesForType,
  getUrlField,
  getBucket,
  extractStoragePath,
  STICKER_CATEGORIES,
  AUDIO_CATEGORIES,
  EMOJI_CATEGORIES,
} from './useMediaLibraryTypes';

/** Re-exported module members. */
export type { MediaItem, MediaType } from './useMediaLibraryTypes';

/** Hook: MAX_UPLOAD_SIZE_MB. */
export const MAX_UPLOAD_SIZE_MB = 10;
/** Hook: MAX_UPLOAD_SIZE_BYTES. */
export const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
