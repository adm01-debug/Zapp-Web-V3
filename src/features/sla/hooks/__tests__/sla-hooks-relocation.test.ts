import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Z4 (resíduo E67): hooks SLA devem morar em features/sla/hooks.
 *
 * A feature SLA foi consolidada em src/features/sla (E67). Três hooks ficaram
 * fora da feature — `src/hooks/useSLARulesCounts.ts`,
 * `src/hooks/useSLAScopeNames.ts` e `src/hooks/sla/useSLAScopeOptions.ts` —
 * com import direto pelos componentes (SLARulesManager, ScopeRulesList,
 * SLARuleFormDialog). Contrato Z4: os hooks passam a ser exportados de
 * `src/features/sla/hooks/` (barrel incluso) e os arquivos antigos em
 * `src/hooks/` deixam de existir.
 *
 * RED esperado (Z4): os imports abaixo não resolvem (módulo ausente) e os
 * arquivos antigos ainda existem.
 * GREEN: imports resolvem, barrel exporta e arquivos antigos sumiram.
 */
const testDir = dirname(fileURLToPath(import.meta.url));

const OLD_PATHS = [
  resolve(testDir, '../../../../hooks/useSLARulesCounts.ts'),
  resolve(testDir, '../../../../hooks/useSLAScopeNames.ts'),
  resolve(testDir, '../../../../hooks/sla/useSLAScopeOptions.ts'),
];

describe('Z4 — hooks SLA relocados para features/sla/hooks (resíduo E67)', () => {
  it('useSLARulesCounts é exportado de features/sla/hooks', async () => {
    const mod = await import('@/features/sla/hooks/useSLARulesCounts');
    expect(typeof mod.useSLARulesCounts).toBe('function');
  });

  it('useSLAScopeNames é exportado de features/sla/hooks', async () => {
    const mod = await import('@/features/sla/hooks/useSLAScopeNames');
    expect(typeof mod.useSLAScopeNames).toBe('function');
  });

  it('useSLAScopeOptions é exportado de features/sla/hooks', async () => {
    const mod = await import('@/features/sla/hooks/useSLAScopeOptions');
    expect(typeof mod.useSLAScopeOptions).toBe('function');
  });

  it('barrel features/sla/hooks exporta os 3 hooks', async () => {
    const mod = await import('@/features/sla/hooks');
    expect(typeof mod.useSLARulesCounts).toBe('function');
    expect(typeof mod.useSLAScopeNames).toBe('function');
    expect(typeof mod.useSLAScopeOptions).toBe('function');
  });

  it('arquivos antigos em src/hooks não existem mais', () => {
    for (const p of OLD_PATHS) {
      expect(existsSync(p), `${p} ainda existe`).toBe(false);
    }
  });
});
