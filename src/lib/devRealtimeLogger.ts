/**
 * Dev-only logger for postgres_changes subscriptions on the `messages` table.
 *
 * Goal: make it trivial, in development, to see:
 *   - WHEN a hook registers a subscription (and with what event/filter)
 *   - WHEN that hook actually receives a payload from the realtime channel
 *
 * Both are tagged with the consumer hook name so the 7-way fan-out documented
 * in TRILHA_MENSAGENS_NAVEGAVEL.mmd is observable at a glance in the console.
 *
 * Production: completely no-op (zero overhead, no console noise).
 */

const isDev =
  typeof import.meta !== 'undefined' &&
  // Vite injects this; also true in `bun run dev`
  (import.meta as unknown as { env?: { DEV?: boolean; MODE?: string } }).env?.DEV === true; // ignore-audit — Vite injects import.meta.env but it's not in TS lib

type Bind = {
  event?: string;
  schema?: string;
  table?: string;
  filter?: string;
};

type AnyPayload = {
  eventType?: string;
  new?: { id?: string | number } | null;
  old?: { id?: string | number } | null;
  [k: string]: unknown;
};

// ---------------------------------------------------------------------------
// Lightweight pub/sub for the "Realtime Fan-out" debug panel.
// Runs in dev AND prod (the panel is opt-in via a route) but stays cheap:
// only stores the *last* event per consumer, plus the last 50 globally.
// ---------------------------------------------------------------------------

export interface FanoutSubscriptionRecord {
  hookName: string;
  bind: Bind;
  registeredAt: number;
}

export interface FanoutEventRecord {
  hookName: string;
  eventType: string;
  rowId: string | null;
  receivedAt: number;
}

const subscriptions = new Map<string, FanoutSubscriptionRecord>();
const lastEventByHook = new Map<string, FanoutEventRecord>();
const recentEvents: FanoutEventRecord[] = [];
const RECENT_EVENT_CAP = 50;

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  listeners.forEach((l) => {
    try { l(); } catch { /* noop */ }
  });
}

export function subscribeFanoutBus(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getFanoutSubscriptions(): FanoutSubscriptionRecord[] {
  return Array.from(subscriptions.values());
}

export function getFanoutLastEvents(): Map<string, FanoutEventRecord> {
  return new Map(lastEventByHook);
}

export function getFanoutRecentEvents(): FanoutEventRecord[] {
  return [...recentEvents];
}

export function clearFanoutHistory(): void {
  lastEventByHook.clear();
  recentEvents.length = 0;
  notify();
}


const STYLE_REG = 'color:#888;font-weight:600'; // audit-ok: console.log CSS — CSS vars unsupported
const STYLE_HOOK = 'color:#3b82f6;font-weight:700'; // audit-ok
const STYLE_EVENT_INSERT = 'color:#16a34a;font-weight:600'; // audit-ok
const STYLE_EVENT_UPDATE = 'color:#d97706;font-weight:600'; // audit-ok
const STYLE_EVENT_DELETE = 'color:#dc2626;font-weight:600'; // audit-ok
const STYLE_DIM = 'color:#888'; // audit-ok

function eventStyle(evt: string | undefined): string {
  switch ((evt ?? '').toUpperCase()) {
    case 'INSERT':
      return STYLE_EVENT_INSERT;
    case 'UPDATE':
      return STYLE_EVENT_UPDATE;
    case 'DELETE':
      return STYLE_EVENT_DELETE;
    default:
      return STYLE_DIM;
  }
}

/**
 * Log that a hook is registering a postgres_changes subscription on `messages`.
 * Call this once at subscription setup time (right before/after `.on(...)`).
 */
export function logMessagesSubscribe(hookName: string, bind: Bind): void {
  // Always record into the bus so the /debug/realtime-fanout panel works in
  // any environment. A subscription registered twice (e.g. effect re-run)
  // simply overwrites the prior record — that's the current truth.
  subscriptions.set(`${hookName}|${bind.event ?? '*'}|${bind.filter ?? ''}`, {
    hookName,
    bind: { ...bind },
    registeredAt: Date.now(),
  });
  notify();

  if (!isDev) return;
  const evt = bind.event ?? '*';
  // eslint-disable-next-line no-console
  console.debug(
    `%c[realtime:messages]%c subscribe %c${hookName}%c → %c${evt}%c ${bind.table ?? 'messages'}${
      bind.filter ? ` (${bind.filter})` : ''
    }`,
    STYLE_REG,
    STYLE_DIM,
    STYLE_HOOK,
    STYLE_DIM,
    eventStyle(evt),
    STYLE_DIM,
  );
}

export function wrapMessagesHandler<T>(
  hookName: string,
  handler: (payload: T) => void,
): (payload: T) => void {
  return (payload: T) => {
    try {
      const p = payload as unknown as AnyPayload; // ignore-audit — generic T not constrained to AnyPayload; shape is always compatible at runtime
      const evt = String(p?.eventType ?? '?');
      const rowId =
        (p?.new && (p.new as { id?: string | number }).id) ??
        (p?.old && (p.old as { id?: string | number }).id) ??
        null;

      const record: FanoutEventRecord = {
        hookName,
        eventType: evt,
        rowId: rowId == null ? null : String(rowId),
        receivedAt: Date.now(),
      };
      lastEventByHook.set(hookName, record);
      recentEvents.unshift(record);
      if (recentEvents.length > RECENT_EVENT_CAP) recentEvents.length = RECENT_EVENT_CAP;
      notify();

      if (isDev) {
        // eslint-disable-next-line no-console
        console.debug(
          `%c[realtime:messages]%c event %c${hookName}%c ← %c${evt}%c id=${rowId ?? '—'}`,
          STYLE_REG,
          STYLE_DIM,
          STYLE_HOOK,
          STYLE_DIM,
          eventStyle(evt),
          STYLE_DIM,
        );
      }
    } catch {
      // never break realtime because of logging
    }
    handler(payload);
  };
}
