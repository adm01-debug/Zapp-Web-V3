import { supabase } from '@/integrations/supabase/client';
import { generateCorrelationId, CORRELATION_HEADER } from '@/lib/correlationId';
import { getLogger } from '@/lib/logger';

const log = getLogger('ExternalDbProxy');

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
const PROXY_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/external-db-proxy` : '';

interface ProxyResponse<T> {
  data: T;
  count?: number;
  cid: string;
  rid: string;
  schema_unavailable?: boolean;
}

/**
 * Encapsulates communication with the external DB proxy.
 */
class ExternalDbProxyClient {
  private cachedSession: { token: string; expires: number } | null = null;

  private async getAuthHeader(): Promise<string> {
    const now = Date.now();

    // Cache session token for 30s to avoid redundant getSession() calls in parallel requests
    if (this.cachedSession && this.cachedSession.expires > now) {
      return `Bearer ${this.cachedSession.token}`;
    }

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (token) {
        this.cachedSession = {
          token,
          expires: now + 30000,
        };
        return `Bearer ${token}`;
      }
      return `Bearer ${SUPABASE_ANON}`;
    } catch {
      return `Bearer ${SUPABASE_ANON}`;
    }
  }

  async call<T>(
    body: Record<string, unknown>,
    retryCount = 0
  ): Promise<{ data: T | null; schema_unavailable: boolean }> {
    if (!PROXY_URL) throw new Error('VITE_SUPABASE_URL missing');

    const cid = generateCorrelationId();
    const auth = await this.getAuthHeader();

    try {
      const response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON,
          Authorization: auth,
          [CORRELATION_HEADER]: cid,
        },
        body: JSON.stringify({
          ...body,
          __cid: cid,
          schema: 'evo_api', // Default for this proxy client
        }),
      });

      const text = await response.text();
      let result: any = null;
      try {
        result = text ? JSON.parse(text) : null;
      } catch {
        result = { error: text || `HTTP ${response.status}` };
      }

      if (!response.ok) {
        const errorMsg = result?.error ?? `HTTP ${response.status}`;

        // PGRST106 (Invalid schema) or PGRST002 (Schema cache error)
        const isTransientSchemaError =
          errorMsg.includes('PGRST106') ||
          errorMsg.includes('Invalid schema') ||
          errorMsg.includes('PGRST002') ||
          errorMsg.includes('schema cache');

        if (isTransientSchemaError && retryCount < 5) {
          const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
          log.warn('Transient schema error, retrying', {
            error: errorMsg,
            attempt: retryCount + 1,
            delayMs: Math.round(delay),
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.call<T>(body, retryCount + 1);
        }

        throw new Error(errorMsg);
      }

      const okResult = result as ProxyResponse<T> | null;
      return {
        data: (okResult?.data ?? null) as T | null,
        schema_unavailable: !!okResult?.schema_unavailable,
      };
    } catch (error: any) {
      const errorMsg = error?.message ?? String(error);
      const isTransient =
        errorMsg.includes('PGRST106') ||
        errorMsg.includes('Invalid schema') ||
        errorMsg.includes('PGRST002') ||
        errorMsg.includes('schema cache');

      if (isTransient && retryCount < 5) {
        const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.call<T>(body, retryCount + 1);
      }
      throw error;
    }
  }

  rpc<T = unknown>(name: string, params: Record<string, unknown> = {}) {
    return this.call<T>({ action: 'rpc', rpc: name, params });
  }

  select<T = unknown>(opts: {
    table: string;
    select?: string;
    filters?: { column: string; operator: string; value: unknown }[];
    order?: { column: string; ascending?: boolean };
    limit?: number;
    offset?: number;
  }) {
    return this.call<T[]>({ action: 'select', ...opts });
  }

  update<T = unknown>(opts: {
    table: string;
    data: Record<string, unknown>;
    match: Record<string, unknown>;
  }) {
    return this.call<T[]>({ action: 'update', ...opts });
  }
}

// Export a singleton instance
export const evoApi = new ExternalDbProxyClient();
