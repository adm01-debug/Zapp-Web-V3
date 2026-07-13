// Re-export from consolidated useUIInteractionManagement module (ETAPA 32 consolidation)
import { useDeviceDetectionManagement, type UserDevice, type UserSession } from '@/hooks/useUIInteractionManagement';

export type { UserDevice, UserSession };

export function useDeviceDetection() {
  return useDeviceDetectionManagement();
}
