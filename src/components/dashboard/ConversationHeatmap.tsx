import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Clock, TrendingUp, Flame, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { dbFrom } from '@/integrations/datasource/db';

interface HeatmapData {
  day: number; // 0-6 (Sunday-Saturday)
  hour: number; // 0-23
  value: number;
  count?: number;
}

interface ConversationHeatmapProps {
  data?: HeatmapData[];
  metric?: 'volume' | 'response_time' | 'satisfaction';
  className?: string;
  onCellClick?: (day: number, hour: number) => void;
}

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DAYS_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Generate heatmap data from real messages
function useHeatmapData() {
  return useQuery({
    queryKey: queryKeys.adminOps.conversationHeatmap(),
    queryFn: async () => {
      const { data, error } = await dbFrom('messages')
        .select('created_at')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      if (error) throw error;

      const heatmap: HeatmapData[] = [];
      const counts = new Map<string, number>();

      (data || []).forEach((m) => {
        const d = new Date(m.created_at);
        const key = `${d.getDay()}-${d.getHours()}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      });

      for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
          const key = `${day}-${hour}`;
          const value = counts.get(key) || 0;
          heatmap.push({ day, hour, value, count: value });
        }
      }

      return heatmap;
    },
    staleTime: 5 * 60 * 1000,
  });
}

const METRIC_CONFIG = {
  volume: {
    label: 'Volume de Mensagens',
    colorScale: [
      'hsl(var(--success) / 0.08)',
      'hsl(var(--success) / 0.25)',
      'hsl(var(--success) / 0.55)',
      'hsl(var(--success) / 0.80)',
      'hsl(var(--success))',
    ],
    unit: 'msgs',
    description: 'Número total de mensagens por período',
  },
  response_time: {
    label: 'Tempo de Resposta',
    colorScale: [
      'hsl(var(--warning) / 0.08)',
      'hsl(var(--warning) / 0.25)',
      'hsl(var(--warning) / 0.55)',
      'hsl(var(--warning) / 0.80)',
      'hsl(var(--warning))',
    ],
    unit: 'seg',
    description: 'Tempo médio de primeira resposta',
  },
  satisfaction: {
    label: 'Satisfação',
    colorScale: [
      'hsl(var(--destructive) / 0.08)',
      'hsl(var(--destructive) / 0.25)',
      'hsl(var(--destructive) / 0.55)',
      'hsl(var(--destructive) / 0.80)',
      'hsl(var(--destructive))',
    ],
    unit: '/5',
    description: 'Nota média de satisfação do cliente',
    invert: true,
  },
};

/** Conversation Heatmap component for the dashboard section. */
export default function ConversationHeatmap({
  data: externalData,
  metric = 'volume',
  className,
  onCellClick,
}: ConversationHeatmapProps) {
  const { data: realData } = useHeatmapData();
  const data = externalData || realData || [];
  const [selectedMetric, setSelectedMetric] = useState(metric);

  const config = METRIC_CONFIG[selectedMetric];

  // Calculate min/max for color scaling
  const { min, max, hotspots } = useMemo(() => {
    const values = data.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Find hotspots (top 5 busiest periods)
    const sorted = [...data].sort((a, b) => b.value - a.value);
    const hotspots = sorted.slice(0, 5);

    return { min, max, hotspots };
  }, [data]);

  const getColor = (value: number) => {
    const scale = config.colorScale;
    const normalized = (value - min) / (max - min || 1);
    const index = Math.min(Math.floor(normalized * (scale.length - 1)), scale.length - 1);
    const shouldInvert = 'invert' in config && config.invert;
    return scale[shouldInvert ? scale.length - 1 - index : index];
  };

  const getCellData = (day: number, hour: number) => {
    return data.find((d) => d.day === day && d.hour === hour);
  };

  const formatHour = (hour: number) => {
    return `${hour.toString().padStart(2, '0')}:00`;
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Flame className="h-5 w-5 text-primary" />
            Mapa de Calor
          </CardTitle>

          <Tabs
            value={selectedMetric}
            onValueChange={(v) =>
              setSelectedMetric(v as 'volume' | 'response_time' | 'satisfaction')
            }
          >
            <TabsList className="h-8">
              <TabsTrigger value="volume" className="h-6 px-2 text-xs">
                Volume
              </TabsTrigger>
              <TabsTrigger value="response_time" className="h-6 px-2 text-xs">
                Resposta
              </TabsTrigger>
              <TabsTrigger value="satisfaction" className="h-6 px-2 text-xs">
                Satisfação
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          {config.description}
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-3.5 w-3.5" />
            </TooltipTrigger>
            <TooltipContent>Clique em uma célula para ver detalhes do período</TooltipContent>
          </Tooltip>
        </p>
      </CardHeader>

      <CardContent>
        {/* Hotspots */}
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground">Períodos mais movimentados:</span>
          {hotspots.slice(0, 3).map((spot) => (
            <Badge key={`${spot.day}-${spot.hour}`} variant="secondary" className="gap-1 text-xs">
              <Flame className="h-3 w-3 text-warning" />
              {DAYS[spot.day]} {formatHour(spot.hour)}
            </Badge>
          ))}
        </div>

        {/* Heatmap Grid */}
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            {/* Hour labels */}
            <div className="mb-1 ml-12 flex">
              {HOURS.filter((_, i) => i % 3 === 0).map((hour) => (
                <div
                  key={hour}
                  className="text-xs text-muted-foreground"
                  style={{ width: `${100 / 8}%` }}
                >
                  {formatHour(hour)}
                </div>
              ))}
            </div>

            {/* Grid */}
            {DAYS.map((day, dayIndex) => (
              <div key={day} className="mb-1 flex items-center gap-1">
                {/* Day label */}
                <div className="w-10 shrink-0 pr-2 text-right text-xs text-muted-foreground">
                  {day}
                </div>

                {/* Cells */}
                <div className="flex flex-1 gap-0.5">
                  {HOURS.map((hour) => {
                    const cellData = getCellData(dayIndex, hour);
                    const isHotspot = hotspots.some((h) => h.day === dayIndex && h.hour === hour);

                    return (
                      <Tooltip key={hour}>
                        <TooltipTrigger asChild>
                          <motion.div
                            whileHover={{ scale: 1.2, zIndex: 10 }}
                            onClick={() => onCellClick?.(dayIndex, hour)}
                            className={cn(
                              'relative aspect-square flex-1 cursor-pointer rounded transition-all',
                              'min-w-[12px] max-w-[24px]',
                              isHotspot && 'ring-1 ring-warning/50'
                            )}
                            style={{
                              backgroundColor: cellData
                                ? getColor(cellData.value)
                                : config.colorScale[0],
                            }}
                          >
                            {isHotspot && (
                              <div className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-warning" />
                            )}
                          </motion.div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="text-sm">
                            <div className="font-medium">
                              {DAYS_FULL[dayIndex]}, {formatHour(hour)}
                            </div>
                            <div>
                              {config.label}: {cellData?.value ?? 0} {config.unit}
                            </div>
                            {cellData?.count && <div>Total: {cellData.count} conversas</div>}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center justify-center gap-2">
          <span className="text-xs text-muted-foreground">Baixo</span>
          <div className="flex h-3 overflow-hidden rounded">
            {config.colorScale.map((color, i) => (
              <div
                key={`${color}-${i}`}
                className="h-full w-6"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">Alto</span>
        </div>

        {/* Stats Summary */}
        <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-4">
          <StatCard
            icon={TrendingUp}
            label="Pico Semanal"
            value={`${max} ${config.unit}`}
            description={`${DAYS_FULL[hotspots[0]?.day ?? 0]} às ${formatHour(hotspots[0]?.hour ?? 0)}`}
          />
          <StatCard
            icon={Clock}
            label="Horário Nobre"
            value="10h - 16h"
            description="Maior concentração"
          />
          <StatCard
            icon={Calendar}
            label="Melhor Dia"
            value={DAYS_FULL[2]}
            description="Menor tempo de espera"
          />
        </div>
      </CardContent>
    </Card>
  );
}

interface StatCardProps {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  description: string;
}

function StatCard({ icon: Icon, label, value, description }: StatCardProps) {
  return (
    <div className="text-center">
      <Icon className="mx-auto mb-1 h-4 w-4 text-primary" />
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{description}</div>
    </div>
  );
}
