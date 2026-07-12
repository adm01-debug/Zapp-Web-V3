const ALLOWED_ORIGINS = [
  'https://nexus.promobrindes.com.br',
  'https://app.promobrindes.com.br',
  'https://promobrindes.com.br',
  'https://zapp.atomicabr.com.br',
  'https://atomicabr.com.br',
  'https://lovable.dev',
  'https://supabase.com',
  // Produção/alias Vercel do app (o pattern abaixo só cobre previews -git-…-juca1).
  // Sem estes, o fail-closed bloqueia o app servido nessas origens (mesmas listadas
  // em evolution-credentials). Auditoria 2026-07-12 (Codex P1).
  'https://zapp-web-v3.vercel.app',
  'https://zapp-web-v3-juca1.vercel.app',
];
const ALLOWED_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/.*\.lovable\.dev$/,
  /^https:\/\/.*\.supabase\.co$/,
  /^https:\/\/.*\.promobrindes\.com\.br$/,
  /^https:\/\/.*\.atomicabr\.com\.br$/,
  /^https:\/\/zapp-web-v3-git-[a-z0-9-]+-juca1\.vercel\.app$/,
];
const ALLOWED_HEADERS = [
  'authorization', 'x-client-info', 'apikey', 'content-type',
  'x-api-key', 'x-request-id',
  'idempotency-key', 'x-idempotency-key',
  'x-hub-signature-256',
].join(', ');
const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';

export function getCorsHeaders(req: Request): Record<string, string> {
  const requestOrigin = req.headers.get('Origin') ?? '';
  // Use value from static array (not user input) to avoid reflected-origin taint path.
  const exactMatch = ALLOWED_ORIGINS.find((allowed) => allowed === requestOrigin);
  // Pattern-matched origins (localhost, dev previews) echo the validated requestOrigin back.
  // For unrecognized origins: omit ACAO entirely. Never send 'null' — sandboxed iframes and
  // file:// pages serialize their origin as the literal string "null", so ACAO: null would
  // inadvertently grant them access.
  const patternMatch = !exactMatch && ALLOWED_PATTERNS.some((p) => p.test(requestOrigin));
  const allowedOrigin: string | null = exactMatch ?? (patternMatch ? requestOrigin : null);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (allowedOrigin !== null) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
  }
  return headers;
}

export function handleCorsPreflight(req: Request): Response {
  return new Response(null, { status: 204, headers: getCorsHeaders(req) });
}

export function jsonResponse(req: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

export function errorResponse(
  req: Request,
  msg: string,
  status = 400,
  details?: Record<string, unknown>,
): Response {
  return jsonResponse(req, { error: msg, ...(details || {}) }, status);
}