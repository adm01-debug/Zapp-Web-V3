/**
 * Utilitários de formatação para Recharts.
 *
 * Recharts tipa `Formatter` com `value: ValueType | undefined`, o que quebra
 * assinaturas simples como `(v: number) => string`. Estes helpers absorvem o
 * `undefined` de forma segura e devolvem strings estáveis para os tooltips.
 */

type ValueType = string | number | Array<string | number> | undefined;

/** Converte value do Recharts em número, com fallback 0. */
export function toNumber(v: ValueType): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (Array.isArray(v) && v.length > 0) return toNumber(v[0]);
  return 0;
}

/** Formata número usando toLocaleString. */
export function formatLocaleNumber(v: ValueType): string {
  return toNumber(v).toLocaleString();
}

/** Formata como "N tokens". */
export function formatTokens(v: ValueType): string {
  return `${formatLocaleNumber(v)} tokens`;
}

/** Formata como percentual (0-100). */
export function formatPercent(v: ValueType, digits = 1): string {
  return `${toNumber(v).toFixed(digits)}%`;
}

/** Formata como moeda BRL. */
export function formatBRL(v: ValueType): string {
  return toNumber(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
