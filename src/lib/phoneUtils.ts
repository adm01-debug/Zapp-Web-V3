/**
 * phoneUtils.ts — v2.0
 * Brazilian phone number utilities for ZAPP WEB.
 * Used by: ContactFormModal, useDuplicateDetector, csvUtils, evolution-webhook
 *
 * Features:
 * - 67 valid DDDs
 * - 9th digit handling (mobile numbers in Brazil)
 * - WhatsApp JID parsing (55{phone}@c.us, @g.us, @s.whatsapp.net)
 * - Display formatting with mask
 * - Flexible matching (with/without 9th digit)
 */

// ── Valid Brazilian DDDs (area codes) ─────────────────────────────────────

/** Set of all valid Brazilian DDD area codes accepted by the phone normaliser. */
export const VALID_DDDS = new Set<number>([
  // São Paulo + ABCD
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  // Rio de Janeiro + Espírito Santo
  21, 22, 24, 27, 28,
  // Minas Gerais
  31, 32, 33, 34, 35, 37, 38,
  // Paraná
  41, 42, 43, 44, 45, 46,
  // Santa Catarina
  47, 48, 49,
  // Rio Grande do Sul
  51, 53, 54, 55,
  // Centro-Oeste: DF + GO + MT + MS
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  // Bahia + Sergipe
  71, 73, 74, 75, 77, 79,
  // Nordeste
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  // Norte
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

// ── Core normalize function ────────────────────────────────────────────────

/**
 * Normalize a phone number to clean digits.
 * Handles: country code 55, formatting chars, 9th digit insertion.
 * Returns null if invalid.
 *
 * @example
 * normalizePhone('+55 (11) 98765-4321') → '11987654321'
 * normalizePhone('11 8765-4321')        → '11987654321'  (9th digit added)
 * normalizePhone('6299999999')           → '62999999999'  (9th digit added, DDD 62)
 * normalizePhone('+351912345678')        → null (not a BR number)
 */
export function normalizePhone(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const input = typeof raw === 'string' ? raw : String(raw);

  // If it starts with a plus but not +55, or it's longer than 11 digits without 55, it's international
  const digitsOnly = input.replace(/\D/g, '');
  if (input.startsWith('+') && !input.startsWith('+55')) return digitsOnly;
  if (digitsOnly.length > 11 && !digitsOnly.startsWith('55')) return digitsOnly;

  let digits = input.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }

  if (digits.length < 10) return null;
  if (digits.length > 11) return null;

  const ddd = parseInt(digits.slice(0, 2));
  if (!VALID_DDDS.has(ddd)) return null;

  if (digits.length === 10) {
    const firstOfNumber = digits[2];
    // Brazilian mobile numbers start with 6, 7, 8 or 9 (after DDD)
    if (['6', '7', '8', '9'].includes(firstOfNumber)) {
      digits = digits.slice(0, 2) + '9' + digits.slice(2);
    }
  }

  return digits;
}

// ── Validate ──────────────────────────────────────────────────────────────

/**
 * Returns a detailed validation object. For backwards compat, also exposes a
 * truthy `.valid` boolean — callers can do `if (validatePhone(x).valid)`.
 */
export function validatePhone(phone: unknown): PhoneValidationDetailed {
  const raw = phone === null || phone === undefined ? '' : String(phone).trim();
  if (raw === '') return { valid: false, error: 'Telefone vazio.' };

  const digitsOnly = raw.replace(/\D/g, '');
  const startsWithPlus = raw.startsWith('+');
  const isInternational = startsWithPlus ? !raw.startsWith('+55') : (digitsOnly.length > 11 && !digitsOnly.startsWith('55'));

  if (isInternational) {
    return {
      valid: true,
      normalized: startsWithPlus ? raw.replace(/[^\d+]/g, '') : digitsOnly,
      formatted: raw,
      type: 'international',
    };
  }

  const normalized = normalizePhone(phone);
  if (!normalized) return { valid: false, error: 'Número inválido para o Brasil.' };

  return {
    valid: true,
    normalized,
    formatted: formatPhoneForDisplay(normalized),
    type: normalized.length === 11 ? 'mobile' : 'landline',
  };
}

/**
 * Rich phone validation result for forms.
 * Returns normalized digits, formatted display, and inferred type.
 */
export type PhoneType = 'mobile' | 'landline' | 'international';
/** Rich phone validation result containing normalised digits, display format, and inferred type. */
export interface PhoneValidationDetailed {
  valid:       boolean;
  error?:      string;
  normalized?: string;
  formatted?:  string;
  type?:       PhoneType;
}

/** validate Phone Detailed function. */
export function validatePhoneDetailed(phone: unknown): PhoneValidationDetailed {
  if (phone === null || phone === undefined || String(phone).trim() === '') {
    return { valid: false, error: 'Telefone vazio.' };
  }
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return { valid: false, error: 'Número inválido para o Brasil (DDD ou tamanho).' };
  }
  const type: PhoneType = normalized.length === 11 ? 'mobile' : 'landline';
  return {
    valid: true,
    normalized,
    formatted: formatPhoneForDisplay(normalized),
    type,
  };
}

