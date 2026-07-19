import { getLogger } from '@/lib/logger';

const log = getLogger('connectionPool');

/**
 * Connection Pool Management (MELHORIA #9)
 *
 * Manages Supabase connection lifecycle, preventing exhaustion, leaks, and
 * ensuring efficient resource utilization across concurrent operations.
 *
 * Key strategies:
 * - Track active connections with timestamp and ID
 * - Monitor connection health via periodic validation
 * - Implement automatic cleanup of stale connections
 * - Enforce concurrent connection limits with graceful degradation
 * - Detect and prevent connection memory leaks
 * - Provide pool metrics for monitoring dashboards
 */

/** Connection Metrics interface. */
export interface ConnectionMetrics {
  activeConnections: number;
  totalCreated: number;
  totalClosed: number;
  totalTimeouts: number;
  totalErrors: number;
  avgConnectionAge: number;
  maxConcurrent: number;
  poolUtilization: number;
  heapUsageBeforeGc: number | null;
  heapUsageAfterGc: number | null;
  lastHealthCheck: Date | null;
  lastCleanup: Date | null;
}

/** Connection Entry interface definition. */
export interface ConnectionEntry {
  id: string;
  createdAt: number;
  lastUsedAt: number;
  requestCount: number;
  error: Error | null;
  isHealthy: boolean;
}

class ConnectionPoolManager {
  private static readonly DEFAULT_MAX_CONCURRENT = 50;
  private static readonly DEFAULT_CONNECTION_TIMEOUT = 30000; // 30s
  private static readonly DEFAULT_IDLE_TIMEOUT = 300000; // 5 minutes
  private static readonly DEFAULT_HEALTH_CHECK_INTERVAL = 60000; // 1 minute
  private static readonly DEFAULT_CLEANUP_INTERVAL = 120000; // 2 minutes
  private static readonly MEMORY_PRESSURE_THRESHOLD = 0.85; // 85% heap usage

  private connections: Map<string, ConnectionEntry> = new Map();
  private maxConcurrent: number;
  private connectionTimeout: number;
  private idleTimeout: number;
  private totalCreated = 0;
  private totalClosed = 0;
  private totalTimeouts = 0;
  private totalErrors = 0;
  private maxConcurrentRecorded = 0;
  private lastHealthCheckTime: Date | null = null;
  private lastCleanupTime: Date | null = null;
  private healthCheckTimerId: ReturnType<typeof setInterval> | null = null;
  private cleanupTimerId: ReturnType<typeof setInterval> | null = null;
  private memoryPressureDetected = false;

  constructor(options?: {
    maxConcurrent?: number;
    connectionTimeout?: number;
    idleTimeout?: number;
    healthCheckInterval?: number;
    cleanupInterval?: number;
  }) {
    this.maxConcurrent = options?.maxConcurrent ?? ConnectionPoolManager.DEFAULT_MAX_CONCURRENT;
    this.connectionTimeout =
      options?.connectionTimeout ?? ConnectionPoolManager.DEFAULT_CONNECTION_TIMEOUT;
    this.idleTimeout = options?.idleTimeout ?? ConnectionPoolManager.DEFAULT_IDLE_TIMEOUT;

    this.startHealthCheckTimer(
      options?.healthCheckInterval ?? ConnectionPoolManager.DEFAULT_HEALTH_CHECK_INTERVAL
    );
    this.startCleanupTimer(
      options?.cleanupInterval ?? ConnectionPoolManager.DEFAULT_CLEANUP_INTERVAL
    );

    log.info('Connection pool initialized', {
      maxConcurrent: this.maxConcurrent,
      connectionTimeout: this.connectionTimeout,
      idleTimeout: this.idleTimeout,
    });
  }

  private startHealthCheckTimer(interval: number): void {
    this.healthCheckTimerId = setInterval(() => {
      this.performHealthCheck();
    }, interval);
  }

  private startCleanupTimer(interval: number): void {
    this.cleanupTimerId = setInterval(() => {
      this.cleanup();
    }, interval);
  }

