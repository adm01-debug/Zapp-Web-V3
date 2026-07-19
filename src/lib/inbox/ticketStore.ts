/**
 * Ticket overlay store
 * ====================
 *
 * Camada local que mantém status (`open` | `in_progress` | `resolved`) e
 * histórico de eventos do atendimento, por `contact_id`. É um *stub*
 * persistido em `localStorage` enquanto o operador FATOR X não publica as
 * RPCs equivalentes (`rpc_update_conversation_status`,
 * `rpc_assign_conversation`).
 *
 * Toda mutação dispara um evento custom (`ticket-overlay-changed`) para
 * que abas/usuários da mesma sessão vejam o estado atualizado em tempo
 * real (cross-tab via `storage` event nativo + intra-tab via custom).
 *
 * Quando a RPC ficar disponível basta trocar `persistRemote` por uma
 * chamada `externalClient.rpc(...)` — a API pública do hook não muda.
 */

const STORAGE_KEY = 'inbox.tickets.overlay.v1';
const EVENT_NAME = 'ticket-overlay-changed';

export type TicketStatus = 'open' | 'in_progress' | 'resolved';

export interface TicketEvent {
  id: string;
  /** Tipo do evento — alinhado com `conversation_events.event_type`. */
  type: 'status_change' | 'assign' | 'unassign' | 'transfer' | 'auto_routed';
  at: string; // ISO
  performedBy?: string | null;
  fromAgentId?: string | null;
  toAgentId?: string | null;
  fromStatus?: TicketStatus | null;
  toStatus?: TicketStatus | null;
  note?: string | null;
}

/** Ticket State interface definition. */
export interface TicketState {
  status: TicketStatus;
  assignedTo: string | null; // profile_id
  queueId: string | null;
  /** Quando entrou em `open` pela primeira vez (para tempo médio). */
  openedAt: string;
  /** Última transição. */
  updatedAt: string;
  resolvedAt?: string | null;
  events: TicketEvent[];
}

type Overlay = Record<string, TicketState>;

// Cached snapshot — CRITICAL para useSyncExternalStore. Sem cache,
// cada chamada de readAll() retorna um novo objeto (JSON.parse) e o
// React entra em loop infinito ("Maximum update depth exceeded").
let cachedOverlay: Overlay | null = null;

/** Reads the full ticket overlay from localStorage, returning and caching the parsed result; returns an empty overlay on error. */
function readAll(): Overlay {
  if (typeof window === 'undefined') return EMPTY_OVERLAY;
  if (cachedOverlay !== null) return cachedOverlay;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cachedOverlay = {};
      return cachedOverlay;
    }
    const parsed = JSON.parse(raw) as Overlay;
    cachedOverlay = parsed && typeof parsed === 'object' ? parsed : {};
    return cachedOverlay;
  } catch {
    cachedOverlay = {};
    return cachedOverlay;
  }
}

/** Persists the overlay to localStorage, updates the in-memory cache, and dispatches the change event to intra-tab subscribers. */
function writeAll(overlay: Overlay) {
  cachedOverlay = overlay; // mutação local — atualiza a referência cacheada
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overlay));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // localStorage cheio/desabilitado — silencioso, é overlay.
  }
}

/** Clears the in-memory overlay cache so the next readAll() reloads from localStorage. */
function invalidateCache() {
  cachedOverlay = null;
}

const EMPTY_OVERLAY: Overlay = Object.freeze({}) as Overlay;

/** Generates a collision-resistant unique ID using crypto.randomUUID when available, falling back to Math.random + timestamp. */
function cryptoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** ticket Store constant. */
export const ticketStore = {
  /** Snapshot completo (somente leitura) — referência ESTÁVEL entre renders. */
  snapshot(): Overlay {
    return readAll();
  },

  get(contactId: string): TicketState | null {
    return readAll()[contactId] ?? null;
  },

  /** Garante o registro inicial (idempotente, não dispara evento). */
  bootstrap(
    contactId: string,
    seed?: Partial<Pick<TicketState, 'assignedTo' | 'queueId' | 'openedAt'>>
  ) {
    const current = readAll();
    if (current[contactId]) return;
    const now = new Date().toISOString();
    const next: Overlay = {
      ...current,
      [contactId]: {
        status: 'open',
        assignedTo: seed?.assignedTo ?? null,
        queueId: seed?.queueId ?? null,
        openedAt: seed?.openedAt ?? now,
        updatedAt: now,
        events: [],
      },
    };
    writeAll(next);
  },

  setStatus(contactId: string, nextStatus: TicketStatus, performedBy: string | null) {
    const current = readAll();
    const existing = current[contactId];
    const base: TicketState = existing ?? {
      status: 'open',
      assignedTo: null,
      queueId: null,
      openedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      events: [],
    };
    if (base.status === nextStatus && existing) return;
    const ev: TicketEvent = {
      id: cryptoId(),
      type: 'status_change',
      at: new Date().toISOString(),
      performedBy,
      fromStatus: base.status,
      toStatus: nextStatus,
    };
    const updated: TicketState = {
      ...base,
      status: nextStatus,
      updatedAt: ev.at,
      resolvedAt: nextStatus === 'resolved' ? ev.at : null,
      events: [ev, ...base.events].slice(0, 50),
    };
    writeAll({ ...current, [contactId]: updated });
  },

  assign(
    contactId: string,
    agentId: string | null,
    performedBy: string | null,
    opts?: { queueId?: string | null; auto?: boolean }
  ) {
    const current = readAll();
    const existing = current[contactId];
    const base: TicketState = existing ?? {
      status: 'open',
      assignedTo: null,
      queueId: null,
      openedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      events: [],
    };
    const prev = base.assignedTo;
    if (
      prev === agentId &&
      (opts?.queueId === undefined || opts.queueId === base.queueId) &&
      existing
    )
      return;
    const now = new Date().toISOString();
    const evType: TicketEvent['type'] = opts?.auto
      ? 'auto_routed'
      : agentId == null
        ? 'unassign'
        : prev == null
          ? 'assign'
          : 'transfer';
    const ev: TicketEvent = {
      id: cryptoId(),
      type: evType,
      at: now,
      performedBy,
      fromAgentId: prev,
      toAgentId: agentId,
    };
    let nextStatus: TicketStatus = base.status;
    let events = base.events;
    if (agentId && (base.status === 'resolved' || base.status === 'open')) {
      const statusEv: TicketEvent = {
        id: cryptoId(),
        type: 'status_change',
        at: now,
        performedBy,
        fromStatus: base.status,
        toStatus: 'in_progress',
      };
      events = [statusEv, ev, ...base.events].slice(0, 50);
      nextStatus = 'in_progress';
    } else {
      events = [ev, ...base.events].slice(0, 50);
    }
    const updated: TicketState = {
      ...base,
      assignedTo: agentId,
      queueId: opts?.queueId !== undefined ? opts.queueId : base.queueId,
      status: nextStatus,
      events,
      updatedAt: now,
    };
    writeAll({ ...current, [contactId]: updated });
  },

  /** Subscreve mudanças (cross-tab via storage + intra-tab via custom). */
  subscribe(listener: () => void): () => void {
    if (typeof window === 'undefined') return () => undefined;
    const handler = () => listener();
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        invalidateCache();
        listener();
      }
    };
    window.addEventListener(EVENT_NAME, handler);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, handler);
      window.removeEventListener('storage', onStorage);
    };
  },
};
