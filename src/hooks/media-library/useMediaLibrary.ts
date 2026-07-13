// Re-export from consolidated useMediaLibraryManagement module (ETAPA 21 consolidation)
import { useMediaCrudManagement } from './useMediaLibraryManagement';
import type { UseMediaCrudParams, UseMediaCrudResult } from './useMediaLibraryManagement';

export { useMediaCrudManagement as useMediaLibrary };
export type { UseMediaCrudParams, UseMediaCrudResult };
