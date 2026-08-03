import { useState, useCallback, useRef, useEffect } from 'react';
import { getLogger } from '@/lib/logger';
import { v4 as uuidv4 } from 'uuid';
import { toast } from '@/hooks/use-toast';
import { dbFrom } from '@/integrations/datasource/db';

const log = getLogger('useMessageQueue');

/** Retry and back-off configuration for the outbound message queue. */
export interface QueueConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  jitter: boolean;
}

/** Default queue config: 3 retries with 1s base / 30s max exponential back-off and jitter. */
export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1s
  maxDelay: 30000, // 30s
  jitter: true,
};

/** Single item in the outbound message queue, carrying lifecycle status, retry counters, progress, and per-attempt timing. */
export interface QueueItem {
  id: string;
  contactId: string;
  content: string;
  type: 'text' | 'attachment' | 'audio';
  attachments?: File[];
  onProgress?: (p: number) => void;
  status: 'pending' | 'sending' | 'failed' | 'confirmed';
  error?: unknown;
  retryCount: number;
  progress?: number;
  externalId?: string;
  createdAt: number;
  completedAt?: number;
  nextRetryAt?: number;
  attempts: Array<{
    timestamp: number;
    error?: string;
    duration?: number;
  }>;
}

/** Aggregate send metrics computed from queue history: totals by type and conversation with raw latency arrays for P50/P95 computation. */
export interface QueueMetrics {
  totalSent: number;
  totalFailed: number;
  totalRetries: number;
  averageLatency: number;
  byType: Record<string, { sent: number; failed: number; latency: number[] }>;
  byConversation: Record<string, { sent: number; failed: number; latency: number[] }>;
}

/** Public API returned by useMessageQueue: queue state plus add/retry/progress/reconcile/metrics/remove operations. */
export interface MessageQueueController {
  queue: QueueItem[];
  addToQueue: (
    contactId: string,
    content: string,
    attachments?: File[],
    type?: QueueItem['type'],
    onProgress?: (p: number) => void
  ) => void;
  retryMessage: (id: string) => void;
  updateProgress: (id: string, progress: number) => void;
  reconcileWithDelivery: (
    contactId: string,
    externalId: string,
    status: 'confirmed' | 'failed'
  ) => void;
  getMetrics: () => QueueMetrics;
  removeFromQueue: (id: string) => void;
}

const MAX_CONCURRENT_SENDS = 5;

// F4-10: cap do dedupe de entregas processadas — o Set crescia sem limite
// (memory leak). Com o cap, a entrada mais antiga é evictada (Set preserva
// ordem de inserção) e o dedupe cobre as últimas 1000 entregas.
const MAX_PROCESSED_DELIVERIES = 1000;

/**
 * F4-13: classifica erro de envio como retryable (transitório) ou permanente.
 * - HTTP 5xx / 408 (request timeout) / 429 (rate limit) → retryable — backoff faz sentido.
 * - HTTP 4xx (exceto 408/429) → permanente — retry não muda o resultado (ex.: 400/401/403/404).
 * - Sem status conhecido → fallback por mensagem/código (rede/timeout/abort) e,
 *   se nada casar, retryable (preserva o comportamento legado do queue).
 */
function isRetryableSendError(error: unknown): boolean {
  const status =
    typeof (error as { status?: unknown } | null)?.status === 'number'
      ? ((error as { status: number }).status)
      : undefined;

  if (status !== undefined) {
    if (status >= 500) return true; // 5xx — servidor instável, vale tentar de novo
    if (status === 408 || status === 429) return true; // timeout / rate-limit
    if (status >= 400 && status < 500) return false; // 4xx — erro permanente
  }

  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const code = ((error as { code?: string } | null)?.code ?? '').toUpperCase();
  return (
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('aborted') ||
    msg.includes('fetch') ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'ENETUNREACH'
  );
}

