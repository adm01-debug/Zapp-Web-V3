/**
 * HMAC Webhook Signature Validation
 *
 * Provides secure validation of webhook payloads using HMAC-SHA256.
 * Uses Web Crypto API for cryptographic operations and implements
 * constant-time comparison to prevent timing attacks.
 */
import { timingSafeStringEqual } from "./auth.ts";

/**
 * Validates HMAC-SHA256 signature of a webhook payload.
 * 
 * @param payload - Raw request body as string
 * @param signature - Signature from webhook header (hex-encoded or with 'sha256=' prefix)
 * @param secret - Shared secret key
 * @returns true if signature is valid
 */
export async function verifyHmacSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!payload || !signature || !secret) {
    return false;
  }

  try {
    // Remove 'sha256=' prefix if present (common in GitHub-style webhooks)
    const normalizedSignature = signature.toLowerCase().replace(/^sha256=/, '');

    // Convert secret to key
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    // Compute expected signature
    const payloadBytes = encoder.encode(payload);
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, payloadBytes);
    
    // Convert to hex string
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Constant-time comparison
    return timingSafeEqual(expectedSignature, normalizedSignature);
  } catch (error) {
    console.error('[HMAC] Signature verification error:', error);
    return false;
  }
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 * Compares strings in constant time regardless of where they differ.
 */
/** Re-export canonical TextEncoder-based constant-time comparison from auth.ts. */
export const timingSafeEqual = timingSafeStringEqual;

/**
 * Extracts signature from request headers.
 * Supports multiple common header formats.
 */
export function extractSignatureFromHeaders(headers: Headers): string | null {
  // Try common webhook signature headers in order of precedence
  const signatureHeaders = [
    'x-hub-signature-256',    // GitHub-style
    'x-signature',            // Generic
    'x-webhook-signature',    // Alternative
    'x-evolution-signature',  // Evolution API specific
    'x-api-signature',        // API Gateway style
  ];

  for (const header of signatureHeaders) {
    const value = headers.get(header);
    if (value) {
      return value;
    }
  }

  return null;
}

/**
 * Extracts a plaintext shared-secret bearer from request headers.
 *
 * Some producers cannot compute a per-request HMAC and instead send a static
 * shared secret (e.g. Evolution API's native webhook only supports static
 * headers). This reads those headers so the validator can authenticate them
 * via a constant-time equality check against the configured secret(s).
 */
export function extractSharedSecretFromHeaders(headers: Headers): string | null {
  const sharedSecretHeaders = [
    'x-webhook-secret',   // Evolution API native webhook / RabbitMQ consumer
    'x-webhook-token',    // Alternative
  ];

  for (const header of sharedSecretHeaders) {
    const value = headers.get(header);
    if (value) {
      return value;
    }
  }

  return null;
}

/**
 * WebhookSecurityService - Comprehensive webhook security validation.
 *
 * Supports multi-secret rotation: when constructed with an array of secrets,
 * a request is considered authentic if ANY secret in the array validates its
 * signature. Use this to roll a webhook secret without downtime:
 *
 *   1. Deploy with `[newSecret, oldSecret]` — validates both.
 *   2. Update the signing side (Evolution / external producer) to `newSecret`.
 *   3. Once all traffic uses `newSecret`, deploy with `[newSecret]` only.
 *
 * Single-secret constructor is preserved for backwards compatibility.
 *
 * Usage:
 * ```typescript
 * const security = new WebhookSecurityService('my-secret');
 * // or with rotation:
 * const security = new WebhookSecurityService(['new', 'old'], true);
 * ```
 */
export class WebhookSecurityService {
  private secrets: string[];
  private strictMode: boolean;
  private allowSharedSecret: boolean;

  /**
   * @param secret - HMAC secret (string) or list of secrets (rotation). Empty
   *                strings are filtered out so an unset env var doesn't add a
   *                permanently-failing slot.
   * @param strictMode - If true, rejects requests without signatures. Default: false
   * @param allowSharedSecret - If true, also authenticates requests that present
   *                a valid plaintext shared secret in `x-webhook-secret`
   *                (constant-time compared against the configured secrets), in
   *                addition to HMAC signatures. This is what lets producers that
   *                cannot sign per-request (Evolution's native webhook) pass
   *                strict mode. HMAC is always preferred and checked first.
   *                Default: true.
   */
  constructor(secret: string | string[], strictMode = false, allowSharedSecret = true) {
    const arr = Array.isArray(secret) ? secret : [secret];
    this.secrets = arr.filter((s): s is string => typeof s === 'string' && s.length > 0);
    this.strictMode = strictMode;
    this.allowSharedSecret = allowSharedSecret;
  }

  /** Constant-time check of a plaintext shared secret against every configured secret. */
  private sharedSecretMatches(candidate: string): boolean {
    let matched = false;
    for (const secret of this.secrets) {
      // timingSafeEqual short-circuits on length mismatch but never leaks which
      // secret matched; OR-accumulate so we always scan the full list.
      matched = timingSafeEqual(candidate, secret) || matched;
    }
    return matched;
  }

