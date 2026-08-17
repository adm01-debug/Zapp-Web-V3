/**
 * Offline Queue Manager
 *
 * Quando o usuário está offline, mensagens são enfileiradas no IndexedDB
 * e enviadas automaticamente quando a conexão retorna.
 *
 * Background Sync API é usado para processamento em background.
 */
import { getLogger } from '@/lib/logger';

const log = getLogger('OfflineQueue');
const DB_NAME = 'zapp-offline-queue';
const STORE_NAME = 'pending-messages';
const VERSION = 1;

interface QueuedMessage {
  id: string;
  contactId: string;
  content: string;
  messageType: string;
  mediaUrl?: string;
  queuedAt: number;
  attempts: number;
  lastAttemptAt?: number;
  error?: string;
}

class OfflineQueueDB {
  private db: IDBDatabase | null = null;

  async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('queuedAt', 'queuedAt', { unique: false });
        }
      };
    });
  }

  async add(message: QueuedMessage): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).add(message);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getAll(): Promise<QueuedMessage[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async remove(id: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async update(message: QueuedMessage): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(message); // atomic upsert, no remove+add gap
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clear(): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async count(): Promise<number> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
}

export const offlineQueue = new OfflineQueueDB();

/**
 * Enqueue a message to be sent when online.
 */
export async function enqueueMessage(
  message: Omit<QueuedMessage, 'id' | 'queuedAt' | 'attempts'>
): Promise<QueuedMessage> {
  const queued: QueuedMessage = {
    ...message,
    id: crypto.randomUUID(),
    queuedAt: Date.now(),
    attempts: 0,
  };

  await offlineQueue.add(queued);

  // Try to register background sync
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      // @ts-expect-error — sync is experimental
      await reg.sync.register('send-queued-messages');
    } catch {
      // Background sync not available; will retry when online
    }
  }

  return queued;
}

/**
 * Process all queued messages (called when online).
 */
let queueProcessing = false;

export async function processQueue(): Promise<{ sent: number; failed: number }> {
  if (!navigator.onLine) {
    return { sent: 0, failed: 0 };
  }
  // MUTEX: dois gatilhos independentes (evento 'online' + background sync via
  // mensagem do SW + boot) podem disparar em paralelo e duplicar o envio.
  if (queueProcessing) {
    return { sent: 0, failed: 0 };
  }
  queueProcessing = true;
  try {
    const messages = await offlineQueue.getAll();
    let sent = 0;
    let failed = 0;

    for (const msg of messages) {
      try {
        const { sendMessageToContact } =
          await import('@/features/inbox/hooks/realtime/messageSender');
        await sendMessageToContact(msg.contactId, msg.content, msg.messageType, msg.mediaUrl);
        await offlineQueue.remove(msg.id);
        sent++;
      } catch (err) {
        msg.attempts++;
        msg.lastAttemptAt = Date.now();
        msg.error = err instanceof Error ? err.message : String(err);

        if (msg.attempts >= 5) {
          // Give up after 5 attempts
          await offlineQueue.remove(msg.id);
          failed++;
        } else {
          await offlineQueue.update(msg);
          failed++;
        }
      }
    }

    return { sent, failed };
  } finally {
    queueProcessing = false;
  }
}

/**
 * Get stats about the offline queue.
 */
export async function getQueueStats(): Promise<{
  pending: number;
  oldestAge?: number;
}> {
  const count = await offlineQueue.count();
  const messages = await offlineQueue.getAll();
  const oldest = messages.reduce((min, m) => (m.queuedAt < min ? m.queuedAt : min), Date.now());

  return {
    pending: count,
    oldestAge: count > 0 ? Date.now() - oldest : undefined,
  };
}

/**
 * Hook: React integration for online/offline state.
 */
export function setupOnlineListener(): () => void {
  const handleOnline = async () => {
    log.info('Online — processing queue');
    try {
      await processQueue();
    } catch (err) {
      // Event listener async: rejeição sem handler vira unhandled rejection
      // (ex.: IndexedDB indisponível, chunk load do messageSender).
      log.error('Failed to process offline queue on reconnect:', err);
    }
  };

  const handleOffline = () => {
    log.info('Offline — messages will be queued');
  };

  // Background Sync: o SW acorda as janelas com PROCESS_OFFLINE_QUEUE
  // (public/sw.js: sendQueuedMessages) — a página é quem tem o cliente Supabase.
  const handleSwMessage = (event: MessageEvent) => {
    if (event.data && (event.data as { type?: string }).type === 'PROCESS_OFFLINE_QUEUE') {
      log.info('ServiceWorker requested offline queue processing');
      void processQueue().catch((err: unknown) => {
        log.error('Failed to process offline queue from SW sync:', err);
      });
    }
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  // Guard truthy: `'serviceWorker' in navigator` é true mesmo com o valor
  // undefined (happy-dom/testes) — chamar addEventListener direto crashava.
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', handleSwMessage);
  }

  // Process queue on initial load if online
  if (navigator.onLine) {
    void processQueue().catch((err: unknown) => {
      log.error('Failed to process offline queue on boot:', err);
    });
  }

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    if (navigator.serviceWorker) {
      navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    }
  };
}
