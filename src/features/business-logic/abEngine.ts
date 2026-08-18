/**
 * Engine A/B (E62) — seleção ponderada de variante por destinatário.
 *
 * A lógica pura espelha a implementação SQL do RPC
 * `zapp.rpc_campaign_assign_variant` (migration 20260818230000): dado o
 * conjunto de variantes com peso, sorteia uma pelo peso configurado
 * (`variant_weight`, default 1). Pesos inválidos (<= 0 ou não-finitos) são
 * ignorados; se nenhuma variante for elegível, retorna null (sem atribuição).
 */

/** Variante elegível com peso configurado. */
export interface WeightedVariant {
  id: string;
  variant_name: string;
  /** Peso configurado; null/undefined = 1 (default). */
  variant_weight: number | null;
}

const DEFAULT_WEIGHT = 1;

/** Peso efetivo de uma variante, ou null se inválido (<= 0 / não-finito). */
function effectiveWeight(variant: WeightedVariant): number | null {
  const w = variant.variant_weight ?? DEFAULT_WEIGHT;
  if (!Number.isFinite(w) || w <= 0) return null;
  return w;
}

/**
 * Seleciona uma variante ponderadamente.
 *
 * @param variants variantes candidatas (com peso)
 * @param random   fonte de aleatoriedade injetável (default Math.random) — [0, 1)
 * @returns id da variante sorteada, ou null se não há candidata elegível
 */
export function selectWeightedVariant(
  variants: WeightedVariant[],
  random: () => number = Math.random
): string | null {
  const weighted = variants
    .map((v) => ({ variant: v, weight: effectiveWeight(v) }))
    .filter((entry): entry is { variant: WeightedVariant; weight: number } => entry.weight !== null);

  if (weighted.length === 0) return null;

  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = random() * total;

  for (const entry of weighted) {
    cursor -= entry.weight;
    if (cursor < 0) return entry.variant.id;
  }
  // tolerância a random() === 1 (fora do contrato [0,1)): cai na última
  return weighted[weighted.length - 1].variant.id;
}
