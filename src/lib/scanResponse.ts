/**
 * Centralized parser for security-scanner Edge Function responses.
 *
 * Backend contract (file-security-scanner / secure-upload):
 *   Success: { success: true, verdict: "clean", scanId, message, path, url? }
 *   Error:   { error: true, code, message, verdict, scanId?, details? }
 *
 * This module normalizes:
 *   1. Successful invocations (data.success === true).
 *   2. Failed invocations where Supabase populates `error` and the body
 *      with `code` is buried in `error.context.response`.
 *   3. Network/parse failures (no body at all).
 *
 * UI layer should consume only the normalized `ScanResult`.
 */

export type ScanCode =
  | 'MALWARE_DETECTED'
  | 'SUSPICIOUS_FILE'
  | 'SCAN_TIMEOUT'
  | 'SCAN_UNAVAILABLE'
  | 'INVALID_INPUT'
  | 'UNAUTHORIZED'
  | 'METHOD_NOT_ALLOWED'
  | 'STORAGE_ERROR'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

/** Scan Verdict type alias. */
export type ScanVerdict = 'clean' | 'malicious' | 'suspicious' | 'unknown';

/** Scan Success interface definition. */
export interface ScanSuccess {
  status: 'success';
  verdict: 'clean';
  scanId: string | null;
  message: string;
  payload: Record<string, unknown>;
}

/** Scan Error interface definition. */
export interface ScanError {
  status: 'error';
  code: ScanCode;
  message: string;
  verdict: ScanVerdict;
  scanId: string | null;
  details?: Record<string, unknown>;
}

/** Scan Result type alias. */
export type ScanResult = ScanSuccess | ScanError;

/** Block the upload entirely — file must not be retried as-is. */
export type BlockingScanError = ScanError & { code: 'MALWARE_DETECTED' | 'SUSPICIOUS_FILE' };
/** Returns true when the scan result is a blocking error (malware or suspicious) that must not be retried as-is. */
export function isBlocking(r: ScanResult): r is BlockingScanError {
  return r.status === 'error' && (r.code === 'MALWARE_DETECTED' || r.code === 'SUSPICIOUS_FILE');
}

/** Caller may retry the same operation. */
export type RetryableScanError = ScanError & {
  code: 'SCAN_TIMEOUT' | 'SCAN_UNAVAILABLE' | 'NETWORK_ERROR';
};
/** Returns true when the scan result is a transient error that the caller may safely retry without changing the request. */
export function isRetryable(r: ScanResult): r is RetryableScanError {
  return (
    r.status === 'error' &&
    (r.code === 'SCAN_TIMEOUT' || r.code === 'SCAN_UNAVAILABLE' || r.code === 'NETWORK_ERROR')
  );
}

/** Bad input — caller should change the request, not retry as-is. */
export type InputScanError = ScanError & { code: 'INVALID_INPUT' | 'METHOD_NOT_ALLOWED' };
/** Returns true when the scan error was caused by bad input; the caller should fix the request rather than retry as-is. */
export function isInputError(r: ScanResult): r is InputScanError {
  return r.status === 'error' && (r.code === 'INVALID_INPUT' || r.code === 'METHOD_NOT_ALLOWED');
}

/**
 * Custom Error type used to bubble a ScanResult up through Promise rejections
 * without losing the structured information.
 */
export class ScanBlockedError extends Error {
  readonly result: ScanResult;
  constructor(result: ScanResult) {
    super(result.status === 'error' ? result.message : 'Scan error');
    this.name = 'ScanBlockedError';
    this.result = result;
  }
}

const BACKEND_CODES = new Set<ScanCode>([
  'MALWARE_DETECTED',
  'SUSPICIOUS_FILE',
  'SCAN_TIMEOUT',
  'SCAN_UNAVAILABLE',
  'INVALID_INPUT',
  'UNAUTHORIZED',
  'METHOD_NOT_ALLOWED',
  'STORAGE_ERROR',
  'INTERNAL_ERROR',
]);

/** Casts an unknown value to a known ScanCode if it is in the backend allowlist, or returns 'UNKNOWN'. */
function asScanCode(v: unknown): ScanCode {
  if (typeof v === 'string' && BACKEND_CODES.has(v as ScanCode)) return v as ScanCode; // ignore-audit: BACKEND_CODES.has() guard confirms v is a valid ScanCode member
  return 'UNKNOWN';
}

/** Coerces an unknown value to a ScanVerdict, returning 'unknown' for any unrecognised string. */
function asVerdict(v: unknown): ScanVerdict {
  return v === 'clean' || v === 'malicious' || v === 'suspicious' || v === 'unknown'
    ? v
    : 'unknown';
}

/** Returns v as a non-empty scan ID string, or null if the value is missing or empty. */
function asScanId(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Parses a raw response body object into a ScanResult, returning null when the body lacks both success and error markers. */
function fromBody(body: Record<string, unknown> | null | undefined): ScanResult | null {
  if (!body || typeof body !== 'object') return null;

  if (body.success === true) {
    return {
      status: 'success',
      verdict: 'clean',
      scanId: asScanId(body.scanId),
      message: typeof body.message === 'string' ? body.message : 'Operação concluída com sucesso.',
      payload: body,
    };
  }

  if (body.error === true || typeof body.code === 'string') {
    return {
      status: 'error',
      code: asScanCode(body.code),
      message:
        typeof body.message === 'string'
          ? body.message
          : 'Falha no processamento do arquivo.',
      verdict: asVerdict(body.verdict),
      scanId: asScanId(body.scanId),
      details:
        typeof body.details === 'object' && body.details !== null
          ? (body.details as Record<string, unknown>)
          : undefined,
    };
  }

  return null;
}

/**
 * Body of a Supabase FunctionsHttpError lives in `error.context` (a Response).
 * We clone before reading so the caller can still consume the original.
 */
async function readBodyFromInvokeError(
  error: unknown,
): Promise<Record<string, unknown> | null> {
  if (!error || typeof error !== 'object') return null;
  const ctx = (error as { context?: unknown }).context;
  if (!ctx) return null;

  if (typeof Response !== 'undefined' && ctx instanceof Response) {
    try {
      const cloned = ctx.clone();
      const text = await cloned.text();
      if (!text) return null;
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  if (typeof ctx === 'object') return ctx as Record<string, unknown>; // ignore-audit: typeof guard confirms ctx is an object; cast safely narrows to Record<string, unknown>
  return null;
}

/**
 * Normalize a `supabase.functions.invoke` result into a `ScanResult`.
 * Always resolves — never throws — so callers can use a single switch.
 */
export async function parseScanInvocation(args: {
  data: Record<string, unknown> | null | undefined;
  error: unknown;
}): Promise<ScanResult> {
  const { data, error } = args;

  // 1. Direct body — most success paths land here.
  const fromData = fromBody(data ?? null);
  if (fromData) return fromData;

  // 2. Body buried inside FunctionsHttpError.
  if (error) {
    const body = await readBodyFromInvokeError(error);
    const fromErrBody = fromBody(body);
    if (fromErrBody) return fromErrBody;

    // 3. Transport error — no parseable body.
    const message =
      (error as { message?: string }).message ?? 'Falha de comunicação com o servidor.';
    return {
      status: 'error',
      code: 'NETWORK_ERROR',
      message,
      verdict: 'unknown',
      scanId: null,
    };
  }

  // 4. No data, no error — degenerate case.
  return {
    status: 'error',
    code: 'UNKNOWN',
    message: 'Resposta inválida do servidor.',
    verdict: 'unknown',
    scanId: null,
  };
}
