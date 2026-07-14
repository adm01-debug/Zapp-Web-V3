import { getLogger } from '@/lib/logger';
import {
  BC_NAME,
  BUS_MSG_TTL,
  LS_BUS_PREFIX,
  TAB_ID,
  type BroadcastMessage,
  type Transport,
} from './crossTabDedupeTypes';

const log = getLogger('crossTabDedupe');

let transportKind: Transport | null = null;
let bc: BroadcastChannel | null = null;
let storageListenerInstalled = false;
let storedHandler: ((msg: BroadcastMessage) => void) | null = null;

function installStorageListener(): boolean {
  if (storageListenerInstalled) return true;
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return false;
  try {
    window.addEventListener('storage', (e: StorageEvent) => {
      if (!e.key || !e.key.startsWith(LS_BUS_PREFIX)) return;
      if (!e.newValue) return;
      try {
        const msg = JSON.parse(e.newValue) as BroadcastMessage;
        if (typeof msg.ts === 'number' && Date.now() - msg.ts > BUS_MSG_TTL) return;
        storedHandler?.(msg);
      } catch {
        /* payload corrompido — ignora */
      }
    });
    storageListenerInstalled = true;
    return true;
  } catch {
    return false;
  }
}

export function ensureTransport(onMessage: (msg: BroadcastMessage) => void): Transport {
  if (!storedHandler) storedHandler = onMessage;
  if (transportKind && transportKind !== 'none') return transportKind;

  if (typeof BroadcastChannel !== 'undefined' && !bc) {
    try {
      bc = new BroadcastChannel(BC_NAME);
      bc.addEventListener('message', (e) => storedHandler?.(e.data as BroadcastMessage)); // ignore-audit: narrows Supabase query result to local interface
      transportKind = 'broadcast-channel';
      log.debug('Transport ativo: BroadcastChannel');
      return transportKind;
    } catch {
      bc = null;
    }
  }
  if (bc) {
    transportKind = 'broadcast-channel';
    return transportKind;
  }
  if (installStorageListener()) {
    transportKind = 'storage-event';
    log.debug('Transport ativo: storage event (fallback, BroadcastChannel indisponível)');
    return transportKind;
  }
  transportKind = 'none';
  return transportKind;
}

export function broadcast<T>(msg: BroadcastMessage<T>): void {
  const kind = transportKind ?? 'none';
  if (kind === 'broadcast-channel' && bc) {
    try {
      bc.postMessage(msg);
      return;
    } catch {
      /* cai no fallback */
    }
  }
  if (kind === 'storage-event' || kind === 'broadcast-channel') {
    if (typeof localStorage === 'undefined') return;
    try {
      const slot = `${LS_BUS_PREFIX}${TAB_ID}:${msg.ts}:${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(slot, JSON.stringify(msg));
      setTimeout(() => {
        try {
          localStorage.removeItem(slot);
        } catch {
          /* noop */
        }
      }, 250);
    } catch {
      /* quota cheia ou serialização falhou — degrada silenciosamente */
    }
  }
}

/** @internal — usado por testes para inspecionar o transporte ativo. */
export function __getActiveTransport(): Transport {
  return transportKind ?? 'none';
}
