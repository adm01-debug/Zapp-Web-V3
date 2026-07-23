// Evolution API Health Check Edge Function
// Monitors WhatsApp connection status, webhook configuration, and API health

import { getCorsHeaders, handleCors, Logger } from '../_shared/validation.ts';
import { requireServiceRoleOrCron } from '../_shared/auth.ts';
import { createZappAdminClient } from '../_shared/db-client.ts';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  instance: {
    name: string
    connected: boolean
    state: string
    phoneNumber?: string
    lastSeen?: string
  }
  webhook: {
    configured: boolean
    url?: string
    events?: string[]
  }
  api: {
    reachable: boolean
    latencyMs: number
    version?: string
  }
  database: {
    connected: boolean
    lastMessageAt?: string
    pendingMessages?: number
  }
  alerts: string[]
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const denied = requireServiceRoleOrCron(req);
  if (denied) return denied;

  const headers = { ...getCorsHeaders(req), 'Content-Type': 'application/json' };
  const log = new Logger('evolution-health');

  try {
    const EVOLUTION_API_URL = (Deno.env.get('EVOLUTION_API_URL') || '').trim().replace(/\/+$/, '')
    const EVOLUTION_API_KEY = (Deno.env.get('EVOLUTION_API_KEY') || '').trim()
    const INSTANCE_NAME = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'wpp2'
    const isPlaceholder = (v: string) => !v || /PLACEHOLDER|REPLACE_ME|YOUR_|CHANGE_ME/i.test(v);
    const isValidUrl = (v: string) => { try { new URL(v); return true; } catch { return false; } };
    if (isPlaceholder(EVOLUTION_API_URL) || isPlaceholder(EVOLUTION_API_KEY) || !isValidUrl(EVOLUTION_API_URL)) {
      return new Response(JSON.stringify({
        status: 'unhealthy',
        error: 'evolution_api_not_configured',
        message: 'Configure os secrets EVOLUTION_API_URL (URL válida) e EVOLUTION_API_KEY.',
        timestamp: new Date().toISOString(),
      }), { status: 503, headers });
    }

    const supabase = createZappAdminClient()
    const alerts: string[] = []

    // 1. Check Evolution API reachability
    let apiReachable = false
    let apiLatency = 0
    let apiVersion = ''
    try {
      const apiStart = Date.now()
      const apiResponse = await fetch(`${EVOLUTION_API_URL}/manager/version`, {
        headers: { 'apikey': EVOLUTION_API_KEY },
        signal: AbortSignal.timeout(7_000),
      })
      apiLatency = Date.now() - apiStart
      if (apiResponse.ok) {
        apiReachable = true
        const data = await apiResponse.json()
        apiVersion = data.version || 'unknown'
      }
    } catch {
      alerts.push('Evolution API is unreachable')
    }

    // 2. Check instance connection status
    let instanceConnected = false
    let instanceState = 'unknown'
    let phoneNumber = ''
    try {
      const instanceResponse = await fetch(
        `${EVOLUTION_API_URL}/instance/connectionState/${INSTANCE_NAME}`,
        { headers: { 'apikey': EVOLUTION_API_KEY }, signal: AbortSignal.timeout(7_000) }
      )
      if (instanceResponse.ok) {
        const data = await instanceResponse.json()
        instanceState = data.instance?.state || 'unknown'
        instanceConnected = instanceState === 'open'
        phoneNumber = data.instance?.phoneNumber || ''
        
        if (!instanceConnected) {
          alerts.push(`WhatsApp disconnected: state=${instanceState}`)
        }
      }
    } catch {
      alerts.push('Failed to check instance status')
    }

    // 3. Check webhook configuration
    let webhookConfigured = false
    let webhookUrl = ''
    let webhookEvents: string[] = []
    try {
      const webhookResponse = await fetch(
        `${EVOLUTION_API_URL}/webhook/find/${INSTANCE_NAME}`,
        { headers: { 'apikey': EVOLUTION_API_KEY }, signal: AbortSignal.timeout(7_000) }
      )
      if (webhookResponse.ok) {
        const data = await webhookResponse.json()
        webhookUrl = data.webhook?.url || ''
        webhookEvents = data.webhook?.events || []
        webhookConfigured = !!webhookUrl
        
        if (!webhookConfigured) {
          alerts.push('Webhook not configured')
        }
        
        const criticalEvents = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED']
        const missingEvents = criticalEvents.filter(e => !webhookEvents.includes(e))
        if (missingEvents.length > 0) {
          alerts.push(`Missing webhook events: ${missingEvents.join(', ')}`)
        }
      }
    } catch {
      alerts.push('Failed to check webhook configuration')
    }

    // 4. Check database connection and recent messages
    let dbConnected = false
    let lastMessageAt = ''
    let pendingMessages = 0
    try {
      const { data: lastMsg, error: lastMsgError } = await supabase
        .from('messages_whatsapp')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!lastMsgError && lastMsg) {
        dbConnected = true
        lastMessageAt = lastMsg.created_at
        
        const lastMsgTime = new Date(lastMsg.created_at).getTime()
        const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000
        if (instanceConnected && lastMsgTime < thirtyMinutesAgo) {
          alerts.push('No messages received in last 30 minutes')
        }
      }

      const { count: pendingCount, error: pendingError } = await supabase
        .from('message_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')

      if (!pendingError && pendingCount !== null) {
        pendingMessages = pendingCount
        if (pendingMessages > 100) {
          alerts.push(`High message queue: ${pendingMessages} pending`)
        }
      }
    } catch {
      dbConnected = true
    }

    // Determine overall status
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    if (!apiReachable || !instanceConnected) {
      overallStatus = 'unhealthy'
    } else if (alerts.length > 0) {
      overallStatus = 'degraded'
    }

    const result: HealthCheckResult = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      instance: {
        name: INSTANCE_NAME,
        connected: instanceConnected,
        state: instanceState,
        phoneNumber: phoneNumber || undefined,
      },
      webhook: {
        configured: webhookConfigured,
        url: webhookUrl || undefined,
        events: webhookEvents.length > 0 ? webhookEvents : undefined,
      },
      api: {
        reachable: apiReachable,
        latencyMs: apiLatency,
        version: apiVersion || undefined,
      },
      database: {
        connected: dbConnected,
        lastMessageAt: lastMessageAt || undefined,
        pendingMessages: pendingMessages > 0 ? pendingMessages : undefined,
      },
      alerts,
    }

    try {
      await supabase.from('system_logs').insert({
        level: overallStatus === 'unhealthy' ? 'error' : overallStatus === 'degraded' ? 'warn' : 'info',
        category: 'health_check',
        message: `Evolution API health: ${overallStatus}`,
        metadata: result,
      })
    } catch {
      // system_logs table might not exist
    }

    log.done(overallStatus === 'unhealthy' ? 503 : 200);

    return new Response(JSON.stringify(result), {
      headers,
      status: overallStatus === 'unhealthy' ? 503 : 200,
    })

  } catch (error) {
    log.error('Health check error', { error: error instanceof Error ? error.message : String(error) });
    return new Response(
      JSON.stringify({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
        alerts: ['Health check failed unexpectedly'],
      }),
      { headers, status: 503 }
    )
  }
})
