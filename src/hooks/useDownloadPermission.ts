// Re-export from consolidated useMediaManagement module (ETAPA 40 consolidation)
import { useDownloadPermissionManagement } from '@/hooks/useMediaManagement';

export function useDownloadPermission(resourceId?: string) {
  return useDownloadPermissionManagement(resourceId);
}