/** Manages an ordered outbound message queue with exponential back-off retry, per-conversation concurrency cap, localStorage persistence, and send-metric collection. */
export function useMessageQueue(
  processMessage: (item: QueueItem) => Promise<void>,
  configOverrides?: Partial<Record<string, Partial<QueueConfig>>>
): MessageQueueController {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const queueRef = useRef<QueueItem[]>([]);
  const isProcessingRef = useRef<Record<string, boolean>>({});
  const activeTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const processedDeliveriesRef = useRef<Set<string>>(new Set());
  const currentlySendingRef = useRef<number>(0);

  useEffect(() => {
    const activeTimers = activeTimersRef.current;
    const processedDeliveries = processedDeliveriesRef.current;
    return () => {
      activeTimers.forEach(clearTimeout);
      processedDeliveries.clear();
      currentlySendingRef.current = 0;
    };
  }, []);
  const QUEUE_STORAGE_KEY = 'chat_message_queue';

  const getConfig = useCallback(
    (contactId: string): QueueConfig => {
      const overrides = configOverrides?.[contactId] || {};
      return { ...DEFAULT_QUEUE_CONFIG, ...overrides };
    },
    [configOverrides]
  );

  const calculateNextRetryDelay = useCallback((retryCount: number, config: QueueConfig) => {
    // Backoff exponencial: baseDelay * 2^retryCount
    let delay = config.baseDelay * Math.pow(2, retryCount);

    if (config.jitter) {
      // Jitter: +/- 20% de variação aleatória para evitar "thundering herd"
      const jitterAmount = delay * 0.2;
      delay = delay + (Math.random() * jitterAmount * 2 - jitterAmount);
    }

    return Math.min(delay, config.maxDelay);
  }, []);

  // Persistência: Carregar fila ao iniciar
  useEffect(() => {
    // F4-11: getItem pode lançar (SecurityError em modo privado/bloqueado) —
    // nunca derrubar o app por indisponibilidade do localStorage.
    let savedQueue: string | null = null;
    try {
      savedQueue = localStorage.getItem(QUEUE_STORAGE_KEY);
    } catch (e) {
      log.warn('localStorage unavailable (getItem) — queue restore skipped', e);
    }
    if (savedQueue) {
      try {
        const parsed = JSON.parse(savedQueue) as QueueItem[];
        const restored = parsed.map((item) => {
          // Attachments (File/Blob) não são serializáveis e por isso nunca
          // sobrevivem ao localStorage. Para 'text' isso é inofensivo (o
          // conteúdo real É a string). Para 'audio'/'attachment', `content`
          // é só um rótulo de exibição (ex.: "Mensagem de áudio") — resgatar
          // esses itens como 'pending' faz o processador reenviar esse rótulo
          // como se fosse a mensagem real ao cliente. Marcamos como 'failed'
          // para o usuário decidir regravar/reanexar em vez de reenviar.
          const lostMedia =
            (item.type === 'audio' || item.type === 'attachment') && item.status !== 'confirmed';
          return {
            ...item,
            status: lostMedia
              ? ('failed' as const)
              : item.status === 'sending'
                ? ('pending' as const)
                : item.status,
            progress: item.status === 'sending' ? 0 : item.progress,
            error: lostMedia
              ? 'Anexo perdido ao recarregar a página — reenvie manualmente.'
              : item.error,
            attachments: undefined,
          };
        });
        setQueue(restored);
        log.info('Restored message queue from localStorage');
      } catch (e) {
        log.error('Failed to parse saved queue', e);
      }
    }
  }, []);

  // Persistência: Salvar fila ao mudar
  useEffect(() => {
    const queueToSave = queue.map((item) => ({
      ...item,
      attachments: undefined, // Não serializável
    }));
    // F4-11: setItem pode lançar (QuotaExceededError / SecurityError) — falha
    // de persistência não pode quebrar o envio de mensagens.
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queueToSave));
    } catch (e) {
      log.warn('Failed to persist message queue to localStorage', e);
    }
  }, [queue]);

  // Espelho síncrono da fila: permite notificar onProgress sem efeitos
  // colaterais dentro de updaters de setState.
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const updateProgress = useCallback((id: string, progress: number) => {
    // Notifica o caller (ex.: barra de progresso do input) com o progresso real
    // da fila: 5 (início do envio), 15 (mídia), % de upload, 100 (confirmado), 0 (falha).
    queueRef.current.find((i) => i.id === id)?.onProgress?.(progress);
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, progress } : item)));
  }, []);

  // Versão corrigida e simplificada do processamento
  const processNextInQueue = useCallback(
    async (contactId: string) => {
      // Controle de concorrência global: máximo de MAX_CONCURRENT_SENDS simultâneos
      if (currentlySendingRef.current >= MAX_CONCURRENT_SENDS) {
        log.debug(
          `[concurrency] Max concurrent sends (${MAX_CONCURRENT_SENDS}) reached, deferring`
        );
        return;
      }

      if (isProcessingRef.current[contactId]) return;

      // Encontrar o próximo item pendente para este contato
      setQueue((currentQueue) => {
        const contactQueue = currentQueue.filter((item) => item.contactId === contactId);
        const itemToProcess = contactQueue.find((item) => item.status === 'pending');

        if (!itemToProcess) return currentQueue;

        // Se achamos um item, marcamos como enviando e iniciamos o processo fora do setQueue
        isProcessingRef.current[contactId] = true;
        currentlySendingRef.current += 1;

        // Iniciamos o processamento assíncrono
        void (async () => {
          const config = getConfig(contactId);
          const startTime = Date.now();

          try {
            // Verificar se o item já passou do tempo de retry se estiver pendente após falha
            if (itemToProcess.nextRetryAt && itemToProcess.nextRetryAt > Date.now()) {
              isProcessingRef.current[contactId] = false;
              currentlySendingRef.current = Math.max(0, currentlySendingRef.current - 1);
              // Agendar verificação para o tempo exato do retry
              const t1 = setTimeout(
                () => {
                  activeTimersRef.current.delete(t1);
                  processNextInQueue(contactId);
                },
                itemToProcess.nextRetryAt - Date.now() + 10
              );
              activeTimersRef.current.add(t1);
              return;
            }

            log.info(
              `Processing message ${itemToProcess.id} for contact ${contactId} (Retry: ${itemToProcess.retryCount})`
            );

            setQueue((q) =>
              q.map((i) => (i.id === itemToProcess.id ? { ...i, status: 'sending' } : i))
            );

            // Notifica o caller que o envio começou de verdade (barra de progresso do input).
            updateProgress(itemToProcess.id, 5);

            // Internal tracking for sequential media uploads
            if (itemToProcess.type !== 'text') {
              updateProgress(itemToProcess.id, 15);
            }

            await processMessage(itemToProcess);

            const completedAt = Date.now();
            const duration = completedAt - startTime;
            setQueue((q) =>
              q.map((i) =>
                i.id === itemToProcess.id
                  ? {
                      ...i,
                      status: 'confirmed',
                      completedAt,
                      nextRetryAt: undefined,
                      attempts: [...(i.attempts || []), { timestamp: Date.now(), duration }],
                    }
                  : i
              )
            );

            // Envio confirmado: fecha a barra de progresso do input em 100%.
            updateProgress(itemToProcess.id, 100);

            const t2 = setTimeout(() => {
              activeTimersRef.current.delete(t2);
              setQueue((q) => q.filter((i) => i.id !== itemToProcess.id));
            }, 5000);
            activeTimersRef.current.add(t2);

            log.info(
              `[INBOX_METRIC] action=send_success contact=${contactId} duration=${duration}ms attempt=${itemToProcess.retryCount}`
            );
          } catch (err) {
            const duration = Date.now() - startTime;
            const errorMsg = err instanceof Error ? err.message : String(err);

            // Observability: Telemetry for failures
            log.error(
              `[QUEUE_ERROR] id=${itemToProcess.id} contact=${contactId} attempt=${itemToProcess.retryCount} err=${errorMsg}`
            );

            const analytics = (
              window as Window & {
                analytics?: { track: (event: string, props?: Record<string, unknown>) => void };
              }
            ).analytics;
            const durationMs = Date.now() - startTime;

            // New Monitoring Logs for Dashboard
            log.info(
              `[INBOX_METRIC] action=send_fail contact=${contactId} duration=${durationMs}ms attempt=${itemToProcess.retryCount}`
            );

            if (analytics) {
              analytics.track('Message Queue Failure', {
                messageId: itemToProcess.id,
                contactId,
                attempt: itemToProcess.retryCount,
                error: errorMsg,
                duration,
              });
            }

            // F4-13: classifica o erro — 5xx/timeout/rede são retryable; 4xx é
            // permanente e não deve gastar tentativas com backoff inútil.
            const retryable = isRetryableSendError(err);
            const shouldAutoRetry = retryable && itemToProcess.retryCount < config.maxRetries;
            const delay = shouldAutoRetry
              ? calculateNextRetryDelay(itemToProcess.retryCount, config)
              : 0;
            const nextRetryAt = shouldAutoRetry ? Date.now() + delay : undefined;

            if (!retryable) {
              log.info(
                `[QUEUE_ERROR] permanent error (non-retryable) id=${itemToProcess.id} contact=${contactId} err=${errorMsg}`
              );
            }

            setQueue((q) =>
              q.map((i) =>
                i.id === itemToProcess.id
                  ? {
                      ...i,
                      status: shouldAutoRetry ? 'pending' : 'failed',
                      retryCount: i.retryCount + (shouldAutoRetry ? 1 : 0),
                      error: err,
                      nextRetryAt,
                      attempts: [
                        ...(i.attempts || []),
                        { timestamp: Date.now(), error: errorMsg, duration },
                      ],
                    }
                  : i
              )
            );

            // Falha (ou retry agendado): zera a barra de progresso do input.
            updateProgress(itemToProcess.id, 0);

            if (!shouldAutoRetry) {
              toast({
                title: retryable ? 'Falha definitiva' : 'Falha permanente',
                description: retryable
                  ? 'Atingido limite de tentativas. Você pode tentar manualmente ou remover o item.'
                  : 'O servidor recusou o envio (erro permanente). Verifique os dados e tente novamente.',
                variant: 'destructive',
              });
              // Persistir no banco para rastreamento e possivel reprocessamento via DLQ
              dbFrom('failed_messages')
                .insert({
                  id: uuidv4(),
                  instance_name: 'client-queue',
                  remote_jid: contactId,
                  status: 'abandoned',
                  payload: { content: itemToProcess.content, type: itemToProcess.type },
                  error_message: errorMsg,
                  retry_count: itemToProcess.retryCount,
                  max_retries: config.maxRetries,
                  last_attempt_at: new Date().toISOString(),
                })
                // F4-14: .select() + tratamento estruturado — sem .select() o
                // erro do PostgREST (ex.: RLS bloqueando o insert) era engolido
                // e a falha ficava silenciosa (zapp.failed_messages vazia).
                .select()
                .then(
                  ({
                    error,
                  }: {
                    error: { message: string; code?: string | null } | null;
                  }) => {
                    if (error) {
                      log.warn('[failed_messages] insert failed', {
                        code: error.code ?? null,
                        message: error.message,
                      });
                    } else {
                      log.debug('Failed message persisted to zapp.failed_messages');
                    }
                  }
                )
                .catch((e: unknown) => log.warn('Failed to persist failed_message to DB', e));
            } else {
              log.info(`Scheduled retry for ${itemToProcess.id} in ${Math.round(delay / 1000)}s`);
            }
          } finally {
            isProcessingRef.current[contactId] = false;
            currentlySendingRef.current = Math.max(0, currentlySendingRef.current - 1);
            // Tentar processar o próximo após um pequeno delay ou o tempo do retry
            const t3 = setTimeout(() => {
              activeTimersRef.current.delete(t3);
              processNextInQueue(contactId);
            }, 500);
            activeTimersRef.current.add(t3);
          }
        })();

        return currentQueue; // O estado será atualizado dentro do bloco assíncrono
      });
    },
    [processMessage, getConfig, updateProgress, calculateNextRetryDelay]
  );

  // Disparar processamento quando a fila mudar
  useEffect(() => {
    const contactIds = Array.from(
      new Set(queue.filter((i) => i.status === 'pending').map((i) => i.contactId))
    );
    contactIds.forEach((id) => {
      if (!isProcessingRef.current[id]) {
        processNextInQueue(id);
      }
    });
  }, [queue, processNextInQueue]);

  const addToQueue = useCallback(
    (
      contactId: string,
      content: string,
      attachments?: File[],
      type: 'text' | 'attachment' | 'audio' = 'text',
      onProgress?: (p: number) => void
    ) => {
      const newItem: QueueItem = {
        id: `queue:${uuidv4()}`,
        contactId,
        content,
        type,
        attachments,
        onProgress,
        status: 'pending',
        retryCount: 0,
        progress: 0,
        createdAt: Date.now(),
        attempts: [],
      };

      setQueue((prev) => [...prev, newItem]);
      log.info(`Added message to queue: ${newItem.id} (type: ${type})`);
    },
    []
  );

  const retryMessage = useCallback((id: string) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: 'pending',
              error: undefined,
              retryCount: 0,
              progress: 0,
            }
          : item
      )
    );
  }, []);

  const reconcileWithDelivery = useCallback(
    (contactId: string, externalId: string, status: 'confirmed' | 'failed') => {
      const dedupeKey = `${contactId}:${externalId}:${status}`;
      const processed = processedDeliveriesRef.current;
      if (processed.has(dedupeKey)) {
        log.debug('[dedup] Already processed delivery event', { contactId, externalId, status });
        return;
      }
      // F4-10: cap do dedupe — evicta a entrada mais antiga (Set preserva
      // ordem de inserção) para o Set não crescer sem limite.
      if (processed.size >= MAX_PROCESSED_DELIVERIES) {
        const oldest = processed.values().next().value;
        if (oldest !== undefined) processed.delete(oldest);
      }
      processed.add(dedupeKey);

      if (status === 'confirmed') {
        const confirmedItem = queueRef.current.find(
          (i) =>
            i.contactId === contactId && (i.externalId === externalId || i.content === externalId)
        );
        // Confirmação via webhook antes do processamento local marcar 100:
        // fecha a barra de progresso do input em vez de deixá-la presa.
        confirmedItem?.onProgress?.(100);
      }

      setQueue((prev) => {
        const item = prev.find(
          (i) =>
            i.contactId === contactId && (i.externalId === externalId || i.content === externalId)
        );
        if (!item) return prev;

        if (status === 'confirmed') {
          return prev.filter((i) => i.id !== item.id);
        } else {
          return prev.map((i) =>
            i.id === item.id ? { ...i, status: 'failed', completedAt: Date.now() } : i
          );
        }
      });
    },
    []
  );

  // Compute metrics from the queue items (including those just processed)
  const getMetrics = useCallback((): QueueMetrics => {
    const metrics: QueueMetrics = {
      totalSent: 0,
      totalFailed: 0,
      totalRetries: 0,
      averageLatency: 0,
      byType: {},
      byConversation: {},
    };

    const confirmedItems = queue.filter((i) => i.status === 'confirmed');
    const failedItems = queue.filter((i) => i.status === 'failed');

    metrics.totalSent = confirmedItems.length;
    metrics.totalFailed = failedItems.length;

    const allItems = [...confirmedItems, ...failedItems];
    let totalLatency = 0;
    let latencyCount = 0;

    allItems.forEach((item) => {
      const type = item.type;
      const conv = item.contactId;
      const latency = item.completedAt ? item.completedAt - item.createdAt : 0;

      if (!metrics.byType[type]) metrics.byType[type] = { sent: 0, failed: 0, latency: [] };
      if (!metrics.byConversation[conv])
        metrics.byConversation[conv] = { sent: 0, failed: 0, latency: [] };

      if (item.status === 'confirmed') {
        metrics.byType[type].sent++;
        metrics.byConversation[conv].sent++;
        if (latency > 0) {
          metrics.byType[type].latency.push(latency);
          metrics.byConversation[conv].latency.push(latency);
          totalLatency += latency;
          latencyCount++;
        }
      } else {
        metrics.byType[type].failed++;
        metrics.byConversation[conv].failed++;
      }

      metrics.totalRetries += item.retryCount;
    });

    metrics.averageLatency = latencyCount > 0 ? totalLatency / latencyCount : 0;

    return metrics;
  }, [queue]);

  return {
    queue,
    addToQueue,
    retryMessage,
    updateProgress,
    reconcileWithDelivery,
    getMetrics,
    removeFromQueue: (id: string) => {
      const item = queueRef.current.find((i) => i.id === id);
      // Remoção de item em voo (falha multi-anexo ou cancelamento do usuário)
      // sem confirmação: zera o progresso para a barra do input não ficar presa.
      if (item && item.status !== 'confirmed') item.onProgress?.(0);
      setQueue((prev) => prev.filter((item) => item.id !== id));
    },
  };
}
