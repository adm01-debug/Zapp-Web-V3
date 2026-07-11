import { agentRepository, AgentProfile } from '../data-access/agentRepository';

export interface AgentWithStats extends AgentProfile {
  activeChats: number;
  status: 'online' | 'away' | 'offline';
  queues: Array<{ id: string; name: string; color: string }>;
}

import { getLogger } from '@/lib/logger';

const log = getLogger('agentService');

export const agentService = {
  getAgentStatus(lastActivity?: string): 'online' | 'away' | 'offline' {
    if (!lastActivity) return 'offline';
    const now = new Date();
    const lastActive = new Date(lastActivity);
    const diffMinutes = (now.getTime() - lastActive.getTime()) / (1000 * 60);

    if (diffMinutes < 5) return 'online';
    if (diffMinutes < 30) return 'away';
    return 'offline';
  },

  async getAgentsWithStats(): Promise<AgentWithStats[]> {
    try {
      log.debug('Fetching agents with stats...');
      const [profilesResult, [queuesResult, membersResult], chatsResult] = await Promise.all([
        agentRepository.fetchProfiles(),
        agentRepository.fetchQueuesAndMembers(),
        agentRepository.fetchActiveChatsCounts(),
      ]);

      if (profilesResult.error) {
        log.error('Error fetching agent profiles:', profilesResult.error);
        throw new Error(`Erro ao buscar perfis: ${profilesResult.error.message}`);
      }
      if (queuesResult.error) {
        log.error('Error fetching queues:', queuesResult.error);
        throw new Error(`Erro ao buscar filas: ${queuesResult.error.message}`);
      }
      if (membersResult.error) {
        log.error('Error fetching queue members:', membersResult.error);
        throw new Error(`Erro ao buscar membros das filas: ${membersResult.error.message}`);
      }
      if (chatsResult.error) {
        log.error('Error fetching active chat counts:', chatsResult.error);
        throw new Error(`Erro ao buscar contagem de chats: ${chatsResult.error.message}`);
      }

      const chatCounts: Record<string, number> = {};
      chatsResult.data?.forEach((contact) => {
        if (contact.assigned_to) {
          chatCounts[contact.assigned_to] = (chatCounts[contact.assigned_to] || 0) + 1;
        }
      });

      return (profilesResult.data as AgentProfile[]).map((profile) => {
        const agentQueues =
          (membersResult.data
            ?.filter((m) => m.profile_id === profile.id)
            .map((m) => {
              const queue = queuesResult.data?.find((q) => q.id === m.queue_id);
              return queue ? { id: queue.id, name: queue.name, color: queue.color } : null;
            })
            .filter(Boolean) as Array<{ id: string; name: string; color: string }>) || [];

        return {
          ...profile,
          activeChats: chatCounts[profile.id] || 0,
          status: this.getAgentStatus(profile.updated_at),
          queues: agentQueues,
        };
      });
    } catch (err) {
      log.error('Critical error in getAgentsWithStats:', err);
      throw err;
    }
  },
};
