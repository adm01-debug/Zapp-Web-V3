// Re-export from consolidated useConnectionsManagement module (ETAPA 24 consolidation)
import {
  useBridgeHealthManagement,
  type UseBridgeHealthParams,
  type UseBridgeHealthResult,
} from './useConnectionsManagement';

/** Hook for monitoring connection bridge health and status. */
export { useBridgeHealthManagement as useBridgeHealth };
export type { UseBridgeHealthParams, UseBridgeHealthResult };
