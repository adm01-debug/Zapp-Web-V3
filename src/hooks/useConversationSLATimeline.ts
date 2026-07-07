import { useQuery } from '@tanstack/react-query';
import { externalSupabase, isExternalConfigured } from '@/integrations/supabase/externalClient';
import { safeClient } from '@/integrations/supabase/safeClient';
import { dbList } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';

export interface SLAAttribution {
  agentId: string | null;
  agentName: string | null;
  queueId: string | null;
  queueName: string | null;
}

/**
 * How the first-response attribution was determined.
 * - 'assign-event': an `assign` event sits between firstContactAt and firstResponseAt (canonical).
 * - 'pre-contact-assign': only an assign before firstContactAt exists; used as a weaker signal.
 * - 'insufficient-events': no usable assign event was found — UI must show a fallback label
 *   (callers may then fall back to the conversation's current `assignedTo`/`queue`).
 * - 'not-applicable': there is no first response yet.
 */
export type FirstResponseAttributionSource =
  | 'assign-event'
  | 'pre-contact-assign'
  | 'insufficient-events'
  | 'not-applicable';

export interface SLATimelineData {
  firstContactAt: Date | null;
  firstResponseAt: Date | null;
  firstResponseDurationMs: number | null;
  lastMessageAt: Date | null;
  closedAt: Date | null;
  resolutionDurationMs: number | null;
  reopenedAt: Date | null;
  isAwaitingFirstResponse: boolean;
  awaitingMs: number | null;
  totalMessages: number;
  firstResponseBy: SLAAttribution | null;
  /** Window used for attribution: [firstAssignAt, firstResponseAt]. Null when no valid window. */
  firstResponseAttributionWindow: { from: Date; to: Date } | null;
  firstResponseAttributionSource: FirstResponseAttributionSource;
  resolvedBy: SLAAttribution | null;
}

interface EvolutionMessageRow {
  created_at: string;
  direction: string | null;
  from_me: boolean | null;
}

interface ConversationEventRow {
  event_type: string;
  created_at: string;
  performed_by: string | null;
  from_agent_id: string | null;
  to_agent_id: string | null;
  from_queue_id: string | null;
  to_queue_id: string | null;
  performed_by_profile?: { id: string; name: string | null } | null;
  to_agent?: { id: string; name: string | null } | null;
  to_queue?: { id: string; name: string | null } | null;
}

const EMPTY: SLATimelineData = {
  firstContactAt: null,
  firstResponseAt: null,
  firstResponseDurationMs: null,
  lastMessageAt: null,
  closedAt: null,
  resolutionDurationMs: null,
  reopenedAt: null,
  isAwaitingFirstResponse: false,
  awaitingMs: null,
  totalMessages: 0,
  firstResponseBy: null,
  firstResponseAttributionWindow: null,
  firstResponseAttributionSource: 'not-applicable',
  resolvedBy: null,
};

/**
 * Resolves the SLA milestones for a single conversation.
 * - Pulls messages from FATOR X (`rpc_list_messages`) to find first inbound/outbound + last activity.
 * - Pulls close/reopen events from Lovable Cloud `conversation_events`.
 */