  /**
   * Validates webhook request signature and returns parsed payload.
   */
  async validateRequest(req: Request): Promise<{
    valid: boolean;
    payload: string | null;
    error?: string;
    signatureFound: boolean;
    signatureValid: boolean;
    sharedSecretValid?: boolean;
  }> {
    const signature = extractSignatureFromHeaders(req.headers);
    const signatureFound = signature !== null;
    const sharedSecret = this.allowSharedSecret
      ? extractSharedSecretFromHeaders(req.headers)
      : null;
    const sharedSecretFound = sharedSecret !== null;

    // Read body
    let payload: string;
    try {
      payload = await req.text();
    } catch (error) {
      return {
        valid: false,
        payload: null,
        error: 'Failed to read request body',
        signatureFound,
        signatureValid: false,
      };
    }

    // No HMAC signature: try the shared-secret bearer path before falling back
    // to strict/non-strict handling. A shared secret that is present but wrong
    // is always rejected (the caller claimed auth and failed), regardless of
    // strict mode.
    if (!signatureFound && sharedSecretFound) {
      if (this.secrets.length > 0 && this.sharedSecretMatches(sharedSecret!)) {
        console.info('[HMAC] Authenticated via shared-secret bearer (x-webhook-secret)');
        return {
          valid: true,
          payload,
          signatureFound: false,
          signatureValid: false,
          sharedSecretValid: true,
        };
      }
      console.warn('[HMAC] Invalid shared secret received');
      return {
        valid: false,
        payload,
        error: 'Invalid webhook shared secret',
        signatureFound: false,
        signatureValid: false,
        sharedSecretValid: false,
      };
    }

    // If no signature (and no shared secret) and strict mode, reject
    if (!signatureFound && this.strictMode) {
      console.warn('[HMAC] Strict mode: rejecting request without signature');
      return {
        valid: false,
        payload,
        error: 'Missing webhook signature',
        signatureFound: false,
        signatureValid: false,
      };
    }

    // If no signature and not strict mode, allow (for backwards compatibility)
    if (!signatureFound) {
      console.info('[HMAC] No signature found, allowing request (non-strict mode)');
      return {
        valid: true,
        payload,
        signatureFound: false,
        signatureValid: false,
      };
    }

    // Validate signature against each configured secret. The first match wins.
    // Tries them sequentially to keep timing differences below the noise of
    // the network jitter (constant-time per-secret, but loop bails early on
    // success — acceptable trade-off for rotation support).
    let signatureValid = false;
    let matchedSlot = -1;
    for (let i = 0; i < this.secrets.length; i++) {
      if (await verifyHmacSignature(payload, signature, this.secrets[i])) {
        signatureValid = true;
        matchedSlot = i;
        break;
      }
    }

    if (!signatureValid) {
      console.warn('[HMAC] Invalid signature received');
      return {
        valid: false,
        payload,
        error: 'Invalid webhook signature',
        signatureFound: true,
        signatureValid: false,
      };
    }

    if (this.secrets.length > 1) {
      // Slot 0 is the primary; >0 means a rotation-tail secret was used. Log
      // so ops can monitor when it's safe to drop the old secret.
      console.info(`[HMAC] Signature validated successfully (slot=${matchedSlot}${matchedSlot === 0 ? ' primary' : ' rotation-tail'})`);
    } else {
      console.info('[HMAC] Signature validated successfully');
    }
    return {
      valid: true,
      payload,
      signatureFound: true,
      signatureValid: true,
    };
  }

  /**
   * Creates a signature for a payload using the primary (first) secret. Useful
   * for outgoing webhooks and tests. When rotating, signing always uses slot 0.
   */
  async signPayload(payload: string): Promise<string> {
    if (this.secrets.length === 0) {
      throw new Error('No secret configured — cannot sign payload');
    }
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.secrets[0]);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const payloadBytes = encoder.encode(payload);
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, payloadBytes);

    const signature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return `sha256=${signature}`;
  }
}

/**
 * Creates a webhook security middleware for Deno serve handlers.
 * 
 * Usage:
 * ```typescript
 * const validateWebhook = createWebhookValidator(Deno.env.get('WEBHOOK_SECRET')!);
 * 
 * serve(async (req) => {
 *   const validation = await validateWebhook(req);
 *   if (!validation.valid) {
 *     return new Response(validation.error, { status: 401 });
 *   }
 *   const payload = JSON.parse(validation.payload!);
 *   // ... handle webhook
 * });
 * ```
 */
export function createWebhookValidator(secret: string | string[], strictMode = false, allowSharedSecret = true) {
  const service = new WebhookSecurityService(secret, strictMode, allowSharedSecret);
  return (req: Request) => service.validateRequest(req);
}

/**
 * Reads webhook secrets from environment, supporting rotation via a
 * comma-separated list. The first non-empty entry is the primary secret;
 * subsequent ones are accepted but logged as `rotation-tail` matches.
 *
 * Variables tried (first non-empty wins):
 *   - <BASE>_SECRETS  — comma-separated list (e.g. "newSecret,oldSecret")
 *   - <BASE>_SECRET   — single secret (legacy)
 *
 * @param base env-var prefix, e.g. "EVOLUTION_WEBHOOK"
 */
export function readWebhookSecretsFromEnv(base: string): string[] {
  const env = (typeof Deno !== 'undefined' && Deno.env)
    ? (k: string) => Deno.env.get(k) ?? ''
    : () => '';
  const list = env(`${base}_SECRETS`);
  if (list) {
    return list.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  }
  const single = env(`${base}_SECRET`);
  return single ? [single] : [];
}
