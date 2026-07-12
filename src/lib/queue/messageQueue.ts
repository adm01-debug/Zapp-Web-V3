
import { dbInsert } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';
import { getLogger } from '@/lib/logger';

const log = getLogger('messageQueue');
import { eventBus } from '@/lib/eventBus';

export interface QueuedMessage {
  id: string;
  remote_jid: string;
  content: string;
  media_url?: string;
  media_mimetype?: string;
  message_type: 'text' | 'audio' | 'image' | 'video' | 'document';
  status: 'pending' | 'sending' | 'failed' | 'sent';
  attempts: number;
  last_error?: string;
  created_at: number;
}

class MessageQueue {
  private queue: QueuedMessage[] = [];
  private isProcessing = false;
  private maxAttempts = 5;

  constructor() {
    this.loadFromStorage();
    // Listen for connection recovery to resume processing
    eventBus.on('connection:recovered', () => this.processQueue());
  }

  private loadFromStorage() {
    const stored = localStorage.getItem('message_retry_queue');
    if (stored) {
      try {
        this.queue = JSON.parse(stored);
      } catch (e) {
        log.error('Failed to parse stored queue', e);
        this.queue = [];
      }
    }
  }

  private saveToStorage() {
    localStorage.setItem('message_retry_queue', JSON.stringify(this.queue));
    eventBus.emit('queue:updated', this.queue);
  }

  async enqueue(message: Omit<QueuedMessage, 'id' | 'status' | 'attempts' | 'created_at'>) {
    const newItem: QueuedMessage = {
      ...message,
      id: crypto.randomUUID(),
      status: 'pending',
      attempts: 0,
      created_at: Date.now(),
    };

    this.queue.push(newItem);
    this.saveToStorage();
    this.processQueue();
    return newItem.id;
  }

  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    const pending = this.queue.filter(m => m.status === 'pending' || m.status === 'failed');
    
    for (const msg of pending) {
      if (msg.attempts >= this.maxAttempts) continue;

      try {
        msg.status = 'sending';
        this.saveToStorage();

        // Using the typed RPC catalog
        const { error } = await dbInsert(RPC.send_message_v2, {
          p_remote_jid: msg.remote_jid,
          p_content: msg.content,
          p_message_type: msg.message_type,
          p_media_url: msg.media_url,
          p_media_mimetype: msg.media_mimetype
        });

        if (error) throw error;

        msg.status = 'sent';
        // Remove from queue on success
        this.queue = this.queue.filter(m => m.id !== msg.id);
      } catch (err: any) {
        msg.attempts++;
        msg.status = 'failed';
        msg.last_error = err.message;
        log.error(`Failed to send message ${msg.id}`, err);
      }
      this.saveToStorage();
    }

    this.isProcessing = false;
  }

  getQueue() {
    return [...this.queue];
  }

  retryMessage(id: string) {
    const msg = this.queue.find(m => m.id === id);
    if (msg) {
      msg.status = 'pending';
      msg.attempts = 0;
      this.saveToStorage();
      this.processQueue();
    }
  }

  clearQueue() {
    this.queue = [];
    this.saveToStorage();
  }
}

export const messageQueue = new MessageQueue();
