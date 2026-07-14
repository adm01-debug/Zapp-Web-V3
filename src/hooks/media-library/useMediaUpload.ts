// Re-export from consolidated useMediaLibraryManagement module (ETAPA 21 consolidation)
import {
  useMediaUploadManagement,
  type UseMediaUploadParams,
  type UseMediaUploadResult,
} from './useMediaLibraryManagement';

/** Hook for handling media file uploads with progress tracking. */
export { useMediaUploadManagement as useMediaUpload };
export type { UseMediaUploadParams, UseMediaUploadResult };
