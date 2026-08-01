/**
 * Sistema de Métricas de Negócio (Business Analytics).
 *
 * Métricas rastreadas:
 * - Mensagens enviadas/recebidas
 * - Tempo médio de resposta
 * - Taxa de conversão de leads
 * - Engagement score de contatos
 * - Performance de agents
 *
 * Os dados são enviados para Supabase (analytics_events)
 * e processados por Edge Functions (analytics-aggregator).
 */

export type EventCategory =
  | 'message'
  | 'contact'
  | 'campaign'
  | 'agent_performance'
  | 'engagement'
  | 'conversion'
  | 'response_time';

export type EventValue = number | string | boolean | null;

export interface BusinessEvent {
  /** Categoria do evento */
  category: EventCategory;
  /** Nome da ação (ex: 'sent', 'received', 'replied') */
  action: string;
  /** Label opcional para contextualizar */
  label?: string;
  /** Valor numérico (ex: tempo, count, valor) */
  value?: number;
  /** Metadata extra (opcional) */
  metadata?: Record<string, EventValue>;
  /** User ID (opcional) */
  userId?: string;
  /** Workspace ID (opcional) */
  workspaceId?: string;
  /** Timestamp ISO */
  timestamp?: string;
}

interface AnalyticsConfig {
  /** Habilitar tracking */
  enabled?: boolean;
  /** Habilitar sampling (0-1) */
  sampleRate?: number;
  /** Auto-flush interval */
  flushIntervalMs?: number;
  /** User ID para tracking */
  userId?: string;
  /** Workspace ID para tracking */
  workspaceId?: string;
}

class BusinessAnalytics {
  private queue: BusinessEvent[] = [];
  private config: AnalyticsConfig = {};
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  configure(config: AnalyticsConfig): void {
    this.config = config;

    if (config.flushIntervalMs && !this.flushTimer) {
      this.flushTimer = setInterval(() => this.flush(), config.flushIntervalMs);
    }
  }

  /**
   * Track evento de negócio.
   */
  track(
    event: Omit<BusinessEvent, 'timestamp' | 'userId' | 'workspaceId'> &
      Partial<Pick<BusinessEvent, 'timestamp' | 'userId' | 'workspaceId'>>
  ): void {
    if (this.config.enabled === false) return;

    // Sampling
    if (typeof this.config.sampleRate === 'number' && this.config.sampleRate < 1) {
      if (Math.random() > this.config.sampleRate) return;
    }

    const fullEvent: BusinessEvent = {
      ...event,
      userId: event.userId ?? this.config.userId,
      workspaceId: event.workspaceId ?? this.config.workspaceId,
      timestamp: event.timestamp ?? new Date().toISOString(),
    };

    this.queue.push(fullEvent);

    // Auto-flush se queue muito grande
    if (this.queue.length >= 50) {
      this.flush();
    }
  }

  /**
   * Helper para mensagens enviadas.
   */
  trackMessageSent(durationMs: number, instanceName: string): void {
    this.track({
      category: 'message',
      action: 'sent',
      value: durationMs,
      metadata: { instance: instanceName },
    });
  }

  /**
   * Helper para mensagens recebidas.
   */
  trackMessageReceived(instanceName: string, isFirstResponse: boolean): void {
    this.track({
      category: 'message',
      action: 'received',
      metadata: { instance: instanceName, firstResponse: isFirstResponse },
    });
  }

  /**
   * Helper para tempo de resposta.
   */
  trackResponseTime(durationMs: number, agentId: string): void {
    this.track({
      category: 'response_time',
      action: 'replied',
      value: durationMs,
      metadata: { agentId },
    });
  }

  /**
   * Helper para engagement de contato.
   */
  trackContactEngagement(contactId: string, score: number): void {
    this.track({
      category: 'engagement',
      action: 'scored',
      value: score,
      metadata: { contactId },
    });
  }

  /**
   * Helper para conversão de campanha.
   */
  trackCampaignConversion(campaignId: string, contactId: string, value: number): void {
    this.track({
      category: 'conversion',
      action: 'converted',
      value,
      metadata: { campaignId, contactId },
    });
  }

  /**
   * Helper para performance de agent.
   */
  trackAgentPerformance(agentId: string, metric: string, value: number): void {
    this.track({
      category: 'agent_performance',
      action: metric,
      value,
      metadata: { agentId },
    });
  }

  /**
   * Adiciona à fila manualmente.
   */
  enqueue(event: BusinessEvent): void {
    this.queue.push(event);
  }

  /**
   * Flush para Supabase (batch).
   */
  async flush(): Promise<{ sent: number; failed: number }> {
    if (this.queue.length === 0) {
      return { sent: 0, failed: 0 };
    }

    const batch = [...this.queue];
    this.queue = [];

    try {
      // Envia para Supabase via Edge Function ou RPC
      const { supabase } = await import('@/integrations/supabase/client');

      // Tabela analytics_events
      const rows = batch.map((e) => ({
        category: e.category,
        action: e.action,
        label: e.label,
        value: e.value,
        metadata: e.metadata,
        user_id: e.userId,
        workspace_id: e.workspaceId,
        timestamp: e.timestamp,
      }));

      // `analytics_events` não está nos types gerados — usa builder estrutural estreito
      // (o `from` tipado degeneraria para o union de 300+ tabelas → TS2769).
      const { error } = await (
        supabase as unknown as {
          from: (table: string) => {
            insert: (rows: unknown[]) => Promise<{ error: unknown }>;
          };
        }
      )
        .from('analytics_events')
        .insert(rows);

      if (error) throw error;

      return { sent: batch.length, failed: 0 };
    } catch (error) {
      // Recoloca na queue para retry
      this.queue = [...batch, ...this.queue];
      console.error('[BusinessAnalytics] Flush falhou:', error);
      return { sent: 0, failed: batch.length };
    }
  }

  /**
   * Para o auto-flush.
   */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Stats atuais.
   */
  getStats(): { queueSize: number; enabled: boolean } {
    return {
      queueSize: this.queue.length,
      enabled: this.config.enabled !== false,
    };
  }
}

// Singleton
export const analytics = new BusinessAnalytics();

/**
 * Hook React para tracking.
 */
export function useAnalytics() {
  return {
    track: analytics.track.bind(analytics),
    flush: analytics.flush.bind(analytics),
  };
}
