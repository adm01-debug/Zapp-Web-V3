// IMPORTANTE: o config.toml (verify_jwt, limites de memória/timeout por função)
// NÃO é honrado pelo runtime edge self-hosted (supabase/edge-runtime) quando este
// arquivo é o entrypoint. Esta allowlist (PUBLIC_FNS) é a FONTE DE VERDADE:
// funções listadas aqui são chamadas SEM JWT mesmo com VERIFY_JWT=true; qualquer
// outra função exige Authorization: Bearer <JWT válido>.

import * as jose from 'https://deno.land/x/jose@v4.14.4/index.ts'
import { initSentry, captureException } from '../_shared/sentry.ts'

// Inicializa Sentry UMA vez por container — cobre 100% das Edge Functions
// sem precisar alterar cada uma individualmente
let sentryReady = false
try {
  sentryReady = initSentry('edge-runtime-main')
  if (sentryReady) console.error('[main] Sentry initialized for global error tracking')
} catch (_) { /* noop — Sentry não deve derrubar o entrypoint */ }

// Cold-start indicator — logs once per container lifecycle. Remove in production if verbose logging is undesired.

const VERIFY_JWT = Deno.env.get('VERIFY_JWT') === 'true'

// Allowlist de funções públicas: não exigem JWT (webhooks externos, health checks,
// endpoints chamados pelo frontend sem sessão). Manter em sincronia com o deploy.
// Fonte: docs/edge/reconciliacao-2026-08.md (Fase E2, 2026-08-01) + classificação E21.
const PUBLIC_FNS = new Set<string>([
  // webhooks com HMAC próprio (fail-closed via *_STRICT + secrets HMAC)
  'evolution-webhook',
  'whatsapp-webhook',
  'whatsapp-cloud-webhook',
  'whatsapp-cloud-webhook-verify',
  'elevenlabs-webhook',
  'gmail-webhook',
  // públicos por design (sem dado sensível)
  'email-track-pixel',
  'email-track-link',
  'health-check',
  'status',
  'login-attempts',
  // cron/alert com segredo próprio (CRON_SECRET / *_SECRET)
  'cleanup-rate-limit-logs',
  'cleanup-storage-orphans',
  'auto-close-conversations',
  'auto-escalate-sla',
  'queue-rebalance',
  'nps-scheduler',
  'sicoob-outbox-consumer',
  'talkx-scheduler',
  'sla-alert-forward',
  'sentiment-alert',
  'evolution-health',
  'bitrix-api',
  'send-rate-limit-alert',
  'evolution-sync',
  // service-to-service com secret próprio (sem JWT de usuário)
  'sicoob-bridge',
  'sicoob-bridge-reply',
  'gmail-oauth',
  'public-api',
  // scrape/health com bearer de segredo próprio (NÃO-JWT: PROXY_METRICS_TOKEN / HEALTH_TOKEN)
  'proxy-metrics',
  'proxy-health',
])

// O segredo JWT pode vir direto de JWT_SECRET ou de um arquivo montado no container
// via JWT_SECRET_FILE (ex.: /run/secrets/jwt_secret em Docker Swarm). O trim remove
// quebras de linha típicas de arquivos de segredo.
const jwtSecretFile = Deno.env.get('JWT_SECRET_FILE')
let fileSecret = ''
if (jwtSecretFile) {
  try {
    fileSecret = Deno.readTextFileSync(jwtSecretFile)
  } catch (e) {
    // Arquivo ausente/ilegível NUNCA pode derrubar o entrypoint compartilhado:
    // loga e continua (o fallback JWT_SECRET abaixo cobre o caso normal).
    console.error('[main] aviso: JWT_SECRET_FILE ilegível — usando JWT_SECRET', e)
  }
}
const rawSecret = (fileSecret || Deno.env.get('JWT_SECRET') || '').trim()
const JWT_SECRET = rawSecret.startsWith('MISSING__') ? '' : rawSecret

// Fail-fast on startup: se VERIFY_JWT=true sem segredo resolvido, cada request
// seria validado contra chave indefinida — derruba o container no boot.
if (VERIFY_JWT && !JWT_SECRET) {
  console.error('[main] FATAL: VERIFY_JWT=true but JWT_SECRET/JWT_SECRET_FILE is not set — refusing to start')
  throw new Error('JWT_SECRET required when VERIFY_JWT is enabled')
}

// Allowlist for function names: lowercase alpha, digits, hyphen; no traversal, no self-invocation.
const SERVICE_NAME_RE = /^[a-z][a-z0-9-]*$/
const MAX_SERVICE_NAME_LEN = 64

function getAuthToken(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) throw new Error('Missing authorization header')
  const [bearer, token] = authHeader.split(' ')
  if (bearer !== 'Bearer') throw new Error("Auth header is not 'Bearer {token}'")
  return token
}

async function verifyJWT(jwt: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const secretKey = encoder.encode(JWT_SECRET)
  try {
    await jose.jwtVerify(jwt, secretKey)
  } catch (err) {
    console.error(err)
    return false
  }
  return true
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  const { pathname } = url
  const path_parts = pathname.split('/')
  const service_name = path_parts[1]

  if (!service_name || service_name === '') {
    return new Response(JSON.stringify({ msg: 'missing function name in request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Validate: reject path traversal characters, oversized names, and self-invocation.
  if (
    !SERVICE_NAME_RE.test(service_name) ||
    service_name.length > MAX_SERVICE_NAME_LEN ||
    service_name === 'main'
  ) {
    return new Response(JSON.stringify({ msg: 'invalid function name' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Gate de autenticação: OPTIONS (CORS preflight) sempre passa; allowlist passa
  // sem token; todo o resto exige Bearer JWT válido quando VERIFY_JWT=true.
  if (req.method !== 'OPTIONS' && VERIFY_JWT && !PUBLIC_FNS.has(service_name)) {
    try {
      const token = getAuthToken(req)
      const isValidJWT = await verifyJWT(token)
      if (!isValidJWT) {
        return new Response(JSON.stringify({ msg: 'Invalid JWT' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    } catch (e) {
      console.error(e)
      if (sentryReady) captureException(e, { functionName: 'edge-runtime-main', requestUrl: req.url })
      return new Response(JSON.stringify({ msg: 'Authorization failed' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  const servicePath = `/home/deno/functions/${service_name}`
  console.error(`serving the request with ${servicePath}`)

  // Increased from 150 MB to handle heavier functions (e.g. evolution-api with many imports)
  const memoryLimitMb = 256
  // Increased from 1 min to 5 min to survive cold-start module loading from deno.land/esm.sh
  const workerTimeoutMs = 5 * 60 * 1000
  const noModuleCache = false
  const importMapPath = null
  const envVarsObj = Deno.env.toObject()
  const envVars = Object.keys(envVarsObj).map((k) => [k, envVarsObj[k]])

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb,
      workerTimeoutMs,
      noModuleCache,
      importMapPath,
      envVars,
    })
    return await worker.fetch(req)
  } catch (e) {
    console.error('worker error:', e)
    if (sentryReady) captureException(e, { functionName: service_name, requestUrl: req.url })
    return new Response(JSON.stringify({ msg: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
