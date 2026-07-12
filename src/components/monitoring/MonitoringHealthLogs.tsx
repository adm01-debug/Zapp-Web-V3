import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, XCircle, AlertTriangle, Clock, Search, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';
import type { HealthLog } from './hooks/useEvolutionMonitoring';

interface Props {
  healthLogs: HealthLog[];
}

const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; bg: string }> = {
  connected: { icon: CheckCircle2, color: 'text-primary', bg: 'bg-primary/5' },
  healthy: { icon: CheckCircle2, color: 'text-primary', bg: 'bg-primary/5' },
  disconnected: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/5' },
  error: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/5' },
  degraded: { icon: AlertTriangle, color: 'text-warning-foreground', bg: 'bg-warning/5' },
};
const defaultStatus = { icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted/30' };

export function MonitoringHealthLogs({ healthLogs }: Props) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [instanceFilter, setInstanceFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const instances = useMemo(() => [...new Set(healthLogs.map(l => l.instance_id))], [healthLogs]);

  const filtered = useMemo(() => {
    return healthLogs.filter(log => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'ok' && !['connected', 'healthy'].includes(log.status)) return false;
        if (statusFilter === 'error' && !['disconnected', 'error'].includes(log.status)) return false;
        if (statusFilter === 'degraded' && log.status !== 'degraded') return false;
      }
      if (instanceFilter !== 'all' && log.instance_id !== instanceFilter) return false;
      if (search && !log.instance_id.toLowerCase().includes(search.toLowerCase()) &&
          !(log.error_message || '').toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [healthLogs, statusFilter, instanceFilter, search]);

  const okCount = filtered.filter(l => ['connected', 'healthy'].includes(l.status)).length;
  const errCount = filtered.filter(l => ['disconnected', 'error'].includes(l.status)).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">Histórico de Health Checks</CardTitle>
            <CardDescription>{filtered.length} de {healthLogs.length} registros</CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="text-[10px] text-primary">✓ {okCount}</Badge>
            <Badge variant="outline" className="text-[10px] text-destructive">✗ {errCount}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              aria-label="Buscar instância ou erro"
              placeholder="Buscar instância ou erro..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <Filter className="w-3 h-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ok">✓ OK</SelectItem>
              <SelectItem value="error">✗ Erro</SelectItem>
              <SelectItem value="degraded">⚠ Degradado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={instanceFilter} onValueChange={setInstanceFilter}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Instância" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {instances.map(inst => (
                <SelectItem key={inst} value={inst}>{inst}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(statusFilter !== 'all' || instanceFilter !== 'all' || search) && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setStatusFilter('all'); setInstanceFilter('all'); setSearch(''); }}>
              Limpar
            </Button>
          )}
        </div>

        <ScrollArea className="h-[400px]">
          <div className="space-y-1">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Clock className="w-10 h-10 mb-2 opacity-20" />
                <p className="text-sm">Nenhum registro encontrado.</p>
              </div>
            ) : filtered.map((log, i) => {
              const cfg = statusConfig[log.status] || defaultStatus;
              const Icon = cfg.icon;
              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.01, 0.3) }}
                  className={cn('flex items-center justify-between p-2.5 rounded-lg transition-colors hover:bg-muted/50', cfg.bg)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={cn('w-4 h-4 shrink-0', cfg.color)} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{log.instance_id}</span>
                        <Badge variant="outline" className={cn('text-[10px]', cfg.color)}>{log.status}</Badge>
                      </div>
                      {log.error_message && (
                        <p className="text-[11px] text-destructive mt-0.5 truncate max-w-sm">{log.error_message}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                    {log.response_time_ms != null && (
                      <span className={cn('font-medium',
                        log.response_time_ms < 300 ? 'text-primary' :
                        log.response_time_ms < 800 ? 'text-warning-foreground' : 'text-destructive'
                      )}>
                        {log.response_time_ms}ms
                      </span>
                    )}
                    <span className="tabular-nums">{format(new Date(log.checked_at), 'dd/MM HH:mm:ss', { locale: ptBR })}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
