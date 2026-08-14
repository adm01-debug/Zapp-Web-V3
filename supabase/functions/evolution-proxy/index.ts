/**
 * evolution-proxy — Edge Function (v2, 2026-08-14; v3, 2026-08-14)
 *
 * piloto V4 #34 — primeira function a consumir o registry
 * (supabase/functions/_shared/providers/registry.ts): o client HTTP é
 * resolvido via registry.getProviderClient() em vez de import direto.
 *  - Fora de DENO_ENV=test, o registry SEMPRE resolve o evolution real
 *    (mesmo client providers/evolution/client.ts, mesmos envs
 *    EVOLUTION_API_URL / EVOLUTION_API_KEY) — comportamento default idêntico.
 *  - Em DENO_ENV=test com PROVIDER_UNDER_TEST=fake, o registry resolve o
 *    fakeProvider (mock/stub sem I/O) — adoção testável sem trocar chamadas.
 *  - Defesa em profundidade: se registry.getProviderClient() lançar, há
 *    fallback explícito para o caminho legado (evolutionClient direto).
 *
 * SECURITY FIX: Proxy server-side para a Evolution API.
 * Elimina o acoplamento browser→evolution.atomicabr.com.br:
 *  - A Evolution API key NUNCA chega ao browser (nem via header)
 *  - Autenticação: JWT admin/supervisor (mesmo gate do evolution-credentials)
 *  - Allowlist rígida de paths: apenas os 6 verbos necessários
 *  - Key e baseUrl resolvidas via cliente canônico (_shared/providers/evolution/client.ts)
 *
 * v2: eliminado bypass Deno.env.get direto — tudo via evolutionFetch()
 * v3: piloto registry — GET/POST via verbos genéricos do client resolvido;
 *     PUT (markChatUnread) segue no transport legado evolutionFetch (sem
 *     verbo canônico no client).
 *
 * Paths permitidos (allowlist):
 *  POST /message/sendText/{instance}
 *  POST /message/sendMedia/{instance}
 *  POST /message/sendWhatsAppAudio/{instance}
 *  PUT  /chat/markChatUnread/{instance}
 *  GET  /instance/fetchInstances
 *  GET  /instance/connectionState/{instance}
 *
 * Browser chama: POST /functions/v1/evolution-proxy
 * Body: { method: 'GET'|'POST'|'PUT', path: '/message/sendText/wpp2', body?: object }
 */

import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { requireAdminOrSupervisor } from '../_shared/auth.ts';
import { checkRateLimit } from '../_shared/validation.ts';
import { evolutionFetch, evolutionClient, type EvolutionClientConfig } from '../_shared/providers/evolution/client.ts';
import { getProviderClient } from '../_shared/providers/registry.ts';

// Paths que o browser pode chamar via proxy (prefixos permitidos)
const ALLOWED_PATH_PREFIXES = [
  '/message/sendText/',
  '/message/sendMedia/',
  '/message/sendWhatsAppAudio/',
  '/chat/markChatUnread/',
  '/instance/fetchInstances',
  '/instance/connectionState/',
] as const;

const ALLOWED_METHODS = ['GET', 'POST', 'PUT'] as const;
type AllowedMethod = typeof ALLOWED_METHODS[number];

function isAllowedPath(path: string): boolean {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return ALLOWED_PATH_PREFIXES.some((prefix) => clean.startsWith(prefix));
}

// ─── Piloto V4 #34: resolução de client via registry ───────────────────────

/** Shape mínimo comum entre evolutionClient (EvolutionResponse) e fakeProvider (FakeResponse). */
export interface ProviderCallResult {
  ok: boolean;
  status?: number;
  data?: unknown;
  error?: string;
}

/** Interface dos verbos genéricos usados pelo proxy (get/post existem nos dois providers). */
export interface ProviderClientLike {
  get?: (path: string, options?: EvolutionClientConfig) => Promise<ProviderCallResult>;
  post?: (path: string, body?: unknown, options?: EvolutionClientConfig) => Promise<ProviderCallResult>;
}

