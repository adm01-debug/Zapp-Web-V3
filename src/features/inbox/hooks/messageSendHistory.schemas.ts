/**
 * Schemas Zod + normalizadores para o histórico de envio de mensagens.
 *
 * Fonte da verdade para o formato de `retry_reasons`, `final_status` e
 * entradas de audit log consumidas por `useMessageSendHistory` e
 * `MessageSendHistorySheet`. Cobre variações históricas do banco:
 *   - `retry_reasons` como array JSON, string JSON, objeto único ou `null`
 *   - entradas com `attempt` ausente / `at` inválido
 *   - `final_status` legado ("success" | "failed" | "exhausted") + estados
 *     derivados ("retrying") e fallback ("unknown").
 */
import { z } from 'zod';

// ─── Final status ──────────────────────────────────────────────────────────
export const FinalStatusSchema = z.enum([
  'success',
  'failed',
  'exhausted',
  'retrying',
  'unknown',
]);
export type FinalStatus = z.infer<typeof FinalStatusSchema>;

export function normalizeFinalStatus(raw: unknown): FinalStatus {
  const parsed = FinalStatusSchema.safeParse(raw);
  return parsed.success ? parsed.data : 'unknown';
}

// ─── Retry attempt ─────────────────────────────────────────────────────────
/**
 * `at` propositalmente aceita string livre — normalizador filtra timestamps
 * inválidos em runtime para não descartar a tentativa inteira quando só o
 * campo de tempo está corrompido.
 */
export const RetryAttemptSchema = z.object({
  attempt: z.number().int().nonnegative(),
  status: z.number().int().min(0).max(599).optional(),
  reason: z.string().min(1),
  at: z.string().optional(),
  duration_ms: z.number().finite().nonnegative().optional(),
});
export type RetryAttempt = z.infer<typeof RetryAttemptSchema>;

/**
 * `retry_reasons` já apareceu no banco como:
 *   - `null` / `undefined` (linhas antigas)
 *   - string JSON (`'[{"attempt":1,...}]'` ou `'{"attempt":1,...}'`)
 *   - array de objetos (formato canônico)
 *   - objeto único (bug de escrita antigo)
 * Este normalizador aceita todos e devolve sempre `RetryAttempt[]` ordenado.
 */
export function normalizeRetryReasons(raw: unknown): RetryAttempt[] {
  if (raw == null) return [];
  let arr: unknown[];

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return [];
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed == null) return [];
      arr = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  } else if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === 'object') {
    arr = [raw];
  } else {
    return [];
  }

  const out: RetryAttempt[] = [];
  arr.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const rec = item as Record<string, unknown>;
    const reasonRaw = typeof rec.reason === 'string' ? rec.reason.trim() : '';
    const atRaw = typeof rec.at === 'string' ? rec.at : undefined;
    const atValid = atRaw && !Number.isNaN(new Date(atRaw).getTime()) ? atRaw : undefined;
    const candidate = {
      attempt: typeof rec.attempt === 'number' ? rec.attempt : index + 1,
      status: typeof rec.status === 'number' ? rec.status : undefined,
      reason: reasonRaw.length > 0 ? reasonRaw : 'unknown',
      at: atValid,
      duration_ms:
        typeof rec.duration_ms === 'number' && Number.isFinite(rec.duration_ms)
          ? rec.duration_ms
          : undefined,
    };
    const parsed = RetryAttemptSchema.safeParse(candidate);
    if (parsed.success) out.push(parsed.data);
  });

  return out.sort((a, b) => a.attempt - b.attempt);
}

/**
 * Garante que o array de tentativas tem pelo menos `expected` posições —
 * quando `retry_count` no banco é maior que `retry_reasons.length` (ex.:
 * edge function falhou antes de gravar a razão), preenche com placeholders
 * `{ reason: 'unknown' }` para a UI renderizar coerente.
 */
export function padRetryAttempts(
  attempts: RetryAttempt[],
  expected: number,
): RetryAttempt[] {
  if (!Number.isFinite(expected) || expected <= attempts.length) return attempts;
  const out = [...attempts];
  const startAttempt =
    attempts.length > 0 ? Math.max(...attempts.map((a) => a.attempt)) + 1 : 1;
  for (let i = out.length; i < expected; i++) {
    out.push({
      attempt: startAttempt + (i - attempts.length),
      reason: 'unknown',
    });
  }
  return out;
}

// ─── Audit entry ───────────────────────────────────────────────────────────
/**
 * Shape exposto ao UI. Mantém `action` + `createdAt` para preservar contrato
 * com `MessageSendHistorySheet` (não introduzir breaking change).
 */
export const AuditEntrySchema = z.object({
  id: z.string().min(1),
  action: z.string().min(1),
  createdAt: z.string(),
  details: z.unknown(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

/** Deduplica entradas por (action, createdAt, external_id no details). */
export function dedupeAuditEntries(entries: AuditEntry[]): AuditEntry[] {
  const seen = new Set<string>();
  const out: AuditEntry[] = [];
  for (const e of entries) {
    const extId =
      e.details && typeof e.details === 'object' && !Array.isArray(e.details)
        ? String((e.details as Record<string, unknown>).external_id ?? '')
        : '';
    const key = `${e.action}|${e.createdAt}|${extId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

// ─── Derivação de finalStatus ──────────────────────────────────────────────
export interface FinalStatusInputs {
  externalMessageId?: string | null;
  retryCount?: number | null;
  maxRetries?: number | null;
  nextRetryAt?: string | null;
  storedFinalStatus?: unknown;
  now?: Date;
}

/**
 * Regra explícita (ordem importa):
 *   1. `success` → external_message_id presente E status legado != 'failed'/'exhausted'
 *   2. `exhausted` → retry_count >= max_retries e sem external_message_id
 *   3. `retrying` → next_retry_at no futuro
 *   4. `failed` → status legado 'failed' ou tentativas > 0 sem sucesso
 *   5. `unknown` → cai aqui quando nada acima aplica
 */
export function deriveFinalStatus(inputs: FinalStatusInputs): FinalStatus {
  const {
    externalMessageId,
    retryCount,
    maxRetries,
    nextRetryAt,
    storedFinalStatus,
    now = new Date(),
  } = inputs;

  const legacy = normalizeFinalStatus(storedFinalStatus);
  const hasExternalId = typeof externalMessageId === 'string' && externalMessageId.length > 0;

  if (hasExternalId && legacy !== 'failed' && legacy !== 'exhausted') {
    return 'success';
  }
  if (
    typeof retryCount === 'number' &&
    typeof maxRetries === 'number' &&
    maxRetries > 0 &&
    retryCount >= maxRetries &&
    !hasExternalId
  ) {
    return 'exhausted';
  }
  if (nextRetryAt) {
    const t = new Date(nextRetryAt).getTime();
    if (!Number.isNaN(t) && t > now.getTime()) return 'retrying';
  }
  if (legacy === 'failed' || legacy === 'exhausted') return legacy;
  if (typeof retryCount === 'number' && retryCount > 0 && !hasExternalId) return 'failed';
  return legacy === 'unknown' ? 'unknown' : legacy;
}
