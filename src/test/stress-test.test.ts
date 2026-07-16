import { describe, it, expect } from 'vitest';
import { simulateLoad } from './load-test';

describe('Stress Test Simulation', () => {
  // Skip por padrão: depende de rede ao Supabase + latência variável,
  // gerando flakiness em CI. Reativar manualmente para testes de carga.
  it.skip('should handle parallel requests with acceptable latency', async () => {
    const target = 'https://supabase.atomicabr.com.br/rest/v1/profiles?select=count';
    const results = await simulateLoad(target, 10);

    expect(results.failure).toBe(0);
    expect(results.avgLatency).toBeLessThan(1000); // Max 1s
  });
});
