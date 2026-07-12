import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExportButton } from './ExportButton';
import { ConversationHeatmap } from './ConversationHeatmap';
import { PeriodComparison } from './PeriodComparison';
import { DemandForecast } from './DemandForecast';
import { AbandonmentRate } from './AbandonmentRate';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useReportsData } from './useReportsData';
import {
  ComparisonSummaryChart,
  PeriodAreaChart,
  DistributionPieChart,
  DailyMessagesChart,
  AgentsChart,
  ContactsCharts,
} from './ReportCharts';
import {
  BarChart3,
  TrendingUp,
  Users,
  MessageSquare,
  Tag,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  GitCompare,
  Flame,
  GitPullRequest,
  UserX,
  Gauge,
} from 'lucide-react';
import { format } from 'date-fns';

const PERIOD_OPTIONS = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '14', label: 'Últimos 14 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
];

export function AdvancedReportsView() {
  const {
    period,
    setPeriod,
    selectedAgent,
    setSelectedAgent,
    selectedTag: _selectedTag,
    setSelectedTag: _setSelectedTag,
    compareEnabled,
    setCompareEnabled,
    agents,
    tags: _tags,
    dateRange,
    chartData,
    previousChartData,
    comparisonSummary,
    contactsChartData,
    stats,
    isLoading,
    getExportData,
  } = useReportsData();

  const previousDateRange = {
    from: new Date(dateRange.from.getTime() - (dateRange.to.getTime() - dateRange.from.getTime())),
    to: new Date(dateRange.from.getTime() - 86400000),
  };

  const summaryStats = [
    {
      label: 'Total de Mensagens',
      value: stats.totalMessages,
      prevValue: stats.prevTotalMessages,
      icon: MessageSquare,
      trend: stats.messagesTrend,
    },
    {
      label: 'Mensagens Enviadas',
      value: stats.sentMessages,
      prevValue: stats.prevSentMessages,
      icon: TrendingUp,
      trend: stats.sentTrend,
    },
    {
      label: 'Novos Contatos',
      value: stats.totalContacts,
      prevValue: stats.prevTotalContacts,
      icon: Users,
      trend: stats.contactsTrend,
    },
    {
      label: 'Média por Dia',
      value: stats.avgMessagesPerDay,
      prevValue: stats.prevAvgMessagesPerDay,
      icon: Clock,
    },
  ];

  return (
    <div className="h-full space-y-6 overflow-auto p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <BarChart3 className="h-7 w-7 text-primary" />
            Relatórios Avançados
          </h1>
          <p className="mt-1 text-muted-foreground">
            Análise detalhada de atendimentos por período, agente e tags
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
            <GitCompare className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="compare-mode" className="cursor-pointer text-sm">
              Comparar períodos
            </Label>
            <Switch
              id="compare-mode"
              checked={compareEnabled}
              onCheckedChange={setCompareEnabled}
            />
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40">
              <Calendar className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedAgent} onValueChange={setSelectedAgent}>
            <SelectTrigger className="w-40">
              <Users className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Agente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os agentes</SelectItem>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ExportButton getData={getExportData} disabled={isLoading} />
        </div>
      </div>

      {/* Comparison Indicator */}
      {compareEnabled && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="rounded-lg border bg-muted/30 p-4"
        >
          <div className="flex items-center gap-3 text-sm">
            <GitCompare className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">Comparando:</span>
            <Badge variant="outline" className="gap-1">
              <span className="font-medium">Atual:</span> {format(dateRange.from, 'dd/MM/yyyy')} -{' '}
              {format(dateRange.to, 'dd/MM/yyyy')}
            </Badge>
            <span className="text-muted-foreground">vs</span>
            <Badge variant="secondary" className="gap-1">
              <span className="font-medium">Anterior:</span>{' '}
              {format(previousDateRange.from, 'dd/MM/yyyy')} -{' '}
              {format(previousDateRange.to, 'dd/MM/yyyy')}
            </Badge>
          </div>
        </motion.div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryStats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="relative overflow-hidden">
              <CardContent className="p-6">
                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
                      <stat.icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="mt-2 flex items-end gap-2">
                      <p className="text-3xl font-bold text-foreground">
                        {stat.value.toLocaleString()}
                      </p>
                      {stat.trend !== undefined && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            stat.trend >= 0
                              ? 'border-success text-success'
                              : 'border-destructive text-destructive'
                          )}
                        >
                          {stat.trend >= 0 ? (
                            <ArrowUpRight className="mr-1 h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="mr-1 h-3 w-3" />
                          )}
                          {Math.abs(stat.trend).toFixed(1)}%
                        </Badge>
                      )}
                    </div>
                    {compareEnabled && stat.prevValue !== undefined && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Período anterior:{' '}
                        <span className="font-medium">{stat.prevValue.toLocaleString()}</span>
                      </p>
                    )}
                  </>
                )}
              </CardContent>
              <div className="absolute right-0 top-0 h-24 w-24 -translate-y-1/2 translate-x-1/2 rounded-full bg-primary/5 blur-2xl" />
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <Tabs defaultValue="messages" className="space-y-4">
        <TabsList className="grid w-full max-w-3xl grid-cols-7">
          <TabsTrigger value="messages" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Mensagens
          </TabsTrigger>
          <TabsTrigger value="agents" className="gap-2">
            <Users className="h-4 w-4" />
            Agentes
          </TabsTrigger>
          <TabsTrigger value="contacts" className="gap-2">
            <Tag className="h-4 w-4" />
            Contatos
          </TabsTrigger>
          <TabsTrigger value="heatmap" className="gap-2">
            <Flame className="h-4 w-4" />
            Heatmap
          </TabsTrigger>
          <TabsTrigger value="comparison" className="gap-2">
            <GitPullRequest className="h-4 w-4" />
            Comparativo
          </TabsTrigger>
          <TabsTrigger value="forecast" className="gap-2">
            <Gauge className="h-4 w-4" />
            Previsão
          </TabsTrigger>
          <TabsTrigger value="abandonment" className="gap-2">
            <UserX className="h-4 w-4" />
            Abandono
          </TabsTrigger>
        </TabsList>

        <TabsContent value="messages" className="space-y-4">
          {compareEnabled ? (
            <>
              <ComparisonSummaryChart data={comparisonSummary} isLoading={isLoading} />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <PeriodAreaChart
                  data={chartData.daily}
                  label="Período Atual"
                  dateLabel={`${format(dateRange.from, 'dd/MM')} - ${format(dateRange.to, 'dd/MM')}`}
                  gradientId="colorEnviadasCurrent"
                  color="hsl(var(--primary))"
                  total={stats.totalMessages}
                  isLoading={isLoading}
                  variant="primary"
                />
                <PeriodAreaChart
                  data={previousChartData.daily}
                  label="Período Anterior"
                  dateLabel={`${format(previousDateRange.from, 'dd/MM')} - ${format(previousDateRange.to, 'dd/MM')}`}
                  gradientId="colorEnviadasPrev"
                  color="hsl(var(--muted-foreground))"
                  total={stats.prevTotalMessages}
                  isLoading={isLoading}
                  variant="secondary"
                />
                <DistributionPieChart
                  data={chartData.bySender}
                  label="Distribuição Atual"
                  isLoading={isLoading}
                  variant="primary"
                />
                <DistributionPieChart
                  data={previousChartData.bySender}
                  label="Distribuição Anterior"
                  isLoading={isLoading}
                  colors={['hsl(var(--chart-4))', 'hsl(var(--chart-5))']}
                  variant="secondary"
                />
              </div>
            </>
          ) : (
            <DailyMessagesChart data={chartData} isLoading={isLoading} />
          )}
        </TabsContent>

        <TabsContent value="agents" className="space-y-4">
          <AgentsChart data={chartData.byAgent} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="contacts" className="space-y-4">
          <ContactsCharts data={contactsChartData} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="heatmap" className="space-y-4">
          <ConversationHeatmap />
        </TabsContent>

        <TabsContent value="comparison" className="space-y-4">
          <PeriodComparison />
        </TabsContent>

        <TabsContent value="forecast" className="space-y-4">
          <DemandForecast />
        </TabsContent>

        <TabsContent value="abandonment" className="space-y-4">
          <AbandonmentRate />
        </TabsContent>
      </Tabs>
    </div>
  );
}
