import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";

/**
 * 3-layer health check para conexões Evolution.
 *
 * Layer 1 — Socket: GET /instance/connectionState/{instance} → state
 * Layer 2 — Identidade: GET /instance/fetchInstances?instanceName={instance} → owner JID
 * Layer 3 — Atividade: última mensagem no FATOR X (evolution_messages) por instance_name
 *
 * Mapeamento (state, ownerJid, lastActivityAge):
 *  open + owner ausente              → degraded · phantom_session   · status=disconnected
 *  open + owner ok + > 6h            → disconnected · stale_session  · status=disconnected
 *  open + owner ok + 30min..6h       → degraded · webhook_silent    · status=connected
 *  open + owner ok + < 30min         → healthy                       · status=connected
 *  close                             → disconnected · socket_closed  · status=disconnected
 *  HTTP error                        → error                         · status=disconnected
 *  timeout                           → timeout                       · status=disconnected
 */

interface FetchInstanceShape {
  instance?: { owner?: string; ownerJid?: string; profileName?: string; profilePicUrl?: string; state?: string; connectionStatus?: string };
  // Evolution v2 devolve esses campos no objeto raiz (ownerJid + connectionStatus)
  owner?: string;
  ownerJid?: string;
  profileName?: string;
  connectionStatus?: string;
}

// Sem mensagens há 6h ainda é normal (noite/fds). Só virou degraded depois de 2h e
// só vira "stale" (suspeito) depois de 24h — e mesmo assim NUNCA marca como disconnected
// se o socket está aberto e o owner está pareado.
const ACTIVITY_DEGRADED_MS = 2 * 60 * 60 * 1000;     // 2h sem evento → silent (warn)
const ACTIVITY_STALE_MS    = 24 * 60 * 60 * 1000;    // 24h sem evento → stale (warn, não erro)

