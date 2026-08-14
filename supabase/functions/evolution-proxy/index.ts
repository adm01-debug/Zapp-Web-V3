/**
 * evolution-proxy — Edge Function (v2, 2026-08-14)
 *
 * SECURITY FIX: Proxy server-side para a Evolution API.
 * Elimina o acoplamento browser→evolution.atomicabr.com.br:
 *  - A Evolution API key NUNCA chega ao browser (nem via header)
 *  - Autenticação: JWT admin/supervisor (mesmo gate do evolution-credentials)
 *  - Allowlist rígida de paths: apenas os 6 verbos necessários
 *  - Key e baseUrl resolvidas via cliente canônico (_shared/providers/evolution/client.ts)
 *
 * v2: eliminado bypass Deno.env.get direto — tudo via evolutionFetch()
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
import { evolutionFetch } from '../_shared/providers/evolution/client.ts';

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

  // Chamar Evolution API via cliente canônico (key e baseUrl resolvidas internamente)
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;

  try {
    const evoRes = await evolutionFetch<unknown>(normalizedPath, {
      method: method as AllowedMethod,
      body: proxyBody !== undefined ? JSON.stringify(proxyBody) : undefined,
      maxRetries: 0,
      timeoutMs: 30_000,
    });

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
    console.error('[evolution-proxy] evolutionFetch falhou:', msg);
    return json(502, { ok: false, error: `Evolution API inacessível: ${msg}` });
  }
});
