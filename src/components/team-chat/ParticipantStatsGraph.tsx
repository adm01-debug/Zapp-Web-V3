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
import { useUserSettings } from '@/hooks/useUserSettings';
import { useParticipantStats } from '@/hooks/useParticipantStats';

interface ParticipantStatsGraphProps {
  conversationId: string;
}

/** Participant Stats Graph component for the team chat section. */
export function ParticipantStatsGraph({ conversationId }: ParticipantStatsGraphProps) {
  const { settings } = useUserSettings();
  const { data, isLoading } = useParticipantStats(conversationId, settings.simulation_mode_enabled);

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