  /**
   * Register a new connection in the pool.
   * Enforces concurrent connection limits and detects memory pressure.
   */
  registerConnection(): { connectionId: string; allowed: boolean } {
    const now = Date.now();
    const activeCount = this.connections.size;

    // Detect memory pressure
    const heapUsage = this.getHeapUsageRatio();
    if (heapUsage > ConnectionPoolManager.MEMORY_PRESSURE_THRESHOLD) {
      this.memoryPressureDetected = true;
      log.warn('Memory pressure detected', { heapUsage, activeConnections: activeCount });

      // Under memory pressure, reject new connections if pool is near capacity
      if (activeCount >= this.maxConcurrent * 0.9) {
        this.totalErrors++;
        return { connectionId: '', allowed: false };
      }
    }

    if (activeCount >= this.maxConcurrent) {
      this.totalErrors++;
      log.warn('Connection limit reached', { active: activeCount, max: this.maxConcurrent });
      return { connectionId: '', allowed: false };
    }

    const connectionId = `conn-${crypto.randomUUID()}`;
    this.connections.set(connectionId, {
      id: connectionId,
      createdAt: now,
      lastUsedAt: now,
      requestCount: 0,
      error: null,
      isHealthy: true,
    });

    this.totalCreated++;
    this.maxConcurrentRecorded = Math.max(this.maxConcurrentRecorded, this.connections.size);

    log.debug('Connection registered', { connectionId, activeCount: this.connections.size });

    return { connectionId, allowed: true };
  }

  /**
   * Mark a connection as used and update metrics.
   */
  markUsed(connectionId: string): boolean {
    const entry = this.connections.get(connectionId);
    if (!entry) return false;

    entry.lastUsedAt = Date.now();
    entry.requestCount++;
    entry.isHealthy = true;
    entry.error = null;

    return true;
  }

  /**
   * Mark a connection as errored.
   */
  markError(connectionId: string, error: Error): boolean {
    const entry = this.connections.get(connectionId);
    if (!entry) return false;

    entry.error = error;
    entry.isHealthy = false;
    this.totalErrors++;

    return true;
  }

  /**
   * Close a connection and remove from pool.
   */
  closeConnection(connectionId: string): boolean {
    const removed = this.connections.delete(connectionId);
    if (removed) {
      this.totalClosed++;
      log.debug('Connection closed', { connectionId, activeCount: this.connections.size });
    }
    return removed;
  }

  /**
   * Check if connection should be closed due to timeout.
   */
  private isConnectionTimedOut(entry: ConnectionEntry): boolean {
    const age = Date.now() - entry.createdAt;
    return age > this.connectionTimeout;
  }

  /**
   * Check if connection should be closed due to idle timeout.
   */
  private isConnectionIdle(entry: ConnectionEntry): boolean {
    const idleTime = Date.now() - entry.lastUsedAt;
    return idleTime > this.idleTimeout;
  }

  /**
   * Perform periodic health check on all connections.
   */
  private performHealthCheck(): void {
    this.lastHealthCheckTime = new Date();
    let unhealthyCount = 0;

    for (const [connectionId, entry] of this.connections) {
      if (!entry.isHealthy || entry.error) {
        unhealthyCount++;

        // Remove unhealthy connections after giving them a chance
        if (Date.now() - entry.createdAt > 10000) {
          this.closeConnection(connectionId);
        }
      }
    }

    if (unhealthyCount > 0) {
      log.warn('Health check detected unhealthy connections', {
        unhealthy: unhealthyCount,
        total: this.connections.size,
      });
    }
  }

  /**
   * Cleanup stale connections (timed out or idle).
   */
  private cleanup(): void {
    this.lastCleanupTime = new Date();
    const connectionsToRemove: string[] = [];

    for (const [connectionId, entry] of this.connections) {
      if (this.isConnectionTimedOut(entry)) {
        connectionsToRemove.push(connectionId);
        this.totalTimeouts++;
      } else if (this.isConnectionIdle(entry)) {
        connectionsToRemove.push(connectionId);
      }
    }

    for (const connectionId of connectionsToRemove) {
      this.closeConnection(connectionId);
    }

    if (connectionsToRemove.length > 0) {
      log.info('Cleanup completed', {
        removed: connectionsToRemove.length,
        activeCount: this.connections.size,
      });
    }

    // Reset memory pressure flag if heap usage is healthy
    if (this.memoryPressureDetected && this.getHeapUsageRatio() < 0.7) {
      this.memoryPressureDetected = false;
      log.info('Memory pressure resolved');
    }
  }

