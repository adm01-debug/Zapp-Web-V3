import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import { queryKeys } from '@/services/api/queryKeys';

interface StatEntry {
  name: string;
  sent: number;
  delivered: number;
  read: number;
}

export function useParticipantStats(conversationId: string, simulationModeEnabled: boolean) {
  return useQuery<StatEntry[]>({
    queryKey: queryKeys.messageReactions.participantStatsDetailed(
      conversationId,
      simulationModeEnabled,
    ),
    queryFn: async () => {
      if (simulationModeEnabled) {
        return [
          { name: 'Alice', sent: 120, delivered: 115, read: 100 },
          { name: 'Bob', sent: 80, delivered: 80, read: 75 },
          { name: 'Charlie', sent: 150, delivered: 140, read: 120 },
          { name: 'Diana', sent: 95, delivered: 90, read: 85 },
          { name: 'Edward', sent: 110, delivered: 110, read: 110 },
        ];
      }

      const { data: messages, error: msgError } = await supabase
        .from('team_messages')
        .select('id, sender_id')
        .eq('conversation_id', conversationId);
      if (msgError) throw msgError;
      if (!messages || messages.length === 0) return [];

      const messageIds = messages.map((m) => m.id);

      type ReceiptRow = {
        status: string;
        profile_id: string | null;
        profiles: { name: string | null } | null;
      };
      const { data: rawReceipts, error: recError } = await fromTable('team_message_receipts')
        .select('status, profile_id, profiles(name)')
        .in('message_id', messageIds);
      if (recError) throw recError;

      const allReceipts = (rawReceipts as ReceiptRow[] | null) ?? [];
      const statsMap: Record<string, StatEntry> = {};

      messages.forEach((m) => {
        const senderId = m.sender_id;
        if (senderId) {
          if (!statsMap[senderId]) {
            statsMap[senderId] = { name: 'Unknown', sent: 0, delivered: 0, read: 0 };
          }
          statsMap[senderId].sent++;
        }
      });

      allReceipts.forEach((r) => {
        const pid = r.profile_id;
        if (!pid) return;
        if (!statsMap[pid]) {
          statsMap[pid] = {
            name: r.profiles?.name ?? 'Unknown',
            sent: 0,
            delivered: 0,
            read: 0,
          };
        } else if (r.profiles?.name) {
          statsMap[pid].name = r.profiles.name;
        }
        if (r.status === 'delivered') statsMap[pid].delivered++;
        if (r.status === 'read') {
          statsMap[pid].delivered++;
          statsMap[pid].read++;
        }
      });

      return Object.values(statsMap);
    },
  });
}
