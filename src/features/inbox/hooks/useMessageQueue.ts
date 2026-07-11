import { useState, useCallback, useRef, useEffect } from 'react';
import { getLogger } from '@/lib/logger';
import { v4 as uuidv4 } from 'uuid';
import { toast } from '@/hooks/use-toast';

const log = getLogger('useMessageQueue');

export interface QueueConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  jitter: boolean;
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1s
  maxDelay: 30000, // 30s
  jitter: true
};

export interface QueueItem {
  id: string;
  contactId: string;
  content: string;
  type: 'text' | 'attachment' | 'audio';
  attachments?: File[];
  onProgress?: (p: number) => void;
  status: 'pending' | 'sending' | 'failed' | 'confirmed';
  error?: any;
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

export interface QueueMetrics {
  totalSent: number;
  totalFailed: number;
  totalRetries: number;
  averageLatency: number;
  byType: Record<string, { sent: number; failed: number; latency: number[] }>;
  byConversation: Record<string, { sent: number; failed: number; latency: number[] }>;
}

export function useMessageQueue(
  processMessage: (item: QueueItem) => Promise<void>,
  configOverrides?: Partial<Record<string, Partial<QueueConfig>>>
) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const isProcessingRef = useRef<Record<string, boolean>>({});
  const activeTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => () => { activeTimersRef.current.forEach(clearTimeout); }, []);
  const QUEUE_STORAGE_KEY = 'chat_message_queue';

  const getConfig = useCallback((contactId: string): QueueConfig => {
    const overrides = configOverrides?.[contactId] || {};
    return { ...DEFAULT_QUEUE_CONFIG, ...overrides };
  }, [configOverrides]);

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
    const savedQueue = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (savedQueue) {
      try {
        const parsed = JSON.parse(savedQueue) as QueueItem[];
        const restored = parsed.map(item => ({
          ...item,
          status: item.status === 'sending' ? 'pending' : item.status,
          progress: item.status === 'sending' ? 0 : item.progress,
          attachments: undefined
        }));
        setQueue(restored);
        log.info('Restored message queue from localStorage');
      } catch (e) {
        log.error('Failed to parse saved queue', e);
      }
    }
  }, []);

  // Persistência: Salvar fila ao mudar
  useEffect(() => {
    const queueToSave = queue.map(item => ({
      ...item,
      attachments: undefined // Não serializável
    }));
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queueToSave));
  }, [queue]);

  const processQueueForContact = useCallback(async (contactId: string) => {
    if (isProcessingRef.current[contactId]) return;

    // Tentar pegar o próximo item da fila sem criar um loop infinito de dependência
    // isProcessingRef garante que não rodamos em paralelo para o mesmo contato
    let nextItem: QueueItem | undefined;
    
    // Precisamos de uma forma de ler o estado atual do queue sem depender dele
    // Como estamos dentro de um useCallback que será chamado por um useEffect,
    // podemos usar um truque ou simplesmente aceitar que o useEffect gatilha a primeira vez.
    // Mas para o processamento sequencial, precisamos ler o estado atualizado.
    
    // Abordagem: processQueueForContact será disparado pelo useEffect quando o queue mudar,
    // mas ele mesmo só age se isProcessingRef estiver false.
  }, [processMessage]);

  // Versão corrigida e simplificada do processamento
  const processNextInQueue = useCallback(async (contactId: string) => {
    if (isProcessingRef.current[contactId]) return;

    // Encontrar o próximo item pendente para este contato
    setQueue(currentQueue => {
      const contactQueue = currentQueue.filter(item => item.contactId === contactId);
      const itemToProcess = contactQueue.find(item => item.status === 'pending');

      if (!itemToProcess) return currentQueue;

      // Se achamos um item, marcamos como enviando e iniciamos o processo fora do setQueue
      isProcessingRef.current[contactId] = true;
      
          // Iniciamos o processamento assíncrono
          void (async () => {
            const config = getConfig(contactId);
            const startTime = Date.now();
            
            try {
              // Verificar se o item já passou do tempo de retry se estiver pendente após falha
              if (itemToProcess.nextRetryAt && itemToProcess.nextRetryAt > Date.now()) {
                isProcessingRef.current[contactId] = false;
                // Agendar verificação para o tempo exato do retry
                const t1 = setTimeout(() => { activeTimersRef.current.delete(t1); processNextInQueue(contactId); }, itemToProcess.nextRetryAt - Date.now() + 10);
                activeTimersRef.current.add(t1);
                return;
              }

              log.info(`Processing message ${itemToProcess.id} for contact ${contactId} (Retry: ${itemToProcess.retryCount})`);
              
              setQueue(q => q.map(i => i.id === itemToProcess.id ? { ...i, status: 'sending', progress: 5 } : i));
              
              // Internal tracking for sequential media uploads
              if (itemToProcess.type !== 'text') {
                updateProgress(itemToProcess.id, 15);
              }
              
              await processMessage(itemToProcess);
              
              const completedAt = Date.now();
              const duration = completedAt - startTime;
              setQueue(q => q.map(i => 
                i.id === itemToProcess.id ? { 
                  ...i, 
                  status: 'confirmed', 
                  progress: 100,
                  completedAt,
                  nextRetryAt: undefined,
                  attempts: [...(i.attempts || []), { timestamp: Date.now(), duration }]
                } : i
              ));
              
              const t2 = setTimeout(() => { activeTimersRef.current.delete(t2); setQueue(q => q.filter(i => i.id !== itemToProcess.id)); }, 5000);
              activeTimersRef.current.add(t2);

              log.info(`[INBOX_METRIC] action=send_success contact=${contactId} duration=${duration}ms attempt=${itemToProcess.retryCount}`);
            } catch (err) {
              const duration = Date.now() - startTime;
              const errorMsg = err instanceof Error ? err.message : String(err);
              
              // Observability: Telemetry for failures
              log.error(`[QUEUE_ERROR] id=${itemToProcess.id} contact=${contactId} attempt=${itemToProcess.retryCount} err=${errorMsg}`);
              
              const analytics = (window as Window & { analytics?: { track: (event: string, props?: Record<string, unknown>) => void } }).analytics;
              const startTimeStr = new Date(startTime).toISOString();
              const durationMs = Date.now() - startTime;
              
              // New Monitoring Logs for Dashboard
              log.info(`[INBOX_METRIC] action=send_fail contact=${contactId} duration=${durationMs}ms attempt=${itemToProcess.retryCount}`);
              
              if (analytics) {
                analytics.track('Message Queue Failure', {
                  messageId: itemToProcess.id,
                  contactId,
                  attempt: itemToProcess.retryCount,
                  error: errorMsg,
                  duration
                });
              }
              
              const shouldAutoRetry = itemToProcess.retryCount < config.maxRetries;
              const delay = shouldAutoRetry ? calculateNextRetryDelay(itemToProcess.retryCount, config) : 0;
              const nextRetryAt = shouldAutoRetry ? Date.now() + delay : undefined;
              
              setQueue(q => q.map(i => 
                i.id === itemToProcess.id ? { 
                  ...i, 
                  status: shouldAutoRetry ? 'pending' : 'failed',
                  retryCount: i.retryCount + (shouldAutoRetry ? 1 : 0),
                  error: err,
                  progress: 0,
                  nextRetryAt,
                  attempts: [...(i.attempts || []), { timestamp: Date.now(), error: errorMsg, duration }]
                } : i
              ));

              if (!shouldAutoRetry) {
                toast({
                  title: "Falha definitiva",
                  description: "Atingido limite de tentativas. Você pode tentar manualmente ou remover o item.",
                  variant: "destructive"
                });
              } else {
                log.info(`Scheduled retry for ${itemToProcess.id} in ${Math.round(delay/1000)}s`);
              }
            } finally {
              isProcessingRef.current[contactId] = false;
              // Tentar processar o próximo após um pequeno delay ou o tempo do retry
              const t3 = setTimeout(() => { activeTimersRef.current.delete(t3); processNextInQueue(contactId); }, 500);
              activeTimersRef.current.add(t3);
            }
          })();

      return currentQueue; // O estado será atualizado dentro do bloco assíncrono
    });
  }, [processMessage]);

  // Disparar processamento quando a fila mudar
  useEffect(() => {
    const contactIds = Array.from(new Set(queue.filter(i => i.status === 'pending').map(i => i.contactId)));
    contactIds.forEach(id => {
      if (!isProcessingRef.current[id]) {
        processNextInQueue(id);
      }
    });
  }, [queue, processNextInQueue]);

  const addToQueue = useCallback((contactId: string, content: string, attachments?: File[], type: 'text' | 'attachment' | 'audio' = 'text') => {
    const newItem: QueueItem = {
      id: `queue:${uuidv4()}`,
      contactId,
      content,
      type,
      attachments,
      status: 'pending',
      retryCount: 0,
      progress: 0,
      createdAt: Date.now(),
      attempts: []
    };
    
    setQueue(prev => [...prev, newItem]);
    log.info(`Added message to queue: ${newItem.id} (type: ${type})`);
  }, []);

  const updateProgress = useCallback((id: string, progress: number) => {
    setQueue(prev => prev.map(item => 
      item.id === id ? { ...item, progress } : item
    ));
  }, []);

  const retryMessage = useCallback((id: string) => {
    setQueue(prev => prev.map(item => 
      item.id === id ? { 
        ...item, 
        status: 'pending', 
        error: undefined, 
        retryCount: 0, 
        progress: 0 
      } : item
    ));
  }, []);

  const reconcileWithDelivery = useCallback((contactId: string, externalId: string, status: 'confirmed' | 'failed') => {
    setQueue(prev => {
      const item = prev.find(i => i.contactId === contactId && (i.externalId === externalId || i.content === externalId));
      if (!item) return prev;

      if (status === 'confirmed') {
        return prev.filter(i => i.id !== item.id);
      } else {
        // Apenas marca como falha se não houver mais tentativas automáticas
        return prev.map(i => i.id === item.id ? { ...i, status: 'failed' } : i);
      }
    });
  }, []);

  // Compute metrics from the queue items (including those just processed)
  const getMetrics = useCallback((): QueueMetrics => {
    const metrics: QueueMetrics = {
      totalSent: 0,
      totalFailed: 0,
      totalRetries: 0,
      averageLatency: 0,
      byType: {},
      byConversation: {}
    };

    const confirmedItems = queue.filter(i => i.status === 'confirmed');
    const failedItems = queue.filter(i => i.status === 'failed');
    
    metrics.totalSent = confirmedItems.length;
    metrics.totalFailed = failedItems.length;
    
    const allItems = [...confirmedItems, ...failedItems];
    let totalLatency = 0;
    let latencyCount = 0;

    allItems.forEach(item => {
      const type = item.type;
      const conv = item.contactId;
      const latency = item.completedAt ? item.completedAt - item.createdAt : 0;

      if (!metrics.byType[type]) metrics.byType[type] = { sent: 0, failed: 0, latency: [] };
      if (!metrics.byConversation[conv]) metrics.byConversation[conv] = { sent: 0, failed: 0, latency: [] };

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
      setQueue(prev => prev.filter(item => item.id !== id));
    }
  };
}
