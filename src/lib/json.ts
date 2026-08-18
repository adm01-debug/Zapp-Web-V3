import type { Json } from '@/integrations/supabase/schema';

/**
 * E60 — saneamento auth/admin: substitui casts `as unknown as Json` por
 * validação runtime recursiva. `toJson` normaliza qualquer valor para o tipo
 * `Json` do Supabase (aceito por insert/update), com verificação real de cada
 * nível; `isJson` é o type guard correspondente.
 *
 * Regra: NUNCA usar `as unknown as Json` — se um valor não passa em `toJson`,
 * a escrita no banco seria rejeitada de qualquer forma (ou pior, gravada
 * corrompida). O helper falha "fail-fast" para valores inválidos (Date,
 * undefined, função) em vez de silenciosamente gravar `null`.
 */
export function isJson(v: unknown): v is Json {
  if (v === null) return true;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return true;
  if (Array.isArray(v)) return v.every(isJson);
  if (typeof v === 'object') {
    return Object.values(v).every(isJson);
  }
  return false;
}

/** Converte qualquer valor JSON-serializável para o tipo `Json` (com validação). */
export function toJson(v: unknown): Json {
  if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return v;
  }
  if (Array.isArray(v)) {
    return v.map(toJson);
  }
  if (typeof v === 'object') {
    const out: Record<string, Json> = {};
    for (const [key, value] of Object.entries(v)) {
      if (value !== undefined) out[key] = toJson(value);
    }
    return out;
  }
  // undefined, função, symbol, bigint — não são JSON; gravar null seria
  // corromper silenciosamente o dado. Falha alto em vez de fail-open.
  throw new TypeError(`toJson: valor não serializável (${typeof v})`);
}

/** Versão tolerante para payloads de origem externa: inválido → null (JSON válido). */
export function toJsonOrNull(v: unknown): Json {
  try {
    return toJson(v);
  } catch {
    return null;
  }
}
