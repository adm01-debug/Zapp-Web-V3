// Re-export from consolidated useConnectionsManagement module (ETAPA 24 consolidation)
import { useBridgeHealthManagement } from './useConnectionsManagement';
import type { UseBridgeHealthParams, UseBridgeHealthResult } from './useConnectionsManagement';

/** Hook: use Bridge Health. */
export { useBridgeHealthManagement as useBridgeHealth };
export type { UseBridgeHealthParams, UseBridgeHealthResult };
