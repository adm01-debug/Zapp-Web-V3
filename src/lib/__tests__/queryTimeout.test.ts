/**
 * Tests para queryTimeout.ts
 */
import { describe, it, expect } from 'vitest';

import {
  withQueryTimeout,
  QueryTimeoutError,
  recommendedTimeout,
  TIMEOUTS,
} from "../queryTimeout";

describe('queryTimeout', () => {
  it('TIMEOUTS constants', () => {
    expect(TIMEOUTS.fast).toEqual(2_000);
    expect(TIMEOUTS.normal).toEqual(8_000);
    expect(TIMEOUTS.slow).toEqual(30_000);
    expect(TIMEOUTS.analytics).toEqual(120_000);
  });

  it('recommendedTimeout', () => {
    expect(recommendedTimeout('select')).toEqual('normal');
    expect(recommendedTimeout('insert')).toEqual('fast');
    expect(recommendedTimeout('update')).toEqual('fast');
    expect(recommendedTimeout('delete')).toEqual('fast');
    expect(recommendedTimeout('rpc')).toEqual('slow');
  });

  it('withQueryTimeout resolves fast query', async () => {
    const fastQuery = Promise.resolve({ data: { id: 1 }, error: null });
    const result = await withQueryTimeout(fastQuery, 'fast');
    expect(result.data).toEqual({ id: 1 });
    expect(result.error).toEqual(null);
  });

  it('withQueryTimeout handles errors gracefully', async () => {
    const failingQuery = Promise.reject(new Error('Database error'));
    await expect(withQueryTimeout(failingQuery as never, 'fast')).rejects.toThrow('Database error');
  });
});

describe('QueryTimeoutError', () => {
  it('contains timeout info', () => {
    const error = new QueryTimeoutError(5000);
    expect(error.timeoutMs).toEqual(5000);
    expect(error.name).toEqual('QueryTimeoutError');
    expect(error.message).toBeDefined();
  });
});
