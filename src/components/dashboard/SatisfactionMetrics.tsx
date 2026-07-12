import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Star, TrendingUp, TrendingDown, Minus, Smile, Meh, Frown } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { SatisfactionAgentRanking } from './SatisfactionAgentRanking';

interface SatisfactionData {
  csat: number; nps: number; totalResponses: number; responseRate: number;
  trend: 'up' | 'down' | 'stable'; trendValue: number;
  byAgent: { agentId: string; agentName: string; csat: number; responses: number }[];
  byQueue: { queueId: string; queueName: string; csat: number; responses: number }[];
  distribution: { rating: number; count: number }[];
  timeline: { date: string; csat: number; nps: number }[];
}

const getCSATColor = (v: number) => v >= 85 ? 'text-success' : v >= 70 ? 'text-warning' : 'text-destructive';
const getNPSColor = (v: number) => v >= 50 ? 'text-success' : v >= 0 ? 'text-warning' : 'text-destructive';
const getRatingIcon = (r: number) => r >= 4 ? <Smile className="h-4 w-4 text-success" /> : r === 3 ? <Meh className="h-4 w-4 text-warning" /> : <Frown className="h-4 w-4 text-destructive" />;

export const SatisfactionMetrics = () => {
  const [data, setData] = useState<SatisfactionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d'>('30d');
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setData({
        csat: 87, nps: 42, totalResponses: 1234, responseRate: 34, trend: 'up', trendValue: 5,
        byAgent: [
          { agentId: '1', agentName: 'Maria Santos', csat: 94, responses: 156 },
          { agentId: '2', agentName: 'João Silva', csat: 89, responses: 203 },
          { agentId: '3', agentName: 'Ana Costa', csat: 85, responses: 178 },
          { agentId: '4', agentName: 'Pedro Lima', csat: 82, responses: 145 },
        ],
        byQueue: [
          { queueId: '1', queueName: 'Suporte', csat: 88, responses: 567 },
          { queueId: '2', queueName: 'Vendas', csat: 91, responses: 412 },
          { queueId: '3', queueName: 'Financeiro', csat: 79, responses: 255 },
        ],
        distribution: [{ rating: 5, count: 523 }, { rating: 4, count: 398 }, { rating: 3, count: 167 }, { rating: 2, count: 89 }, { rating: 1, count: 57 }],
        timeline: Array.from({ length: 30 }, (_, i) => ({ date: format(subDays(new Date(), 29 - i), 'dd/MM'), csat: Math.floor(Math.random() * 15) + 80, nps: Math.floor(Math.random() * 30) + 30 })),
      });
      setIsLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, [selectedPeriod]);

  if (isLoading || !data) return <Card><CardContent className="flex items-center justify-center h-64"><div className="animate-pulse text-muted-foreground">Carregando métricas...</div></CardContent></Card>;

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><Star className="h-5 w-5 text-warning" /><CardTitle className="text-lg">Satisfação do Cliente</CardTitle></div>
            <div className="flex items-center gap-2">
              {(['7d', '30d', '90d'] as const).map((p) => (
                <Button key={p} variant={selectedPeriod === p ? 'default' : 'outline'} size="sm" className="text-xs" onClick={() => setSelectedPeriod(p)}>
                  {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : '90 dias'}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-muted/50 rounded-lg p-4 text-center">
              <div className="text-sm text-muted-foreground mb-1">CSAT</div>
              <div className={`text-3xl font-bold ${getCSATColor(data.csat)}`}>{data.csat}%</div>
              <div className="flex items-center justify-center gap-1 text-xs mt-1">
                {data.trend === 'up' ? <TrendingUp className="h-3 w-3 text-success" /> : data.trend === 'down' ? <TrendingDown className="h-3 w-3 text-destructive" /> : <Minus className="h-3 w-3 text-warning" />}
                <span className={data.trend === 'up' ? 'text-success' : data.trend === 'down' ? 'text-destructive' : ''}>{data.trendValue}%</span>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-muted/50 rounded-lg p-4 text-center">
              <div className="text-sm text-muted-foreground mb-1">NPS</div>
              <div className={`text-3xl font-bold ${getNPSColor(data.nps)}`}>{data.nps > 0 ? '+' : ''}{data.nps}</div>
              <div className="text-xs text-muted-foreground mt-1">{data.nps >= 50 ? 'Excelente' : data.nps >= 0 ? 'Bom' : 'Precisa melhorar'}</div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-muted/50 rounded-lg p-4 text-center">
              <div className="text-sm text-muted-foreground mb-1">Respostas</div>
              <div className="text-3xl font-bold">{data.totalResponses.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-1">{data.responseRate}% taxa de resposta</div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} role="button" tabIndex={0} aria-label="Ver detalhes do agente com melhor desempenho" className="bg-muted/50 rounded-lg p-4 text-center cursor-pointer hover:bg-muted transition-colors" onClick={() => setDetailsOpen(true)} onKeyDown={(e) => e.key === 'Enter' && setDetailsOpen(true)}>
              <div className="text-sm text-muted-foreground mb-1">Top Agente</div>
              <div className="text-lg font-bold truncate">{data.byAgent[0]?.agentName}</div>
              <div className="text-xs text-success mt-1">{data.byAgent[0]?.csat}% CSAT</div>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-medium mb-3">Distribuição de Notas</h4>
              <div className="space-y-2">
                {data.distribution.map((item) => (
                  <div key={item.rating} className="flex items-center gap-3">
                    <div className="flex items-center gap-1 w-16">{getRatingIcon(item.rating)}<span className="text-sm">{item.rating} ★</span></div>
                    <div className="flex-1"><Progress value={(item.count / data.totalResponses) * 100} className="h-2" /></div>
                    <span className="text-sm text-muted-foreground w-12 text-right">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium mb-3">Por Fila</h4>
              <div className="h-[150px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.byQueue}><XAxis dataKey="queueName" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} domain={[0, 100]} /><Tooltip /><Bar dataKey="csat" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} /></BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-3">Evolução</h4>
            <div className="h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.timeline}><XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} domain={[0, 100]} /><Tooltip /><Line type="monotone" dataKey="csat" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} /></LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>
      <SatisfactionAgentRanking open={detailsOpen} onOpenChange={setDetailsOpen} agents={data.byAgent} />
    </>
  );
};
