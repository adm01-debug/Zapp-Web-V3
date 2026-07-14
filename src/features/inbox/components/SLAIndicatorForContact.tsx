import { useEffect, useRef } from 'react';
import { log } from '@/lib/logger';
import { SLAIndicator } from './SLAIndicator';
import { useApplicableSLA, ApplicableSLA, SLAMatchedLevel } from '@/features/sla';
import { Conversation } from '@/types/chat';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface SLAIndicatorForContactProps {
  conversation: Conversation;
  compact?: boolean;
  className?: string;
}

const HIERARCHY: { level: SLAMatchedLevel; label: string }[] = [
  { level: 'contact', label: 'Contato' },
  { level: 'company', label: 'Empresa' },
  { level: 'job_title', label: 'Cargo' },
  { level: 'contact_type', label: 'Tipo' },
  { level: 'queue', label: 'Fila' },
  { level: 'agent', label: 'Agente' },
];

function levelLabel(level: SLAMatchedLevel, conversation: Conversation): string {
  const c = conversation.contact;
  switch (level) {
    case 'contact':
      return 'Contato específico';
    case 'company':
      return `Empresa${c.company ? `: ${c.company}` : ''}`;
    case 'job_title':
      return `Cargo${c.job_title ? `: ${c.job_title}` : ''}`;
    case 'contact_type':
      return `Tipo${c.contact_type ? `: ${c.contact_type}` : ''}`;
    case 'queue':
      return 'Fila';
    case 'agent':
      return 'Agente atribuído';
    case 'global_default':
      return 'Padrão global';
    case 'system_default':
      return 'Padrão do sistema (fallback)';
  }
}

function resolveMessageTimestamp(message: Conversation['lastMessage']): Date | null {
  if (!message || message.sender !== 'agent') return null;
  if (message.timestamp instanceof Date) return message.timestamp;
  if (!message.created_at) return null;
  const parsed = new Date(message.created_at);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

interface SLATooltipContentProps {
  applicable: ApplicableSLA | undefined;
  isLoading: boolean;
  fallbackFr: number;
  fallbackRes: number;
  priority: Conversation['priority'];
  conversation: Conversation;
}

function SLATooltipContent({
  applicable,
  isLoading,
  fallbackFr,
  fallbackRes,
  priority,
  conversation,
}: SLATooltipContentProps) {
  const fr = applicable?.firstResponseMinutes ?? fallbackFr;
  const res = applicable?.resolutionMinutes ?? fallbackRes;
  const matched = applicable?.matchedLevel;

  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="text-sm font-semibold">
        {applicable?.ruleName ?? (isLoading ? 'Carregando regras…' : 'Sem regra específica')}
      </div>

      {matched && (
        <div className="inline-flex w-fit items-center rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          {levelLabel(matched, conversation)}
        </div>
      )}

      <div className="flex flex-col gap-0.5 text-foreground">
        <div>
          1ª resposta: <span className="font-medium">{fr} min</span>
        </div>
        <div>
          Resolução: <span className="font-medium">{res} min</span>
        </div>
      </div>

      <div className="border-t border-border/50 pt-1.5">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Hierarquia
        </div>
        <div className="flex flex-wrap items-center gap-x-1 text-[11px] text-muted-foreground">
          {HIERARCHY.map((h, i) => (
            <span key={h.level} className="inline-flex items-center gap-1">
              <span className={cn(matched === h.level && 'font-semibold text-foreground')}>
                {h.label}
              </span>
              {i < HIERARCHY.length - 1 && <span className="opacity-40">›</span>}
            </span>
          ))}
        </div>
      </div>

      {!applicable && (
        <div className="border-t border-border/50 pt-1.5 text-[11px] text-muted-foreground">
          {isLoading
            ? `Carregando regras de SLA — usando padrões da prioridade (${priority}).`
            : `Nenhuma regra cadastrada cobre este contato. Usando padrão por prioridade (${priority}).`}
        </div>
      )}
    </div>
  );
}

/**
 * Resolves the applicable SLA for the contact (hierarchy: contact > company > job_title > contact_type > queue > agent)
 * and renders the SLAIndicator with those minutes. Tooltip explains the matched rule and fallback reason.
 */
export function SLAIndicatorForContact({
  conversation,
  compact,
  className,
}: SLAIndicatorForContactProps) {
  const contact = conversation.contact;

  // Hooks devem ser chamados incondicionalmente e na mesma ordem em todo render
  // (rules-of-hooks). O early-return de `!contact` fica depois dos hooks; os
  // inputs usam optional chaining para tolerar contato ausente.
  const { data: applicable, isLoading } = useApplicableSLA({
    contactId: contact?.id,
    company: contact?.company ?? null,
    jobTitle: contact?.job_title ?? null,
    contactType: contact?.contact_type ?? null,
    queueId: conversation.queue?.id ?? null,
    agentId: conversation.assignedTo?.id ?? null,
  });

  const lastSlaRef = useRef<string | null>(null);
  const convId = conversation.id || contact?.id || '';
  const priority = conversation.priority || 'medium';
  const createdAt = conversation.createdAt || contact?.createdAt || new Date();
  const lastMessage = conversation.lastMessage;
  const status = conversation.status || 'open';
  const updatedAt = conversation.updatedAt || new Date();

  useEffect(() => {
    if (applicable?.ruleName && applicable.ruleName !== lastSlaRef.current) {
      log.info(
        `[SLA Match] Conv ${convId.slice(0, 8)} matched rule: ${applicable.ruleName} (${applicable.matchedLevel})`
      );
      lastSlaRef.current = applicable.ruleName;
    }
  }, [convId, applicable?.ruleName, applicable?.matchedLevel]);

  const fallbackFr = priority === 'high' ? 2 : 5;
  const fallbackRes = priority === 'high' ? 30 : 60;

  if (!contact) return null;

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <SLAIndicator
            firstMessageAt={createdAt}
            firstResponseAt={resolveMessageTimestamp(lastMessage)}
            resolvedAt={status === 'resolved' ? updatedAt : null}
            firstResponseMinutes={applicable?.firstResponseMinutes ?? fallbackFr}
            resolutionMinutes={applicable?.resolutionMinutes ?? fallbackRes}
            compact={compact}
            className={className}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs border-border bg-foreground shadow-none">
        <SLATooltipContent
          applicable={applicable}
          isLoading={isLoading}
          fallbackFr={fallbackFr}
          fallbackRes={fallbackRes}
          priority={conversation.priority}
          conversation={conversation}
        />
      </TooltipContent>
    </Tooltip>
  );
}
