import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { AgentRecentSendsPopover } from './AgentRecentSendsPopover';
import type { AgentWithStats } from '@/features/admin';
import type { RecentSend } from '@/features/inbox';

interface Props {
  agents: AgentWithStats[];
  pendingCounts: Record<string, number>;
  recentSendsByAgent: Map<string, RecentSend[]>;
}

const statusBadgeVariant = (status: AgentWithStats['status']): 'success' | 'warning' | 'subtle' => {
  if (status === 'online') return 'success';
  if (status === 'away') return 'warning';
  return 'subtle';
};

const statusLabel = (status: AgentWithStats['status']) =>
  status === 'online' ? 'Online' : status === 'away' ? 'Ausente' : 'Offline';

const statusDot = (status: AgentWithStats['status']) =>
  status === 'online' ? 'bg-success' : status === 'away' ? 'bg-warning' : 'bg-muted-foreground/40';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Agent Ops Table component for the agents ops section. */
export function AgentOpsTable({ agents, pendingCounts, recentSendsByAgent }: Props) {
  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Atendente</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Filas</TableHead>
            <TableHead>Em atendimento</TableHead>
            <TableHead>Pendentes</TableHead>
            <TableHead className="text-right">Últimos envios</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {agents.map((agent) => {
            const pending = pendingCounts[agent.id] ?? 0;
            const sends = recentSendsByAgent.get(agent.id) ?? [];
            const max = agent.max_chats ?? 5;
            const pct = max > 0 ? Math.min(100, (agent.activeChats / max) * 100) : 0;
            const visibleQueues = agent.queues.slice(0, 3);
            const moreQueues = agent.queues.length - visibleQueues.length;

            return (
              <TableRow key={agent.id} data-testid={`agent-row-${agent.id}`}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={agent.avatar_url ?? undefined} alt={agent.name} />
                      <AvatarFallback className="text-[10px]">{initials(agent.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{agent.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {agent.role ?? agent.job_title ?? '—'}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 rounded-full', statusDot(agent.status))} />
                    <Badge variant={statusBadgeVariant(agent.status)}>
                      {statusLabel(agent.status)}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>
                  {agent.queues.length === 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1">
                      {visibleQueues.map((q) => (
                        <Badge
                          key={q.id}
                          variant="outline"
                          className="text-[10px] py-0 px-1.5"
                          style={{ borderColor: q.color, color: q.color }}
                        >
                          {q.name}
                        </Badge>
                      ))}
                      {moreQueues > 0 && (
                        <Badge variant="subtle" className="text-[10px] py-0 px-1.5">
                          +{moreQueues}
                        </Badge>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="space-y-1 min-w-[120px]">
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {agent.activeChats} / {max}
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={pending > 0 ? 'warning' : 'subtle'} className="tabular-nums">
                    {pending}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <AgentRecentSendsPopover agentName={agent.name} sends={sends} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
