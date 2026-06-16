import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { format, formatDistanceStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  MessageCircle, Reply, Clock, CheckCircle2, RotateCcw, Activity, AlertTriangle,
  Filter, XCircle, Target, Users, User, MinusCircle, ExternalLink,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { cn } from '@/lib/utils';
import { Conversation } from '@/types/chat';
import { useConversationSLATimeline } from '@/hooks/useConversationSLATimeline';
import { useApplicableSLA } from '@/features/sla';
import { useSLAAlerts } from '@/features/sla';

type SLAStatus = 'ok' | 'warning' | 'breached' | 'na';
type PeriodFilter = '24h' | '7d' | '30d' | 'all';
type SLAScope = 'current' | 'queue' | 'agent' | 'none';

const FILTER_STORAGE_KEY = 'sla-timeline-filters';
const ALL_STATUSES: SLAStatus[] = ['ok', 'warning', 'breached', 'na'];
const PERIOD_MS: Record<PeriodFilter, number> = {
  '24h': 86_400_000,
  '7d': 604_800_000,
  '30d': 2_592_000_000,
  all: Infinity,
};

function getSLAStatus(durationMs: number | null, limitMinutes: number): SLAStatus {
  if (durationMs === null) return 'na';
  const limitMs = limitMinutes * 60_000;
  if (durationMs > limitMs) return 'breached';
  if (durationMs > limitMs * 0.7) return 'warning';
  return 'ok';
}

function isWithinPeriod(date: Date | null, period: PeriodFilter): boolean {
  if (period === 'all') return true;
  if (!date) return false;
  return Date.now() - date.getTime() <= PERIOD_MS[period];
}

const STATUS_STYLES: Record<SLAStatus, { label: string; className: string }> = {
  ok: { label: 'Dentro do SLA', className: 'bg-success/15 text-success border-success/30' },
  warning: { label: 'Em risco', className: 'bg-warning/15 text-warning border-warning/30' },
  breached: { label: 'Violado', className: 'bg-destructive/15 text-destructive border-destructive/30' },
  na: { label: '—', className: 'bg-muted/40 text-muted-foreground border-border/40' },
};

function formatDurationMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}min`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

function formatTs(d: Date | null): string {
  return d ? format(d, "dd/MM HH:mm", { locale: ptBR }) : '—';
}

interface MilestoneProps {
  index: number;
  icon: typeof MessageCircle;
  label: string;
  timestamp: Date | null;
  durationLabel?: string | null;
  status?: SLAStatus;
  pulse?: boolean;
  iconColor?: string;
  agentName?: string | null;
  queueName?: string | null;
  /** Optional disclaimer shown below the chips (e.g. "atribuição parcial"). */
  attributionNote?: string | null;
  /** Style of the note: 'fallback' = warning tone, 'info' = neutral. */
  attributionTone?: 'fallback' | 'info';
  /** Show "Abrir conversa" CTA — only meaningful when status is warning/breached. */
  onOpenConversation?: () => void;
}

function Milestone({
  index, icon: Icon, label, timestamp, durationLabel, status, pulse, iconColor,
  agentName, queueName, attributionNote, attributionTone = 'info', onOpenConversation,
}: MilestoneProps) {
  const statusStyle = status ? STATUS_STYLES[status] : null;
  const showOpenCta = onOpenConversation && (status === 'warning' || status === 'breached');
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      role="listitem"
      className={cn(
        'relative flex gap-3 py-2',
        status === 'breached' && 'rounded-md -mx-1 px-1 bg-destructive/5',
        status === 'warning' && 'rounded-md -mx-1 px-1 bg-warning/5',
      )}
    >
      <div
        className={cn(
          'relative z-10 mt-0.5 w-[22px] h-[22px] rounded-full bg-background border-2 border-border flex items-center justify-center shrink-0',
          pulse && 'animate-pulse border-warning/60',
          status === 'breached' && 'border-destructive/60',
          status === 'warning' && !pulse && 'border-warning/60',
        )}
      >
        <Icon className={cn('w-3 h-3', iconColor || 'text-muted-foreground')} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-medium text-foreground">{label}</span>
          {statusStyle && (
            <Badge
              variant="outline"
              className={cn(
                'text-[9px] h-4 px-1.5 font-medium border inline-flex items-center gap-1',
                statusStyle.className,
              )}
              aria-label={`SLA: ${statusStyle.label}`}
            >
              {status === 'breached' && <XCircle className="w-2.5 h-2.5" aria-hidden />}
              {status === 'warning' && <AlertTriangle className="w-2.5 h-2.5" aria-hidden />}
              {statusStyle.label}
            </Badge>
          )}
          {showOpenCta && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenConversation}
              className={cn(
                'h-5 px-1.5 text-[10px] gap-1 ml-auto',
                status === 'breached'
                  ? 'border-destructive/40 text-destructive hover:bg-destructive/10'
                  : 'border-warning/40 text-warning hover:bg-warning/10',
              )}
            >
              <ExternalLink className="w-2.5 h-2.5" aria-hidden />
              Abrir conversa
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
          <span>{formatTs(timestamp)}</span>
          {durationLabel && <span className="text-foreground/60">· {durationLabel}</span>}
        </div>
        {(agentName || queueName) && (
          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground/90 flex-wrap">
            {agentName && (
              <span className="inline-flex items-center gap-1 bg-muted/40 rounded px-1.5 py-0.5">
                <User className="w-2.5 h-2.5" />
                <span className="text-foreground/80 font-medium">{agentName}</span>
              </span>
            )}
            {queueName && (
              <span className="inline-flex items-center gap-1 bg-muted/40 rounded px-1.5 py-0.5">
                <Users className="w-2.5 h-2.5" />
                <span className="text-foreground/80">{queueName}</span>
              </span>
            )}
          </div>
        )}
        {attributionNote && (
          <div
            className={cn(
              'mt-1 inline-flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5',
              attributionTone === 'fallback'
                ? 'bg-warning/10 text-warning border border-warning/30'
                : 'bg-muted/40 text-muted-foreground'
            )}
            role="note"
          >
            <AlertTriangle className="w-2.5 h-2.5" />
            <span>{attributionNote}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

interface SLATimelineSectionProps {
  conversation: Conversation;
}

interface MilestoneEntry {
  key: string;
  date: Date | null;
  status: SLAStatus;
  alwaysVisible?: boolean;
  render: (index: number) => JSX.Element;
}

function loadFilters(): { status: SLAStatus[]; period: PeriodFilter; scope: SLAScope } {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const status = Array.isArray(parsed.status)
        ? parsed.status.filter((s: string): s is SLAStatus => ALL_STATUSES.includes(s as SLAStatus))
        : ALL_STATUSES;
      const period: PeriodFilter = ['24h', '7d', '30d', 'all'].includes(parsed.period) ? parsed.period : 'all';
      const scope: SLAScope = ['current', 'queue', 'agent', 'none'].includes(parsed.scope) ? parsed.scope : 'current';
      return { status: status.length ? status : ALL_STATUSES, period, scope };
    }
  } catch { /* storage unavailable */ }
  return { status: ALL_STATUSES, period: 'all', scope: 'current' };
}

const SCOPE_LABELS: Record<SLAScope, string> = {
  current: 'Atual (fila + agente)',
  queue: 'Por fila',
  agent: 'Por agente',
  none: 'Sem SLA',
};

export function SLATimelineSection({ conversation }: SLATimelineSectionProps) {
  const { contact, queue, assignedTo } = conversation;
  const remoteJid = useMemo(
    () => (contact.phone ? `${contact.phone}@s.whatsapp.net` : null),
    [contact.phone]
  );

  const initial = useMemo(loadFilters, []);
  const [statusFilter, setStatusFilter] = useState<SLAStatus[]>(initial.status);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(initial.period);
  const [scope, setScope] = useState<SLAScope>(initial.scope);

  useEffect(() => {
    try {
      localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({ status: statusFilter, period: periodFilter, scope })
      );
    } catch { /* storage unavailable */ }
  }, [statusFilter, periodFilter, scope]);

  const { data: timeline, isLoading } = useConversationSLATimeline(remoteJid, contact.id);

  const slaQueueId = scope === 'current' || scope === 'queue' ? (queue?.id ?? null) : null;
  const slaAgentId = scope === 'current' || scope === 'agent' ? (assignedTo?.id ?? null) : null;
  const { data: sla } = useApplicableSLA({
    contactId: scope === 'none' ? undefined : contact.id,
    company: scope === 'none' ? null : (contact.company ?? null),
    jobTitle: scope === 'none' ? null : (contact.job_title ?? null),
    contactType: scope === 'none' ? null : (contact.contact_type ?? null),
    queueId: slaQueueId,
    agentId: slaAgentId,
  });

  const firstResponseLimit = sla?.firstResponseMinutes ?? 5;
  const resolutionLimit = sla?.resolutionMinutes ?? 60;

  // Statuses e hooks abaixo são computados/chamados ANTES dos early-returns
  // (rules-of-hooks). Tolera `timeline` ausente via optional chaining.
  const firstResponseStatus: SLAStatus = scope === 'none' || !timeline
    ? 'na'
    : timeline.isAwaitingFirstResponse
      ? getSLAStatus(timeline.awaitingMs, firstResponseLimit)
      : getSLAStatus(timeline.firstResponseDurationMs, firstResponseLimit);

  const resolutionStatus: SLAStatus = scope === 'none' || !timeline
    ? 'na'
    : timeline.resolutionDurationMs !== null
      ? getSLAStatus(timeline.resolutionDurationMs, resolutionLimit)
      : 'na';

  const handleOpenConversation = useMemo(() => {
    return () => {
      // Notify any inbox container/router that wants to focus this conversation.
      try {
        window.dispatchEvent(
          new CustomEvent('inbox:focus-conversation', {
            detail: { contactId: contact.id, remoteJid, conversationId: conversation.id },
          }),
        );
      } catch { /* SSR / older browsers — no-op */ }

      // Open the conversation details panel for THIS contact first, then any open
      // details panel, then fall back to the chat panel.
      const detailsPanel =
        document.querySelector<HTMLElement>(
          `[data-contact-details][data-contact-id="${contact.id}"]`,
        ) || document.querySelector<HTMLElement>('[data-contact-details]');

      const target = detailsPanel || document.querySelector<HTMLElement>('[data-chat-panel]');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.focus({ preventScroll: true });
      }
    };
  }, [contact.id, remoteJid, conversation.id]);

  useSLAAlerts({
    contactId: contact.id ?? null,
    contactName: contact.name || contact.phone || 'Contato',
    scope,
    firstResponseStatus,
    resolutionStatus,
    ruleName: sla?.ruleName ?? null,
    awaitingMs: timeline?.awaitingMs ?? null,
    resolutionDurationMs: timeline?.resolutionDurationMs ?? null,
    onOpenConversation: handleOpenConversation,
  });

  if (isLoading) {
    return (
      <div className="space-y-3 py-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="w-[22px] h-[22px] rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-2.5 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!timeline || (!timeline.firstContactAt && timeline.totalMessages === 0)) {
    return (
      <GenericEmptyState
        icon={Activity}
        title="Sem marcos ainda"
        description="A linha do tempo aparecerá assim que houver mensagens."
        className="py-6"
      />
    );
  }

  const firstResponseDurationLabel = timeline.isAwaitingFirstResponse
    ? `Aguardando há ${formatDurationMs(timeline.awaitingMs)}`
    : timeline.firstResponseDurationMs !== null
      ? `Respondido em ${formatDurationMs(timeline.firstResponseDurationMs)} (limite ${firstResponseLimit}min)`
      : null;

  const milestones: MilestoneEntry[] = [];

  if (timeline.firstContactAt) {
    milestones.push({
      key: 'first-contact',
      date: timeline.firstContactAt,
      status: 'na',
      render: (i) => (
        <Milestone
          key="first-contact"
          index={i}
          icon={MessageCircle}
          label="Primeira mensagem do contato"
          timestamp={timeline.firstContactAt}
          iconColor="text-primary"
        />
      ),
    });
  }

  const attributionSource = timeline.firstResponseAttributionSource;
  // Only trust event-based attribution (assign within window). For weaker sources
  // fall back to the conversation's CURRENT assignment, but flag it to the user.
  const attributionFromEvents = attributionSource === 'assign-event';
  const firstResponseAgentName = attributionFromEvents
    ? timeline.firstResponseBy?.agentName ?? null
    : assignedTo?.name ?? null;
  const firstResponseQueueName = attributionFromEvents
    ? timeline.firstResponseBy?.queueName ?? null
    : queue?.name ?? null;

  let attributionNote: string | null = null;
  let attributionTone: 'fallback' | 'info' = 'info';
  if (timeline.firstResponseAt && !timeline.isAwaitingFirstResponse) {
    if (attributionSource === 'assign-event' && timeline.firstResponseAttributionWindow) {
      const w = timeline.firstResponseAttributionWindow;
      attributionNote = `Atribuição calculada do assign em ${format(w.from, 'HH:mm', { locale: ptBR })} até a resposta em ${format(w.to, 'HH:mm', { locale: ptBR })}`;
      attributionTone = 'info';
    } else if (attributionSource === 'pre-contact-assign') {
      attributionNote = 'Sem evento de assign após o contato — exibindo a atribuição atual da conversa';
      attributionTone = 'fallback';
    } else if (attributionSource === 'insufficient-events') {
      attributionNote = firstResponseAgentName || firstResponseQueueName
        ? 'Sem eventos de assign no período — atribuição estimada pelo estado atual'
        : 'Sem eventos suficientes para identificar agente/fila';
      attributionTone = 'fallback';
    }
  }

  if (timeline.firstResponseAt || timeline.isAwaitingFirstResponse) {
    milestones.push({
      key: 'first-response',
      date: timeline.firstResponseAt ?? timeline.firstContactAt,
      status: firstResponseStatus,
      alwaysVisible: timeline.isAwaitingFirstResponse,
      render: (i) => (
        <Milestone
          key="first-response"
          index={i}
          icon={timeline.isAwaitingFirstResponse ? AlertTriangle : Reply}
          label={timeline.isAwaitingFirstResponse ? 'Aguardando primeira resposta' : 'Primeira resposta do agente'}
          timestamp={timeline.firstResponseAt}
          durationLabel={firstResponseDurationLabel}
          status={firstResponseStatus}
          pulse={timeline.isAwaitingFirstResponse}
          iconColor={timeline.isAwaitingFirstResponse ? 'text-warning' : 'text-success'}
          agentName={timeline.isAwaitingFirstResponse ? null : firstResponseAgentName}
          queueName={timeline.isAwaitingFirstResponse ? null : firstResponseQueueName}
          attributionNote={timeline.isAwaitingFirstResponse ? null : attributionNote}
          attributionTone={attributionTone}
          onOpenConversation={handleOpenConversation}
        />
      ),
    });
  }

  if (timeline.lastMessageAt) {
    milestones.push({
      key: 'last-message',
      date: timeline.lastMessageAt,
      status: 'na',
      render: (i) => (
        <Milestone
          key="last-message"
          index={i}
          icon={Clock}
          label="Última mensagem"
          timestamp={timeline.lastMessageAt}
          durationLabel={`há ${formatDistanceStrict(timeline.lastMessageAt!, new Date(), { locale: ptBR })}`}
          iconColor="text-muted-foreground"
        />
      ),
    });
  }

  if (timeline.closedAt) {
    milestones.push({
      key: 'closed',
      date: timeline.closedAt,
      status: resolutionStatus,
      render: (i) => (
        <Milestone
          key="closed"
          index={i}
          icon={CheckCircle2}
          label="Conversa encerrada"
          timestamp={timeline.closedAt}
          durationLabel={
            timeline.resolutionDurationMs !== null
              ? `Resolvido em ${formatDurationMs(timeline.resolutionDurationMs)} (limite ${resolutionLimit}min)`
              : null
          }
          status={resolutionStatus}
          iconColor="text-success"
          agentName={timeline.resolvedBy?.agentName ?? null}
          queueName={timeline.resolvedBy?.queueName ?? null}
          onOpenConversation={handleOpenConversation}
        />
      ),
    });
  }

  if (timeline.reopenedAt) {
    milestones.push({
      key: 'reopened',
      date: timeline.reopenedAt,
      status: 'na',
      render: (i) => (
        <Milestone
          key="reopened"
          index={i}
          icon={RotateCcw}
          label="Conversa reaberta"
          timestamp={timeline.reopenedAt}
          iconColor="text-warning"
        />
      ),
    });
  }

  const filteredMilestones = milestones.filter(
    (m) => m.alwaysVisible || (statusFilter.includes(m.status) && isWithinPeriod(m.date, periodFilter))
  );

  const clearFilters = () => {
    setStatusFilter(ALL_STATUSES);
    setPeriodFilter('all');
    setScope('current');
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-muted/30 p-2 space-y-2">
        <div className="flex items-center gap-2">
          <Filter className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Filtros</span>
          {(() => {
            const onlyAtRisk =
              statusFilter.length === 2 &&
              statusFilter.includes('warning') &&
              statusFilter.includes('breached');
            return (
              <Button
                type="button"
                variant={onlyAtRisk ? 'default' : 'outline'}
                size="sm"
                onClick={() =>
                  setStatusFilter(onlyAtRisk ? ALL_STATUSES : ['warning', 'breached'])
                }
                aria-pressed={onlyAtRisk}
                className={cn(
                  'h-5 px-2 text-[10px] gap-1',
                  onlyAtRisk
                    ? 'bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/20'
                    : 'border-border/60',
                )}
                title="Mostrar apenas marcos em risco ou violados para o escopo selecionado"
              >
                <AlertTriangle className="w-2.5 h-2.5" aria-hidden />
                Só em risco/violado
              </Button>
            );
          })()}
          <Badge variant="outline" className="ml-auto text-[9px] h-4 px-1.5">
            {filteredMilestones.length} de {milestones.length}
          </Badge>
        </div>
        <ToggleGroup
          type="multiple"
          size="sm"
          variant="outline"
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v.length ? (v as SLAStatus[]) : ALL_STATUSES)}
          aria-label="Filtrar marcos por status"
          className="flex-wrap justify-start gap-1"
        >
          <ToggleGroupItem value="ok" className="h-6 px-2 text-[10px] data-[state=on]:bg-success/15 data-[state=on]:text-success">
            <CheckCircle2 className="w-3 h-3 mr-1" />OK
          </ToggleGroupItem>
          <ToggleGroupItem value="warning" className="h-6 px-2 text-[10px] data-[state=on]:bg-warning/15 data-[state=on]:text-warning">
            <AlertTriangle className="w-3 h-3 mr-1" />Em risco
          </ToggleGroupItem>
          <ToggleGroupItem value="breached" className="h-6 px-2 text-[10px] data-[state=on]:bg-destructive/15 data-[state=on]:text-destructive">
            <XCircle className="w-3 h-3 mr-1" />Violado
          </ToggleGroupItem>
          <ToggleGroupItem value="na" className="h-6 px-2 text-[10px]">
            Outros
          </ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={periodFilter}
          onValueChange={(v) => v && setPeriodFilter(v as PeriodFilter)}
          aria-label="Filtrar por período"
          className="flex-wrap justify-start gap-1"
        >
          <ToggleGroupItem value="24h" className="h-6 px-2 text-[10px]">24h</ToggleGroupItem>
          <ToggleGroupItem value="7d" className="h-6 px-2 text-[10px]">7d</ToggleGroupItem>
          <ToggleGroupItem value="30d" className="h-6 px-2 text-[10px]">30d</ToggleGroupItem>
          <ToggleGroupItem value="all" className="h-6 px-2 text-[10px]">Tudo</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={scope}
          onValueChange={(v) => v && setScope(v as SLAScope)}
          aria-label="Escopo da regra de SLA"
          className="flex-wrap justify-start gap-1"
        >
          <ToggleGroupItem value="current" className="h-6 px-2 text-[10px] data-[state=on]:bg-primary/10 data-[state=on]:text-primary">
            <Target className="w-3 h-3 mr-1" />Atual
          </ToggleGroupItem>
          <ToggleGroupItem value="queue" className="h-6 px-2 text-[10px] data-[state=on]:bg-primary/10 data-[state=on]:text-primary">
            <Users className="w-3 h-3 mr-1" />Fila
          </ToggleGroupItem>
          <ToggleGroupItem value="agent" className="h-6 px-2 text-[10px] data-[state=on]:bg-primary/10 data-[state=on]:text-primary">
            <User className="w-3 h-3 mr-1" />Agente
          </ToggleGroupItem>
          <ToggleGroupItem value="none" className="h-6 px-2 text-[10px] data-[state=on]:bg-muted data-[state=on]:text-muted-foreground">
            <MinusCircle className="w-3 h-3 mr-1" />Sem SLA
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {filteredMilestones.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-[11px] text-muted-foreground">Nenhum marco corresponde aos filtros</p>
          <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={clearFilters}>
            Limpar filtros
          </Button>
        </div>
      ) : (
        <div role="list" aria-label="Marcos de SLA da conversa" className="relative">
          <div className="absolute left-[11px] top-3 bottom-3 w-px bg-border/50" />
          {filteredMilestones.map((m, i) => m.render(i))}
        </div>
      )}

      <p className="pl-1 text-[10px] text-muted-foreground/80 leading-relaxed">
        Avaliado por: <span className="text-foreground/80 font-medium">{SCOPE_LABELS[scope]}</span>
        {scope !== 'none' && sla && (
          <>
            {' · Regra '}<span className="text-foreground/80 font-medium">{sla.ruleName}</span>
            {' · '}1ª resp. {sla.firstResponseMinutes}min · Resolução {sla.resolutionMinutes}min
          </>
        )}
        {scope === 'none' && ' · limites desativados'}
      </p>
    </div>
  );
}
