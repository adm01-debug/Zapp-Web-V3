// Re-export from consolidated useAdminManagement module (ETAPA 19 consolidation)
import { useAdminManagement } from '@/features/admin/hooks/useAdminManagement';

export {
  type ServiceChannel,
  type ChannelStatus,
  type QueueOption,
  type WppConnOption,
} from '@/features/admin/hooks/useAdminManagement';

export function useAdminChannels(statusFilter: string, search: string) {
  const admin = useAdminManagement({ channelStatusFilter: statusFilter, channelSearch: search });
  return {
    channels: admin.channels,
    filteredChannels: admin.filteredChannels,
    queues: admin.channelQueues,
    wppConns: admin.channelWppConns,
    loading: admin.channelsLoading,
    load: admin.loadChannels,
    save: admin.saveChannel,
    runAction: admin.runChannelAction,
    reactivate: admin.reactivateChannel,
  };
}
