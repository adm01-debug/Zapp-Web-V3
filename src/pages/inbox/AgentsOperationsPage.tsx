import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { Users, Search } from 'lucide-react';
import { useAgents, type AgentWithStats } from '@/features/admin';
import { useConnectionsManager } from '@/features/connections';
import { useAgentPendingCounts } from '@/features/inbox';
import { useAgentRecentSends } from '@/features/inbox';
import { AgentsConnectionsHeader } from '@/features/inbox/components/agents-ops/AgentsConnectionsHeader';
import { AgentOpsTable } from '@/features/inbox/components/agents-ops/AgentOpsTable';

type StatusFilter = 'all' | AgentWithStats['status'];

export default function AgentsOperationsPage() {
  const { agents, stats, isLoading: loadingAgents } = useAgents();
  const { connections } = useConnectionsManager();
  const { counts: pendingCounts } = useAgentPendingCounts();
  const { byAgent: recentSendsByAgent, totalSends } = useAgentRecentSends();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (q && !a.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [agents, search, statusFilter]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-2xl font-display font-bold text-foreground">Atendentes Online</h1>
        <p className="text-sm text-muted-foreground">
          Status, filas, mensagens pendentes e últimos envios com idempotência. Inclui apenas
          envios processados via Evolution proxy ({totalSends} no buffer).
        </p>
      </header>

      <AgentsConnectionsHeader connections={connections} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiCard label="Online" value={stats.onlineCount} tone="success" />
        <KpiCard label="Ausentes" value={stats.awayCount} tone="warning" />
        <KpiCard label="Offline" value={stats.offlineCount} tone="muted" />
        <KpiCard label="Em atendimento" value={stats.totalActiveChats} tone="info" />
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Buscar atendente"
            placeholder="Buscar atendente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */)}>
          <SelectTrigger className="sm:w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="away">Ausentes</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loadingAgents ? (
        <Card>
          <CardContent className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <GenericEmptyState
          icon={Users}
          title="Nenhum atendente"
          description="Nenhum atendente corresponde ao filtro atual."
        />
      ) : (
        <AgentOpsTable
          agents={filtered}
          pendingCounts={pendingCounts}
          recentSendsByAgent={recentSendsByAgent}
        />
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'success' | 'warning' | 'muted' | 'info';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-success'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'info'
          ? 'text-info'
          : 'text-muted-foreground';
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
          {label}
        </div>
        <div className={`text-2xl font-bold tabular-nums ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
