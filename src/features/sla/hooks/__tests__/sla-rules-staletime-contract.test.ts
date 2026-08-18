import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Z4 (resíduo E67): useSLARules NÃO pode usar `staleTime: Infinity`.
 *
 * Regra da casa (src/lib/queryStaleTimes.ts): TTLs centralizados por domínio —
 * `QUERY_STALE_TIMES.<domínio>` / `QUERY_GC_TIMES.<domínio>`. `Infinity`
 * congela o cache para sempre (mesmo após invalidação por mutação o dado
 * velho pode ser servido) e foge da política de catálogo quase-estático.
 * `slaRules` = 2min stale / 5min gc (mesmo padrão de useSLARulesCounts).
 *
 * RED esperado (Z4): o fonte ainda contém `staleTime: Infinity`.
 * GREEN: `staleTime: QUERY_STALE_TIMES.slaRules`.
 */
const testDir = dirname(fileURLToPath(import.meta.url));

const useSLARulesSource = readFileSync(
  resolve(testDir, '../useSLARules.ts'),
  'utf8'
);

describe('Z4 — useSLARules staleTime configurado (resíduo E67)', () => {
  it('não contém mais staleTime: Infinity', () => {
    expect(useSLARulesSource).not.toContain('staleTime: Infinity');
  });

  it('usa o TTL centralizado QUERY_STALE_TIMES.slaRules', () => {
    expect(useSLARulesSource).toContain('staleTime: QUERY_STALE_TIMES.slaRules');
  });
});
