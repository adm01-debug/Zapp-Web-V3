import { useEffect, useRef } from 'react';
import { queryKeys } from '@/services/api/queryKeys';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { externalSupabase } from '@/integrations/supabase/externalClient';
import type { EvolutionContact } from '@/types/evolutionExternal';
import { getLogger } from '@/lib/logger';
import { DEFAULT_WHATSAPP_INSTANCE } from '@/lib/constants/whatsappInstances';
import { setRealtimeContactsStatus } from './realtimeContactsStatusStore';

const log = getLogger('RealtimeContacts');
const FLUSH_DELAY_MS = 100;
const BROADCAST_RE = /(^status@broadcast$|@broadcast$)/i;

interface UseRealtimeContactsOptions {
  instance?: string;
  enabled?: boolean;
}

type ContactChange = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  contact: EvolutionContact;
  /** True when fields that affect sidebar ordering/visibility changed. */
  reorder?: boolean;
};

/**
 * Fields whose change should force a re-sort of the conversations sidebar
 * (relevance ranking, scoping, pinning, badges, etc.). Keep narrow to avoid
 * unnecessary refetches on noise (e.g. profile_picture_url updates).
 */
const REORDER_FIELDS = [
  'lead_status',
  'assigned_to',
  'is_pinned',
  'priority',
  'last_message_at',
  'unread_count',
  'deleted_at',
  'tags',
] as const;

/** Shallow array equality (order-sensitive). */
function arraysEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function hasReorderingChange(
  oldRow: Partial<EvolutionContact> | null | undefined,
  newRow: Partial<EvolutionContact> | null | undefined
): boolean {
  if (!oldRow || !newRow) return true; // unknown → be safe and reorder
  for (const f of REORDER_FIELDS) {
    const ov = (oldRow as Record<string, unknown>)[f];
    const nv = (newRow as Record<string, unknown>)[f];
    if (f === 'tags') {
      if (!arraysEqual(ov, nv)) return true;
    } else if (ov !== nv) {
      return true;
    }
  }
  return false;
}

/**
 * Shallow merge that preserves existing values when the incoming payload
 * omits a key (value === undefined). Critical for fields like `tags`: a
 * partial UPDATE that only changes `lead_status` must NOT wipe the
 * previously-known tags array out of the cache.
 */
