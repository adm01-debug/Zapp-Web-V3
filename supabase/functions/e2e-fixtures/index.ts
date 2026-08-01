/**
 * e2e-fixtures — seed determinístico e cleanup para testes E2E.
 *
 * Hard guard: TODA operação só toca em registros cujo `instance_name`,
 * `remote_jid` ou `event_type` começa com o prefixo `e2e-`. O `runId`
 * fornecido pelo cliente também precisa começar com `e2e-`. Isso garante
 * que esta função NUNCA mexa em dados de produção, mesmo se chamada
 * acidentalmente com argumentos errados.
 *
 * Auth: aceita service-role JWT OU um usuário admin autenticado.
 *
 * Schemas tocados:
 *   - public.failed_messages          (Lovable Cloud)
 *   - evolution_webhook_events        (FATOR X / external)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const E2E_PREFIX = 'e2e-';

type SeedTarget = 'failed_messages' | 'webhook_events';
type Action = 'seed' | 'cleanup';

interface RequestBody {
  action: Action;
  /** Required. Must start with `e2e-`. Used as suffix for instance_name/remote_jid. */
  runId: string;
  /** For seed: which dataset to write. For cleanup: optional filter. */
  target?: SeedTarget | 'all';
  /** For seed: how many rows to insert per target (default 3, max 25). */
  count?: number;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function envOrThrow(key: string): string {
  const v = Deno.env.get(key);
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

/** Returns true when the caller is the service role OR an admin user. */
async function authorize(req: Request): Promise<{ ok: boolean; reason?: string }> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, reason: 'missing-bearer' };

  const serviceKey = envOrThrow('SUPABASE_SERVICE_ROLE_KEY');
  if (token === serviceKey) return { ok: true };

  // Otherwise, validate the JWT and confirm the user has app_role='admin'.
  const url = envOrThrow('SUPABASE_URL');
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return { ok: false, reason: 'invalid-jwt' };
  const { data: roleRow, error: roleErr } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)
    .eq('role', 'admin')
    .maybeSingle();
  if (roleErr) return { ok: false, reason: 'role-lookup-failed' };
  if (!roleRow) return { ok: false, reason: 'not-admin' };
  return { ok: true };
}

function validateBody(raw: unknown): { ok: true; body: RequestBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'body must be JSON object' };
  const b = raw as Record<string, unknown>;
  if (b.action !== 'seed' && b.action !== 'cleanup') {
    return { ok: false, error: "action must be 'seed' or 'cleanup'" };
  }
  if (typeof b.runId !== 'string' || !b.runId.startsWith(E2E_PREFIX)) {
    return { ok: false, error: `runId must start with "${E2E_PREFIX}"` };
  }
  if (b.runId.length > 64) return { ok: false, error: 'runId too long' };
  if (b.target !== undefined && !['failed_messages', 'webhook_events', 'all'].includes(String(b.target))) {
    return { ok: false, error: "target must be 'failed_messages', 'webhook_events' or 'all'" };
  }
  if (b.count !== undefined) {
    const n = Number(b.count);
    if (!Number.isInteger(n) || n < 1 || n > 25) return { ok: false, error: 'count must be 1..25' };
  }
  return { ok: true, body: b as unknown as RequestBody };
}

function lovableClient() {
  return createClient(envOrThrow('SUPABASE_URL'), envOrThrow('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
}

function externalClient() {
  return createClient(
    envOrThrow('EXTERNAL_SUPABASE_URL'),
    envOrThrow('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );
}

// ============================================================
// Seed
// ============================================================

async function seedFailedMessages(runId: string, count: number) {
  const supabase = lovableClient();
  const rows = Array.from({ length: count }, (_, i) => ({
    instance_name: `${E2E_PREFIX}${runId}`,
    remote_jid: `${E2E_PREFIX}${runId}-${i}@s.whatsapp.net`,
    payload: { e2e: true, runId, index: i, text: `seed-${i}` },
    status: i % 3 === 0 ? 'failed' : i % 3 === 1 ? 'pending' : 'retrying',
    error_code: `E2E_SEED_${i}`,
    error_message: `seed error ${i}`,
    http_status: 500,
    retry_count: i,
    max_retries: 5,
    idempotency_key: `${E2E_PREFIX}${runId}-${i}`,
    last_retry_reason: 'e2e-seed',
  }));
  const { data, error } = await supabase.from('failed_messages').insert(rows).select('id');
  if (error) throw new Error(`failed_messages insert: ${error.message}`);
  return { inserted: data?.length ?? 0 };
}

async function seedWebhookEvents(runId: string, count: number) {
  const ext = externalClient();
  const now = Date.now();
  const rows = Array.from({ length: count }, (_, i) => ({
    instance_name: `${E2E_PREFIX}${runId}`,
    event_type: `${E2E_PREFIX}messages.upsert`,
    remote_jid: `${E2E_PREFIX}${runId}-${i}@s.whatsapp.net`,
    push_name: `${E2E_PREFIX}name-${i}`,
    message_type: i % 2 === 0 ? 'conversation' : 'imageMessage',
    processed: i % 2 === 0,
    error_message: i % 4 === 3 ? `seed-error-${i}` : null,
    payload: { e2e: true, runId, index: i },
    created_at: new Date(now - i * 1000).toISOString(),
  }));
  const { data, error } = await ext.from('evolution_webhook_events').insert(rows).select('id');
  if (error) throw new Error(`evolution_webhook_events insert: ${error.message}`);
  return { inserted: data?.length ?? 0 };
}

// ============================================================
// Cleanup — só remove o que casa com o prefixo `e2e-` E o runId.
// ============================================================

async function cleanupFailedMessages(runId: string) {
  const supabase = lovableClient();
  const { data, error } = await supabase
    .from('failed_messages')
    .delete()
    .like('instance_name', `${E2E_PREFIX}${runId}%`)
    .select('id');
  if (error) throw new Error(`failed_messages cleanup: ${error.message}`);
  return { deleted: data?.length ?? 0 };
}

async function cleanupWebhookEvents(runId: string) {
  const ext = externalClient();
  const { data, error } = await ext
    .from('evolution_webhook_events')
    .delete()
    .like('instance_name', `${E2E_PREFIX}${runId}%`)
    .select('id');
  if (error) throw new Error(`evolution_webhook_events cleanup: ${error.message}`);
  return { deleted: data?.length ?? 0 };
}

// ============================================================
// Handler
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method-not-allowed' });

  const authz = await authorize(req);
  if (!authz.ok) return json(401, { error: 'unauthorized', reason: authz.reason });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json(400, { error: 'invalid-json' });
  }
  const parsed = validateBody(raw);
  if (!parsed.ok) return json(400, { error: parsed.error });
  const { action, runId, target = 'all', count = 3 } = parsed.body;

  try {
    const result: Record<string, unknown> = { runId, action };

    if (action === 'seed') {
      if (target === 'failed_messages' || target === 'all') {
        result.failed_messages = await seedFailedMessages(runId, count);
      }
      if (target === 'webhook_events' || target === 'all') {
        result.webhook_events = await seedWebhookEvents(runId, count);
      }
    } else {
      if (target === 'failed_messages' || target === 'all') {
        result.failed_messages = await cleanupFailedMessages(runId);
      }
      if (target === 'webhook_events' || target === 'all') {
        result.webhook_events = await cleanupWebhookEvents(runId);
      }
    }

    return json(200, result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(500, { error: 'fixture-op-failed', message: msg });
  }
});
