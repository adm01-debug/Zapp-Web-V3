/**
 * Tests para queryTimeout.ts (convertido de Deno → vitest)
 */
import { describe, it, expect } from 'vitest';

import {
  withQueryTimeout,
  QueryTimeoutError,
  recommendedTimeout,
  TIMEOUTS,
} from '../queryTimeout';

describe('queryTimeout', () => {
  it('TIMEOUTS constants', () => {
    expect(TIMEOUTS.fast).toBe(2_000);
    expect(TIMEOUTS.normal).toBe(8_000);
    expect(TIMEOUTS.slow).toBe(30_000);
    expect(TIMEOUTS.analytics).toBe(120_000);
  });

  it('recommendedTimeout', () => {
    expect(recommendedTimeout('select')).toBe('normal');
    expect(recommendedTimeout('insert')).toBe('fast');
    expect(recommendedTimeout('update')).toBe('fast');
    expect(recommendedTimeout('delete')).toBe('fast');
    expect(recommendedTimeout('rpc')).toBe('slow');
  });

  it('withQueryTimeout resolves fast query', async () => {
    const fastQuery = Promise.resolve({ data: { id: 1 }, error: null });
    const result = await withQueryTimeout(fastQuery, 'fast');
    expect(result.data).toEqual({ id: 1 });
    expect(result.error).toBeNull();
  });

  it('withQueryTimeout handles errors gracefully', async () => {
    const failingQuery = Promise.reject(new Error('Database error'));
    await expect(
      withQueryTimeout(failingQuery, 'fast')
    ).rejects.toThrow('Database error');
  });

  it('QueryTimeoutError contains timeout info', () => {
    const error = new QueryTimeoutError(5000);
    expect(error.timeoutMs).toBe(5000);
    expect(error.name).toBe('QueryTimeoutError');
    expect(error.message).toBeDefined();
  });
});
