/**
 * Load test simulations (Mock k6 behavior)
 * Monitoring latency and error rates under stress.
 */
import { log } from '@/lib/logger';

export async function simulateLoad(targetUrl: string, virtualUsers: number = 50) {
  log.info(`[LOAD TEST] Starting simulation on ${targetUrl} with ${virtualUsers} VUs`);
  const results = {
    success: 0,
    failure: 0,
    latencies: [] as number[],
  };

  const requests = Array.from({ length: virtualUsers }).map(async (_) => {
    const start = performance.now();
    try {
      const resp = await fetch(targetUrl);
      if (resp.ok) {
        results.success++;
      } else {
        results.failure++;
      }
    } catch {
      results.failure++;
    } finally {
      results.latencies.push(performance.now() - start);
    }
  });

  await Promise.all(requests);

  const avgLatency = results.latencies.reduce((a, b) => a + b, 0) / results.latencies.length;
  log.info(
    `[LOAD TEST] Results: Success=${results.success}, Failure=${results.failure}, AvgLatency=${avgLatency.toFixed(2)}ms`
  );

  return { ...results, avgLatency };
}
