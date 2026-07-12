/**
 * Schemas Zod + normalizadores para o hook `useMessageSendHistory`.
 * Extraídos para arquivo próprio para manter o hook ≤ 340 linhas e permitir
 * testes unitários dos normalizadores sem instanciar React Query.
 */
import { z } from 'zod';

export const FinalStatusSchema = z.enum([
  'success',
  'failed',
  'exhausted',
  'retrying',
  'unknown',
]);
export type FinalStatus = z.infer<typeof FinalStatusSchema>;

export const RetryAttemptSchema = z.object({
  attempt: z.number().int().nonnegative(),
  status: z.number().int().min(0).max(599).optional(),
  reason: z.string().min(1),
  /** ISO 8601 com offset — populado apenas quando a EF grava. */
  at: z.string().datetime({ offset: true }).optional(),
  /** Latência da tentativa em ms. */
  duration_ms: z.number().finite().nonnegative().optional(),
});
export type RetryAttempt = z.infer<typeof RetryAttemptSchema>;

/**
 * Normaliza `retry_reasons` vindo de `evolution_retry_metrics.retry_reasons`.
 * Formatos aceitos:
 *   - Array de objetos (formato canônico).
 *   - Objeto único (EFs antigas com 1 tentativa sem envelope).
 *   - String JSON (EFs que fizeram `JSON.stringify` por engano).
 *   - `null` / `undefined` / valores inválidos → `[]`.
 *
 * Itens sem `attempt` numérico usam `index + 1` como reconstrução defensiva.
 * `reason` vazio/whitespace vira `"unknown"`.
 * `status` fora do intervalo HTTP (0–599) e `duration_ms` negativo/NaN causam
 * descarte da tentativa (não do lote inteiro).
 * Resultado ordenado por `attempt` ascendente.
 */
export function normalizeRetryReasons(raw: unknown): RetryAttempt[] {
  let arr: unknown[];
  if (raw == null) return [];

  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
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
    const candidate = {
      attempt: typeof rec.attempt === 'number' ? rec.attempt : index + 1,
      status: rec.status,
      reason: reasonRaw.length > 0 ? reasonRaw : 'unknown',
      at: rec.at,
      duration_ms: rec.duration_ms,
    };
    const parsed = RetryAttemptSchema.safeParse(candidate);
    if (parsed.success) out.push(parsed.data);
  });

  return out.sort((a, b) => a.attempt - b.attempt);
}

export function normalizeFinalStatus(raw: unknown): FinalStatus {
  const parsed = FinalStatusSchema.safeParse(raw);
  return parsed.success ? parsed.data : 'unknown';
}
