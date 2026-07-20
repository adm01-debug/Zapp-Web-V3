/**
 * SupervisorQueueBoard
 *
 * Lista conversas abertas ordenadas por prioridade e permite ao supervisor
 * redirecionar para outro agente ou movê-las para outra fila.
 */
import { useMemo, useState } from 'react';
import { RefreshCw, User, Users, AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  useSupervisorConversations,
  type SupervisorConversationRow,
} from '../hooks/useSupervisorConversations';
import { PRIORITY_META, PRIORITY_RULES_TEXT, type PriorityLevel } from '../lib/supervisorPriority';

const FILTERS: Array<{ id: 'all' | PriorityLevel; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'critical', label: 'P1' },
  { id: 'high', label: 'P2' },
  { id: 'medium', label: 'P3' },
  { id: 'normal', label: 'P4' },
];

const UNASSIGNED_VALUE = '__none__';

/** Supervisor Queue Board function. */
export function SupervisorQueueBoard() {
  const { rows, agents, queues, loading, refreshedAt, summary, reload, reassignAgent, moveQueue } =
    useSupervisorConversations();
  const [filter, setFilter] = useState<'all' | PriorityLevel>('all');

  const filtered = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.priority.level === filter)),
    [rows, filter],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const count =
            f.id === 'all'
              ? rows.length
              : summary[f.id];
          return (
            <Button
              key={f.id}
              size="sm"
              variant={filter === f.id ? 'default' : 'outline'}
              className="h-7 text-[11px]"
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <Badge variant="secondary" className="ml-1.5 h-4 min-w-4 px-1 text-[10px]">
                {count}
              </Badge>
            </Button>
          );
        })}
        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          {refreshedAt && <span>Atualizado {refreshedAt.toLocaleTimeString('pt-BR')}</span>}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-[11px]"
                aria-label="Ver regras de prioridade"
              >
                <Info className="h-3.5 w-3.5" /> Regras
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 text-xs">
              <p className="mb-2 font-semibold">Regras de prioridade</p>
              <ul className="space-y-1 text-muted-foreground">
                {PRIORITY_RULES_TEXT.map((r) => (
                  <li key={r} className="leading-snug">• {r}</li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => void reload()}
            disabled={loading}
            aria-label="Recarregar"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <div className="max-h-[420px] overflow-y-auto rounded-xl border border-border/40">
        {loading && rows.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Carregando conversas…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            Nenhuma conversa nesse filtro.
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {filtered.map((row) => (
              <ConversationRow
                key={row.id}
                row={row}
                agents={agents}
                queues={queues}
                onReassignAgent={reassignAgent}
                onMoveQueue={moveQueue}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface RowProps {
  row: SupervisorConversationRow;
  agents: { id: string; name: string; role: string }[];
  queues: { id: string; name: string }[];
  onReassignAgent: (contactId: string, agentId: string | null) => Promise<void>;
  onMoveQueue: (contactId: string, queueId: string | null) => Promise<void>;
}

function ConversationRow({ row, agents, queues, onReassignAgent, onMoveQueue }: RowProps) {
  const meta = PRIORITY_META[row.priority.level];
  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge className={cn('h-5 px-1.5 text-[10px]', meta.badgeClass)}>{meta.label}</Badge>
          <p className="truncate text-sm font-medium">{row.name || row.phone}</p>
          {row.priority.level === 'critical' && (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
          )}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
          <span>{row.priority.reason}</span>
          <span>•</span>
          <span className="inline-flex items-center gap-1">
            <User className="h-3 w-3" />
            {row.agentName ?? 'Sem atendente'}
          </span>
          <span>•</span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" />
            {row.queueName ?? 'Sem fila'}
          </span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select
          value={row.assigned_to ?? UNASSIGNED_VALUE}
          onValueChange={(v) => onReassignAgent(row.id, v === UNASSIGNED_VALUE ? null : v)}
        >
          <SelectTrigger className="h-8 w-40 text-xs" aria-label="Redirecionar para agente">
            <SelectValue placeholder="Redirecionar…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED_VALUE}>Sem atendente</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={row.queue_id ?? UNASSIGNED_VALUE}
          onValueChange={(v) => onMoveQueue(row.id, v === UNASSIGNED_VALUE ? null : v)}
        >
          <SelectTrigger className="h-8 w-40 text-xs" aria-label="Mover para fila">
            <SelectValue placeholder="Mover fila…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED_VALUE}>Sem fila</SelectItem>
            {queues.map((q) => (
              <SelectItem key={q.id} value={q.id}>
                {q.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </li>
  );
}
