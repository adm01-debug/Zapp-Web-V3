/**
 * In-memory pub/sub for transient send statuses (sending/retrying).
 * Terminal statuses (sent/failed/failed_auth/failed_retries) persist in DB.
 */
export type SendUIStatus =
  | 'sending'
  | 'retrying'
  | 'sent'
  | 'failed'
  | 'failed_auth'
  | 'failed_retries';

export interface SendStatusDetail {
  status: SendUIStatus;
  attempt?: number;
  totalRetries?: number;
  errorCode?: string | number;
  errorReason?: string;
  updatedAt: number;
}

type Listener = (detail: SendStatusDetail) => void;

const store = new Map<string, SendStatusDetail>();
const listeners = new Map<string, Set<Listener>>();
const globalListeners = new Set<(messageId: string, detail: SendStatusDetail) => void>();

/**
 * Per-message ring-buffer of past status transitions, used by the debug
 * panel ("Histórico do sendStatusBus"). Bounded so long-lived sessions don't
 * grow unbounded — production code MUST NOT rely on the full history.
 */
export interface SendStatusHistoryEntry extends SendStatusDetail {
  /** Milliseconds since the previous transition for this message, or null for the first. */
  deltaMs: number | null;
  /** Optional context captured at emit time so the debug UI can group by conversation. */
  contactId?: string | null;
  /** Free-form label captured at emit time (e.g. "send-text", "manual-resend"). */
  source?: string | null;
}

const HISTORY_LIMIT_PER_MESSAGE = 50;
const HISTORY_LIMIT_TOTAL = 2_000;

const history = new Map<string, SendStatusHistoryEntry[]>();
let historyOrder: string[] = []; // FIFO of messageIds for total cap eviction
const historyListeners = new Set<(messageId: string, entry: SendStatusHistoryEntry) => void>();

export interface EmitContext {
  contactId?: string | null;
  source?: string | null;
}

export function emitSendStatus(
  messageId: string,
  detail: Omit<SendStatusDetail, 'updatedAt'>,
  context?: EmitContext,
) {
  const full: SendStatusDetail = { ...detail, updatedAt: Date.now() };
  const previous = store.get(messageId);
  store.set(messageId, full);

  // Append to history (ring buffer per message + soft cap on total messages tracked).
  const entry: SendStatusHistoryEntry = {
    ...full,
    deltaMs: previous ? full.updatedAt - previous.updatedAt : null,
    contactId: context?.contactId ?? null,
    source: context?.source ?? null,
  };
  let bucket = history.get(messageId);
  if (!bucket) {
    bucket = [];
    history.set(messageId, bucket);
    historyOrder.push(messageId);
    if (historyOrder.length > HISTORY_LIMIT_TOTAL) {
      const evict = historyOrder.shift();
      if (evict) history.delete(evict);
    }
  }
  bucket.push(entry);
  if (bucket.length > HISTORY_LIMIT_PER_MESSAGE) {
    bucket.splice(0, bucket.length - HISTORY_LIMIT_PER_MESSAGE);
  }
  historyListeners.forEach((cb) => {
    try { cb(messageId, entry); } catch { /* noop */ }
  });

  listeners.get(messageId)?.forEach((cb) => {
    try { cb(full); } catch { /* noop */ }
  });
  globalListeners.forEach((cb) => {
    try { cb(messageId, full); } catch { /* noop */ }
  });
}

export function getSendStatus(messageId: string): SendStatusDetail | undefined {
  return store.get(messageId);
}

/** Returns a copy of the captured transition history for a message (oldest first). */
export function getSendStatusHistory(messageId: string): SendStatusHistoryEntry[] {
  const bucket = history.get(messageId);
  return bucket ? [...bucket] : [];
}

/**
 * Returns a snapshot of ALL message histories currently in the ring buffer,
 * grouped by messageId. Intended for the debug screen.
 */
export function getAllSendStatusHistory(): Record<string, SendStatusHistoryEntry[]> {
  const out: Record<string, SendStatusHistoryEntry[]> = {};
  history.forEach((entries, id) => {
    out[id] = [...entries];
  });
  return out;
}

/** Subscribe to every new history entry as it is appended. */
export function subscribeSendStatusHistory(
  cb: (messageId: string, entry: SendStatusHistoryEntry) => void,
): () => void {
  historyListeners.add(cb);
  return () => { historyListeners.delete(cb); };
}

/** Test/maintenance helper — clears the ring buffer without touching live state. */
export function clearSendStatusHistory() {
  history.clear();
  historyOrder = [];
}

export function subscribeSendStatus(messageId: string, cb: Listener): () => void {
  const existing = listeners.get(messageId);
  const set = existing ?? new Set<Listener>();
  if (!existing) listeners.set(messageId, set);
  set.add(cb);
  return () => {
    set.delete(cb);
    if (set.size === 0) listeners.delete(messageId);
  };
}

export function subscribeAllSendStatus(
  cb: (messageId: string, detail: SendStatusDetail) => void
): () => void {
  globalListeners.add(cb);
  return () => { globalListeners.delete(cb); };
}

export function clearSendStatus(messageId: string) {
  store.delete(messageId);
  listeners.delete(messageId);
}

/**
 * Test-only: limpa todo o estado in-memory do bus (store, listeners e history).
 * NÃO use em código de produção — existe apenas para isolar testes que
 * compartilham o módulo singleton entre arquivos.
 */
export function __resetSendStatusForTest() {
  store.clear();
  listeners.clear();
  globalListeners.clear();
  history.clear();
  historyOrder = [];
  historyListeners.clear();
}

