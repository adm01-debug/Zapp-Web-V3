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

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // Verifica usuário autenticado
  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims) return json({ error: 'unauthorized' }, 401);

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
      if (error) return json({ error: error.message }, 400);
      return json({ items: data ?? [] });
    }

    if (action === 'history') {
      const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200);
      const { data, error } = await supabase
        .from('instance_processing_pauses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return json({ error: error.message }, 400);
      return json({ items: data ?? [] });
    }

    if (action === 'pause') {
      const instance = String(body.instance ?? '').trim();
      const minutes = Math.min(Math.max(Number(body.minutes) || 15, 1), 1440);
      const reason = String(body.reason ?? 'manual_pause').slice(0, 200);
      if (!instance) return json({ error: 'instance is required' }, 400);

      const { data, error } = await supabase.rpc('pause_instance', {
        p_instance: instance,
        p_reason: reason,
        p_minutes: minutes,
        p_trigger_count: 0,
      });
      if (error) return json({ error: error.message }, 400);
      return json({ id: data, instance, minutes });
    }

    if (action === 'unpause') {
      const instance = String(body.instance ?? '').trim();
      if (!instance) return json({ error: 'instance is required' }, 400);
      const { data, error } = await supabase.rpc('unpause_instance', { p_instance: instance });
      if (error) return json({ error: error.message }, 400);
      return json({ instance, cleared: data ?? 0 });
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
      if (error) return json({ error: error.message }, 400);
      return json({ items: data ?? [] });
    }

    if (action === 'mark_investigated') {
      const pauseId = String(body.pause_id ?? '').trim();
      const notes = body.notes != null ? String(body.notes).slice(0, 1000) : null;
      if (!pauseId) return json({ error: 'pause_id is required' }, 400);
      const { data, error } = await supabase.rpc('mark_pause_investigated', {
        p_pause_id: pauseId,
        p_notes: notes,
      });
      if (error) return json({ error: error.message }, 400);
      return json({ pause: data });
    }

    if (action === 'status') {
      const instance = String(body.instance ?? '').trim();
      if (!instance) return json({ error: 'instance is required' }, 400);
      const { data, error } = await supabase
        .from('instance_processing_pauses')
        .select('paused_until,reason,trigger_count,auto_paused')
        .eq('instance_name', instance)
        .gt('paused_until', new Date().toISOString())
        .order('paused_until', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return json({ error: error.message }, 400);
      return json({
        instance,
        paused: !!data,
        until: data?.paused_until ?? null,
        reason: data?.reason ?? null,
        trigger_count: data?.trigger_count ?? 0,
        auto_paused: data?.auto_paused ?? false,
      });
    }

    return json({ error: `unknown_action:${action}` }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: 'internal_error', message: msg }, 500);
  }
});