  /**
   * Get heap usage ratio (0-1).
   */
  private getHeapUsageRatio(): number {
    if (typeof performance === 'undefined' || !performance.memory) {
      return 0;
    }
    const { usedJSHeapSize, jsHeapSizeLimit } = performance.memory;
    return usedJSHeapSize / jsHeapSizeLimit;
  }

  /**
   * Calculate average connection age in milliseconds.
   */
  private getAverageConnectionAge(): number {
    if (this.connections.size === 0) return 0;

    const now = Date.now();
    let totalAge = 0;

    for (const entry of this.connections.values()) {
      totalAge += now - entry.createdAt;
    }

    return Math.round(totalAge / this.connections.size);
  }

  /**
   * Get current pool metrics for monitoring.
   */
  getMetrics(): ConnectionMetrics {
    const heapRatio = this.getHeapUsageRatio();
    let heapBefore: number | null = null;
    let heapAfter: number | null = null;

    if (heapRatio > ConnectionPoolManager.MEMORY_PRESSURE_THRESHOLD) {
      heapBefore = Math.round(performance.memory?.usedJSHeapSize ?? 0);

      if (typeof gc !== 'undefined') {
        gc(false); // non-full garbage collection
        heapAfter = Math.round(performance.memory?.usedJSHeapSize ?? 0);
      }
    }

    return {
      activeConnections: this.connections.size,
      totalCreated: this.totalCreated,
      totalClosed: this.totalClosed,
      totalTimeouts: this.totalTimeouts,
      totalErrors: this.totalErrors,
      avgConnectionAge: this.getAverageConnectionAge(),
      maxConcurrent: this.maxConcurrentRecorded,
      poolUtilization: this.connections.size / this.maxConcurrent,
      heapUsageBeforeGc: heapBefore,
      heapUsageAfterGc: heapAfter,
      lastHealthCheck: this.lastHealthCheckTime,
      lastCleanup: this.lastCleanupTime,
    };
  }

  /**
   * Get detailed connection list for diagnostics.
   */
  getConnectionDetails(): ConnectionEntry[] {
    return Array.from(this.connections.values()).map((entry) => ({
      ...entry,
    }));
  }

  /**
   * Shutdown the pool and cleanup timers.
   */
  shutdown(): void {
    if (this.healthCheckTimerId !== null) {
      clearInterval(this.healthCheckTimerId);
      this.healthCheckTimerId = null;
    }
    if (this.cleanupTimerId !== null) {
      clearInterval(this.cleanupTimerId);
      this.cleanupTimerId = null;
    }

    const activeCount = this.connections.size;
    this.connections.clear();

    log.info('Connection pool shutdown', {
      closedConnections: activeCount,
      totalCreated: this.totalCreated,
      totalClosed: this.totalClosed,
    });
  }
}

// Singleton instance
let poolInstance: ConnectionPoolManager | null = null;

/** initialize Connection Pool function. */
export function initializeConnectionPool(
  options?: Parameters<typeof ConnectionPoolManager>[0]
): ConnectionPoolManager {
  if (poolInstance) {
    return poolInstance;
  }

  poolInstance = new ConnectionPoolManager(options);
  return poolInstance;
}

/** get Connection Pool function. */
export function getConnectionPool(): ConnectionPoolManager {
  if (!poolInstance) {
    poolInstance = new ConnectionPoolManager();
  }
  return poolInstance;
}

/** shutdown Connection Pool function. */
export function shutdownConnectionPool(): void {
  if (poolInstance) {
    poolInstance.shutdown();
    poolInstance = null;
  }
}

// Auto-initialize on module load
const pool = getConnectionPool();

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    shutdownConnectionPool();
  });
}

/** Default export. */
export default pool;