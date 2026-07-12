import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart3,
  Users,
  TrendingUp,
  Building,
  Tag,
  Lightbulb,
  AlertCircle,
  ArrowUpRight,
  Zap,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, subDays, startOfDay } from 'date-fns';
import { CONTACT_TYPE_CONFIG } from './contactTypeConfig';

interface ContactAnalyticsDashboardProps {
  contacts: Array<{
    id: string;
    name: string;
    contact_type?: string | null;
    company?: string | null;
    tags?: string[] | null;
    created_at: string;
  }>;
  className?: string;
}

export function ContactAnalyticsDashboard({ contacts, className }: ContactAnalyticsDashboardProps) {
  const analytics = useMemo(() => {
    // Type distribution
    const typeMap = new Map<string, number>();
    contacts.forEach((c) => {
      const t = c.contact_type || 'cliente';
      typeMap.set(t, (typeMap.get(t) || 0) + 1);
    });
    const typeDistribution = [...typeMap.entries()]
      .map(([type, count]) => ({
        type,
        count,
        percentage: Math.round((count / contacts.length) * 100),
        config: CONTACT_TYPE_CONFIG[type] || CONTACT_TYPE_CONFIG.cliente,
      }))
      .sort((a, b) => b.count - a.count);

    // Top companies
    const companyMap = new Map<string, number>();
    contacts.forEach((c) => {
      if (c.company) companyMap.set(c.company, (companyMap.get(c.company) || 0) + 1);
    });
    const topCompanies = [...companyMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Top tags
    const tagMap = new Map<string, number>();
    contacts.forEach((c) => {
      c.tags?.forEach((tag) => tagMap.set(tag, (tagMap.get(tag) || 0) + 1));
    });
    const topTags = [...tagMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

    // Daily growth (last 14 days)
    const dailyGrowth: { date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const day = startOfDay(subDays(new Date(), i));
      const dayStr = format(day, 'yyyy-MM-dd');
      const label = format(day, 'dd/MM');
      const count = contacts.filter((c) => {
        const d = format(startOfDay(new Date(c.created_at)), 'yyyy-MM-dd');
        return d === dayStr;
      }).length;
      dailyGrowth.push({ date: label, count });
    }

    // New this week
    const weekAgo = subDays(new Date(), 7);
    const newThisWeek = contacts.filter((c) => new Date(c.created_at) >= weekAgo).length;

    // Actionable Insights Logic
    type Insight = {
      title: string;
      description: string;
      icon: React.ComponentType<{ className?: string }>;
      color: string;
      bg: string;
    };
    const insights: Insight[] = [];

    if (newThisWeek > contacts.length * 0.05) {
      insights.push({
        title: 'Crescimento Acelerado',
        description: `Aumento de ${Math.round((newThisWeek / contacts.length) * 100)}% na base esta semana.`,
        icon: ArrowUpRight,
        color: 'text-primary',
        bg: 'bg-primary/10',
      });
    }

    const leadsCount = contacts.filter((c) => c.contact_type === 'lead').length;
    if (leadsCount > contacts.length * 0.3) {
      insights.push({
        title: 'Foco em Conversão',
        description: 'Leads representam mais de 30% da base. Priorize ações de vendas.',
        icon: Zap,
        color: 'text-warning-foreground',
        bg: 'bg-warning/10',
      });
    }

    const missingCompany = contacts.filter((c) => !c.company).length;
    if (missingCompany > contacts.length * 0.2) {
      insights.push({
        title: 'Dados Incompletos',
        description: `${missingCompany} contatos sem empresa. Enriqueça para melhor segmentação.`,
        icon: AlertCircle,
        color: 'text-warning-foreground',
        bg: 'bg-warning/10',
      });
    }

    return { typeDistribution, topCompanies, topTags, dailyGrowth, newThisWeek, insights };
  }, [contacts]);

  const maxDaily = Math.max(...analytics.dailyGrowth.map((d) => d.count), 1);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="mb-2 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">Analytics de Contatos</h2>
        <Badge variant="secondary" className="text-xs">
          {contacts.length} total
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Type Distribution */}
        <Card className="border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-primary" />
              Distribuição por Tipo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {analytics.typeDistribution.map((item, i) => (
              <motion.div
                key={item.type}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <div className="mb-1 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span>{item.config.iconNode}</span>
                    <span className="font-medium">{item.config.label}</span>
                  </div>
                  <span className="text-muted-foreground">
                    {item.count} ({item.percentage}%)
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted/30">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.percentage}%` }}
                    transition={{ delay: i * 0.05 + 0.2, duration: 0.5 }}
                    className="h-full rounded-full bg-primary/60"
                  />
                </div>
              </motion.div>
            ))}
          </CardContent>
        </Card>

        {/* Daily Growth Chart */}
        <Card className="border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-primary" />
              Novos Contatos (14 dias)
              <Badge variant="default" className="ml-auto text-[10px]">
                +{analytics.newThisWeek} semana
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-[100px] items-end gap-[3px]">
              {analytics.dailyGrowth.map((day, i) => (
                <motion.div
                  key={day.date}
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max((day.count / maxDaily) * 100, 4)}%` }}
                  transition={{ delay: i * 0.03, duration: 0.4 }}
                  className="group relative flex-1 cursor-default rounded-t bg-primary/50 transition-colors hover:bg-primary/70"
                  title={`${day.date}: ${day.count} contatos`}
                >
                  <div className="pointer-events-none absolute -top-5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded border border-border bg-popover px-1 py-0.5 text-[9px] text-foreground opacity-0 transition-opacity group-hover:opacity-100">
                    {day.count}
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="mt-1.5 flex justify-between">
              <span className="text-[9px] text-muted-foreground">
                {analytics.dailyGrowth[0]?.date}
              </span>
              <span className="text-[9px] text-muted-foreground">
                {analytics.dailyGrowth[analytics.dailyGrowth.length - 1]?.date}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Top Companies & Tags */}
        <Card className="border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Building className="h-4 w-4 text-primary" />
              Top Empresas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {analytics.topCompanies.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground/50">Sem dados</p>
            ) : (
              <div className="space-y-2">
                {analytics.topCompanies.map(([company, count], i) => (
                  <motion.div
                    key={company}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="mr-2 truncate font-medium">{company}</span>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {count}
                    </Badge>
                  </motion.div>
                ))}
              </div>
            )}

            {analytics.topTags.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Tag className="h-3 w-3" />
                  Tags populares
                </div>
                <div className="flex flex-wrap gap-1">
                  {analytics.topTags.map(([tag, count]) => (
                    <Badge key={tag} variant="outline" className="gap-1 text-[10px]">
                      {tag}
                      <span className="text-muted-foreground/60">{count}</span>
                    </Badge>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actionable Insights Section */}
      <div className="border-t border-border/50 pt-4">
        <div className="mb-4 flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-warning-foreground" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Insights Acionáveis
          </h3>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {analytics.insights.map((insight, i) => (
            <motion.div
              key={insight.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.1 }}
              className={cn(
                'flex items-start gap-3 rounded-xl border border-border/40 p-4',
                insight.bg
              )}
            >
              <div className={cn('rounded-lg bg-background p-2 shadow-sm', insight.color)}>
                <insight.icon className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold leading-none">{insight.title}</p>
                <p className="text-xs leading-tight text-muted-foreground">{insight.description}</p>
              </div>
            </motion.div>
          ))}
          {analytics.insights.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center rounded-xl border border-dashed border-border/50 p-8 text-center">
              <Sparkles className="mb-2 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">Sua base está saudável!</p>
              <p className="text-xs text-muted-foreground/60">
                Continue mantendo os dados atualizados para gerar novos insights.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
