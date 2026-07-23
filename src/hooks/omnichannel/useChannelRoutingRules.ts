// Re-export from consolidated useOmnichannelManagement module (ETAPA 22 consolidation)
import { useChannelRoutingRulesManagement } from './useOmnichannelManagement';
import type {
  UseChannelRoutingRulesParams,
  UseChannelRoutingRulesResult,
  NewRoutingRule,
  RoutingRule,
} from './useOmnichannelManagement';

/** Hook: use Channel Routing Rules. */
export { useChannelRoutingRulesManagement as useChannelRoutingRules };
export type { UseChannelRoutingRulesParams, UseChannelRoutingRulesResult, NewRoutingRule, RoutingRule };
