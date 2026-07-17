// Re-export from consolidated useMediaLibraryManagement module (ETAPA 21 consolidation)
import { useMediaCrudManagement } from './useMediaLibraryManagement';
import type { UseMediaCrudParams, UseMediaCrudResult } from './useMediaLibraryManagement';

export { useMediaCrudManagement as useMediaLibrary };
export type { UseMediaCrudParams, UseMediaCrudResult };

// Re-export utilitários puros para testabilidade
export {
  getCategoriesForType,
  getUrlField,
  getBucket,
  extractStoragePath,
  STICKER_CATEGORIES,
  AUDIO_CATEGORIES,
  EMOJI_CATEGORIES,
} from './useMediaLibraryTypes';

export type { MediaItem, MediaType } from './useMediaLibraryTypes';

export const MAX_UPLOAD_SIZE_MB = 10;
export const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
