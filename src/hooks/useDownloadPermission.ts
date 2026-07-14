// Re-export from consolidated useMediaManagement module (ETAPA 40 consolidation)
import { useDownloadPermissionManagement } from '@/hooks/useMediaManagement';

/** Hook for checking and managing download permissions for media resources. */
export function useDownloadPermission(resourceId?: string) {
  return useDownloadPermissionManagement(resourceId);
}