// ── Format for display ────────────────────────────────────────────────────

/**
 * Format a normalized phone for human display.
 * @example
 * formatPhoneForDisplay('11987654321') → '(11) 98765-4321'
 * formatPhoneForDisplay('1133334444')  → '(11) 3333-4444'
 */
export function formatPhoneForDisplay(phone: unknown): string {
  if (!phone) return '';
  const raw = String(phone);
  const digitsOnly = raw.replace(/\D/g, '');
  const isInternational = raw.startsWith('+') ? !raw.startsWith('+55') : (digitsOnly.length > 11 && !digitsOnly.startsWith('55'));
  if (isInternational) return raw;

  const normalized = normalizePhone(phone) ?? digitsOnly;
  if (!normalized || normalized.length < 10) return raw;

  if (normalized.length === 11) {
    return `(${normalized.slice(0, 2)}) ${normalized.slice(2, 7)}-${normalized.slice(7)}`;
  }
  return `(${normalized.slice(0, 2)}) ${normalized.slice(2, 6)}-${normalized.slice(6)}`;
}

// ── WhatsApp JID helpers ──────────────────────────────────────────────────

/**
 * Convert a phone number to a WhatsApp JID.
 * @example toWhatsAppJID('11987654321') → '5511987654321@c.us'
 */
export function toWhatsAppJID(phone: unknown): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return `55${normalized}@c.us`;
}

/**
 * Extract a clean phone number from a WhatsApp JID.
 * Handles: @c.us, @g.us, @s.whatsapp.net
 * @example fromWhatsAppJID('5511987654321@c.us') → '11987654321'
 */
export function fromWhatsAppJID(jid: unknown): string | null {
  if (!jid) return null;
  const raw = String(jid).split('@')[0];
  return normalizePhone(raw);
}

// ── Phone matching ────────────────────────────────────────────────────────

/**
 * Check if two phone numbers match, considering 9th digit variations.
 * @example phonesMatch('11987654321', '1187654321') → true (same number with/without 9th digit)
 */
export function phonesMatch(a: unknown, b: unknown): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  // Check 9th digit variants
  const shorter  = na.length < nb.length ? na : nb;
  const longer   = na.length < nb.length ? nb : na;

  if (shorter.length === 10 && longer.length === 11) {
    // shorter may be longer without the 9th digit
    const withNinth = shorter.slice(0, 2) + '9' + shorter.slice(2);
    return withNinth === longer;
  }
  return false;
}

/**
 * Alias semântico de `phonesMatch` — mantido para compatibilidade com
 * consumidores legados (ex.: useEvolutionAutoSync). Prefira `phonesMatch`.
 */
export const isSamePhone = phonesMatch;

// ── Batch utilities ───────────────────────────────────────────────────────

/**
 * Normalize an array of phones, removing duplicates and nulls.
 */
export function normalizePhoneList(phones: unknown[]): string[] {
  return [...new Set(phones.map(normalizePhone).filter((p): p is string => p !== null))];
}

/**
 * Given a phone number, return both the 10-digit and 11-digit variants.
 * Useful for matching against database records that may have either form.
 */
export function phoneVariants(phone: unknown): string[] {
  const normalized = normalizePhone(phone);
  if (!normalized) return [];

  const variants = [normalized];

  if (normalized.length === 11 && normalized[2] === '9') {
    // Also add without 9th digit
    variants.push(normalized.slice(0, 2) + normalized.slice(3));
  } else if (normalized.length === 10) {
    // Also add with 9th digit
    const withNinth = normalized.slice(0, 2) + '9' + normalized.slice(2);
    if (VALID_DDDS.has(parseInt(withNinth.slice(0, 2)))) {
      variants.push(withNinth);
    }
  }

  return [...new Set(variants)];
}

/** format B R Phone constant. */
export const formatBRPhone = formatPhoneForDisplay;

/** is Whats App J I D function. */
export function isWhatsAppJID(value: unknown): boolean {
  if (!value) return false;
  return /^\d+@(c\.us|s\.whatsapp\.net|g\.us)$/.test(String(value));
}
