/**
 * Event bus for cross-component communication.
 *
 * Provides a type-safe, decoupled way for components to communicate
 * without prop drilling or complex context chains.
 *
 * Use cases:
 * - Notify Inbox when a message is sent from CRM panel
 * - Trigger SLA siren from any module
 * - Broadcast connection status changes
 * - Coordinate between Inbox sidebar and chat panel
 */

import { getLogger } from '@/lib/logger';

const log = getLogger('EventBus');

type EventCallback<T = unknown> = (payload: T) => void;

interface EventMap {
  'message:sent': { contactId: string; content: string };
  'message:received': { contactId: string; content: string; sender: string };
  'message:failed': { contactId: string; error: string };
  'conversation:transferred': { contactId: string; toAgent: string };
  'conversation:closed': { contactId: string };
  'sla:breach': { contactId: string; slaMinutes: number };
  'connection:status': { isOnline: boolean; isConnected: boolean };
  'connection:recovered': { instanceName: string };
  'connection:credential-error': { instanceName: string; connectionName: string; status: number };
  'connection:reconnect-exhausted': { instanceName: string; attempts: number };
  'notification:show': { title: string; body: string; type: 'info' | 'warning' | 'error' };
  'agent:status': { agentId: string; status: 'online' | 'away' | 'offline' };
  'queue:update': { queueId: string; count: number };
  'queue:updated': Record<string, unknown>[];
}

type EventName = keyof EventMap;

class TypedEventBus {
  private listeners = new Map<string, Set<EventCallback>>();

  on<K extends EventName>(event: K, callback: EventCallback<EventMap[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback as EventCallback);
    };
  }

  emit<K extends EventName>(event: K, payload: EventMap[K]): void {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;

    for (const cb of callbacks) {
      try {
        cb(payload);
      } catch (err) {
        log.error('EventBus handler threw', { event, err });
      }
    }
  }

  off<K extends EventName>(event: K, callback: EventCallback<EventMap[K]>): void {
    this.listeners.get(event)?.delete(callback as EventCallback);
  }

  /** Remove all listeners for an event */
  clear(event?: EventName): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /** Get count of listeners for debugging */
  listenerCount(event: EventName): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

/** Singleton event bus instance */
export const eventBus = new TypedEventBus();