/**
 * Resolve o client via registry (piloto V4 #34).
 * Default ('evolution') = comportamento idêntico ao legado. Defesa em
 * profundidade: se o registry lançar, cai no caminho atual (evolutionClient).
 * `resolver` é injetável apenas para teste do fallback.
 */
export function resolveProviderClient(
  // Cast de adaptação (as unknown as): o fakeProvider tem verbos com retorno
  // inferido como Promise<{}> (tipagem frouxa do mock) — o shape real de
  // ambos providers satisfaz ProviderClientLike (ok/status/data/error).
  resolver: () => ProviderClientLike = () => getProviderClient() as unknown as ProviderClientLike,
): ProviderClientLike {
  try {
    return resolver();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[evolution-proxy] registry.getProviderClient() falhou (${msg}); fallback explícito p/ evolutionClient`,
    );
    return evolutionClient;
  }
}

/**
 * Despacha a chamada para o provider resolvido (piloto V4 #34).
 * GET/POST usam os verbos genéricos do client — com o fake (DENO_ENV=test +
 * PROVIDER_UNDER_TEST=fake) as respostas vêm do mock/stub, sem I/O real.
 * PUT não tem verbo canônico no client → transport legado evolutionFetch.
 */
export async function callProvider(
  provider: ProviderClientLike,
  method: AllowedMethod,
  path: string,
  body?: unknown,
): Promise<ProviderCallResult> {
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;

  if (method === 'GET') {
    return (await provider.get?.(normalizedPath, { maxRetries: 0, timeoutMs: 30_000 })) ?? {
      ok: false,
      status: 502,
      error: 'Provider sem verbo GET',
    };
  }

  if (method === 'POST') {
    return (await provider.post?.(normalizedPath, body, { maxRetries: 0, timeoutMs: 30_000 })) ?? {
      ok: false,
      status: 502,
      error: 'Provider sem verbo POST',
    };
  }

  // PUT — sem verbo canônico no client; transport genérico legado (markChatUnread)
  return evolutionFetch<unknown>(normalizedPath, {
    method: 'PUT',
    body: body !== undefined ? JSON.stringify(body) : undefined,
    maxRetries: 0,
    timeoutMs: 30_000,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  const cors = getCorsHeaders(req);
  const json = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'Method Not Allowed — use POST com {method, path, body}' });
  }

  // Gate: apenas admin ou supervisor
  const authed = await requireAdminOrSupervisor(req);
  if (authed instanceof Response) return authed;

  // Rate limit: 60 req/min por usuário (suficiente para envio de mensagens em bulk)
  const rl = checkRateLimit(`evolution-proxy:${authed.user.id}`, 60, 60_000);
  if (!rl.allowed) return json(429, { ok: false, error: 'Rate limit exceeded' });

  // Parse do envelope
  let envelope: { method?: string; path?: string; body?: unknown };
  try {
    envelope = await req.json();
  } catch {
    return json(400, { ok: false, error: 'Body JSON inválido' });
  }

  const { method = 'POST', path = '', body: proxyBody } = envelope;

  // Validar método
  if (!(ALLOWED_METHODS as readonly string[]).includes(method)) {
    return json(400, { ok: false, error: `Método inválido: ${method}. Permitidos: ${ALLOWED_METHODS.join(', ')}` });
  }

  // Validar path contra allowlist (proteção contra path injection)
  if (!path || !isAllowedPath(path)) {
    return json(403, {
      ok: false,
      error: `Path não permitido: ${path}`,
      allowed: ALLOWED_PATH_PREFIXES,
    });
  }

  // Piloto V4 #34: client resolvido via registry (fora de test = evolution real)
  const provider = resolveProviderClient();

  try {
    const evoRes = await callProvider(provider, method as AllowedMethod, path, proxyBody);

    if (!evoRes.ok) {
      return json(evoRes.status || 502, {
        ok: false,
        error: evoRes.error ?? 'Evolution API inacessível',
      });
    }

    return new Response(JSON.stringify(evoRes.data), {
      status: evoRes.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[evolution-proxy] callProvider falhou:', msg);
    return json(502, { ok: false, error: `Evolution API inacessível: ${msg}` });
  }
});
