import { createClient, User } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createZappAdminClient } from "./db-client.ts";

/**
 * Shared validation, security, and logging utilities for Edge Functions.
 * Provides input sanitization, rate limiting, structured logging, and standard error responses.
 */

// Re-export HMAC validation utilities
export { 
  verifyHmacSignature, 
  extractSignatureFromHeaders, 
  WebhookSecurityService, 
  createWebhookValidator 
} from './hmac-validation.ts';

// ─── Secret Sanitization (Bug 1 fix — never log secrets) ────────────────────

/**
 * Names of env vars whose values must NEVER appear in logs.
 * Inspired by the v6 hardening checklist (PROMPT_LOVABLE_ZAPPWEB_EVO_BITRIX).
 */
const SENSITIVE_ENV_NAMES = [
  'EVOLUTION_WEBHOOK_SECRET',
  'WEBHOOK_SECRET',
  'WEBHOOK_SHARED_SECRET',
  'BITRIX_WEBHOOK_URL',
  'BITRIX_CLIENT_SECRET',
  'BITRIX_PORTAL',
  'EVOLUTION_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

let _sensitiveValuesCache: string[] | null = null;
function getSensitiveValues(): string[] {
  if (_sensitiveValuesCache) return _sensitiveValuesCache;
  const out: string[] = [];
  for (const name of SENSITIVE_ENV_NAMES) {
    const v = Deno.env.get(name);
    // Only redact non-trivial values to avoid false positives (e.g. empty / "true").
    if (v && v.length >= 12) out.push(v);
  }
  // Sort longest first so substring matches do not partially mask shorter overlapping secrets.
  _sensitiveValuesCache = out.sort((a, b) => b.length - a.length);
  return _sensitiveValuesCache;
}

// ─── Generic PII / credential patterns ──────────────────────────────────────
// These catch leaks even when the value isn't a known env-var secret
// (e.g. user-supplied tokens echoed inside webhook payloads).
const PII_PATTERNS: ReadonlyArray<{ re: RegExp; replacement: string | ((m: string) => string) }> = [
  { re: /(authorization\s*[:=]\s*)(bearer|basic)\s+[A-Za-z0-9._\-+/=]+/gi, replacement: '$1$2 ***REDACTED***' },
  { re: /((?:x-)?api[_-]?key\s*[:=]\s*)["']?[A-Za-z0-9._\-]{16,}["']?/gi, replacement: '$1***REDACTED***' },
  { re: /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g, replacement: '***JWT_REDACTED***' },
  { re: /\/rest\/(\d+)\/[A-Za-z0-9]{20,}\b/g, replacement: '/rest/$1/***REDACTED***' },
  { re: /\b([A-Za-z0-9._%+\-]{1,64})@([A-Za-z0-9.\-]+\.[A-Za-z]{2,})\b/g, replacement: '***@$2' },
  { re: /\+?\d{8,15}\b/g, replacement: (m: string) => '***' + m.slice(-4) },
];

/** Redact known secret values + generic PII patterns from any string. */
export function redactSecrets(input: string): string {
  if (typeof input !== 'string' || input.length === 0) return input;
  let out = input;
  for (const secret of getSensitiveValues()) {
    if (out.includes(secret)) out = out.split(secret).join('***REDACTED***');
  }
  for (const { re, replacement } of PII_PATTERNS) {
    out = typeof replacement === 'string'
      ? out.replace(re, replacement)
      : out.replace(re, replacement);
  }
  return out;
}

/** Recursively redact secrets in any value (depth-limited to avoid runaway). */
function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 3 || value == null) return value;
  if (typeof value === 'string') return redactSecrets(value);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactDeep(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Test-only: clear the sensitive-values cache (for unit tests that mutate Deno.env). */
export function _resetSensitiveCacheForTests(): void {
  _sensitiveValuesCache = null;
}

// ─── Bitrix Origin Validation (Bug 2 fix — defense in depth) ────────────────

/** Result of a Bitrix24 origin header validation check. */
export interface OriginValidationResult {
  ok: boolean;
  reason?: string;
  origin?: string;
}

/**
 * Validate that a request originates from a Bitrix24 portal.
 * Accepts:
 *   - hostname matching `*.bitrix24.com.br` (Brazilian portals)
 *   - exact match against the BITRIX_PORTAL env var (when set)
 *
 * Defense in depth — pairs with HMAC/auth on the same endpoint. CORS already
 * blocks browser-initiated cross-origin requests; this closes the
 * server-to-server vector documented in the v6 runbook.
 */
export function validateBitrixOrigin(
  req: Request,
  allowedPortal: string | null = Deno.env.get('BITRIX_PORTAL') ?? null,
): OriginValidationResult {
  const origin = req.headers.get('origin');
  if (!origin) return { ok: false, reason: 'missing_origin' };

  // Exact portal match (e.g. https://promo-brindes.bitrix24.com.br)
  if (allowedPortal && origin === allowedPortal) return { ok: true, origin };

  let hostname: string;
  try {
    hostname = new URL(origin).hostname.toLowerCase();
  } catch {
    return { ok: false, reason: 'malformed_origin', origin };
  }

  // Strict suffix match — `fake-bitrix24.com.br.evil.com` must NOT pass.
  if (hostname === 'bitrix24.com.br' || hostname.endsWith('.bitrix24.com.br')) {
    return { ok: true, origin };
  }

  return { ok: false, reason: 'untrusted_origin', origin };
}

// ─── Structured Logger ───────────────────────────────────────────────────────

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  fn?: string;
  requestId?: string;
  [key: string]: unknown;
}

/** Structured logger for edge functions with context and timing */
export class Logger {
  private fn: string;
  private requestId: string;
  private startTime: number;

  constructor(functionName: string, req?: Request) {
    this.fn = functionName;
    // Honor inbound x-request-id header to enable end-to-end tracing across
    // client → edge function → DB. Falls back to a fresh short UUID.
    const inbound = req?.headers.get('x-request-id')?.trim();
    this.requestId = (inbound && inbound.length > 0 && inbound.length <= 64)
      ? inbound
      : crypto.randomUUID().slice(0, 8);
    this.startTime = Date.now();
  }

  /** Expose request id so handlers can stamp it on DB writes for tracing. */
  getRequestId(): string {
    return this.requestId;
  }

  private log(level: LogLevel, message: string, ctx?: Record<string, unknown>) {
    const safeMessage = redactSecrets(message);
    const safeCtx = ctx ? (redactDeep(ctx) as Record<string, unknown>) : undefined;
    const entry = {
      level,
      fn: this.fn,
      rid: this.requestId,
      ms: Date.now() - this.startTime,
      msg: safeMessage,
      ...(safeCtx ?? {}),
    };
    const serialized = redactSecrets(JSON.stringify(entry));
    if (level === 'error') console.error(serialized);
    else if (level === 'warn') console.warn(serialized);
    else console.log(serialized);
  }

  debug(msg: string, ctx?: Record<string, unknown>) { this.log('debug', msg, ctx); }
  info(msg: string, ctx?: Record<string, unknown>) { this.log('info', msg, ctx); }
  warn(msg: string, ctx?: Record<string, unknown>) { this.log('warn', msg, ctx); }
  error(msg: string, ctx?: Record<string, unknown>) { this.log('error', msg, ctx); }

  /** Log final response with duration */
  done(status: number, ctx?: Record<string, unknown>) {
    this.log(status >= 400 ? 'error' : 'info', `completed ${status}`, {
      status,
      durationMs: Date.now() - this.startTime,
      ...ctx,
    });
  }
}

const EXACT_ALLOWED_ORIGINS = new Set([
  'https://zapp.atomicabr.com.br',
  'https://pronto-talk-suite.lovable.app',
  'https://whats-your-line.lovable.app',
  'https://id-preview--22c0b518-7895-4f4f-9ea0-978457a2c37a.lovable.app',
  'https://id-preview--1d419c34-35ac-4a71-96a5-146ca1b3ebf2.lovable.app',
  'https://1d419c34-35ac-4a71-96a5-146ca1b3ebf2.lovableproject.com',
]);

const LOCAL_ORIGIN_PATTERNS = [
  /^http:\/\/localhost(?::\d{1,5})?$/,
  /^http:\/\/127\.0\.0\.1(?::\d{1,5})?$/,
  /^https:\/\/id-preview--[a-f0-9-]+\.lovable\.app$/,
  /^https:\/\/preview--[a-f0-9-]+\.lovable\.app$/,
  /^https:\/\/[a-f0-9-]+\.lovableproject\.com$/,
];

function isAllowedOrigin(origin: string): boolean {
  return EXACT_ALLOWED_ORIGINS.has(origin) || LOCAL_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

/** Merge comma-separated header values, normalizing casing and deduplicating tokens. */
export function mergeCsvHeaderValues(...values: Array<string | undefined>): string {
  const merged = new Set<string>()
  for (const value of values) {
    if (!value) continue
    for (const token of value.split(',')) {
      const normalized = token.trim().toLowerCase()
      if (normalized) merged.add(normalized)
    }
  }
  return Array.from(merged).join(', ')
}

/** Security headers applied to all responses */
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '0',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cache-Control': 'no-store',
};

/** Build CORS + security headers with origin validation */
export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get('origin') || '';
  const allowedOrigin = isAllowedOrigin(origin) ? origin : 'https://pronto-talk-suite.lovable.app';
  return {
    ...SECURITY_HEADERS,
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-hub-signature-256, x-signature, x-webhook-signature, x-evolution-signature, idempotency-key, x-idempotency-key, x-correlation-id, x-request-id',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/** @deprecated Use getCorsHeaders(req) for origin-validated CORS. Kept for backward compat — do NOT use in new code. */
export const corsHeaders = getCorsHeaders();

/** Standard JSON error response (with origin-validated CORS) */
export function errorResponse(message: string, status = 400, req?: Request) {
  const headers = req ? getCorsHeaders(req) : corsHeaders;
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...headers, 'Content-Type': 'application/json' } }
  );
}

