// @ts-nocheck
/**
 * Tests for evolution/v237Fallbacks.ts.
 *
 * Covered:
 *   isEndpointUnavailable — HTTP status codes and message patterns
 *   withV237Fallback      — primary success, payload not-found, thrown 404/non-404
 *
 * externalClient and logger are mocked so no real Supabase is touched.
 * fallbackFindChats / fallbackFindContacts / fallbackFetchProfile call
 * the external client — they are covered via mockRpc stubs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/externalClient', () => ({
  isExternalConfigured: true,
  externalSupabase: { rpc: mockRpc },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ warn: vi.fn(), debug: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

// ── Import SUT AFTER mocks ────────────────────────────────────────────────────
import {
  isEndpointUnavailable,
  withV237Fallback,
  fallbackFindChats,
  fallbackFindContacts,
  fallbackFetchProfile,
} from '../v237Fallbacks';

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
});

// ── isEndpointUnavailable ─────────────────────────────────────────────────────
describe('isEndpointUnavailable', () => {
  it('returns false for a null/undefined error', () => {
    expect(isEndpointUnavailable(null)).toBe(false);
    expect(isEndpointUnavailable(undefined)).toBe(false);
  });

  it('returns true for status 404', () => {
    expect(isEndpointUnavailable({ status: 404 })).toBe(true);
  });

  it('returns true for status 405', () => {
    expect(isEndpointUnavailable({ status: 405 })).toBe(true);
  });

  it('returns true for status 501', () => {
    expect(isEndpointUnavailable({ status: 501 })).toBe(true);
  });

  it('returns false for status 500 (server error — not an endpoint issue)', () => {
    expect(isEndpointUnavailable({ status: 500 })).toBe(false);
  });

  it('returns false for status 200', () => {
    expect(isEndpointUnavailable({ status: 200 })).toBe(false);
  });

  it('returns true for an Error with "not found" in the message', () => {
    expect(isEndpointUnavailable(new Error('endpoint not found'))).toBe(true);
  });

  it('returns true for an Error with "not implemented" in the message', () => {
    expect(isEndpointUnavailable(new Error('Not Implemented'))).toBe(true);
  });

  it('returns true for an Error with "method not allowed" in the message', () => {
    expect(isEndpointUnavailable(new Error('Method Not Allowed'))).toBe(true);
  });

  it('returns true when the message contains "404"', () => {
    expect(isEndpointUnavailable(new Error('HTTP 404'))).toBe(true);
  });

  it('returns false for an unrelated error message', () => {
    expect(isEndpointUnavailable(new Error('network timeout'))).toBe(false);
  });

  it('returns false for a plain non-null object without status', () => {
    expect(isEndpointUnavailable({ message: 'ok' })).toBe(false);
  });
});

// ── withV237Fallback ──────────────────────────────────────────────────────────
describe('withV237Fallback', () => {
  const fallback = vi.fn();

  beforeEach(() => fallback.mockReset());

  it('returns the primary result when primary succeeds', async () => {
    const result = await withV237Fallback(
      async () => ({ data: 'primary' }),
      fallback,
      'test'
    );
    expect(result).toEqual({ data: 'primary' });
    expect(fallback).not.toHaveBeenCalled();
  });

  it('calls fallback when primary throws a 404-status error', async () => {
    fallback.mockResolvedValue(['fb-data']);
    const err = Object.assign(new Error('not found'), { status: 404 });
    const result = await withV237Fallback(
      async () => { throw err; },
      fallback,
      'test'
    );
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['fb-data']);
  });

  it('calls fallback when primary returns a payload with error:"not_found"', async () => {
    fallback.mockResolvedValue([]);
    const result = await withV237Fallback(
      async () => ({ error: 'not_found' }),
      fallback,
      'test'
    );
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
  });

  it('calls fallback when primary returns a 404-status payload object', async () => {
    fallback.mockResolvedValue([]);
    await withV237Fallback(
      async () => ({ status: 404 }),
      fallback,
      'test'
    );
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('re-throws when primary throws a non-endpoint error', async () => {
    const err = new Error('Internal Server Error');
    await expect(
      withV237Fallback(async () => { throw err; }, fallback, 'test')
    ).rejects.toBe(err);
    expect(fallback).not.toHaveBeenCalled();
  });
});

// ── fallbackFindChats ─────────────────────────────────────────────────────────
describe('fallbackFindChats', () => {
  it('calls rpc_list_conversations with the instance name', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'c1' }], error: null });
    const result = await fallbackFindChats('inst-1');
    expect(mockRpc).toHaveBeenCalledWith(
      'rpc_list_conversations',
      expect.objectContaining({ p_instance: 'inst-1' })
    );
    expect(result).toEqual([{ id: 'c1' }]);
  });

  it('returns an empty array when data is null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const result = await fallbackFindChats('inst-1');
    expect(result).toEqual([]);
  });

  it('throws when the RPC returns an error', async () => {
    const err = new Error('rpc failure');
    mockRpc.mockResolvedValue({ data: null, error: err });
    await expect(fallbackFindChats('inst-1')).rejects.toBe(err);
  });
});

// ── fallbackFindContacts ──────────────────────────────────────────────────────
describe('fallbackFindContacts', () => {
  it('calls rpc_list_contacts with instance name', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'contact-1' }], error: null });
    const result = await fallbackFindContacts('inst-1');
    expect(mockRpc).toHaveBeenCalledWith(
      'rpc_list_contacts',
      expect.objectContaining({ p_instance: 'inst-1' })
    );
    expect(result).toEqual([{ id: 'contact-1' }]);
  });

  it('returns empty array when data is null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await fallbackFindContacts('inst-1')).toEqual([]);
  });
});

// ── fallbackFetchProfile ──────────────────────────────────────────────────────
describe('fallbackFetchProfile', () => {
  it('calls rpc_get_contact with remoteJid and instanceName', async () => {
    mockRpc.mockResolvedValue({ data: { name: 'Alice' }, error: null });
    const result = await fallbackFetchProfile('+5511999', 'inst-1');
    expect(mockRpc).toHaveBeenCalledWith(
      'rpc_get_contact',
      expect.objectContaining({ p_remote_jid: '+5511999', p_instance: 'inst-1' })
    );
    expect(result).toEqual({ name: 'Alice' });
  });

  it('returns null when data is null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await fallbackFetchProfile('+5511999', 'inst-1')).toBeNull();
  });

  it('throws when the RPC returns an error', async () => {
    const err = new Error('rpc error');
    mockRpc.mockResolvedValue({ data: null, error: err });
    await expect(fallbackFetchProfile('+5511999', 'inst-1')).rejects.toBe(err);
  });
});
