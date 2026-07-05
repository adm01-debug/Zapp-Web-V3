import { useMemo, useState, useEffect } from 'react';
import { format, formatDistanceStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  MessageCircle, Reply, Clock, CheckCircle2, RotateCcw, Activity, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { Conversation } from '@/types/chat';
import { useConversationSLATimeline } from '@/hooks/useConversationSLATimeline';
import { useApplicableSLA, useSLAAlerts } from '@/features/sla';
import { Milestone } from './sla-timeline/Milestone';
import { SLATimelineFilters } from './sla-timeline/SLATimelineFilters';
import {
  ALL_STATUSES,
  FILTER_STORAGE_KEY,
  SCOPE_LABELS,
  formatDurationMs,
  getSLAStatus,
  isWithinPeriod,
  loadFilters,
  type PeriodFilter,
  type SLAScope,
  type SLAStatus,
} from './sla-timeline/types';

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
      try {
        window.dispatchEvent(
          new CustomEvent('inbox:focus-conversation', {
            detail: { contactId: contact.id, remoteJid, conversationId: conversation.id },
          }),
        );
      } catch { /* SSR / older browsers — no-op */ }

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
      <SLATimelineFilters
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        periodFilter={periodFilter}
        setPeriodFilter={setPeriodFilter}
        scope={scope}
        setScope={setScope}
        filteredCount={filteredMilestones.length}
        totalCount={milestones.length}
      />

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
