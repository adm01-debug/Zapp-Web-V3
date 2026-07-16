// Painel admin → controlar pausas de processamento de instância.
// Endpoints (via body.action):
//   - 'list'    : lista pausas ativas (admin)
//   - 'history' : últimas N pausas, ativas e expiradas (admin)
//   - 'pause'   : pausa manual { instance, minutes, reason }
//   - 'unpause' : retoma manual { instance }
//   - 'status'  : { instance } -> { paused: boolean, until?: string }
//
// Auth: validamos JWT do usuário e RLS faz o gate de admin/supervisor.
// Auto-pausa (a partir das edge functions evolution-webhook/api) usa SERVICE_ROLE
// e chama o RPC `auto_pause_instance_on_auth_spike` diretamente — não passa por aqui.

import { requireUser } from '../_shared/auth.ts';
import { createZappClient } from '../_shared/db-client.ts';
import { checkRateLimit } from '../_shared/validation.ts';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function dbError(req: Request, context: string, error: { message: string; code?: string }): Response {
  console.error(`[instance-pause-control] ${context}`, error.message, 'code:', error.code);
  // P0001 = PL/pgSQL RAISE EXCEPTION (business rules); 22xxx = data exception; 23xxx = constraint
  if (error.code === 'PGRST116') return json(req, { error: 'Not found' }, 404);
  if (error.code === '42501') return json(req, { error: 'Forbidden' }, 403);
  if (error.code === 'P0001' || error.code?.startsWith('22') || error.code?.startsWith('23')) {
    return json(req, { error: 'Invalid request' }, 400);
  }
  return json(req, { error: 'Database operation failed' }, 500);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);

  // Server-side JWT verification — getClaims() is client-side decode and forgeable
  const authed = await requireUser(req);
  if (authed instanceof Response) return authed;

  const rl = checkRateLimit(`instance-pause:${authed.user.id}`, 30, 60_000);
  if (!rl.allowed) return json(req, { error: 'rate_limit_exceeded' }, 429);

  const supabase = createZappClient(req);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const action = String(body.action ?? '');

  try {
    if (action === 'list') {
      const { data, error } = await supabase
        .from('instance_processing_pauses')
        .select('*')
        .gt('paused_until', new Date().toISOString())
        .order('paused_until', { ascending: false });
      if (error) return dbError(req, 'list', error);
      return json(req, { items: data ?? [] });
    }

    if (action === 'history') {
      const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200);
      const { data, error } = await supabase
        .from('instance_processing_pauses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return dbError(req, 'history', error);
      return json(req, { items: data ?? [] });
    }

    if (action === 'pause') {
      const instance = String(body.instance ?? '').trim();
      const minutes = Math.min(Math.max(Number(body.minutes) || 15, 1), 1440);
      const reason = String(body.reason ?? 'manual_pause').slice(0, 200);
      if (!instance) return json(req, { error: 'instance is required' }, 400);

      const { data, error } = await supabase.rpc('pause_instance', {
        p_instance: instance,
        p_reason: reason,
        p_minutes: minutes,
        p_trigger_count: 0,
      });
      if (error) return dbError(req, 'pause', error);
      return json(req, { id: data, instance, minutes });
    }

    if (action === 'unpause') {
      const instance = String(body.instance ?? '').trim();
      if (!instance) return json(req, { error: 'instance is required' }, 400);
      const { data, error } = await supabase.rpc('unpause_instance', { p_instance: instance });
      if (error) return dbError(req, 'unpause', error);
      return json(req, { instance, cleared: data ?? 0 });
    }

    if (action === 'recent_events') {
      const instance = String(body.instance ?? '').trim();
      const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 200);
      const sinceMin = Math.min(Math.max(Number(body.since_minutes) || 60, 1), 1440);
      const since = new Date(Date.now() - sinceMin * 60_000).toISOString();
      let q = supabase
        .from('instance_auth_events')
        .select('id,instance_name,reason,source,http_status,detail,created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (instance) q = q.eq('instance_name', instance);
      const { data, error } = await q;
      if (error) return dbError(req, 'recent_events', error);
      return json(req, { items: data ?? [] });
    }

    if (action === 'mark_investigated') {
      const pauseId = String(body.pause_id ?? '').trim();
      const notes = body.notes != null ? String(body.notes).slice(0, 1000) : null;
      if (!pauseId) return json(req, { error: 'pause_id is required' }, 400);
      const { data, error } = await supabase.rpc('mark_pause_investigated', {
        p_pause_id: pauseId,
        p_notes: notes,
      });
      if (error) return dbError(req, 'mark_investigated', error);
      return json(req, { pause: data });
    }

    if (action === 'status') {
      const instance = String(body.instance ?? '').trim();
      if (!instance) return json(req, { error: 'instance is required' }, 400);
      const { data, error } = await supabase
        .from('instance_processing_pauses')
        .select('paused_until,reason,trigger_count,auto_paused')
        .eq('instance_name', instance)
        .gt('paused_until', new Date().toISOString())
        .order('paused_until', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return dbError(req, 'status', error);
      return json(req, {
        instance,
        paused: !!data,
        until: data?.paused_until ?? null,
        reason: data?.reason ?? null,
        trigger_count: data?.trigger_count ?? 0,
        auto_paused: data?.auto_paused ?? false,
      });
    }

    return json(req, { error: `unknown_action:${action}` }, 400);
  } catch (e) {
    console.error('[instance-pause-control] unexpected error', e instanceof Error ? (e.stack ?? e.message) : String(e));
    return json(req, { error: 'Internal server error' }, 500);
  }
});
