import { describe, it, expect } from 'vitest';
import {
  selectWeightedVariant,
  type WeightedVariant,
} from '@/features/business-logic/abEngine';

/**
 * Validação E62 — variante A/B RESPECTA PESO.
 * Complementa abEngine.test.ts com: fronteiras exatas em pesos float,
 * dominância, distribuição estatística apertada (100k amostras) e
 * tolerância a random() === 1 (fora do contrato [0,1)).
 * O contrato espelha o SQL do RPC zapp.rpc_campaign_assign_variant
 * (migration 20260818230000): pesos <= 0 / não-finitos são ignorados,
 * default 1, seleção por intervalos acumulados.
 */

const v = (id: string, weight: number | null): WeightedVariant => ({
  id,
  variant_name: id,
  variant_weight: weight,
});

describe('selectWeightedVariant — pesos respetados (E62)', () => {
  it('fronteira exata com pesos FLOAT: random no limite cai no intervalo SEGUINTE', () => {
    // pesos [0.5, 1.5] → total 2.0; intervalos: v1 [0, 0.5), v2 [0.5, 2.0)
    const list = [v('v1', 0.5), v('v2', 1.5)];
    expect(selectWeightedVariant(list, () => 0.0)).toBe('v1');
    expect(selectWeightedVariant(list, () => 0.2499999)).toBe('v1'); // cursor 0.4999998 < 0.5
    expect(selectWeightedVariant(list, () => 0.25)).toBe('v2'); // cursor exatamente 0.5 → próximo
    expect(selectWeightedVariant(list, () => 0.5)).toBe('v2');
    expect(selectWeightedVariant(list, () => 0.9999)).toBe('v2');
  });

  it('dominância: peso 999 vs 1 → quase sempre a variante pesada', () => {
    const list = [v('leve', 1), v('pesada', 999)];
    expect(selectWeightedVariant(list, () => 0.0005)).toBe('leve'); // 0.5% das vezes
    expect(selectWeightedVariant(list, () => 0.001)).toBe('pesada'); // cursor 1.0 → leve perde
    expect(selectWeightedVariant(list, () => 0.5)).toBe('pesada');
    expect(selectWeightedVariant(list, () => 0.999)).toBe('pesada');
  });

  it('pesos IGUAIS → distribuição uniforme (100k amostras, tolerância ±1%)', () => {
    const list = [v('a', 1), v('b', 1), v('c', 1)];
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    let seed = 123456789;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const N = 100_000;
    for (let i = 0; i < N; i += 1) {
      counts[selectWeightedVariant(list, rand)!] += 1;
    }
    // esperado 33333.3 cada; ±1% absoluto (32333..34333) cobre o ruído
    for (const c of Object.values(counts)) {
      expect(c).toBeGreaterThan(N / 3 - N * 0.01);
      expect(c).toBeLessThan(N / 3 + N * 0.01);
    }
  });

  it('pesos 1:2:3 → proporções ~16.7% / 33.3% / 50% (100k amostras, ±1.5% absoluto)', () => {
    const list = [v('a', 1), v('b', 2), v('c', 3)];
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    let seed = 987654321;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const N = 100_000;
    for (let i = 0; i < N; i += 1) {
      counts[selectWeightedVariant(list, rand)!] += 1;
    }
    const expected: Record<string, number> = { a: 1 / 6, b: 2 / 6, c: 3 / 6 };
    for (const [id, exp] of Object.entries(expected)) {
      const prop = counts[id] / N;
      expect(Math.abs(prop - exp)).toBeLessThan(0.015);
      // sanity: proporção também dentro de ±1% do valor esperado relativo
      expect(prop).toBeGreaterThan(exp * 0.9);
      expect(prop).toBeLessThan(exp * 1.1);
    }
  });

  it('random() === 1 (fora do contrato) → cai na ÚLTIMA variante, não lança', () => {
    const list = [v('a', 1), v('b', 2), v('c', 3)];
    expect(selectWeightedVariant(list, () => 1)).toBe('c');
    // peso zero no fim: inválido é ignorado, o último VÁLIDO vence
    const withInvalidTail = [v('a', 1), v('b', 2), v('z', 0)];
    expect(selectWeightedVariant(withInvalidTail, () => 1)).toBe('b');
  });

  it('pesos nulos/undefined → default 1 (semântica do SQL DEFAULT 1)', () => {
    const list = [
      { id: 'n1', variant_name: 'N1', variant_weight: null },
      { id: 'n2', variant_name: 'N2', variant_weight: undefined as unknown as null },
    ];
    // total 2; fronteira 0.5 → n2
    expect(selectWeightedVariant(list, () => 0.49)).toBe('n1');
    expect(selectWeightedVariant(list, () => 0.5)).toBe('n2');
  });

  it('pesos extremos (1e9) e fracionários misturados não quebram a seleção', () => {
    const list = [v('huge', 1e9), v('tiny', 0.000001)];
    // cursor = r * (1e9 + 1e-6); tiny só vence com cursor >= 1e9 (r ≈ 0.999999999999)
    expect(selectWeightedVariant(list, () => 0.999999)).toBe('huge');
    expect(selectWeightedVariant(list, () => 0.5)).toBe('huge');
    expect(selectWeightedVariant(list, () => 0.0)).toBe('huge');
  });

  it('lista vazia ou só inválidos → null (sem atribuição, contrato do RPC)', () => {
    expect(selectWeightedVariant([], () => 0.5)).toBeNull();
    expect(selectWeightedVariant([v('x', 0), v('y', Number.NaN), v('z', -1)], () => 0.5)).toBeNull();
  });
});
