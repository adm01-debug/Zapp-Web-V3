import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import { useUserSettings } from '@/hooks/useUserSettings';
import { queryKeys } from '@/services/api/queryKeys';

interface ParticipantStatsGraphProps {
  conversationId: string;
}

export function ParticipantStatsGraph({ conversationId }: ParticipantStatsGraphProps) {
  const { settings } = useUserSettings();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.messageReactions.participantStatsDetailed(
      conversationId,
      settings.simulation_mode_enabled
    ),
    queryFn: async () => {
      if (settings.simulation_mode_enabled) {
        // Generate mock data for simulation
        return [
          { name: 'Alice', sent: 120, delivered: 115, read: 100 },
          { name: 'Bob', sent: 80, delivered: 80, read: 75 },
          { name: 'Charlie', sent: 150, delivered: 140, read: 120 },
          { name: 'Diana', sent: 95, delivered: 90, read: 85 },
          { name: 'Edward', sent: 110, delivered: 110, read: 110 },
        ];
      }

      // Real data query
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
      const allReceipts = (rawReceipts as ReceiptRow[] | null) ?? null;

      if (recError) throw recError;

      type StatEntry = { name: string; sent: number; delivered: number; read: number };
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

      if (allReceipts) {
        allReceipts.forEach((r) => {
          const pid = r.profile_id;
          if (pid) {
            if (!statsMap[pid]) {
              statsMap[pid] = {
                name: r.profiles?.name || 'Unknown',
                sent: 0,
                delivered: 0,
                read: 0,
              };
            }
            statsMap[pid].name = r.profiles?.name || 'Unknown';
            if (r.status === 'delivered') statsMap[pid].delivered++;
            if (r.status === 'read') {
              statsMap[pid].delivered++;
              statsMap[pid].read++;
            }
          }
        });
      }

      return Object.values(statsMap);
    },
    enabled: !!conversationId,
  });

  if (isLoading)
    return <div className="flex h-[300px] items-center justify-center">Carregando gráfico...</div>;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-sm font-bold">Evolução por Participante</CardTitle>
        <CardDescription className="text-xs">
          Mensagens Enviadas, Entregues e Lidas por cada membro do grupo.
          {settings.simulation_mode_enabled && (
            <span className="ml-2 font-bold text-warning-foreground">(MODO SIMULAÇÃO)</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
              <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: 'none',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                }}
                cursor={{ fill: 'rgba(0,0,0,0.05)' }}
              />
              <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '10px' }} />
              <Bar
                dataKey="sent"
                name="Enviadas"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
                barSize={20}
              />
              <Bar
                dataKey="delivered"
                name="Entregues"
                fill="hsl(var(--success))"
                radius={[4, 4, 0, 0]}
                barSize={20}
              />
              <Bar
                dataKey="read"
                name="Lidas"
                fill="hsl(var(--warning))"
                radius={[4, 4, 0, 0]}
                barSize={20}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
