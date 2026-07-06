import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { WEBHOOK_EVENTS } from '../_shared/evolution-sync-actions.ts';
import { requireAdminOrSupervisor } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authed = await requireAdminOrSupervisor(req);
    if (authed instanceof Response) return authed;

    const supabaseUrl = (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'))!;
    const serviceKey = (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const evolutionUrl = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/+$/, '');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'full-diagnostic';
    const rawInstanceName: unknown = body.instanceName;

    // Validate instanceName to prevent path traversal in Evolution API URLs
    const INSTANCE_RE = /^[a-zA-Z0-9_-]{1,64}$/;
    if (rawInstanceName !== undefined && rawInstanceName !== null) {
      if (typeof rawInstanceName !== 'string' || !INSTANCE_RE.test(rawInstanceName)) {
        return new Response(
          JSON.stringify({ error: 'instanceName contains invalid characters' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    const instanceName = rawInstanceName as string | undefined;

    const results: Record<string, unknown> = { timestamp: new Date().toISOString(), action };

    // 1. Check all connections in DB
    const { data: connections } = await supabase
      .from('whatsapp_connections')
      .select('id, instance_id, status, health_status, last_health_check, phone_number');

    results.connections = connections?.map(c => ({
      instance: c.instance_id,
      dbStatus: c.status,
      healthStatus: c.health_status,
      phone: c.phone_number,
      lastCheck: c.last_health_check,
    })) || [];

    // 2. For each connection (or specified), check Evolution API directly
    const instances = instanceName
      ? [{ instance_id: instanceName }]
      : (connections || []);

    const diagnostics = [];

    for (const conn of instances) {
      const diag: Record<string, unknown> = { instance: conn.instance_id };

      // 2a. Check instance connection state
      const dbConnRecord = (connections || []).find((c: Record<string, unknown>) => c.instance_id === conn.instance_id);
      try {
        let state = 'unknown';
        // /instance/connectionState returns {"instance":{"state":"open"}} — correct endpoint for status checks
        const statusRes = await fetch(`${evolutionUrl}/instance/connectionState/${conn.instance_id}`, {
          headers: { apikey: evolutionKey },
          signal: AbortSignal.timeout(10000),
        });
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          state = statusData?.instance?.state || statusData?.state || 'unknown';
        }
        // Fallback: use DB status if API unreachable
        if (state === 'unknown') {
          state = dbConnRecord?.status === 'connected' ? 'open' : (dbConnRecord?.status || 'unknown');
        }
        diag.connectionState = state;
        diag.statusOk = state === 'open' || state === 'connected';
      } catch (e) {
        diag.connectionState = 'error';
        diag.statusError = e instanceof Error ? e.message : 'timeout';
      }

      // 2b. Check webhook configuration
      try {
        const whRes = await fetch(`${evolutionUrl}/webhook/find/${conn.instance_id}`, {
          headers: { apikey: evolutionKey },
          signal: AbortSignal.timeout(10000),
        });
        const whData = await whRes.json();
        const webhook = whData?.webhook || whData;
        
        const expectedUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;
        const currentUrl = webhook?.url || webhook?.webhookUrl || '';
        const events = webhook?.events || [];

        const criticalEvents = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED', 'CONTACTS_UPSERT', 'SEND_MESSAGE'];
        const missingEvents = criticalEvents.filter(e => !events.includes(e));
        const missingAll = WEBHOOK_EVENTS.filter(e => !events.includes(e));

        diag.webhook = {
          url: currentUrl,
          urlCorrect: currentUrl === expectedUrl,
          expectedUrl,
          eventsCount: events.length,
          events,
          missingCritical: missingEvents,
          missingFromCanonical: missingAll,
          enabled: webhook?.enabled !== false,
          webhookByEvents: webhook?.webhookByEvents,
          webhookBase64: webhook?.webhookBase64,
        };

        // Severity assessment
        if (!currentUrl || currentUrl !== expectedUrl) {
          diag.webhookSeverity = 'critical';
          diag.webhookIssue = 'URL incorreta ou ausente';
        } else if (missingEvents.length > 0) {
          diag.webhookSeverity = 'warning';
          diag.webhookIssue = `${missingEvents.length} eventos críticos ausentes`;
        } else {
          diag.webhookSeverity = 'ok';
        }
      } catch (e) {
        diag.webhook = { error: e instanceof Error ? e.message : 'timeout' };
        diag.webhookSeverity = 'error';
      }

      // 2c. Check recent message flow (scoped to this instance via whatsapp_connection_id)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const connDbId = dbConnRecord?.id as string | undefined;
      let msgQuery = supabase
        .from('messages')
        .select('sender, created_at')
        .gte('created_at', oneHourAgo);
      if (connDbId) msgQuery = msgQuery.eq('whatsapp_connection_id', connDbId);
      const { data: recentMsgs } = await msgQuery;

      const incoming = recentMsgs?.filter(m => m.sender === 'contact').length || 0;
      const outgoing = recentMsgs?.filter(m => m.sender === 'agent').length || 0;

      diag.messageFlow = {
        lastHour: { incoming, outgoing, total: (recentMsgs?.length || 0) },
        incomingOk: incoming > 0,
        flowHealth: incoming === 0 && outgoing > 0 ? 'outbound-only' : incoming === 0 ? 'no-traffic' : 'healthy',
      };

      // 2d. Auto-fix if requested
      if (action === 'auto-fix' && (diag.webhookSeverity === 'critical' || diag.webhookSeverity === 'warning')) {
        try {
          // Evolution API v4.x requires the body wrapped in { webhook: { ... } }
          const fixRes = await fetch(`${evolutionUrl}/webhook/set/${conn.instance_id}`, {
            method: 'POST',
            headers: { apikey: evolutionKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              webhook: {
                enabled: true,
                url: `${supabaseUrl}/functions/v1/evolution-webhook`,
                webhookByEvents: false,
                webhookBase64: true,
                events: WEBHOOK_EVENTS,
              },
            }),
            signal: AbortSignal.timeout(15000),
          });
          diag.autoFix = { applied: fixRes.ok, status: fixRes.status };
        } catch (e) {
          diag.autoFix = { applied: false, error: e instanceof Error ? e.message : 'failed' };
        }
      }

      diagnostics.push(diag);
    }

    results.diagnostics = diagnostics;

    // 3. Overall health score
    const scores = diagnostics.map(d => {
      let score = 100;
      if (d.connectionState !== 'open') score -= 40;
      if (d.webhookSeverity === 'critical') score -= 40;
      else if (d.webhookSeverity === 'warning') score -= 20;
      if ((d.messageFlow as Record<string, unknown>)?.flowHealth !== 'healthy') score -= 20;
      return Math.max(0, score);
    });

    results.overallHealth = {
      score: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      status: scores.every(s => s >= 80) ? 'healthy' : scores.some(s => s < 40) ? 'critical' : 'degraded',
    };

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[webhook-diagnostic] error:', err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
