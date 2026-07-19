/**
 * selfHostedDiagnostics
 *
 * Bateria de probes que validam, do browser, três coisas do Supabase self-hosted:
 * 1. A anon key é aceita pelo GoTrue e pelo PostgREST.
 * 2. Uma leitura real via cliente Supabase funciona (rede → PostgREST → JWT → RLS).
 * 3. O endpoint MCP self-hosted responde ao handshake JSON-RPC e lista tools.
 *
 * Nenhum secret é logado; apenas status HTTP e payloads públicos (truncados em caso de erro).
 */
import { supabase } from '@/integrations/supabase/client';

// URL e anon key públicas do self-hosted (mesmas de src/integrations/supabase/client.ts).
// A anon key é intencionalmente pública — RLS é a camada de proteção.
const SELF_HOSTED_URL = 'https://supabase.atomicabr.com.br';
const SELF_HOSTED_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzE1MDUwODAwLAogICJleHAiOiAxODcyODE3MjAwCn0.rvamc0XHuSCYB1glBwOCCxgfd9yxWVYLnhFzg5-7TRk';

const MCP_URL = 'https://supabase-mcp.atomicabr.com.br/mcp';
const PROBE_TIMEOUT_MS = 8000;

/** Diagnostic Status type alias. */
export type DiagnosticStatus = 'ok' | 'fail' | 'warn';

/** Diagnostic Result interface definition. */
export interface DiagnosticResult {
  step: string;
  status: DiagnosticStatus;
  message: string;
  latencyMs: number;
  details?: unknown;
}

function truncate(s: string, n = 200): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

async function withTimeout<T>(promise: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    return await promise(ctrl.signal);
  } finally {
    clearTimeout(t);
  }
}

async function timed(
  step: string,
  fn: () => Promise<Omit<DiagnosticResult, 'step' | 'latencyMs'>>
): Promise<DiagnosticResult> {
  const t0 = performance.now();
  try {
    const r = await fn();
    return { step, latencyMs: Math.round(performance.now() - t0), ...r };
  } catch (err) {
    return {
      step,
      status: 'fail',
      message: err instanceof Error ? err.message : String(err),
      latencyMs: Math.round(performance.now() - t0),
    };
  }
}

async function pingAuth(): Promise<DiagnosticResult> {
  return timed('Auth /settings (GoTrue)', () =>
    withTimeout(async (signal) => {
      const res = await fetch(`${SELF_HOSTED_URL}/auth/v1/settings`, {
        method: 'GET',
        headers: { apikey: SELF_HOSTED_ANON_KEY },
        signal,
      });
      const body = await res.text();
      if (!res.ok) {
        return {
          status: 'fail' as const,
          message: `HTTP ${res.status} — ${truncate(body)}`,
          details: { status: res.status },
        };
      }
      let parsed: unknown = body;
      try {
        parsed = JSON.parse(body);
      } catch {
        /* keep raw */
      }
      return { status: 'ok' as const, message: 'GoTrue aceitou a anon key.', details: parsed };
    })
  );
}

async function pingRest(): Promise<DiagnosticResult> {
  return timed('REST / (PostgREST)', () =>
    withTimeout(async (signal) => {
      const res = await fetch(`${SELF_HOSTED_URL}/rest/v1/`, {
        method: 'GET',
        headers: {
          apikey: SELF_HOSTED_ANON_KEY,
          Authorization: `Bearer ${SELF_HOSTED_ANON_KEY}`,
        },
        signal,
      });
      const body = await res.text();
      if (!res.ok) {
        return {
          status: 'fail' as const,
          message: `HTTP ${res.status} — ${truncate(body)}`,
          details: { status: res.status },
        };
      }
      return {
        status: 'ok' as const,
        message: 'PostgREST aceitou a anon key.',
        details: { status: res.status, bodyPreview: truncate(body, 120) },
      };
    })
  );
}

async function pingRlsRead(): Promise<DiagnosticResult> {
  return timed('Leitura RLS (cliente Supabase)', async () => {
    // global_settings tem RLS pública/leve; se falhar, é sinal claro de problema na stack.
    const { data, error, status } = await supabase.from('global_settings').select('id').limit(1);
    if (error) {
      return {
        status: 'fail' as const,
        message: `Supabase error (${status}): ${error.message}`,
        details: error,
      };
    }
    return {
      status: 'ok' as const,
      message: `Cliente Supabase leu global_settings (${data?.length ?? 0} linha).`,
      details: data,
    };
  });
}

async function jsonRpc(
  signal: AbortSignal,
  id: number,
  method: string,
  params?: Record<string, unknown>
) {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // MCP Streamable HTTP exige AMBOS — servidores respondem 406 sem isso.
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }),
    signal,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${truncate(text)}`);
  try {
    return JSON.parse(text) as { result?: unknown; error?: { message: string } };
  } catch {
    throw new Error(`Resposta não-JSON: ${truncate(text)}`);
  }
}

async function pingMcpHandshake(): Promise<DiagnosticResult> {
  return timed('MCP initialize (self-hosted)', () =>
    withTimeout(async (signal) => {
      const body = await jsonRpc(signal, 1, 'initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'zapp-web-selfhosted-probe', version: '1.0.0' },
      });
      if (body.error) {
        return {
          status: 'fail' as const,
          message: `JSON-RPC error: ${body.error.message}`,
          details: body,
        };
      }
      const info = (body.result as { serverInfo?: { name?: string; version?: string } })
        ?.serverInfo;
      return {
        status: 'ok' as const,
        message: `MCP OK — ${info?.name ?? 'unknown'} v${info?.version ?? '?'}`,
        details: body.result,
      };
    })
  );
}

async function pingMcpToolsList(): Promise<DiagnosticResult> {
  return timed('MCP tools/list', () =>
    withTimeout(async (signal) => {
      const body = await jsonRpc(signal, 2, 'tools/list');
      if (body.error) {
        return {
          status: 'fail' as const,
          message: `JSON-RPC error: ${body.error.message}`,
          details: body,
        };
      }
      const tools = (body.result as { tools?: Array<{ name: string }> })?.tools ?? [];
      return {
        status: 'ok' as const,
        message: `${tools.length} tools disponíveis: ${tools
          .map((t) => t.name)
          .slice(0, 4)
          .join(', ')}${tools.length > 4 ? '…' : ''}`,
        details: tools.map((t) => t.name),
      };
    })
  );
}

/** run Self Hosted Diagnostics function. */
export async function runSelfHostedDiagnostics(): Promise<DiagnosticResult[]> {
  const results = await Promise.all([
    pingAuth(),
    pingRest(),
    pingRlsRead(),
    pingMcpHandshake(),
    pingMcpToolsList(),
  ]);
  return results;
}
