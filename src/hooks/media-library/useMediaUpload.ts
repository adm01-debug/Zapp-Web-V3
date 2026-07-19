// Re-export from consolidated useMediaLibraryManagement module (ETAPA 21 consolidation)
import { useMediaUploadManagement } from './useMediaLibraryManagement';
import type { UseMediaUploadResult } from './useMediaLibraryManagement';
import type { MediaType } from './useMediaLibraryTypes';

/** Hook: use Media Upload. */
export function useMediaUpload(type: MediaType, onComplete: () => void): UseMediaUploadResult {
  return useMediaUploadManagement({ type, onComplete });
}

export type { UseMediaUploadResult };
