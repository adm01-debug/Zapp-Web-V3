const ALLOWED_ORIGINS = [
  'https://nexus.promobrindes.com.br',
  'https://app.promobrindes.com.br',
  'https://promobrindes.com.br',
  'https://zapp.atomicabr.com.br',
  'https://atomicabr.com.br',
  'https://lovable.dev',
  'https://supabase.com',
];
const ALLOWED_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/.*\.lovable\.dev$/,
  /^https:\/\/.*\.supabase\.co$/,
  /^https:\/\/.*\.promobrindes\.com\.br$/,
  /^https:\/\/.*\.atomicabr\.com\.br$/,
  /^https:\/\/zapp-web-v3[a-z0-9-]+-juca1\.vercel\.app$/,
];
const ALLOWED_HEADERS = [
  'authorization', 'x-client-info', 'apikey', 'content-type',
  'x-api-key', 'x-request-id',
  'idempotency-key', 'x-idempotency-key',
  'x-hub-signature-256',
].join(', ');
const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';

function isOriginAllowed(o: string): boolean {
  if (!o) return false;
  if (ALLOWED_ORIGINS.includes(o)) return true;
  return ALLOWED_PATTERNS.some((p) => p.test(o));
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const o = req.headers.get('Origin');
  if (o && isOriginAllowed(o)) {
    return {
      'Access-Control-Allow-Origin': o,
      'Access-Control-Allow-Headers': ALLOWED_HEADERS,
      'Access-Control-Allow-Methods': ALLOWED_METHODS,
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
  }
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Vary': 'Origin',
  };
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
