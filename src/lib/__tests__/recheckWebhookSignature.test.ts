/**
 * Tests for recheckWebhookSignature.ts
 *
 * Verifies:
 * - event_id is forwarded to functions.invoke
 * - success: returns data as RecheckResult
 * - result.error → throws with error.message
 * - result.error with empty message → throws fallback 'Falha ao revalidar assinatura'
 * - data.error string → throws with that string
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_RESOLVED_URL: 'http://localhost:54321',
  SUPABASE_RESOLVED_ANON_KEY: 'test-anon-key',
  supabase: { functions: { invoke: mockInvoke } },
}));

// ── Import SUT AFTER mocks ────────────────────────────────────────────────────
import { recheckWebhookSignature } from '../recheckWebhookSignature';

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const successData = {
  event_id: 'ev-1',
  instance_name: 'inst-a',
  event_type: 'messages.upsert',
  created_at: '2024-01-01T00:00:00Z',
  secret_configured: true,
  observed_signature: 'obs-sig',
  computed_signature: 'comp-sig',
  signature_valid: true,
  reason: 'signatures match',
};

// ── event_id forwarding ───────────────────────────────────────────────────────
describe('recheckWebhookSignature — event_id forwarding', () => {
  it('calls functions.invoke with the correct function name', async () => {
    mockInvoke.mockResolvedValue({ data: successData, error: null });
    await recheckWebhookSignature('ev-1');
    expect(mockInvoke).toHaveBeenCalledWith(
      'recheck-webhook-signature',
      expect.anything()
    );
  });

  it('forwards eventId in the body as event_id', async () => {
    mockInvoke.mockResolvedValue({ data: successData, error: null });
    await recheckWebhookSignature('ev-abc');
    expect(mockInvoke).toHaveBeenCalledWith(
      expect.any(String),
      { body: { event_id: 'ev-abc' } }
    );
  });
});

// ── success ───────────────────────────────────────────────────────────────────
describe('recheckWebhookSignature — success', () => {
  it('returns data as RecheckResult on success', async () => {
    mockInvoke.mockResolvedValue({ data: successData, error: null });
    const result = await recheckWebhookSignature('ev-1');
    expect(result).toEqual(successData);
  });

  it('returns data with signature_valid: false', async () => {
    const failed = { ...successData, signature_valid: false, reason: 'mismatch' };
    mockInvoke.mockResolvedValue({ data: failed, error: null });
    const result = await recheckWebhookSignature('ev-2');
    expect(result.signature_valid).toBe(false);
    expect(result.reason).toBe('mismatch');
  });

  it('returns data with nullable fields', async () => {
    const partial = {
      ...successData,
      instance_name: null,
      event_type: null,
      created_at: null,
      observed_signature: null,
      computed_signature: null,
      signature_valid: null,
    };
    mockInvoke.mockResolvedValue({ data: partial, error: null });
    const result = await recheckWebhookSignature('ev-3');
    expect(result.instance_name).toBeNull();
    expect(result.signature_valid).toBeNull();
  });
});

// ── result.error ──────────────────────────────────────────────────────────────
describe('recheckWebhookSignature — result.error throws', () => {
  it('throws with error.message when result.error is present', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'function not found' } });
    await expect(recheckWebhookSignature('ev-1')).rejects.toThrow('function not found');
  });

  it('throws fallback message when error.message is empty string', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: '' } });
    await expect(recheckWebhookSignature('ev-1')).rejects.toThrow(
      'Falha ao revalidar assinatura'
    );
  });

  it('throws fallback message when error.message is undefined', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: {} });
    await expect(recheckWebhookSignature('ev-1')).rejects.toThrow(
      'Falha ao revalidar assinatura'
    );
  });
});

// ── data.error ────────────────────────────────────────────────────────────────
describe('recheckWebhookSignature — data.error throws', () => {
  it('throws with data.error string when present', async () => {
    mockInvoke.mockResolvedValue({
      data: { error: 'secret not configured' },
      error: null,
    });
    await expect(recheckWebhookSignature('ev-1')).rejects.toThrow('secret not configured');
  });

  it('throws the exact data.error message', async () => {
    mockInvoke.mockResolvedValue({
      data: { error: 'event not found' },
      error: null,
    });
    await expect(recheckWebhookSignature('ev-1')).rejects.toThrow('event not found');
  });

  it('result.error takes precedence over data.error', async () => {
    mockInvoke.mockResolvedValue({
      data: { error: 'data error' },
      error: { message: 'transport error' },
    });
    await expect(recheckWebhookSignature('ev-1')).rejects.toThrow('transport error');
  });
});