/**
 * Standardized security error response for upload/scan flows.
 * Frontend can match on `code` to render specific UX (block, retry, quarantine).
 *
 * Shape: { error: true, code, message, verdict?, scanId?, details? }
 *
 * Conventional codes:
 *  - MALWARE_DETECTED  → 422 (verdict: 'malicious')
 *  - SUSPICIOUS_FILE   → 403 (verdict: 'suspicious')
 *  - SCAN_TIMEOUT      → 408 (verdict: 'unknown')
 *  - SCAN_UNAVAILABLE  → 502 (verdict: 'unknown')
 *  - INVALID_INPUT     → 400
 *  - UNAUTHORIZED      → 401
 *  - METHOD_NOT_ALLOWED→ 405
 *  - STORAGE_ERROR     → 500
 *  - INTERNAL_ERROR    → 500
 */
export type SecurityVerdict = 'clean' | 'malicious' | 'suspicious' | 'unknown';

/** Security Error Payload interface. */
export interface SecurityErrorPayload {
  code: string;
  message: string;
  verdict?: SecurityVerdict;
  scanId?: string | null;
  details?: Record<string, unknown>;
}

/** security Error Response function. */
export function securityErrorResponse(
  payload: SecurityErrorPayload,
  status: number,
  req?: Request,
) {
  const headers = req ? getCorsHeaders(req) : corsHeaders;
  const body = {
    error: true,
    code: payload.code,
    message: payload.message,
    verdict: payload.verdict ?? 'unknown',
    scanId: payload.scanId ?? null,
    ...(payload.details ? { details: payload.details } : {}),
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

/** Standard JSON success response (with origin-validated CORS) */
export function jsonResponse(data: unknown, status = 200, req?: Request) {
  const headers = req ? getCorsHeaders(req) : corsHeaders;
  return new Response(
    JSON.stringify(data),
    { status, headers: { ...headers, 'Content-Type': 'application/json' } }
  );
}

/** Standard Contract Validation Error Response (422) */
export function contractErrorResponse(
  code: string,
  message: string,
  issues: { path?: (string | number)[]; message?: string }[] = [],
  requestId?: string,
  req?: Request
) {
  const body = {
    error: true,
    code,
    message,
    requestId,
    fields: issues.map(i => i.path?.join('.') || 'root'),
    details: issues.map(i => ({
      path: i.path?.join('.') || 'root',
      message: i.message
    }))
  };
  const headers = req ? getCorsHeaders(req) : corsHeaders;
  return new Response(
    JSON.stringify(body),
    { status: 422, headers: { ...headers, 'Content-Type': 'application/json' } }
  );
}


/** Handle CORS preflight with origin validation */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  return null;
}

/** Sanitize string input — strip control chars, trim, enforce max length */
export function sanitizeString(input: unknown, maxLength = 10000): string | null {
  if (typeof input !== 'string') return null;
  // Remove control characters except newlines/tabs
  const cleaned = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  return cleaned.length > 0 ? cleaned.slice(0, maxLength) : null;
}

/** Validate UUID format */
export function isValidUUID(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** In-memory rate limiter (per-isolate, resets on cold start) with auto-cleanup */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
let lastCleanup = Date.now();

function cleanupRateLimitMap() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return; // Cleanup at most once per minute
  lastCleanup = now;
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}

/** check Rate Limit function. */
export function checkRateLimit(
  key: string,
  maxRequests = 30,
  windowMs = 60_000
): { allowed: boolean; remaining: number } {
  cleanupRateLimitMap();
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  entry.count++;
  const remaining = Math.max(0, maxRequests - entry.count);
  return { allowed: entry.count <= maxRequests, remaining };
}

/** Extract and normalize client IP from request for rate limiting (C.14: IPv6 support) */
export function getClientIP(req: Request): string {
  // Prefer x-real-ip (set by Supabase's infrastructure proxy, not client-controllable).
  // Fall back to the RIGHTMOST x-forwarded-for entry — the leftmost is appended by the
  // client and is fully attacker-controlled (reading it allows rate-limit bypass by
  // cycling fake IPs).
  const raw =
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ||
    'unknown';

  // Normalize IPv6 addresses to lowercase canonical form to prevent rate-limit bypass
  // via different representations (e.g., 2001:db8::1 vs 2001:0db8::0001)
  if (raw !== 'unknown' && raw.includes(':')) {
    try {
      // Parse as IPv6 and convert to canonical string representation
      const hostname = new URL(`http://[${raw}]/`).hostname || raw;
      // Remove brackets that URL.hostname includes for IPv6 addresses
      return hostname.startsWith('[') && hostname.endsWith(']')
        ? hostname.slice(1, -1)
        : hostname;
    } catch {
      // If parsing fails, return as-is (might be malformed or IPv4)
      return raw;
    }
  }
  return raw;
}

/** Get required env var or throw */
/**
 * Require an environment variable to be set and non-empty.
 * Throws with detailed error message if missing or blank.
 *
 * Usage:
 *   const supabaseUrl = requireEnv('SUPABASE_URL', 'https://');
 *   const apiKey = requireEnv('API_KEY');
 */
export function requireEnv(
  name: string,
  expectedPattern?: string | RegExp
): string {
  const value = Deno.env.get(name);

  if (!value || value.trim() === '') {
    throw new Error(
      `[Configuration Error] Environment variable "${name}" is required but not configured. ` +
      `Please set it in your .env or deployment configuration.`
    );
  }

  // Optional pattern validation (e.g., URL prefix, format)
  if (expectedPattern) {
    const pattern = typeof expectedPattern === 'string'
      ? expectedPattern
      : expectedPattern.toString();

    if (expectedPattern instanceof RegExp) {
      if (!expectedPattern.test(value)) {
        throw new Error(
          `[Configuration Error] Environment variable "${name}" does not match expected format. ` +
          `Expected pattern: ${pattern}, got: ${redactSecrets(value)}`
        );
      }
    } else if (typeof expectedPattern === 'string') {
      if (!value.startsWith(expectedPattern)) {
        throw new Error(
          `[Configuration Error] Environment variable "${name}" does not start with expected value "${expectedPattern}". ` +
          `Got: ${redactSecrets(value)}`
        );
      }
    }
  }

  return value;
}

/**
 * Validate multiple environment variables at module load time.
 * Fails fast if any required env var is missing.
 *
 * Usage:
 *   validateEnvironment({
 *     'SUPABASE_URL': /^https:\/\//,
 *     'SUPABASE_SERVICE_ROLE_KEY': undefined, // no pattern validation
 *     'EVOLUTION_API_KEY': /^[a-zA-Z0-9]{32,}$/,
 *   });
 */
export function validateEnvironment(
  envVars: Record<string, RegExp | string | undefined>
): Record<string, string> {
  const validated: Record<string, string> = {};
  const errors: string[] = [];

  for (const [name, pattern] of Object.entries(envVars)) {
    try {
      validated[name] = requireEnv(name, pattern);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `[Configuration Error] ${errors.length} environment variable(s) are not properly configured:\n` +
      errors.map(e => `  • ${e}`).join('\n')
    );
  }

  return validated;
}

/**
 * Validates that the caller has one of the required roles.
 * Returns the caller's user object if authorized, otherwise throws an error response.
 */
export async function authorizeRoles(
  req: Request,
  supabaseUrl: string,
  supabaseAnonKey: string,
  requiredRoles: string[] = ['admin', 'dev']
): Promise<{ user: User; roles: string[] }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw { message: "Não autorizado", status: 401 };

  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
  if (authError || !user) throw { message: "Não autorizado", status: 401 };

  // Fetch user roles using service role to bypass RLS for checking
  const adminClient = createZappAdminClient();
  
  const { data: roleData, error: roleError } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (roleError) throw { message: "Erro ao verificar permissões", status: 500 };

  const userRoles = (roleData || []).map(r => r.role);
  const isAuthorized = userRoles.some(role => requiredRoles.includes(role)) || userRoles.includes('dev');

  if (!isAuthorized) {
    // Log unauthorized attempt to the database via RPC
    await adminClient.rpc('log_security_event', {
      p_event_type: 'unauthorized_api_call',
      p_resource: new URL(req.url).pathname,
      p_action: req.method,
      p_status: 'denied',
      p_details: { user_id: user.id, required_roles: requiredRoles, current_roles: userRoles }
    });
    
    throw { message: "Acesso negado: permissão insuficiente", status: 403 };
  }

  return { user, roles: userRoles };
}

// ─── parseBody + CommonSchemas + z (migrado de validation-legacy.ts em v2.2) ─
// Antes vivia só no arquivo -legacy; movido para cá para permitir a remoção
// definitiva do legacy e destravar novos consumidores sem duplicar helpers.
/** Re-exported module members. */
export { z } from './schemas.ts';
import { z as _z } from './schemas.ts';

/** Parse Success interface definition. */
export interface ParseSuccess<T> { data: T; error: null; }
/** Parse Failure interface definition. */
export interface ParseFailure { data: null; error: Response; }
/** Parse Result type alias. */
export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

/** Parse JSON body and validate via Zod schema. Returns { data, error } discriminated union. */
export async function parseBody<T>(req: Request, schema: _z.ZodSchema<T>): Promise<ParseResult<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { data: null, error: errorResponse('Invalid JSON body', 400, req) };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      data: null,
      error: errorResponse(
        'Validation failed: ' + result.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
        400,
        req
      ),
    };
  }
  return { data: result.data, error: null };
}

/** Common Schemas constant. */
export const CommonSchemas = {
  uuid: _z.string().uuid(),
  nonEmpty: _z.string().min(1).trim(),
} as const;



