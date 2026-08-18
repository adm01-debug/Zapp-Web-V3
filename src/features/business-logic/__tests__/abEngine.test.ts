import { describe, it, expect } from 'vitest';
import {
  selectWeightedVariant,
  type WeightedVariant,
} from '@/features/business-logic/abEngine';

const variants: WeightedVariant[] = [
  { id: 'v-a', variant_name: 'A', variant_weight: 1 },
  { id: 'v-b', variant_name: 'B', variant_weight: 2 },
  { id: 'v-c', variant_name: 'C', variant_weight: 3 },
];

describe('selectWeightedVariant (engine A/B — seleção ponderada)', () => {
  it('retorna null quando não há variantes', () => {
    expect(selectWeightedVariant([], () => 0.5)).toBeNull();
  });

  it('retorna a única variante independente do random', () => {
    const single: WeightedVariant[] = [{ id: 'v1', variant_name: 'S', variant_weight: 1 }];
    expect(selectWeightedVariant(single, () => 0.999)).toBe('v1');
    expect(selectWeightedVariant(single, () => 0.001)).toBe('v1');
  });

  it('trata variant_weight null como peso 1', () => {
    const list: WeightedVariant[] = [
      { id: 'v1', variant_name: 'A', variant_weight: null },
      { id: 'v2', variant_name: 'B', variant_weight: null },
    ];
    // random 0.49 → dentro do primeiro intervalo [0, 1) de total 2
    expect(selectWeightedVariant(list, () => 0.49)).toBe('v1');
    // random 0.5 → segundo intervalo [1, 2)
    expect(selectWeightedVariant(list, () => 0.5)).toBe('v2');
  });

  it('ignora pesos inválidos (<= 0 ou não-finitos) e usa os válidos', () => {
    const list: WeightedVariant[] = [
      { id: 'v-zero', variant_name: 'Z', variant_weight: 0 },
      { id: 'v-neg', variant_name: 'N', variant_weight: -3 },
      { id: 'v-nan', variant_name: 'NaN', variant_weight: Number.NaN },
      { id: 'v-ok', variant_name: 'OK', variant_weight: 5 },
    ];
    expect(selectWeightedVariant(list, () => 0.999)).toBe('v-ok');
    expect(selectWeightedVariant(list, () => 0.0)).toBe('v-ok');
  });

  it('retorna null quando todos os pesos são inválidos', () => {
    const list: WeightedVariant[] = [
      { id: 'v1', variant_name: 'A', variant_weight: 0 },
      { id: 'v2', variant_name: 'B', variant_weight: Number.NaN },
    ];
    expect(selectWeightedVariant(list, () => 0.5)).toBeNull();
  });

  it('respeita os limites dos intervalos acumulados (random 0 → primeiro; 1 → último)', () => {
    // total = 1 + 2 + 3 = 6; intervalos: v-a [0,1), v-b [1,3), v-c [3,6)
    expect(selectWeightedVariant(variants, () => 0.0)).toBe('v-a');
    expect(selectWeightedVariant(variants, () => 1 / 6 - 1e-9)).toBe('v-a');
    expect(selectWeightedVariant(variants, () => 1 / 6)).toBe('v-b');
    expect(selectWeightedVariant(variants, () => 3 / 6 - 1e-9)).toBe('v-b');
    expect(selectWeightedVariant(variants, () => 3 / 6)).toBe('v-c');
    expect(selectWeightedVariant(variants, () => 0.999999)).toBe('v-c');
  });

  it('distribui proporcionalmente ao peso (sanity: 6000 amostras determinísticas)', () => {
    const counts: Record<string, number> = { 'v-a': 0, 'v-b': 0, 'v-c': 0 };
    // sequência determinística pseudo-aleatória
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 6000; i += 1) {
      const picked = selectWeightedVariant(variants, rand);
      if (picked) counts[picked] += 1;
    }
    // esperado ~ 1000/2000/3000; tolerância de 15% cobre ruído determinístico
    expect(counts['v-a']).toBeGreaterThan(850);
    expect(counts['v-a']).toBeLessThan(1150);
    expect(counts['v-b']).toBeGreaterThan(1700);
    expect(counts['v-b']).toBeLessThan(2300);
    expect(counts['v-c']).toBeGreaterThan(2550);
    expect(counts['v-c']).toBeLessThan(3450);
  });
});
