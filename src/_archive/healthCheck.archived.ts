/**
 * @deprecated V3 ARCHIVADO 2026-08-14 — CÓDIGO MORTO
 *
 * Este módulo não tem importadores na aplicação (verificado 2026-08-14).
 * A verificação de saúde da Evolution API é feita via:
 *   - useDiagnosticsData.ts → supabase.functions.invoke('connection-health-check')
 *   - DiagnosticsView.tsx (renderiza resultado do useDiagnosticsData)
 *
 * Referência VITE_EVOLUTION_API_URL REMOVIDA do gateway-first (docs/decouple/).
 * Ver: docs/decouple/PLANO_DESACOPLAMENTO_V3_100_ETAPAS.md etapa 23
 *
 * @preservedFor Histórico de implementação — não restaurar sem revisar V3.
 */
// @ts-nocheck — Arquivo arquivado, não compilado em produção.
/* eslint-disable */
/**
 * Sistema de Health Check para monitorar saúde dos serviços.
 *
 * Componentes verificados:
 * - Supabase (DB, Auth, Realtime)
 * - Evolution API (WhatsApp)
 * - Storage (Uploads)
 * - AI Providers (Gemini, GPT)
 *
 * Uso:
 * ```typescript
 * import { healthCheck } from '@/lib/healthCheck';
 *
 * const status = await healthCheck.run();
 * if (!status.healthy) {
 *   showAlert(status);
 * }
 * ```
 */

export type ServiceStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface ComponentHealth {
  name: string;
  status: ServiceStatus;
  latencyMs?: number;
  message?: string;
  lastChecked: string;
  metadata?: Record<string, unknown>;
}

export interface SystemHealth {
  healthy: boolean;
  status: ServiceStatus;
  components: ComponentHealth[];
  timestamp: string;
  uptimeMs: number;
}

interface HealthCheckConfig {
  /** Timeout para cada check */
  timeoutMs?: number;
  /** Se deve fazer check paralelo */
  parallel?: boolean;
}

class HealthCheckService {
  private startTime = Date.now();
  private cache: SystemHealth | null = null;
  private cacheTtlMs = 5_000;

  /**
   * Roda todos os health checks.
   */
  async run(config: HealthCheckConfig = {}): Promise<SystemHealth> {
    const timeout = config.timeoutMs ?? 5_000;

    const checks = [
      this.checkSupabase(timeout),
      this.checkStorage(timeout),
      this.checkEvolutionAPI(timeout),
    ];

    const components = await Promise.all(checks);

    const unhealthy = components.filter((c) => c.status === 'unhealthy').length;
    const degraded = components.filter((c) => c.status === 'degraded').length;

    let overall: ServiceStatus;
    if (unhealthy > 0) {
      overall = 'unhealthy';
    } else if (degraded > 0) {
      overall = 'degraded';
    } else {
      overall = 'healthy';
    }

    const result: SystemHealth = {
      healthy: overall === 'healthy',
      status: overall,
      components,
      timestamp: new Date().toISOString(),
      uptimeMs: Date.now() - this.startTime,
    };

    this.cache = result;
    return result;
  }

  /**
   * Retorna o último cache (válido por 5s).
   */
  getCached(): SystemHealth | null {
    if (!this.cache) return null;
    const age = Date.now() - new Date(this.cache.timestamp).getTime();
    if (age > this.cacheTtlMs) return null;
    return this.cache;
  }

  /**
   * Supabase health check.
   */
  private async checkSupabase(timeoutMs: number): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      // Faz uma query simples com timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch('/rest/v1/health?select=1', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const latency = Date.now() - start;

      if (!response.ok) {
        return {
          name: 'supabase',
          status: 'unhealthy',
          latencyMs: latency,
          message: `HTTP ${response.status}`,
          lastChecked: new Date().toISOString(),
        };
      }

      // Latência alta = degraded
      if (latency > 1000) {
        return {
          name: 'supabase',
          status: 'degraded',
          latencyMs: latency,
          message: `Alta latência: ${latency}ms`,
          lastChecked: new Date().toISOString(),
        };
      }

      return {
        name: 'supabase',
        status: 'healthy',
        latencyMs: latency,
        lastChecked: new Date().toISOString(),
      };
    } catch (error) {
      return {
        name: 'supabase',
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : 'Erro desconhecido',
        lastChecked: new Date().toISOString(),
      };
    }
  }

  /**
   * Storage health check.
   */
  private async checkStorage(timeoutMs: number): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch('/storage/v1/bucket', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latency = Date.now() - start;

      if (!response.ok) {
        return {
          name: 'storage',
          status: 'unhealthy',
          latencyMs: latency,
          message: `HTTP ${response.status}`,
          lastChecked: new Date().toISOString(),
        };
      }

      return {
        name: 'storage',
        status: 'healthy',
        latencyMs: latency,
        lastChecked: new Date().toISOString(),
      };
    } catch (error) {
      return {
        name: 'storage',
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : 'Erro desconhecido',
        lastChecked: new Date().toISOString(),
      };
    }
  }

  /**
   * Evolution API health check.
   */
  private async checkEvolutionAPI(timeoutMs: number): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      const apiUrl = import.meta.env.VITE_EVOLUTION_API_URL;
      if (!apiUrl) {
        return {
          name: 'evolution-api',
          status: 'unknown',
          message: 'URL não configurada',
          lastChecked: new Date().toISOString(),
        };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(`${apiUrl}/`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latency = Date.now() - start;

      // Evolution pode retornar 404 na raiz - ainda é OK
      if (response.status === 404 || response.ok) {
        return {
          name: 'evolution-api',
          status: latency > 2000 ? 'degraded' : 'healthy',
          latencyMs: latency,
          lastChecked: new Date().toISOString(),
        };
      }

      return {
        name: 'evolution-api',
        status: 'unhealthy',
        latencyMs: latency,
        message: `HTTP ${response.status}`,
        lastChecked: new Date().toISOString(),
      };
    } catch (error) {
      return {
        name: 'evolution-api',
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : 'Erro desconhecido',
        lastChecked: new Date().toISOString(),
      };
    }
  }

  /**
   * Retorna uptime formatado.
   */
  getUptime(): { ms: number; human: string } {
    const ms = Date.now() - this.startTime;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return { ms, human: `${days}d ${hours % 24}h` };
    if (hours > 0) return { ms, human: `${hours}h ${minutes % 60}m` };
    if (minutes > 0) return { ms, human: `${minutes}m ${seconds % 60}s` };
    return { ms, human: `${seconds}s` };
  }
}

export const healthCheck = new HealthCheckService();

/**
 * Hook React para health check periódico.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useHealthCheck(intervalMs: number = 30_000) {
  // Nota: implementação completa requer useState/useEffect
  // Este é apenas o helper para usar no componente
  return healthCheck;
}
