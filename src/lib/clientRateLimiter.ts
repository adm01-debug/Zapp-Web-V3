/**
 * Rate Limiter Client-Side
 *
 * Previne chamadas excessivas para ações sensíveis (ex: enviar mensagem,
 * criar contato) no browser antes mesmo de bater no servidor.
 *
 * Funciona como defense-in-depth — o servidor tem seu próprio rate limiter,
 * mas este evita requests desnecessários.
 */

interface RateLimitRule {
  /** Nome da ação (ex: 'send_message') */
  action: string;
  /** Máximo de chamadas permitidas */
  maxCalls: number;
  /** Janela em ms */
  windowMs: number;
}

const DEFAULT_RULES: Record<string, RateLimitRule> = {
  send_message: { action: 'send_message', maxCalls: 30, windowMs: 60_000 },
  create_contact: { action: 'create_contact', maxCalls: 100, windowMs: 60_000 },
  search: { action: 'search', maxCalls: 60, windowMs: 60_000 },
  export: { action: 'export', maxCalls: 5, windowMs: 60_000 },
  upload: { action: 'upload', maxCalls: 20, windowMs: 60_000 },
  login: { action: 'login', maxCalls: 5, windowMs: 60_000 },
};

interface CallRecord {
  timestamp: number;
}

class ClientRateLimiter {
  private calls = new Map<string, CallRecord[]>();
  private rules = new Map<string, RateLimitRule>();

  constructor() {
    Object.values(DEFAULT_RULES).forEach((rule) => {
      this.rules.set(rule.action, rule);
    });
  }

  /**
   * Configure custom rule.
   */
  setRule(action: string, maxCalls: number, windowMs: number): void {
    this.rules.set(action, { action, maxCalls, windowMs });
  }

  /**
   * Check if action is allowed (and increment counter).
   */
  tryAcquire(action: string): { allowed: boolean; remaining: number; resetMs: number } {
    const rule = this.rules.get(action) ?? {
      action,
      maxCalls: 60,
      windowMs: 60_000,
    };

    const now = Date.now();
    const windowStart = now - rule.windowMs;

    // Get existing calls for this action
    const existing = this.calls.get(action) ?? [];

    // Filter to calls within the window
    const recent = existing.filter((c) => c.timestamp > windowStart);

    if (recent.length >= rule.maxCalls) {
      const oldestRecent = recent[0];
      const resetMs = oldestRecent ? oldestRecent.timestamp + rule.windowMs - now : 0;

      this.calls.set(action, recent);
      return {
        allowed: false,
        remaining: 0,
        resetMs,
      };
    }

    // Record this call
    recent.push({ timestamp: now });
    this.calls.set(action, recent);

    return {
      allowed: true,
      remaining: rule.maxCalls - recent.length,
      resetMs: rule.windowMs,
    };
  }

  /**
   * Reset specific action.
   */
  reset(action: string): void {
    this.calls.delete(action);
  }

  /**
   * Reset all.
   */
  resetAll(): void {
    this.calls.clear();
  }

  /**
   * Get current stats.
   */
  getStats(): Record<string, { used: number; limit: number; remaining: number }> {
    const now = Date.now();
    const stats: Record<string, { used: number; limit: number; remaining: number }> = {};

    this.rules.forEach((rule, action) => {
      const existing = this.calls.get(action) ?? [];
      const recent = existing.filter((c) => c.timestamp > now - rule.windowMs);
      stats[action] = {
        used: recent.length,
        limit: rule.maxCalls,
        remaining: Math.max(0, rule.maxCalls - recent.length),
      };
    });

    return stats;
  }
}

// Singleton
export const clientRateLimiter = new ClientRateLimiter();

/**
 * Throttle function with rate limiting.
 *
 * @example
 * ```typescript
 * const throttledSend = withRateLimit('send_message', sendMessage);
 * throttledSend(contactId, content); // throws if rate limited
 * ```
 */
export function withRateLimit<TArgs extends unknown[], TReturn>(
  action: string,
  fn: (...args: TArgs) => Promise<TReturn>
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    const check = clientRateLimiter.tryAcquire(action);

    if (!check.allowed) {
      const seconds = Math.ceil(check.resetMs / 1000);
      throw new RateLimitError(
        `Ação '${action}' excedeu o limite. Tente novamente em ${seconds}s.`,
        action,
        check.resetMs
      );
    }

    return fn(...args);
  };
}

/**
 * Error thrown when client-side rate limit is exceeded.
 */
export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly action: string,
    public readonly retryAfterMs: number
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * React hook: use rate-limited function with automatic reset.
 */
export function useRateLimitedAction<TArgs extends unknown[], TReturn>(
  action: string,
  fn: (...args: TArgs) => Promise<TReturn>
) {
  return async (...args: TArgs): Promise<TReturn> => {
    return withRateLimit(action, fn)(...args);
  };
}
