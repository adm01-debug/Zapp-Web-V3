import { useState, useCallback, useRef, useEffect } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { eventBus } from '@/lib/eventBus';
import { getLogger } from '@/lib/logger';
import { useToast } from '@/hooks/use-toast';

const log = getLogger('useMessageQueue');

export interface PendingMessage {
  id: string;
  remote_jid: string;
  content: string;
  status: 'pending' | 'sending' | 'failed';
  timestamp: number;
  retries: number;
}

export function useMessageQueue(instanceName: string = 'wpp2') {
  const { sendTextMessage } = useEvolutionApi();
  const { toast } = useToast();
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>(() => {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem(`pending_msgs_${instanceName}`);
    return saved ? JSON.parse(saved) : [];
  });
  const queueRef = useRef<PendingMessage[]>([]);
  const isProcessingRef = useRef(false);
  const mountedRef = useMountedRef();
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
  }, []);

  // Initialize queueRef from state on mount
  useEffect(() => {
    queueRef.current = [...pendingMessages];
    if (pendingMessages.length > 0) {
      void processQueue();
    }
  }, []);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(`pending_msgs_${instanceName}`, JSON.stringify(pendingMessages));
  }, [pendingMessages, instanceName]);

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current || queueRef.current.length === 0) return;
    
    isProcessingRef.current = true;
    
    while (queueRef.current.length > 0) {
      const msg = queueRef.current[0];
      
      // Update status to sending
      setPendingMessages(prev => 
        prev.map(p => p.id === msg.id ? { ...p, status: 'sending' } : p)
      );

      try {
        const number = msg.remote_jid.split('@')[0];
        await sendTextMessage(
          instanceName,
          number,
          msg.content
        );
        
        // Remove from queue after successful send
        // Note: We don't remove from pendingMessages state yet, 
        // we wait for the realtime event to avoid flickering (deduplication)
        // BUT if realtime is slow, we might want to remove it after a timeout
        queueRef.current.shift();
        
        // Success!
        log.info(`[MessageQueue] Sent message ${msg.id}`);
        
        // Optional: remove after a small delay if no realtime message arrived
        if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
        cleanupTimerRef.current = setTimeout(() => {
          if (mountedRef.current) setPendingMessages(prev => prev.filter(p => p.id !== msg.id));
        }, 3000);
        
      } catch (err) {
        log.error(`[MessageQueue] Failed to send ${msg.id}:`, err);
        
        msg.retries += 1;
        
        if (msg.retries >= 3) {
          setPendingMessages(prev => 
            prev.map(p => p.id === msg.id ? { ...p, status: 'failed' } : p)
          );
          queueRef.current.shift(); // Remove after max retries
          
          toast({
            title: 'Erro ao enviar mensagem',
            description: 'A mensagem não pôde ser enviada após várias tentativas.',
            variant: 'destructive'
          });
        } else {
          // Exponential backoff wait
          const waitTime = Math.pow(2, msg.retries) * 1000;
          log.info(`[MessageQueue] Retrying ${msg.id} in ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          // Keep in queue for next iteration
        }
        break; 
      }
    }
    
    isProcessingRef.current = false;
  }, [instanceName, sendTextMessage, toast]);

  const enqueueMessage = useCallback((remote_jid: string, content: string) => {
    const id = `pending_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newMsg: PendingMessage = {
      id,
      remote_jid,
      content,
      status: 'pending',
      timestamp: Date.now(),
      retries: 0
    };
    
    queueRef.current.push(newMsg);
    setPendingMessages(prev => [...prev, newMsg]);
    
    processQueue();
    return id;
  }, [processQueue]);

  // Clean up pending messages when real messages arrive
  useEffect(() => {
    const unsub = eventBus.on('message:received', ({ contactId }) => {
      // If we receive a message from the same contact, we might want to clear old pending ones
      // This is a simple deduplication strategy
      setPendingMessages(prev => prev.filter(p => p.remote_jid !== contactId));
    });
    return unsub;
  }, []);

  return {
    pendingMessages,
    enqueueMessage,
    retryMessage: processQueue
  };
}
