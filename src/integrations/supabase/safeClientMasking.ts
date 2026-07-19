const SENSITIVE_KEYS = new Set([
  'password',
  'senha',
  'secret',
  'token',
  'api_key',
  'apikey',
  'api-key',
  'access_token',
  'refresh_token',
  'private_key',
  'auth_token',
  'authorization',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
  'bearer',
]);
const PARTIAL_KEYS = new Set(['email', 'e-mail', 'e_mail']);
const LONG_TOKEN_PATTERN = /^[A-Za-z0-9+/=._-]{40,}$/;

/** apply Masking. */
export function applyMasking(str: string): string {
  if (str.length > 30 && (str.includes('.') || /^[a-zA-Z0-9_-]+$/.test(str))) {
    return str.substring(0, 5) + '...' + str.substring(str.length - 5);
  }
  return str;
}

/** mask Email. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***@' + (local || '');
  const masked = local.length > 2 ? local.slice(0, 2) + '***' : '***';
  return `${masked}@${domain}`;
}

function maskValue(key: string, value: unknown): unknown {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return maskAny(value as Record<string, unknown> | unknown[]);
  }
  const k = key.toLowerCase();
  if (SENSITIVE_KEYS.has(k)) return '***MASKED***';
  if (PARTIAL_KEYS.has(k) && typeof value === 'string') return maskEmail(value);
  if (typeof value === 'string' && LONG_TOKEN_PATTERN.test(value)) return '***TOKEN***';
  return value;
}

function maskAny(
  d: Record<string, unknown> | unknown[] | null | undefined
): Record<string, unknown> | unknown[] {
  if (Array.isArray(d)) return d.map((item) => maskAny(item as Record<string, unknown>));
  if (!d || typeof d !== 'object') return {} as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(d as Record<string, unknown>).map(([k, v]) => [k, maskValue(k, v)])
  );
}

/** mask Sensitive Data. */
export function maskSensitiveData(
  data: Record<string, unknown> | unknown[]
): Record<string, unknown> | unknown[] {
  return maskAny(data);
}
