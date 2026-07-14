// Re-export from consolidated useOmnichannelManagement module (ETAPA 22 consolidation)
import { useChannelRoutingRulesManagement } from './useOmnichannelManagement';
import type {
  UseChannelRoutingRulesParams,
  UseChannelRoutingRulesResult,
  NewRoutingRule,
  RoutingRule,
} from './useOmnichannelManagement';

/** Hook for managing channel routing rules and message queue distribution. */
export { useChannelRoutingRulesManagement as useChannelRoutingRules };
export type {
  UseChannelRoutingRulesParams,
  UseChannelRoutingRulesResult,
  NewRoutingRule,
  RoutingRule,
};
