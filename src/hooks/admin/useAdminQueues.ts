// Re-export from consolidated useAdminManagement module (ETAPA 19 consolidation)
import { useAdminManagement } from '@/features/admin/hooks/useAdminManagement';

export {
  ALGO_LABEL,
  type Queue,
  type QueueStatus,
  type DistAlgo,
  type QueueMember,
  type QueueSkill,
  type Profile,
  type QueueDepartment,
  type QueueServiceChannel,
  type ChannelQueue,
} from '@/features/admin/hooks/useAdminManagement';

export function useAdminQueues() {
  const admin = useAdminManagement();
  return {
    queues: admin.queues,
    members: admin.queueMembers,
    skills: admin.queueSkills,
    departments: admin.queueDepartments,
    channels: admin.queueChannels,
    channelQueues: admin.channelQueuesData,
    profiles: admin.profiles,
    loading: admin.queuesLoading,
    load: admin.loadQueues,
    save: admin.saveQueue,
    remove: admin.removeQueue,
  };
}