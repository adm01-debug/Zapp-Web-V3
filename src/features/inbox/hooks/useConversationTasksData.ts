import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isValidUUID } from '@/utils/uuid';
import { getLogger } from '@/lib/logger';

const log = getLogger('useConversationTasksData');

export async function fetchConversationTasks(contactId: string) {
  if (!isValidUUID(contactId)) return [];
  const { data } = await supabase
    .from('conversation_tasks')
    .select('*')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

export async function createConversationTask(payload: {
  contact_id: string;
  title: string;
  priority: string;
  created_by: string;
  assigned_to: string;
}) {
  if (!isValidUUID(payload.contact_id)) return { data: null, error: new Error('Invalid UUID') };
  return supabase.from('conversation_tasks').insert(payload);
}

export async function updateConversationTaskStatus(
  id: string,
  status: string,
  completedAt: string | null
) {
  return supabase
    .from('conversation_tasks')
    .update({ status, completed_at: completedAt })
    .eq('id', id);
}

export async function deleteConversationTask(id: string) {
  return supabase.from('conversation_tasks').delete().eq('id', id);
}

// ── Gap 6: batched pending-task check (replaces per-contact HEAD polling) ──────────

const BATCH_POLL_INTERVAL_MS = 2000;

function isRateLimitError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === '429' ||
    /rate limit/i.test(error.message ?? '') ||
    /\b429\b/.test(error.message ?? '')
  );
}

/**
 * Single batched query that checks ALL contact IDs at once.
 *
 * Instead of:  HEAD /conversation_tasks?contact_id=eq.X&status=eq.pending  (per contact)
 * Use:        GET  /conversation_tasks?select=contact_id&status=eq.pending&contact_id=in.(id1,id2,...)
 *
 * Returns the contact_ids that have at least one pending task, plus a `rateLimited`
 * flag so callers can skip the refresh cycle entirely on 429.
 */
export async function fetchPendingTaskContactIds(
  contactIds: string[]
): Promise<{ contactIds: string[]; rateLimited: boolean }> {
  const validIds = [...new Set(contactIds)].filter(isValidUUID);
  if (validIds.length === 0) return { contactIds: [], rateLimited: false };

  const { data, error } = await supabase
    .from('conversation_tasks')
    .select('contact_id')
    .eq('status', 'pending')
    .in('contact_id', validIds);

  if (error) {
    // 429 (or any error): do NOT retry here — surface the flag so the caller
    // can skip the refresh cycle and keep its last known state.
    return { contactIds: [], rateLimited: isRateLimitError(error) };
  }

  const pendingIds: string[] = [];
  for (const row of data ?? []) {
    if (row.contact_id) pendingIds.push(row.contact_id);
  }
  return { contactIds: pendingIds, rateLimited: false };
}

/**
 * Polls pending conversation_tasks for a set of contact IDs with ONE batched query
 * (no per-contact HEAD requests). The batch query is throttled to at most one
 * execution every 2 seconds (useRef timer). On 429 the refresh cycle is skipped
 * entirely — no retry, last known state is kept.
 *
 * Returns a Map<contactId, hasPendingTasks>.
 */
export function useConversationPendingTasks(contactIds: string[]) {
  const [pendingMap, setPendingMap] = useState<Map<string, boolean>>(() => new Map());
  const lastRunAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idsRef = useRef(contactIds);

  // Keep the latest contactIds without re-creating the polling effect on every render.
  useEffect(() => {
    idsRef.current = contactIds;
  }, [contactIds]);

  const refresh = useCallback(async () => {
    const ids = idsRef.current;
    const validIds = [...new Set(ids)].filter(isValidUUID);
    if (validIds.length === 0) {
      setPendingMap(new Map());
      return;
    }

    const { contactIds: pendingContactIds, rateLimited } = await fetchPendingTaskContactIds(
      validIds
    );

    if (rateLimited) {
      // 429: skip this refresh cycle entirely (no retry, keep last known data).
      log.warn('conversation_tasks batch poll rate limited (429) — skipping refresh cycle');
      return;
    }

    const next = new Map<string, boolean>();
    for (const id of validIds) next.set(id, false);
    for (const id of pendingContactIds) next.set(id, true);
    setPendingMap(next);
  }, []);

  const idsKey = contactIds.join(',');

  useEffect(() => {
    const run = () => {
      lastRunAtRef.current = Date.now();
      void refresh();
    };

    // Leading edge: run immediately if the last query was >= 2s ago; otherwise
    // debounce via the useRef timer for the remainder of the 2s window.
    const elapsed = Date.now() - lastRunAtRef.current;
    if (elapsed >= BATCH_POLL_INTERVAL_MS) {
      run();
    } else if (!timerRef.current) {
      timerRef.current = setTimeout(run, BATCH_POLL_INTERVAL_MS - elapsed);
    }

    // Polling cadence: at most one batch query every 2 seconds.
    const interval = setInterval(run, BATCH_POLL_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      clearInterval(interval);
    };
  }, [refresh, idsKey]);

  return pendingMap;
}