function mergeContact<T extends Partial<EvolutionContact>>(
  prev: T,
  next: Partial<EvolutionContact>
): T {
  const out: Record<string, unknown> = { ...(prev as Record<string, unknown>) };
  for (const k in next) {
    const v = (next as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  return out as T; // ignore-audit: out is structurally T — built by spreading prev (typed T) and patching matching keys
}

/**
 * Subscribes to evolution_contacts changes on FATOR X and updates
 * React Query caches in real time. Batched to 100ms to coalesce bursts.
 *
 * - Only listens (never SELECTs evolution_contacts directly).
 * - Filters by instance on the server.
 * - Patches caches optimistically; falls back to invalidate when no entry exists.
 * - Soft delete (deleted_at != null) treated as DELETE on the list.
 */
export function useRealtimeContacts(options: UseRealtimeContactsOptions = {}) {
  const { instance = DEFAULT_WHATSAPP_INSTANCE, enabled = true } = options;
  const queryClient = useQueryClient();
  const pendingRef = useRef<Map<string, ContactChange>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // FATOR X v6.2: externalSupabase nunca é null (fallback para o client
    // principal autenticado quando VITE_EXTERNAL_* ausentes). O gate por
    // isExternalConfigured deixava o realtime de contatos permanentemente
    // desligado em produção.
    // Capture the client reference at effect setup time so cleanup always
    // calls removeChannel on the same instance that created the channel.
    const client = externalSupabase;
    if (!enabled || !client) {
      setRealtimeContactsStatus('disconnected');
      return;
    }
    setRealtimeContactsStatus('connecting');

    const flush = () => {
      flushTimerRef.current = null;
      const pending = pendingRef.current;
      if (pending.size === 0) return;
      const changes = Array.from(pending.values());
      pendingRef.current = new Map();

      let invalidateConversations = false;

      for (const change of changes) {
        const { contact } = change;
        const remoteJid = contact.remote_jid;

        // Patch individual contact cache if present (preserves omitted fields)
        queryClient.setQueriesData<EvolutionContact | undefined>(
          { queryKey: queryKeys.contactDetails.singleContact(remoteJid) },
          (prev) => (prev ? mergeContact(prev, contact) : prev)
        );
        queryClient.setQueriesData<EvolutionContact | undefined>(
          { queryKey: queryKeys.evolutionConversations.contact(remoteJid) },
          (prev) => (prev ? mergeContact(prev, contact) : prev)
        );

        // INSERT/DELETE always invalidate the list (ordering changes)
        if (change.type === 'INSERT' || change.type === 'DELETE' || contact.deleted_at) {
          invalidateConversations = true;
        } else {
          // UPDATE: try to patch list entries in place, fallback to invalidate
          // Force a re-sort when ranking-relevant fields changed
          // (lead_status, assigned_to, pinned, tags, etc.).
          if (change.reorder) invalidateConversations = true;
        }

        // Notify non-React-Query consumers
        try {
          window.dispatchEvent(
            new CustomEvent('contact-updated', {
              detail: { type: change.type, contact },
            })
          );
        } catch {
          /* noop in non-DOM env */
        }
      }

      if (invalidateConversations) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.evolutionConversations.all() });
      }
    };

    const scheduleFlush = () => {
      if (flushTimerRef.current) return;
      flushTimerRef.current = setTimeout(flush, FLUSH_DELAY_MS);
    };

    const handlePayload = (payload: RealtimePostgresChangesPayload<EvolutionContact>) => {
      const row = (payload.new ?? payload.old) as EvolutionContact | undefined;
      if (!row || !row.remote_jid) {
        log.warn('Payload sem remote_jid — descartando', { eventType: payload.eventType });
        return;
      }
      if (BROADCAST_RE.test(row.remote_jid)) return;
      if (row.instance_name && row.instance_name !== instance) return;

      const type =
        payload.eventType === 'DELETE'
          ? 'DELETE'
          : payload.eventType === 'INSERT'
            ? 'INSERT'
            : 'UPDATE';

      const reorder =
        type === 'UPDATE'
          ? hasReorderingChange(
              payload.old as Partial<EvolutionContact> | undefined,
              payload.new as Partial<EvolutionContact> | undefined
            )
          : true;

      // Coalesce within the 100ms window: merge into prior pending change so
      // that bursts of partial UPDATEs (e.g. one touches lead_status, another
      // touches tags) end up with the union of all non-undefined fields.
      // Reorder flag is sticky across the burst.
      const prev = pendingRef.current.get(row.remote_jid);
      const mergedContact = prev ? mergeContact(prev.contact, row) : row;
      // DELETE always wins over earlier INSERT/UPDATE in the same burst.
      const mergedType = type === 'DELETE' ? 'DELETE' : prev?.type === 'INSERT' ? 'INSERT' : type;
      pendingRef.current.set(row.remote_jid, {
        type: mergedType,
        contact: mergedContact,
        reorder: reorder || prev?.reorder,
      });
      scheduleFlush();
    };

    const channelName = `realtime:evolution_contacts:${instance}`;
    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'evo', // tabela-fonte em schema evo (Realtime exige tabela base, não view)
          table: 'evolution_contacts',
          filter: `instance_name=eq.${instance}`,
        },
        handlePayload
      )
      .subscribe((status) => {
        // Map Supabase realtime states → app-facing 3-state model
        if (status === 'SUBSCRIBED') setRealtimeContactsStatus('connected');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')
          setRealtimeContactsStatus('error');
        else if (status === 'CLOSED') setRealtimeContactsStatus('disconnected');
        else setRealtimeContactsStatus('connecting');
      });

    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      pendingRef.current = new Map();
      setRealtimeContactsStatus('disconnected');
      client.removeChannel(channel);
    };
  }, [enabled, instance, queryClient]);
}