async function fetchOwnerJid(baseUrl: string, key: string, instanceName: string, log: Logger): Promise<string | null> {
  try {
    const resp = await fetch(`${baseUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`, {
      method: 'GET',
      headers: { 'apikey': key },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      await resp.text();
      log.warn('fetchInstances non-ok', { instanceName, status: resp.status });
      return null;
    }
    const data = await resp.json();
    // pode vir como array ou objeto
    const entry: FetchInstanceShape = Array.isArray(data) ? data[0] : data;
    if (!entry) return null;
    const owner = entry.instance?.ownerJid ?? entry.instance?.owner ?? entry.ownerJid ?? entry.owner ?? null;
    return owner && typeof owner === 'string' && owner.length > 0 ? owner : null;
  } catch (e) {
    log.warn('fetchInstances threw', { instanceName, error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

async function fetchLastActivityAt(externalUrl: string, externalKey: string, instanceName: string, log: Logger): Promise<Date | null> {
  try {
    const ext = createClient(externalUrl, externalKey);
    const { data, error } = await ext
      .from('evolution_messages')
      .select('created_at')
      .eq('instance_name', instanceName)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) { log.warn('external messages query error', { error: error.message }); return null; }
    if (!data?.created_at) return null;
    return new Date(data.created_at as string);
  } catch (e) {
    log.warn('external messages threw', { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

interface EvalArgs {
  socketState: string | null; // 'open' | 'close' | 'connecting' | null (http error)
  ownerJid: string | null;
  lastActivityAt: Date | null;
  now: Date;
}
interface EvalResult {
  healthStatus: 'healthy' | 'degraded' | 'disconnected' | 'error' | 'timeout';
  dbStatus: 'connected' | 'disconnected';
  reason: string | null;
}

function evaluateHealth(a: EvalArgs): EvalResult {
  if (a.socketState === null) {
    return { healthStatus: 'error', dbStatus: 'disconnected', reason: 'http_error' };
  }
  if (a.socketState !== 'open') {
    return { healthStatus: 'disconnected', dbStatus: 'disconnected', reason: 'socket_closed' };
  }
  // socket open
  if (!a.ownerJid) {
    return { healthStatus: 'degraded', dbStatus: 'disconnected', reason: 'phantom_session' };
  }
  if (a.lastActivityAt) {
    const age = a.now.getTime() - a.lastActivityAt.getTime();
    if (age > ACTIVITY_STALE_MS) {
      // Socket aberto + owner ok há 24h sem mensagens é apenas um aviso,
      // não um erro. A conexão continua "connected" no DB.
      return { healthStatus: 'degraded', dbStatus: 'connected', reason: 'stale_session' };
    }
    if (age > ACTIVITY_DEGRADED_MS) {
      return { healthStatus: 'degraded', dbStatus: 'connected', reason: 'webhook_silent' };
    }
  }
  return { healthStatus: 'healthy', dbStatus: 'connected', reason: null };
}

// Exposto para testes
export { evaluateHealth };

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("connection-health-check");

  try {
    const evolutionUrl = requireEnv('EVOLUTION_API_URL');
    const evolutionKey = requireEnv('EVOLUTION_API_KEY');
    const isPlaceholder = (v: string) => !v || /PLACEHOLDER|REPLACE_ME|YOUR_|CHANGE_ME/i.test(v);
    const isValidUrl = (v: string) => { try { new URL(v); return true; } catch { return false; } };
    if (isPlaceholder(evolutionUrl) || isPlaceholder(evolutionKey) || !isValidUrl(evolutionUrl)) {
      return new Response(JSON.stringify({ error: 'evolution_api_not_configured', message: 'Configure os secrets EVOLUTION_API_URL (URL válida) e EVOLUTION_API_KEY.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
    const baseUrl = evolutionUrl.replace(/\/+$/, '');

    // FATOR X (opcional — se faltar, layer 3 é skipped graciosamente)
    const externalUrl = Deno.env.get('EXTERNAL_SUPABASE_URL') ?? Deno.env.get('FATOR_X_URL');
    const externalKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')
                     ?? Deno.env.get('FATOR_X_SERVICE_ROLE_KEY')
                     ?? Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY');

    // Allow targeting a single instance (manual "Verificar agora" do card)
    let onlyInstance: string | null = null;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body && typeof body.instanceName === 'string' && body.instanceName.length > 0) {
          onlyInstance = body.instanceName;
        }
      } catch { /* sem body, ok */ }
    }

    let query = supabase
      .from('whatsapp_connections')
      .select('id, instance_id, status, phone_number, health_status, health_reason');
    if (onlyInstance) query = query.eq('instance_id', onlyInstance);

    const { data: connections, error: connError } = await query;
    if (connError || !connections) return errorResponse('Failed to fetch connections', 500, req);

    const results = [];
    const alertsToCreate: Array<{ connection_id: string; instance_id: string; phone: string | null; reason: 'disconnected' | 'degraded' | 'phantom_session' | 'webhook_silent' | 'stale_session' }> = [];

    for (const conn of connections) {
      if (!conn.instance_id) continue;
      const start = performance.now();
      let socketState: string | null = null;
      let httpErrorMessage: string | null = null;
      let responseTime = 0;

      // Layer 1
      try {
        const resp = await fetch(`${baseUrl}/instance/connectionState/${conn.instance_id}`, {
          method: 'GET', headers: { 'apikey': evolutionKey },
          signal: AbortSignal.timeout(10000),
        });
        responseTime = Math.round(performance.now() - start);
        if (resp.ok) {
          const data = await resp.json();
          socketState = (data?.instance?.state || data?.state || 'unknown') as string;
        } else {
          httpErrorMessage = `HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`;
        }
      } catch (err) {
        responseTime = Math.round(performance.now() - start);
        const result: EvalResult = { healthStatus: 'timeout', dbStatus: 'disconnected', reason: 'timeout' };
        await persistResult(supabase, conn, result, responseTime, err instanceof Error ? err.message : 'timeout', alertsToCreate, log);
        results.push({ instance_id: conn.instance_id, status: result.healthStatus, response_time_ms: responseTime, reason: result.reason, error: err instanceof Error ? err.message : 'timeout' });
        continue;
      }

      // Layer 2 & 3 (em paralelo, só se socket open)
      let ownerJid: string | null = null;
      let lastActivityAt: Date | null = null;
      if (socketState === 'open') {
        const [owner, activity] = await Promise.all([
          fetchOwnerJid(baseUrl, evolutionKey, conn.instance_id, log),
          externalUrl && externalKey
            ? fetchLastActivityAt(externalUrl, externalKey, conn.instance_id, log)
            : Promise.resolve(null),
        ]);
        ownerJid = owner;
        lastActivityAt = activity;
      }

      const evalResult = evaluateHealth({
        socketState,
        ownerJid,
        lastActivityAt,
        now: new Date(),
      });

      await persistResult(supabase, conn, evalResult, responseTime, httpErrorMessage, alertsToCreate, log, ownerJid);
      results.push({
        instance_id: conn.instance_id,
        socket_state: socketState,
        owner_jid: ownerJid ? ownerJid.split('@')[0] : null, // sem @s.whatsapp.net no payload de retorno
        last_activity_at: lastActivityAt?.toISOString() ?? null,
        status: evalResult.healthStatus,
        reason: evalResult.reason,
        response_time_ms: responseTime,
        error: httpErrorMessage,
      });
    }

    // Alertas (warroom + notifications) — mantém comportamento anterior, com novo `reason` no metadata
    let optInUserIds: string[] = [];
    if (alertsToCreate.length > 0) {
      const { data: prefs } = await supabase
        .from('connection_alert_preferences')
        .select('user_id, alert_on_degraded, alert_on_disconnected, push_enabled');
      optInUserIds = (prefs ?? [])
        .filter((p: any) => p.push_enabled && (p.alert_on_degraded || p.alert_on_disconnected))
        .map((p: any) => p.user_id);
    }

    for (const alert of alertsToCreate) {
      const isDegraded = alert.reason === 'degraded' || alert.reason === 'phantom_session' || alert.reason === 'webhook_silent';
      const reasonLabel: Record<string, string> = {
        phantom_session: 'sessão fantasma (socket aberto sem número pareado)',
        webhook_silent: 'webhook silencioso (sem eventos recentes)',
        stale_session: 'sessão obsoleta (>6h sem atividade)',
        degraded: 'degradada',
        disconnected: 'desconectada',
      };
      const title = isDegraded
        ? `Conexão ${alert.instance_id} — ${reasonLabel[alert.reason] ?? 'degradada'}`
        : `Conexão ${alert.instance_id} desconectada`;
      const message = `A instância ${alert.instance_id}${alert.phone ? ` (${alert.phone})` : ''}: ${reasonLabel[alert.reason] ?? alert.reason}.`;

      await supabase.from('warroom_alerts').insert({
        alert_type: isDegraded ? 'warning' : 'critical',
        title, message, source: 'connection_health',
      }).then(({ error }) => { if (error) log.warn("warroom alert failed", { error: error.message }); });

      if (optInUserIds.length > 0) {
        const rows = optInUserIds.map((uid) => ({
          user_id: uid, title, message, type: 'connection_alert',
          metadata: { connection_id: alert.connection_id, instance_id: alert.instance_id, reason: alert.reason, phone: alert.phone },
        }));
        await supabase.from('notifications').insert(rows).then(({ error }) => {
          if (error) log.warn("notifications insert failed", { error: error.message });
        });
      }
    }

    // Cleanup
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('connection_health_logs').delete().lt('checked_at', sevenDaysAgo);

    log.done(200, { checked: results.length, alerts: alertsToCreate.length });
    return jsonResponse({ success: true, checked_at: new Date().toISOString(), connections: results, alerts_created: alertsToCreate.length }, 200, req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    log.error("Health check error", { error: msg });
    return errorResponse(msg, 500, req);
  }
});

async function persistResult(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  conn: { id: string; instance_id: string; status: string; health_status: string | null; phone_number: string | null },
  evalResult: EvalResult,
  responseTime: number,
  errorMessage: string | null,
  alertsToCreate: Array<{ connection_id: string; instance_id: string; phone: string | null; reason: 'disconnected' | 'degraded' | 'phantom_session' | 'webhook_silent' | 'stale_session' }>,
  log: Logger,
  ownerJid?: string | null,
) {
  await supabase.from('connection_health_logs').insert({
    connection_id: conn.id,
    instance_id: conn.instance_id,
    status: evalResult.healthStatus,
    response_time_ms: responseTime,
    error_message: errorMessage ?? evalResult.reason,
  });

  // Status DB transition?
  if (evalResult.dbStatus !== conn.status || evalResult.healthStatus !== conn.health_status) {
    const isStatusChange = evalResult.dbStatus !== conn.status;
    const isHealthChange = evalResult.healthStatus !== conn.health_status;

    await supabase.from('audit_logs').insert({
      action: isStatusChange ? 'connection_status_change' : 'connection_health_change',
      entity_type: 'whatsapp_connection',
      entity_id: conn.id,
      details: {
        instance_id: conn.instance_id,
        phone: conn.phone_number,
        previous_status: conn.status,
        new_status: evalResult.dbStatus,
        previous_health: conn.health_status,
        new_health: evalResult.healthStatus,
        reason: evalResult.reason,
        response_time_ms: responseTime,
        error: errorMessage
      },
    }).then(({ error }: { error: { message: string } | null }) => { if (error) log.warn('audit insert failed', { error: error.message }); });

    if (isStatusChange) {
      await supabase.from('whatsapp_connections')
        .update({ status: evalResult.dbStatus, updated_at: new Date().toISOString() })
        .eq('id', conn.id);
      
      if (evalResult.dbStatus === 'disconnected' && conn.status === 'connected') {
        alertsToCreate.push({
          connection_id: conn.id,
          instance_id: conn.instance_id,
          phone: conn.phone_number,
          reason: (evalResult.reason as any) || 'disconnected',
        });
      }
    }
  }

  // Health transition?
  const justBecameDegraded = evalResult.healthStatus === 'degraded' && conn.health_status !== 'degraded';
  const updatePayload: Record<string, unknown> = {
    last_health_check: new Date().toISOString(),
    health_status: evalResult.healthStatus,
    health_response_ms: responseTime,
    health_reason: evalResult.reason,
  };
  if (ownerJid !== undefined) updatePayload.owner_jid = ownerJid;
  if (justBecameDegraded) {
    updatePayload.degraded_at = new Date().toISOString();
    alertsToCreate.push({
      connection_id: conn.id,
      instance_id: conn.instance_id,
      phone: conn.phone_number,
      reason: (evalResult.reason as any) || 'degraded',
    });
  }

  await supabase.from('whatsapp_connections').update(updatePayload).eq('id', conn.id);
}
