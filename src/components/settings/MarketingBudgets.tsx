import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Wallet, AlertTriangle } from 'lucide-react';
import { motion } from '@/components/ui/motion';
import { useMarketingBudgets, type MarketingBudget } from '@/hooks/useMarketingBudgets';

const usd = (v: number | null | undefined): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v ?? 0);

function usagePercent(budget: MarketingBudget): number {
  if (!budget.limit_usd || budget.limit_usd <= 0) return 0;
  return Math.min(100, Math.round(((budget.current_usd ?? 0) / budget.limit_usd) * 100));
}

/**
 * NOTA (CAMPANHAS-13): UI mínima de orçamento marketing WhatsApp — SOMENTE LEITURA.
 * RLS atual (canonical 20260804000000): apenas SELECT p/ admin/supervisor
 * (auth_secure_156). Não há policies de escrita — editar/criar budgets exige
 * migration nova (sinalizado ao maestro). O cron daily-wa-marketing-budget (prod,
 * sem fonte no repo) alimenta current_usd.
 */
export function MarketingBudgets() {
  const { data: budgets = [], isLoading, isError } = useMarketingBudgets();

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border border-secondary/20 bg-card hover:border-secondary/30 transition-all">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-whatsapp" />
            Orçamento Marketing WhatsApp
          </CardTitle>
          <CardDescription>
            Acompanhamento de gastos por período (atualizado pelo cron diário). Leitura apenas —
            edição requer políticas RLS de escrita.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          )}

          {!isLoading && isError && (
            <p className="text-sm text-destructive">
              Não foi possível carregar os orçamentos. Verifique se você tem permissão
              (admin/supervisor).
            </p>
          )}

          {!isLoading && !isError && budgets.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum orçamento cadastrado.
            </p>
          )}

          {!isLoading &&
            !isError &&
            budgets.map((budget) => {
              const pct = usagePercent(budget);
              const over = budget.limit_usd ? (budget.current_usd ?? 0) > budget.limit_usd : false;
              const near =
                budget.alert_threshold && budget.limit_usd
                  ? (budget.current_usd ?? 0) >= budget.limit_usd * (budget.alert_threshold / 100)
                  : false;
              return (
                <div
                  key={budget.id}
                  className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{budget.name || 'Sem nome'}</span>
                        <Badge
                          variant={budget.is_active ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {budget.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                        {budget.period && (
                          <Badge variant="outline" className="text-xs">
                            {budget.period}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {usd(budget.current_usd)} de {usd(budget.limit_usd)} · limite
                        {budget.alert_threshold ? ` · alerta em ${budget.alert_threshold}%` : ''}
                      </p>
                    </div>
                    {(over || near) && (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                    )}
                  </div>
                  <Progress value={pct} className="mt-2 h-2" />
                </div>
              );
            })}
        </CardContent>
      </Card>
    </motion.div>
  );
}