export function useConversationSLATimeline(remoteJid: string | null, contactId: string | null) {
  const enabled = Boolean(remoteJid && isExternalConfigured);

  return useQuery({
    queryKey: ['sla-timeline', remoteJid, contactId],
    enabled,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const data = query.state.data as SLATimelineData | undefined;
      return data?.isAwaitingFirstResponse ? 30_000 : false;
    },
    queryFn: async (): Promise<SLATimelineData> => {
      if (!remoteJid || !externalSupabase) return EMPTY;

      // 1. Messages — first inbound, first outbound, last
      // Uses the lite RPC (no payload/raw_data) — only timestamps/direction needed for SLA math.
      const { data: msgs, error: msgErr } = await dbList(RPC.listMessagesLite, {
        p_remote_jid: remoteJid,
        p_limit: 500,
      });
      if (msgErr) throw msgErr;

      const rows = (msgs || []) as EvolutionMessageRow[];
      // RPC returns DESC by created_at typically; sort ASC for milestone scan.
      const sorted = [...rows].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      const firstInbound = sorted.find(
        (m) => m.from_me === false || m.direction === 'inbound'
      );
      const firstOutbound = sorted.find(
        (m) => m.from_me === true || m.direction === 'outbound'
      );
      const last = sorted[sorted.length - 1];

      const firstContactAt = firstInbound ? new Date(firstInbound.created_at) : null;
      const firstResponseAt = firstOutbound ? new Date(firstOutbound.created_at) : null;
      const lastMessageAt = last ? new Date(last.created_at) : null;

      const firstResponseDurationMs =
        firstContactAt && firstResponseAt && firstResponseAt > firstContactAt
          ? firstResponseAt.getTime() - firstContactAt.getTime()
          : null;

      const isAwaitingFirstResponse = Boolean(firstContactAt && !firstResponseAt);
      const awaitingMs =
        isAwaitingFirstResponse && firstContactAt
          ? Date.now() - firstContactAt.getTime()
          : null;

      // 2. Close / reopen / assign events from Lovable Cloud (best-effort)
      let closedAt: Date | null = null;
      let reopenedAt: Date | null = null;
      let resolvedBy: SLAAttribution | null = null;
      let firstResponseBy: SLAAttribution | null = null;
      let firstResponseAttributionWindow: { from: Date; to: Date } | null = null;
      let firstResponseAttributionSource: FirstResponseAttributionSource = firstResponseAt
        ? 'insufficient-events'
        : 'not-applicable';

      if (contactId) {
        const { data: events } = await safeClient.from<ConversationEventRow>('conversation_events', q =>
          q.select(`
            event_type, created_at, performed_by, from_agent_id, to_agent_id,
            from_queue_id, to_queue_id,
            performed_by_profile:profiles!conversation_events_performed_by_fkey(id, name),
            to_agent:profiles!conversation_events_to_agent_id_fkey(id, name),
            to_queue:queues!conversation_events_to_queue_id_fkey(id, name)
          `).eq('contact_id', contactId)
            .in('event_type', ['close', 'reopen', 'assign'])
            .order('created_at', { ascending: false })
            .limit(50),
        );

        const eventRows = events ?? [];
        const lastClose = eventRows.find((e) => e.event_type === 'close');
        const lastReopen = eventRows.find((e) => e.event_type === 'reopen');

        if (lastClose) {
          closedAt = new Date(lastClose.created_at);
          resolvedBy = {
            agentId: lastClose.performed_by_profile?.id ?? lastClose.performed_by ?? null,
            agentName: lastClose.performed_by_profile?.name ?? null,
            queueId: lastClose.to_queue?.id ?? lastClose.to_queue_id ?? null,
            queueName: lastClose.to_queue?.name ?? null,
          };
        }
        if (lastReopen) reopenedAt = new Date(lastReopen.created_at);

        // If reopen happened after close, conversation is open again — nullify closedAt for resolution math.
        if (closedAt && reopenedAt && reopenedAt > closedAt) {
          closedAt = null;
          resolvedBy = null;
        }

        // First-response attribution.
        // Canonical rule: window = [first assign at-or-after firstContactAt, firstResponseAt].
        // The agent/queue shown is the one held by the LAST assign that landed inside that window
        // (so handoffs that happened before the agent actually replied still count).
        if (firstResponseAt) {
          const assignsAsc = eventRows
            .filter((e) => e.event_type === 'assign')
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

          const responseTs = firstResponseAt.getTime();
          const contactTs = firstContactAt?.getTime() ?? -Infinity;

          const inWindow = assignsAsc.filter((e) => {
            const ts = new Date(e.created_at).getTime();
            return ts >= contactTs && ts <= responseTs;
          });

          if (inWindow.length > 0) {
            const firstAssign = inWindow[0];
            const lastAssign = inWindow[inWindow.length - 1];
            firstResponseBy = {
              agentId: lastAssign.to_agent?.id ?? lastAssign.to_agent_id ?? null,
              agentName: lastAssign.to_agent?.name ?? null,
              queueId: lastAssign.to_queue?.id ?? lastAssign.to_queue_id ?? null,
              queueName: lastAssign.to_queue?.name ?? null,
            };
            firstResponseAttributionWindow = {
              from: new Date(firstAssign.created_at),
              to: firstResponseAt,
            };
            firstResponseAttributionSource = 'assign-event';
          } else {
            // Weaker fallback: an assign exists, but only BEFORE firstContactAt.
            const preContact = [...assignsAsc]
              .reverse()
              .find((e) => new Date(e.created_at).getTime() < contactTs);
            if (preContact) {
              firstResponseBy = {
                agentId: preContact.to_agent?.id ?? preContact.to_agent_id ?? null,
                agentName: preContact.to_agent?.name ?? null,
                queueId: preContact.to_queue?.id ?? preContact.to_queue_id ?? null,
                queueName: preContact.to_queue?.name ?? null,
              };
              firstResponseAttributionSource = 'pre-contact-assign';
            } else {
              firstResponseAttributionSource = 'insufficient-events';
            }
          }
        }
      }

      const resolutionDurationMs =
        firstContactAt && closedAt && closedAt > firstContactAt
          ? closedAt.getTime() - firstContactAt.getTime()
          : null;

      return {
        firstContactAt,
        firstResponseAt,
        firstResponseDurationMs,
        lastMessageAt,
        closedAt,
        resolutionDurationMs,
        reopenedAt,
        isAwaitingFirstResponse,
        awaitingMs,
        totalMessages: sorted.length,
        firstResponseBy,
        firstResponseAttributionWindow,
        firstResponseAttributionSource,
        resolvedBy,
      };
    },
  });
}
