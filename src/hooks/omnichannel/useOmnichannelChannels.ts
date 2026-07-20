// Re-export from consolidated useOmnichannelManagement module (ETAPA 22 consolidation)
import { useOmnichannelChannelsManagement } from './useOmnichannelManagement';
import type {
  UseOmnichannelChannelsParams,
  UseOmnichannelChannelsResult,
  ChannelType,
  OmnichannelChannel,
} from './useOmnichannelManagement';

/** Hook: use Omnichannel Channels. */
export { useOmnichannelChannelsManagement as useOmnichannelChannels };
export type { UseOmnichannelChannelsParams, UseOmnichannelChannelsResult, ChannelType, OmnichannelChannel };
