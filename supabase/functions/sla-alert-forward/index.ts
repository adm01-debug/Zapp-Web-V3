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

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';
import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2.95.0/cors';
import { z } from 'https://esm.sh/zod@3.23.8';

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ANON = Deno.env.get('SUPABASE_ANON_KEY');
    if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) {
      return jsonResponse({ error: 'Missing Supabase environment' }, 500);
    }

    // 1. Auth — caller must be a logged-in user.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    // 2. Validate payload.
    const json = await req.json().catch(() => null);
    const parsed = PayloadSchema.safeParse(json);
    if (!parsed.success) {
      return jsonResponse({ error: parsed.error.flatten().fieldErrors }, 400);
    }
    const payload: AlertPayload = {
      ...parsed.data,
      occurred_at: parsed.data.occurred_at ?? new Date().toISOString(),
    };

    // 3. Read webhook config (service-role, since global_settings is admin-only).
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: settings, error: settingsErr } = await admin
      .from('global_settings')
      .select('key, value')
      .in('key', ['sla_alert_webhook_url', 'sla_alert_webhook_method']);

    if (settingsErr) {
      return jsonResponse({ error: `Settings read failed: ${settingsErr.message}` }, 500);
    }

    const map = new Map((settings ?? []).map((r) => [r.key, r.value]));
    const url = (map.get('sla_alert_webhook_url') ?? '').trim();
    const method = (map.get('sla_alert_webhook_method') ?? 'POST').trim().toUpperCase();

    if (!url) {
      // Not configured — caller treats this as a no-op success.
      return jsonResponse({ forwarded: false, reason: 'webhook_not_configured' }, 200);
    }
    if (!/^https:\/\//i.test(url)) {
      return jsonResponse({ forwarded: false, reason: 'webhook_url_must_be_https' }, 422);
    }
    if (!['POST', 'PUT'].includes(method)) {
      return jsonResponse({ forwarded: false, reason: 'invalid_method' }, 422);
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
      return jsonResponse(
        { forwarded: ok, status: res.status, response: text.slice(0, 500) },
        ok ? 200 : 502,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return jsonResponse({ forwarded: false, reason: 'fetch_failed', error: msg }, 502);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: msg }, 500);
  }
});
