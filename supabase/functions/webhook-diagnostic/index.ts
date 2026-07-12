import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { WEBHOOK_EVENTS } from '../_shared/evolution-sync-actions.ts';
import { requireAdminOrSupervisor } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Edge Function: WhatsApp Webhook Configuration Diagnostic & Auto-Fix
 *
 * Diagnoses webhook health across Evolution API instances by checking:
 * - Connection state (open/disconnected) via /instance/connectionState
 * - Webhook configuration (URL, events, enabled status) via /webhook/find
 * - Message flow health (incoming/outgoing traffic last hour)
 * - Auto-fix capability to restore webhook configuration to canonical state
 *
 * Security: Requires admin/supervisor role; validates instanceName regex to prevent path traversal.
 * Severity Scoring: Composite health score (0-100) based on connection + webhook + traffic health.
 * Actions: 'full-diagnostic' (default) or 'auto-fix' to restore webhook configuration atomically.
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authed = await requireAdminOrSupervisor(req);
    if (authed instanceof Response) return authed;

    const supabaseUrl = Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    if (!supabaseUrl || !serviceKey || !evolutionKey) {
      return new Response(
        JSON.stringify({ error: 'Server misconfigured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const evolutionUrl = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/+$/, '');
    const supabase = createClient(supabaseUrl, serviceKey);

    let bodyObj: Record<string, unknown> = {};
    try {
      const raw = await req.json();
      if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
        bodyObj = raw;
      }
    } catch {
      bodyObj = {};
    }

    const action = typeof bodyObj.action === 'string' ? bodyObj.action : 'full-diagnostic';
    const rawInstanceName: unknown = bodyObj.instanceName;

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

    const connectionsArray = Array.isArray(connections) ? connections : [];
    results.connections = connectionsArray
      .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null && !Array.isArray(c))
      .map(c => ({
        instance: typeof c.instance_id === 'string' ? c.instance_id : '',
        dbStatus: typeof c.status === 'string' ? c.status : '',
        healthStatus: typeof c.health_status === 'string' ? c.health_status : '',
        phone: typeof c.phone_number === 'string' ? c.phone_number : '',
        lastCheck: typeof c.last_health_check === 'string' ? c.last_health_check : '',
      }))
      .filter(c => c.instance);

    // 2. For each connection (or specified), check Evolution API directly
    const instances = instanceName
      ? [{ instance_id: instanceName }]
      : connectionsArray;

    const diagnostics = [];

    for (const conn of instances) {
      const connObj = typeof conn === 'object' && conn !== null ? (conn as Record<string, unknown>) : null;
      const connInstanceId = typeof connObj?.instance_id === 'string' ? connObj.instance_id : '';
      if (!connInstanceId) continue;

      const diag: Record<string, unknown> = { instance: connInstanceId };

      // 2a. Check instance connection state
      const dbConnRecord = connectionsArray
        .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null && !Array.isArray(c))
        .find(c => c.instance_id === connInstanceId);
      try {
        let state = 'unknown';
        // /instance/connectionState returns {"instance":{"state":"open"}} — correct endpoint for status checks
        const statusRes = await fetch(`${evolutionUrl}/instance/connectionState/${connInstanceId}`, {
          headers: { apikey: evolutionKey },
          signal: AbortSignal.timeout(10000),
        });
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (typeof statusData === 'object' && statusData !== null && !Array.isArray(statusData)) {
            const statusObj = statusData as Record<string, unknown>;
            const instanceObj = typeof statusObj.instance === 'object' && statusObj.instance !== null
              ? (statusObj.instance as Record<string, unknown>)
              : null;
            state = (typeof instanceObj?.state === 'string' ? instanceObj.state : null)
              || (typeof statusObj.state === 'string' ? statusObj.state : 'unknown');
          }
        }
        // Fallback: use DB status if API unreachable
        if (state === 'unknown' && dbConnRecord) {
          const dbStatus = typeof dbConnRecord.status === 'string' ? dbConnRecord.status : '';
          state = dbStatus === 'connected' ? 'open' : (dbStatus || 'unknown');
        }
        diag.connectionState = state;
        diag.statusOk = state === 'open' || state === 'connected';
      } catch (e) {
        diag.connectionState = 'error';
        diag.statusError = e instanceof Error ? e.message : 'timeout';
      }

      // 2b. Check webhook configuration
      try {
        const whRes = await fetch(`${evolutionUrl}/webhook/find/${connInstanceId}`, {
          headers: { apikey: evolutionKey },
          signal: AbortSignal.timeout(10000),
        });
        const whData = await whRes.json();
        const webhook = (typeof whData === 'object' && whData !== null && !Array.isArray(whData))
          ? (whData as Record<string, unknown>)
          : {};

        const expectedUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;
        const currentUrl = (typeof webhook.url === 'string' ? webhook.url : null)
          || (typeof webhook.webhookUrl === 'string' ? webhook.webhookUrl : '') || '';
        const events = Array.isArray(webhook.events) ? webhook.events : [];

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
          enabled: webhook.enabled !== false,
          webhookByEvents: typeof webhook.webhookByEvents === 'boolean' ? webhook.webhookByEvents : undefined,
          webhookBase64: typeof webhook.webhookBase64 === 'boolean' ? webhook.webhookBase64 : undefined,
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
      const connDbId = dbConnRecord ? (typeof dbConnRecord.id === 'string' ? dbConnRecord.id : '') : '';
      let recentMsgsArray: Record<string, unknown>[] = [];
      if (connDbId) {
        const { data: recentMsgs } = await supabase
          .from('messages')
          .select('sender, created_at')
          .eq('whatsapp_connection_id', connDbId)
          .gte('created_at', oneHourAgo);
        recentMsgsArray = Array.isArray(recentMsgs) ? recentMsgs : [];
      }
      const validMsgs = recentMsgsArray
        .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null && !Array.isArray(m));
      const incoming = validMsgs.filter(m => m.sender === 'contact').length;
      const outgoing = validMsgs.filter(m => m.sender === 'agent').length;

      diag.messageFlow = {
        lastHour: { incoming, outgoing, total: validMsgs.length },
        incomingOk: incoming > 0,
        flowHealth: incoming === 0 && outgoing > 0 ? 'outbound-only' : incoming === 0 ? 'no-traffic' : 'healthy',
      };

      // 2d. Auto-fix if requested
      if (action === 'auto-fix' && (diag.webhookSeverity === 'critical' || diag.webhookSeverity === 'warning')) {
        try {
          // Evolution API v4.x requires the body wrapped in { webhook: { ... } }
          const fixRes = await fetch(`${evolutionUrl}/webhook/set/${connInstanceId}`, {
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

      if (typeof d.messageFlow === 'object' && d.messageFlow !== null && !Array.isArray(d.messageFlow)) {
        const msgFlow = d.messageFlow as Record<string, unknown>;
        if (msgFlow.flowHealth !== 'healthy') score -= 20;
      }
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
