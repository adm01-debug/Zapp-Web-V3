// IMPORTANTE: o config.toml (verify_jwt, limites de memória/timeout por função)
// NÃO é honrado pelo runtime edge self-hosted (supabase/edge-runtime) quando este
// arquivo é o entrypoint. Esta allowlist (PUBLIC_FNS) é a FONTE DE VERDADE:
// funções listadas aqui são chamadas SEM JWT mesmo com VERIFY_JWT=true; qualquer
// outra função exige Authorization: Bearer com JWT válido.

import * as jose from 'https://deno.land/x/jose@v4.14.4/index.ts'

// Cold-start indicator — logs once per container lifecycle. Remove in production if verbose logging is undesired.

const VERIFY_JWT = Deno.env.get('VERIFY_JWT') === 'true'

// Allowlist de funções públicas: não exigem JWT (webhooks externos, health checks,
// endpoints chamados pelo frontend sem sessão). Manter em sincronia com o deploy.
const PUBLIC_FNS = new Set<string>([
  'evolution-webhook',
  'whatsapp-webhook',
  'whatsapp-cloud-webhook',
  'whatsapp-cloud-webhook-verify',
  'elevenlabs-webhook',
  'gmail-webhook',
  'email-track-pixel',
  'email-track-link',
  'login-attempts',
  'get-mapbox-token',
  'sentiment-alert',
  'connection-health-check',
  'evolution-health',
  'evolution-sender',
  'bitrix-api',
  'send-rate-limit-alert',
  'cleanup-rate-limit-logs',
  'evolution-sync',
  'classify-audio-meme',
  'classify-emoji',
  'classify-sticker',
  'health-check',
  'status',
])

// O segredo JWT pode vir direto de JWT_SECRET ou de um arquivo montado no container
// via JWT_SECRET_FILE (ex.: /run/secrets/jwt_secret em Docker Swarm). O trim remove
// quebras de linha típicas de arquivos de segredo.
const jwtSecretFile = Deno.env.get('JWT_SECRET_FILE')
const JWT_SECRET = (jwtSecretFile
  ? Deno.readTextFileSync(jwtSecretFile)
  : (Deno.env.get('JWT_SECRET') ?? '')).trim()

// Fail-fast on startup: if JWT verification is enabled but JWT_SECRET is absent,
// every request would be validated against an undefined key — surface the misconfiguration now.
if (VERIFY_JWT && !JWT_SECRET) {
  console.error('[main] FATAL: VERIFY_JWT=true but JWT_SECRET/JWT_SECRET_FILE is not set — refusing to start')
  throw new Error('JWT_SECRET required when VERIFY_JWT is enabled')
}

// Guard de env não resolvida: no runtime self-hosted, secrets ausentes podem chegar
// como 'MISSING__<NOME>'. Apenas avisamos no boot — não bloqueamos o boot.
for (const key of ['VERIFY_JWT', 'JWT_SECRET', 'JWT_SECRET_FILE']) {
  const value = Deno.env.get(key)
  if (value && value.startsWith('MISSING__')) {
    console.warn(`[main] WARNING: env var "${key}" não foi resolvida (valor começa com 'MISSING__'). Verifique as secrets do runtime self-hosted.`)
  }
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
  const secretKey = encoder.encode(JWT_SECRET!)
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

  // Funções na allowlist (PUBLIC_FNS) não exigem JWT mesmo com VERIFY_JWT=true.
  const isPublic = service_name ? PUBLIC_FNS.has(service_name) : false

  if (req.method !== 'OPTIONS' && VERIFY_JWT && !isPublic) {
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
      return new Response(JSON.stringify({ msg: 'Authorization failed' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

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
    return new Response(JSON.stringify({ msg: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
