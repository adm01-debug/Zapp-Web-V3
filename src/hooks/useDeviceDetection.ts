// Re-export from consolidated useUIInteractionManagement module (ETAPA 32 consolidation)
import {
  useDeviceDetectionManagement,
  type UserDevice,
  type UserSession,
} from '@/hooks/useUIInteractionManagement';

export type { UserDevice, UserSession };

/** Detects and provides information about the current device and user session. */
export function useDeviceDetection() {
  return useDeviceDetectionManagement();
}
