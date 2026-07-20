/**
 * Lightweight store to expose the live status of the evolution_contacts
 * realtime subscription. Read by UI indicators (e.g. inbox header dot)
 * without prop-drilling from useRealtimeContacts.
 */
import { useSyncExternalStore } from 'react';

/** Connection state of the evolution_contacts Supabase Realtime subscription, exposed as a lightweight external store. */
export type RealtimeContactsStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

let current: RealtimeContactsStatus = 'idle';
const listeners = new Set<() => void>();

/** Updates the global realtime contacts status and notifies all useSyncExternalStore subscribers. */
export function setRealtimeContactsStatus(next: RealtimeContactsStatus) {
  if (next === current) return;
  current = next;
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): RealtimeContactsStatus {
  return current;
}

/** React hook that reads the current evolution_contacts realtime status from the external store, compatible with concurrent mode (useSyncExternalStore). */
export function useRealtimeContactsStatus(): RealtimeContactsStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
