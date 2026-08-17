/**
 * Tests para healthCheck.ts (convertido de Deno → vitest)
 *
 * Módulo V3 stub/deprecated: healthCheckService local, sem chamadas à
 * Evolution API (gateway-first). Os asserts refletem o comportamento REAL
 * do módulo (antes eram tautológicos: assertEquals(true, true)).
 */
import { describe, it, expect } from 'vitest';

import { healthCheck } from '../healthCheck';

describe('healthCheck', () => {
  it('deve retornar cache null inicialmente', () => {
    expect(healthCheck.getCached()).toBeNull();
  });

  it('deve rodar e retornar SystemHealth válido', async () => {
    const result = await healthCheck.run();
    expect(result.healthy).toBe(true);
    expect(result.status).toBe('unknown');
    expect(result.components).toEqual([]);
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(result.uptimeMs).toBeGreaterThanOrEqual(0);
  });

  it('deve calcular uptime com ms e human corretos', () => {
    const uptime = healthCheck.getUptime();
    expect(uptime.ms).toBeGreaterThanOrEqual(0);
    expect(uptime.human).toBe(`${Math.floor(uptime.ms / 1000)}s`);
  });

  it('deve aumentar uptime com o tempo', async () => {
    const before = healthCheck.getUptime().ms;
    await new Promise((r) => setTimeout(r, 30));
    const after = healthCheck.getUptime().ms;
    expect(after).toBeGreaterThanOrEqual(before);
  });
});
