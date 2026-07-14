// Re-export from consolidated useConnectionsManagement module (ETAPA 24 consolidation)
import { useBridgeHealthManagement } from './useConnectionsManagement';
import type { UseBridgeHealthParams, UseBridgeHealthResult } from './useConnectionsManagement';

export { useBridgeHealthManagement as useBridgeHealth };
export type { UseBridgeHealthParams, UseBridgeHealthResult };
