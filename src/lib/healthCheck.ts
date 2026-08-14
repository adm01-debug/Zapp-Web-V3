/**
 * @deprecated V3 — Este módulo foi substituído. Use useDiagnosticsData.ts
 * que consulta diretamente edge fn connection-health-check (gateway-first).
 * Ver src/_archive/healthCheck.archived.ts para histórico.
 * Etapa 23 do PLANO_DESACOPLAMENTO_V3_100_ETAPAS.md
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

// Stub V3: sem chamadas diretas à Evolution API (gateway-first).
class HealthCheckService {
  private startTime = Date.now();

  async run(_config = {}): Promise<SystemHealth> {
    return {
      healthy: true,
      status: 'unknown',
      components: [],
      timestamp: new Date().toISOString(),
      uptimeMs: Date.now() - this.startTime,
    };
  }

  getCached(): SystemHealth | null { return null; }
  getUptime() { const ms = Date.now() - this.startTime; return { ms, human: `${Math.floor(ms/1000)}s` }; }
}

export const healthCheck = new HealthCheckService();
