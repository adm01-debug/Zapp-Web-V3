// Forwards `sla_alert` events to a configurable external webhook
// (email gateway, Slack incoming webhook, push relay, etc.).
//
// Configuration is read from `public.global_settings`:
//   - sla_alert_webhook_url    (required) — destination URL
//   - sla_alert_webhook_method (optional) — defaults to "POST"
//
// Optional shared secret for HMAC-SHA256 signing of the body, sent via the
// `X-Lovable-Signature: sha256=<hex>` header. Set as the edge function secret
// `SLA_ALERT_WEBHOOK_SECRET` in Lovable Cloud (no code changes needed).

import { createZappAdminClient } from '../_shared/db-client.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { requireUser } from '../_shared/auth.ts';
import { checkRateLimit } from '../_shared/validation.ts';

const PayloadSchema = z.object({
  contact_id: z.string().min(1),
  contact_name: z.string().min(1),
  kind: z.enum(['first_response', 'resolution']),
  severity: z.enum(['warning', 'breached']),
  scope: z.enum(['current', 'queue', 'agent', 'none']),
  rule_name: z.string().nullable(),
  duration_ms: z.number().nullable(),
  occurred_at: z.string().optional(),
});

type AlertPayload = z.infer<typeof PayloadSchema>;

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  try {
    // 1. Auth — server-side JWT verification via requireUser (getClaims is client-side only).
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;
    const rl = checkRateLimit(`sla-alert-forward:${authed.user.id}`, 30, 60_000);
    if (!rl.allowed) return jsonResponse(req, { error: 'Rate limit exceeded' }, 429);

    // 2. Validate payload.
    const json = await req.json().catch(() => null);
    const parsed = PayloadSchema.safeParse(json);
    if (!parsed.success) {
      return jsonResponse(req, { error: parsed.error.flatten().fieldErrors }, 400);
    }
    const payload: AlertPayload = {
      ...parsed.data,
      occurred_at: parsed.data.occurred_at ?? new Date().toISOString(),
    };

    // 3. Read webhook config (service-role, since global_settings is admin-only).
    const admin = createZappAdminClient();
    const { data: settings, error: settingsErr } = await admin
      .from('global_settings')
      .select('key, value')
      .in('key', ['sla_alert_webhook_url', 'sla_alert_webhook_method']);

    if (settingsErr) {
      console.error('[sla-alert-forward] DB error reading settings:', settingsErr.message);
      return jsonResponse(req, { error: 'Internal server error' }, 500);
    }

    const map = new Map((settings ?? []).map((r) => [r.key, r.value]));
    const url = (map.get('sla_alert_webhook_url') ?? '').trim();
    const method = (map.get('sla_alert_webhook_method') ?? 'POST').trim().toUpperCase();

    if (!url) {
      // Not configured — caller treats this as a no-op success.
      return jsonResponse(req, { forwarded: false, reason: 'webhook_not_configured' }, 200);
    }
    if (!/^https:\/\//i.test(url)) {
      return jsonResponse(req, { forwarded: false, reason: 'webhook_url_must_be_https' }, 422);
    }
    // SSRF guard — block private/internal IP ranges and metadata endpoints
    let parsedWebhookUrl: URL;
    try { parsedWebhookUrl = new URL(url); } catch {
      return jsonResponse(req, { forwarded: false, reason: 'webhook_url_invalid' }, 422);
    }
    const wh = parsedWebhookUrl.hostname.toLowerCase();
    const isPrivateHost =
      wh === 'localhost' || wh.endsWith('.localhost') || wh === '0.0.0.0' ||
      /^127\./.test(wh) || /^169\.254\./.test(wh) ||
      /^10\./.test(wh) || /^192\.168\./.test(wh) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(wh) ||
      wh.startsWith('::') || wh === 'metadata.google.internal' || wh === '100.100.100.200';
    if (isPrivateHost) {
      return jsonResponse(req, { forwarded: false, reason: 'webhook_url_not_allowed' }, 422);
    }
    if (!['POST', 'PUT'].includes(method)) {
      return jsonResponse(req, { forwarded: false, reason: 'invalid_method' }, 422);
    }

    // 4. Forward (best-effort, with timeout).
    const body = JSON.stringify({ event: 'sla_alert', data: payload });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const secret = Deno.env.get('SLA_ALERT_WEBHOOK_SECRET');
    if (secret) {
      headers['X-Lovable-Signature'] = `sha256=${await hmacSha256Hex(secret, body)}`;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8_000);
    try {
      const res = await fetch(url, { method, headers, body, signal: ctrl.signal });
      const ok = res.ok;
      const text = await res.text().catch(() => '');
      return jsonResponse(req, { forwarded: ok, status: res.status, response: text.slice(0, 500) }, ok ? 200 : 502);
    } catch (err) {
      console.error('[sla-alert-forward] fetch failed', err instanceof Error ? err.message : String(err));
      return jsonResponse(req, { forwarded: false, reason: 'fetch_failed', error: 'Network error forwarding alert' }, 502);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.error('[sla-alert-forward]', err instanceof Error ? err.message : String(err));
    return jsonResponse(req, { error: 'Internal server error' }, 500);
  }
});
