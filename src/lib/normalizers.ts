/**
 * Utilitários para normalizar payloads do backend em que colunas nullable (string|null,
 * number|null, boolean|null) precisam ser coeridas para os tipos exigidos pelos componentes.
 *
 * Regras:
 *  - `nn(value, fallback)`         → aplica fallback quando null/undefined
 *  - `strOrEmpty` / `boolOrFalse`  → helpers específicos
 *  - normalizers dedicados para entidades usadas em múltiplos componentes.
 */

/** nn constant. */
export const nn = <T>(value: T | null | undefined, fallback: T): T =>
  value === null || value === undefined ? fallback : value;

/** Coerces a nullable string to a non-null string, returning `''` when the value is null or undefined. */
export const strOrEmpty = (v: string | null | undefined): string => v ?? '';
/** Coerces a nullable boolean to a non-null boolean, returning `false` when the value is null or undefined. */
export const boolOrFalse = (v: boolean | null | undefined): boolean => v ?? false;
/** Coerces a nullable number to a non-null number, returning `0` when the value is null or undefined. */
export const numOrZero = (v: number | null | undefined): number => v ?? 0;

// ---------- Payment Links ----------
/** Normalized Payment Link interface definition. */
export interface NormalizedPaymentLink {
  id: string;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  status: string;
  payment_method: string;
  payment_url: string | null;
  contact_id: string | null;
  paid_at: string | null;
  expires_at: string | null;
  created_at: string;
}

/** normalize Payment Link function. */
export function normalizePaymentLink(row: Record<string, unknown>): NormalizedPaymentLink {
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    description: (row.description as string | null) ?? null,
    amount: numOrZero(row.amount as number | null),
    currency: strOrEmpty(row.currency as string | null) || 'BRL',
    status: strOrEmpty(row.status as string | null) || 'active',
    payment_method: strOrEmpty(row.payment_method as string | null) || 'pix',
    payment_url: (row.payment_url as string | null) ?? null,
    contact_id: (row.contact_id as string | null) ?? null,
    paid_at: (row.paid_at as string | null) ?? null,
    expires_at: (row.expires_at as string | null) ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

// ---------- Blocked IPs ----------
/** Normalized Blocked I P interface definition. */
export interface NormalizedBlockedIP {
  id: string;
  ip_address: string;
  reason: string;
  blocked_at: string;
  expires_at: string | null;
  is_permanent: boolean;
  request_count: number;
  last_attempt_at: string | null;
}

/** normalize Blocked I P function. */
export function normalizeBlockedIP(row: Record<string, unknown>): NormalizedBlockedIP {
  return {
    id: String(row.id ?? ''),
    ip_address: strOrEmpty(row.ip_address as string | null),
    reason: strOrEmpty(row.reason as string | null),
    blocked_at: String(row.blocked_at ?? new Date().toISOString()),
    expires_at: (row.expires_at as string | null) ?? null,
    is_permanent: boolOrFalse(row.is_permanent as boolean | null),
    request_count: numOrZero(row.request_count as number | null),
    last_attempt_at: (row.last_attempt_at as string | null) ?? null,
  };
}

// ---------- Security Alerts ----------
/** Normalized Security Alert interface definition. */
export interface NormalizedSecurityAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string | null;
  ip_address: string | null;
  created_at: string;
  is_resolved: boolean;
}

/** normalize Security Alert function. */
export function normalizeSecurityAlert(row: Record<string, unknown>): NormalizedSecurityAlert {
  return {
    id: String(row.id ?? ''),
    alert_type: strOrEmpty(row.alert_type as string | null),
    severity: strOrEmpty(row.severity as string | null) || 'medium',
    title: strOrEmpty(row.title as string | null),
    description: (row.description as string | null) ?? null,
    ip_address: (row.ip_address as string | null) ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    is_resolved: boolOrFalse(row.is_resolved as boolean | null),
  };
}

// ---------- Devices / Sessions ----------
/** Normalized User Device interface definition. */
export interface NormalizedUserDevice {
  id: string;
  device_name: string;
  browser: string;
  os: string;
  ip_address: string;
  is_trusted: boolean;
  last_seen_at: string;
}

/** normalize User Device function. */
export function normalizeUserDevice(row: Record<string, unknown>): NormalizedUserDevice {
  return {
    id: String(row.id ?? ''),
    device_name: strOrEmpty(row.device_name as string | null) || 'Dispositivo',
    browser: strOrEmpty(row.browser as string | null) || 'Desconhecido',
    os: strOrEmpty(row.os as string | null) || 'Desconhecido',
    ip_address: strOrEmpty(row.ip_address as string | null),
    is_trusted: boolOrFalse(row.is_trusted as boolean | null),
    last_seen_at: String(row.last_seen_at ?? new Date().toISOString()),
  };
}

/** Normalized User Session interface definition. */
export interface NormalizedUserSession {
  id: string;
  device_id: string;
  ip_address: string;
  started_at: string;
}

/** normalize User Session function. */
export function normalizeUserSession(row: Record<string, unknown>): NormalizedUserSession {
  return {
    id: String(row.id ?? ''),
    device_id: strOrEmpty(row.device_id as string | null),
    ip_address: strOrEmpty(row.ip_address as string | null),
    started_at: String(row.started_at ?? new Date().toISOString()),
  };
}
