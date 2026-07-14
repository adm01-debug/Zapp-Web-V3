// Re-export from consolidated useOmnichannelManagement module (ETAPA 22 consolidation)
import { useOmnichannelChannelsManagement } from './useOmnichannelManagement';
import type {
  UseOmnichannelChannelsParams,
  UseOmnichannelChannelsResult,
  ChannelType,
  OmnichannelChannel,
} from './useOmnichannelManagement';

/** Hook for managing omnichannel communication channels across multiple platforms. */
export { useOmnichannelChannelsManagement as useOmnichannelChannels };
export type {
  UseOmnichannelChannelsParams,
  UseOmnichannelChannelsResult,
  ChannelType,
  OmnichannelChannel,
};
