/**
 * inboxFilterPipeline.ts — Pure filtering and sorting logic for the inbox.
 * No hooks — safe to unit-test independently.
 */

import { isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';
import { filterByContactType } from '@/features/inbox';
import { InboxFiltersState, ConversationWithMessages, MainTab, SubTab } from '@/features/inbox';
import type { FailureCategory } from '@/features/inbox';

interface PermissionChecker {
  (key: string): boolean;
}

interface TicketStateMap {
  [id: string]: { status: string; assignedTo?: string | null } | undefined;
}

/** Input bag for the pure inbox filter pipeline: conversations, active filter state, ticket map, permission checker, and user context. */
export interface ApplyInboxFiltersOptions {
  conversations: ConversationWithMessages[];
  profileId: string | undefined;
  externalSearch?: string;
  search: string;
  sortBy?: 'lastMessage' | 'name' | 'unread';
  statusFilter?: 'all' | 'open' | 'closed' | 'unread';
  mainTab: MainTab;
  subTab: SubTab;
  showAll: boolean;
  scope: string;
  departmentAgentIds: string[];
  selectedQueueId: string | null;
  selectedContactType: string | null;
  showOnlyRetrying: boolean;
  failureCategoryFilter: FailureCategory | 'all';
  failureCategoryById: Record<string, FailureCategory>;
  filters: InboxFiltersState;
  contactTagsMap: Record<string, string[]>;
  ticketStates: TicketStateMap;
  customScopes: { id: string; name: string }[];
  hasPermission: PermissionChecker;
  permissionsLoading?: boolean;
}

/** Pure function that applies all active inbox filters (tab, scope, search, agent, queue, tags, failure category, date, contact type) and returns the filtered conversation list. */
export function applyInboxFilters(opts: ApplyInboxFiltersOptions): ConversationWithMessages[] {
  const {
    conversations,
    profileId,
    externalSearch,
    search,
    sortBy,
    statusFilter,
    mainTab,
    subTab,
    showAll,
    scope,
    departmentAgentIds,
    selectedQueueId,
    selectedContactType,
    showOnlyRetrying,
    failureCategoryFilter,
    failureCategoryById,
    filters,
    contactTagsMap,
    ticketStates,
    customScopes,
    hasPermission,
    permissionsLoading = false,
  } = opts;

  const canSeeWhatsapp = hasPermission('inbox.view_whatsapp');
  const canSeeInstagram = hasPermission('inbox.view_instagram');
  const canSeeChat = hasPermission('inbox.view_chat');
  const canSeeDept = hasPermission('inbox.view_department');
  const canSeeAll = hasPermission('inbox.view_all');

  const statusOf = (id: string) => ticketStates[id]?.status ?? 'open';
  const assignedOf = (id: string, fallback: string | null | undefined) => {
    const state = ticketStates[id];
    if (state && state.assignedTo !== undefined) return state.assignedTo;
    return fallback ?? null;
  };

  const effectiveSearch = (externalSearch !== undefined ? externalSearch : search || '').trim();

  const requestedScope =
    showAll && canSeeAll
      ? 'all'
      : scope === 'department' && (canSeeDept || canSeeAll)
        ? 'department'
        : scope === 'all' && canSeeAll
          ? 'all'
          : 'mine';

  const hasMineAssignments = conversations.some((c) => {
    if (!c?.contact?.id) return false;
    return assignedOf(c.contact.id, c.contact.assigned_to) === profileId;
  });

  const effectiveScope =
    requestedScope === 'mine' && !hasMineAssignments && (canSeeAll || canSeeDept)
      ? canSeeAll
        ? 'all'
        : 'department'
      : requestedScope;

  // 0. Base validation + channel visibility (always applied, even in search)
  let result = conversations.filter((c) => c && c.contact && c.contact.id);
  if (!permissionsLoading) {
    result = result.filter((c) => {
      const channel = c.contact?.channel_type;
      if (channel === 'whatsapp' && !canSeeWhatsapp) return false;
      if (channel === 'instagram' && !canSeeInstagram) return false;
      if ((channel === 'chat' || channel === 'webchat') && !canSeeChat) return false;
      return true;
    });
  }

  // 1. Tab / Status filtering
  if (effectiveSearch.length === 0) {
    if (mainTab === 'open') {
      result = result.filter((c) => {
        const s = statusOf(c.contact.id);
        if (s === 'resolved') return false;
        if (statusFilter === 'unread' && c.unreadCount === 0) return false;

        if (subTab === 'attending') {
          const assignee = assignedOf(c.contact.id, c.contact.assigned_to);

          if (filters.agentId) {
            if (filters.agentId !== profileId && !canSeeDept && !canSeeAll) {
              return assignee === profileId;
            }
            return assignee === filters.agentId;
          }

          if (!assignee) return false;

          if (effectiveScope === 'all') return true;

          if (effectiveScope === 'department') {
            if (!assignee) return false;
            return departmentAgentIds.includes(assignee);
          }

          if (effectiveScope === 'mine') return assignee === profileId;

          if (customScopes.find((s) => s.name === effectiveScope)) return true;

          return assignee === profileId;
        }

        if (subTab === 'waiting') {
          return !assignedOf(c.contact.id, c.contact.assigned_to);
        }

        return true;
      });

      if (selectedQueueId) {
        result = result.filter((c) => c.contact.queue_id === selectedQueueId);
      }
    } else if (mainTab === 'resolved') {
      result = result.filter((c) => statusOf(c.contact.id) === 'resolved');
    } else if (mainTab === 'unread') {
      result = result.filter((c) => c.unreadCount > 0 && statusOf(c.contact.id) !== 'resolved');
    }
  } else {
    if (mainTab === 'open') {
      result = result.filter((c) => {
        const s = statusOf(c.contact.id);
        const isOpen = s === 'open' || s === 'in_progress';
        if (!isOpen) return false;
        if (statusFilter === 'unread' && c.unreadCount === 0) return false;

        const assignee = assignedOf(c.contact.id, c.contact.assigned_to);
        if (effectiveScope === 'mine' && assignee !== profileId) return false;
        if (effectiveScope === 'department' && assignee && !departmentAgentIds.includes(assignee))
          return false;

        return true;
      });
    } else if (mainTab === 'resolved') {
      result = result.filter((c) => statusOf(c.contact.id) === 'resolved');
    } else if (mainTab === 'unread') {
      result = result.filter((c) => c.unreadCount > 0 && statusOf(c.contact.id) !== 'resolved');
    }
  }

  // 2. Search
  if (effectiveSearch) {
    const searchLower = effectiveSearch.toLowerCase();
    const digits = effectiveSearch.replace(/\D/g, '');
    result = result.filter((c) => {
      const name = (c.contact?.name || '').toLowerCase();
      const phone = c.contact?.phone || '';
      const email = (c.contact?.email || '').toLowerCase();
      const jid = String(c.contact?.id || '').toLowerCase();
      const lastMsg = (c.lastMessage?.content || '').toLowerCase();
      return (
        name.includes(searchLower) ||
        (digits.length > 0 && phone.replace(/\D/g, '').includes(digits)) ||
        email.includes(searchLower) ||
        jid.includes(searchLower) ||
        lastMsg.includes(searchLower)
      );
    });
  }

  // 3. Status array filter
  if (filters.status.length > 0) {
    result = result.filter((c) => {
      const hasUnread = c.unreadCount > 0;
      const isAssigned = !!c.contact.assigned_to;
      if (filters.status.includes('unread') && hasUnread) return true;
      if (filters.status.includes('read') && !hasUnread && isAssigned) return true;
      if (filters.status.includes('pending') && !isAssigned && c.messages.length > 0) return true;
      if (filters.status.includes('resolved') && c.messages.length === 0) return true;
      return false;
    });
  }

  // 4. Tags filter
  if (filters.tags.length > 0) {
    result = result.filter((c) => {
      const tagIds = contactTagsMap[c.contact.id] || [];
      return filters.tags.some((filterTagId) => tagIds.includes(filterTagId));
    });
  }

  // 5. Agent filter (already partially handled in step 1; reinforced here for safety)
  if (filters.agentId) {
    if (filters.agentId === profileId || canSeeDept || canSeeAll) {
      result = result.filter((c) => c.contact.assigned_to === filters.agentId);
    } else {
      result = result.filter((c) => c.contact.assigned_to === profileId);
    }
  }

  // 6. Date range filter
  if (filters.dateRange.from) {
    const fromStart = startOfDay(filters.dateRange.from);
    const toEnd = filters.dateRange.to ? endOfDay(filters.dateRange.to) : null;
    result = result.filter((c) => {
      const lastMessageDate = c.lastMessage
        ? new Date(c.lastMessage.created_at)
        : new Date(c.contact.created_at);
      if (isBefore(lastMessageDate, fromStart)) return false;
      if (toEnd && isAfter(lastMessageDate, toEnd)) return false;
      return true;
    });
  }

  // 7. Contact type filter
  result = filterByContactType(result, selectedContactType);

  // 8. Failure filter
  if (showOnlyRetrying) {
    result = result.filter((c) => {
      const failingMsgs = c.messages.filter(
        (m) =>
          m.status === 'retrying' ||
          m.status === 'failed_retries' ||
          m.status === 'failed' ||
          m.status === 'failed_auth'
      );
      if (failingMsgs.length === 0) return false;
      if (failureCategoryFilter === 'all') return true;
      return failingMsgs.some((m) => {
        if (m.status === 'retrying') return false;
        if (m.status === 'failed_auth' && failureCategoryFilter === 'auth') return true;
        return failureCategoryById[m.id] === failureCategoryFilter;
      });
    });
  }

  // 9. Sort
  return [...result].sort((a, b) => {
    if (sortBy === 'unread' && a.unreadCount !== b.unreadCount) {
      return b.unreadCount - a.unreadCount;
    }
    if (sortBy === 'name') {
      return (a.contact.name || '').localeCompare(b.contact.name || '');
    }
    const aTime = a.lastMessage
      ? new Date(a.lastMessage.created_at).getTime()
      : new Date(a.contact.updated_at).getTime();
    const bTime = b.lastMessage
      ? new Date(b.lastMessage.created_at).getTime()
      : new Date(b.contact.updated_at).getTime();
    return bTime - aTime;
  });
}

export interface InboxTabCounts {
  open: number;
  attending: number;
  waiting: number;
  resolved: number;
  unread: number;
}

function countUnique(conversations: ConversationWithMessages[]): number {
  return new Set(conversations.map((c) => c.contact.id)).size;
}

/** Computes inbox tab counters with the same permission/filter pipeline used by the visible list. */
export function computeInboxTabCounts(opts: ApplyInboxFiltersOptions): InboxTabCounts {
  const attending = applyInboxFilters({ ...opts, mainTab: 'open', subTab: 'attending' });
  const waiting = applyInboxFilters({ ...opts, mainTab: 'open', subTab: 'waiting' });
  const openIds = new Set([...attending, ...waiting].map((c) => c.contact.id));

  return {
    open: openIds.size,
    attending: countUnique(attending),
    waiting: countUnique(waiting),
    resolved: countUnique(applyInboxFilters({ ...opts, mainTab: 'resolved' })),
    unread: countUnique(applyInboxFilters({ ...opts, mainTab: 'unread' })),
  };
}

/** Options for building per-failure-category conversation counts used to populate the failure filter dropdown. */
export interface BuildFailureCategoryCountsOptions {
  conversations: ConversationWithMessages[];
  showOnlyRetrying: boolean;
  failureCategoryById: Record<string, FailureCategory>;
}

/** Counts conversations per failure category (auth, http_4xx, http_5xx, network, unknown, all) for the failure-filter chips in the inbox. */
export function buildFailureCategoryCounts(
  opts: BuildFailureCategoryCountsOptions
): Record<FailureCategory | 'all', number> {
  const { conversations, showOnlyRetrying, failureCategoryById } = opts;
  const counts: Record<FailureCategory | 'all', number> = {
    all: 0,
    auth: 0,
    http_4xx: 0,
    http_5xx: 0,
    network: 0,
    unknown: 0,
  };

  if (!showOnlyRetrying) return counts;

  const seenConvs = new Set<string>();
  const seenByCat: Record<string, Set<string>> = {
    auth: new Set(),
    http_4xx: new Set(),
    http_5xx: new Set(),
    network: new Set(),
    unknown: new Set(),
  };

  for (const c of conversations) {
    const failing =
      c.messages?.filter(
        (m) => m.status === 'failed' || m.status === 'failed_auth' || m.status === 'failed_retries'
      ) || [];
    if (failing.length === 0) continue;
    seenConvs.add(c.contact.id);
    for (const m of failing) {
      const cat: FailureCategory =
        m.status === 'failed_auth' ? 'auth' : (failureCategoryById[m.id] ?? 'unknown');
      seenByCat[cat].add(c.contact.id);
    }
  }

  counts.all = seenConvs.size;
  counts.auth = seenByCat['auth'].size;
  counts.http_4xx = seenByCat['http_4xx'].size;
  counts.http_5xx = seenByCat['http_5xx'].size;
  counts.network = seenByCat['network'].size;
  counts.unknown = seenByCat['unknown'].size;
  return counts;
}
