/**
 * Tests for whatsappAdapter.ts
 *
 * Covered behaviors:
 *  - getCloudWebhookUrl / getEvolutionWebhookUrl (URL path suffixes, shared base)
 *  - getWhatsAppMode: RPC routing, cache TTL, force bypass, error fallback
 *  - invalidateWhatsAppModeCache: full state reset
 *  - resolveTransport: unofficial path, official+ok path, degraded path, cache, force
 *  - invalidateTransportCache: transport + cloud-creds cache reset
 *  - getActiveWebhookUrl: delegates to resolveTransport
 *  - sendTemplate: throws for non-cloud / degraded, invokes cloud on success
 *  - sendPresence: skips silently on cloud, invokes evolution on unofficial
 *  - sendText: routes body correctly per transport
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockSafeRpc = vi.hoisted(() => vi.fn());
const mockFunctionsInvoke = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/safeClient', () => ({
  safeClient: { rpc: mockSafeRpc },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: mockFunctionsInvoke },
  },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/lib/jid', () => ({
  toPhone: (jid: string) => jid.replace(/@.+$/, ''),
}));

import {
  getWhatsAppMode,
  resolveTransport,
  invalidateWhatsAppModeCache,
  invalidateTransportCache,
  getCloudWebhookUrl,
  getEvolutionWebhookUrl,
  getActiveWebhookUrl,
  sendTemplate,
  sendPresence,
  sendText,
} from '../whatsappAdapter';

// ── helpers ───────────────────────────────────────────────────────────────────

function rpcResult(data: unknown, error: unknown = null) {
  return Promise.resolve({ data, error });
}

function invokeResult(data: unknown, error: unknown = null) {
  return Promise.resolve({ data, error });
}

const ALL_SECRETS_OK = [
  { name: 'WHATSAPP_CLOUD_PHONE_NUMBER_ID', configured: true, length: 20 },
  { name: 'WHATSAPP_CLOUD_ACCESS_TOKEN', configured: true, length: 100 },
];

const SECRETS_PHONE_MISSING = [
  { name: 'WHATSAPP_CLOUD_PHONE_NUMBER_ID', configured: false, length: 0 },
  { name: 'WHATSAPP_CLOUD_ACCESS_TOKEN', configured: true, length: 100 },
];

const ALL_SECRETS_MISSING = [
  { name: 'WHATSAPP_CLOUD_PHONE_NUMBER_ID', configured: false, length: 0 },
  { name: 'WHATSAPP_CLOUD_ACCESS_TOKEN', configured: false, length: 0 },
];

function secretsOk() {
  return invokeResult({ secrets: ALL_SECRETS_OK });
}

function secretsMissing(secrets = ALL_SECRETS_MISSING) {
  return invokeResult({ secrets });
}

// Route functions.invoke by function name
function makeInvokeRouter(routes: Record<string, () => Promise<{ data: unknown; error: unknown }>>) {
  return (fn: string) => {
    const handler = routes[fn];
    return handler ? handler() : Promise.resolve({ data: null, error: { message: `unexpected invoke: ${fn}` } });
  };
}

// ── setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  mockSafeRpc.mockReset();
  mockFunctionsInvoke.mockReset();
  invalidateWhatsAppModeCache(); // resets mode, transport, and cloud-creds caches
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── URL builder helpers ───────────────────────────────────────────────────────

describe('getCloudWebhookUrl', () => {
  it('returns a URL ending with /whatsapp-cloud-webhook', () => {
    expect(getCloudWebhookUrl()).toMatch(/\/whatsapp-cloud-webhook$/);
  });

  it('contains /functions/v1/ in the path', () => {
    expect(getCloudWebhookUrl()).toContain('/functions/v1/');
  });

  it('is stable across multiple calls', () => {
    expect(getCloudWebhookUrl()).toBe(getCloudWebhookUrl());
  });
});

describe('getEvolutionWebhookUrl', () => {
  it('returns a URL ending with /evolution-webhook', () => {
    expect(getEvolutionWebhookUrl()).toMatch(/\/evolution-webhook$/);
  });

  it('contains /functions/v1/ in the path', () => {
    expect(getEvolutionWebhookUrl()).toContain('/functions/v1/');
  });

  it('shares the same functions base as getCloudWebhookUrl', () => {
    const cloud = getCloudWebhookUrl();
    const evo = getEvolutionWebhookUrl();
    const cloudBase = cloud.replace('/whatsapp-cloud-webhook', '');
    const evoBase = evo.replace('/evolution-webhook', '');
    expect(cloudBase).toBe(evoBase);
  });
});

// ── getWhatsAppMode ───────────────────────────────────────────────────────────

describe('getWhatsAppMode', () => {
  it('returns "official" when rpc returns "official"', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('official'));
    expect(await getWhatsAppMode()).toBe('official');
  });

  it('returns "unofficial" when rpc returns any other string', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('unofficial'));
    expect(await getWhatsAppMode()).toBe('unofficial');
  });

  it('returns "unofficial" when rpc returns an unexpected value', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('unknown_mode'));
    expect(await getWhatsAppMode()).toBe('unofficial');
  });

  it('returns "unofficial" as fallback when rpc throws', async () => {
    mockSafeRpc.mockRejectedValueOnce(new Error('rpc failed'));
    expect(await getWhatsAppMode()).toBe('unofficial');
  });

  it('returns "unofficial" as fallback when rpc returns error', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult(null, { message: 'function not found' }));
    expect(await getWhatsAppMode()).toBe('unofficial');
  });

  it('caches result and avoids second RPC within 30s', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('official'));
    await getWhatsAppMode();
    const result = await getWhatsAppMode();
    expect(result).toBe('official');
    expect(mockSafeRpc).toHaveBeenCalledTimes(1);
  });

  it('re-fetches after 30s cache expires', async () => {
    mockSafeRpc
      .mockResolvedValueOnce(rpcResult('official'))
      .mockResolvedValueOnce(rpcResult('unofficial'));

    await getWhatsAppMode();
    vi.advanceTimersByTime(30_001);
    const result = await getWhatsAppMode();

    expect(result).toBe('unofficial');
    expect(mockSafeRpc).toHaveBeenCalledTimes(2);
  });

  it('force=true bypasses mode cache', async () => {
    mockSafeRpc
      .mockResolvedValueOnce(rpcResult('official'))
      .mockResolvedValueOnce(rpcResult('unofficial'));

    await getWhatsAppMode();
    const result = await getWhatsAppMode(true);

    expect(result).toBe('unofficial');
    expect(mockSafeRpc).toHaveBeenCalledTimes(2);
  });
});

// ── invalidateWhatsAppModeCache ───────────────────────────────────────────────

describe('invalidateWhatsAppModeCache', () => {
  it('forces re-fetch on next getWhatsAppMode call', async () => {
    mockSafeRpc
      .mockResolvedValueOnce(rpcResult('official'))
      .mockResolvedValueOnce(rpcResult('unofficial'));

    await getWhatsAppMode();
    invalidateWhatsAppModeCache();
    const result = await getWhatsAppMode();

    expect(result).toBe('unofficial');
    expect(mockSafeRpc).toHaveBeenCalledTimes(2);
  });

  it('also resets transport cache (resolveTransport re-runs after invalidation)', async () => {
    // Prime transport cache with unofficial
    mockSafeRpc.mockResolvedValueOnce(rpcResult('unofficial'));
    await resolveTransport();

    // Invalidate, then switch to official
    invalidateWhatsAppModeCache();
    mockSafeRpc.mockResolvedValueOnce(rpcResult('official'));
    mockFunctionsInvoke.mockResolvedValueOnce(invokeResult({ secrets: ALL_SECRETS_OK }));

    const result = await resolveTransport();
    expect(result.transport).toBe('cloud');
  });
});

// ── resolveTransport ──────────────────────────────────────────────────────────

describe('resolveTransport — unofficial mode', () => {
  it('returns evolution transport with degraded=false for unofficial mode', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('unofficial'));
    const result = await resolveTransport();
    expect(result.transport).toBe('evolution');
    expect(result.requestedMode).toBe('unofficial');
    expect(result.degraded).toBe(false);
  });

  it('does not call functions.invoke (no creds check) for unofficial mode', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('unofficial'));
    await resolveTransport();
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });
});

describe('resolveTransport — official mode with creds ok', () => {
  it('returns cloud transport with degraded=false when all secrets configured', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('official'));
    mockFunctionsInvoke.mockResolvedValueOnce(invokeResult({ secrets: ALL_SECRETS_OK }));

    const result = await resolveTransport();
    expect(result.transport).toBe('cloud');
    expect(result.requestedMode).toBe('official');
    expect(result.degraded).toBe(false);
  });

  it('does not include missingSecrets when creds are ok', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('official'));
    mockFunctionsInvoke.mockResolvedValueOnce(invokeResult({ secrets: ALL_SECRETS_OK }));

    const result = await resolveTransport();
    expect(result.missingSecrets).toBeUndefined();
  });
});

describe('resolveTransport — official mode degraded', () => {
  it('falls back to evolution with degraded=true when secrets missing', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('official'));
    mockFunctionsInvoke.mockResolvedValueOnce(invokeResult({ secrets: ALL_SECRETS_MISSING }));

    const result = await resolveTransport();
    expect(result.transport).toBe('evolution');
    expect(result.requestedMode).toBe('official');
    expect(result.degraded).toBe(true);
  });

  it('lists all missing secret names in missingSecrets', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('official'));
    mockFunctionsInvoke.mockResolvedValueOnce(invokeResult({ secrets: ALL_SECRETS_MISSING }));

    const result = await resolveTransport();
    expect(result.missingSecrets).toContain('WHATSAPP_CLOUD_PHONE_NUMBER_ID');
    expect(result.missingSecrets).toContain('WHATSAPP_CLOUD_ACCESS_TOKEN');
  });

  it('lists only the missing secret when only one is absent', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('official'));
    mockFunctionsInvoke.mockResolvedValueOnce(invokeResult({ secrets: SECRETS_PHONE_MISSING }));

    const result = await resolveTransport();
    expect(result.degraded).toBe(true);
    expect(result.missingSecrets).toEqual(['WHATSAPP_CLOUD_PHONE_NUMBER_ID']);
  });

  it('includes reason string when degraded', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('official'));
    mockFunctionsInvoke.mockResolvedValueOnce(invokeResult({ secrets: ALL_SECRETS_MISSING }));

    const result = await resolveTransport();
    expect(result.reason).toBeTruthy();
    expect(result.reason).toContain('WHATSAPP_CLOUD_PHONE_NUMBER_ID');
  });

  it('falls back to evolution when secrets-status invoke fails', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('official'));
    mockFunctionsInvoke.mockResolvedValueOnce(invokeResult(null, { message: 'edge function error' }));

    const result = await resolveTransport();
    expect(result.transport).toBe('evolution');
    expect(result.degraded).toBe(true);
  });
});

describe('resolveTransport — cache and force', () => {
  it('caches transport result and avoids re-computation within 30s', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('unofficial'));
    await resolveTransport();
    const result = await resolveTransport();
    expect(result.transport).toBe('evolution');
    expect(mockSafeRpc).toHaveBeenCalledTimes(1);
  });

  it('re-resolves after 30s TTL', async () => {
    mockSafeRpc
      .mockResolvedValueOnce(rpcResult('unofficial'))
      .mockResolvedValueOnce(rpcResult('official'));
    mockFunctionsInvoke.mockResolvedValueOnce(invokeResult({ secrets: ALL_SECRETS_OK }));

    await resolveTransport();
    vi.advanceTimersByTime(30_001);
    const result = await resolveTransport();

    expect(result.transport).toBe('cloud');
  });

  it('force=true bypasses transport cache', async () => {
    mockSafeRpc
      .mockResolvedValueOnce(rpcResult('unofficial'))
      .mockResolvedValueOnce(rpcResult('official'));
    mockFunctionsInvoke.mockResolvedValueOnce(invokeResult({ secrets: ALL_SECRETS_OK }));

    await resolveTransport();
    const result = await resolveTransport(true);

    expect(result.transport).toBe('cloud');
    expect(mockSafeRpc).toHaveBeenCalledTimes(2);
  });
});

// ── invalidateTransportCache ──────────────────────────────────────────────────

describe('invalidateTransportCache', () => {
  it('clears transport cache so resolveTransport re-runs (mode cache remains)', async () => {
    // Prime: official + ok creds → cloud transport cached
    mockSafeRpc.mockResolvedValueOnce(rpcResult('official'));
    mockFunctionsInvoke.mockResolvedValueOnce(invokeResult({ secrets: ALL_SECRETS_OK }));
    const first = await resolveTransport();
    expect(first.transport).toBe('cloud');

    // Invalidate transport + cloud-creds cache only (mode 'official' stays cached)
    invalidateTransportCache();

    // Creds now missing → should degrade without re-calling RPC
    mockFunctionsInvoke.mockResolvedValueOnce(invokeResult({ secrets: ALL_SECRETS_MISSING }));
    const result = await resolveTransport();

    expect(result.transport).toBe('evolution');
    expect(result.degraded).toBe(true);
    expect(mockSafeRpc).toHaveBeenCalledTimes(1); // mode was still cached
  });

  it('also resets cloud-creds cache', async () => {
    // First: official + ok creds → cloud
    mockSafeRpc.mockResolvedValueOnce(rpcResult('official'));
    mockFunctionsInvoke.mockResolvedValueOnce(invokeResult({ secrets: ALL_SECRETS_OK }));
    await resolveTransport();

    // Invalidate transport cache — cloudCredsCache should be cleared too
    invalidateTransportCache();

    // Without invalidateTransportCache, the second call would use cached creds (ok).
    // With it cleared, the new mock (missing) takes effect.
    mockFunctionsInvoke.mockResolvedValueOnce(invokeResult({ secrets: ALL_SECRETS_MISSING }));
    const result = await resolveTransport();

    expect(result.degraded).toBe(true);
    expect(mockFunctionsInvoke).toHaveBeenCalledTimes(2); // creds re-fetched
  });
});

// ── getActiveWebhookUrl ───────────────────────────────────────────────────────

describe('getActiveWebhookUrl', () => {
  it('returns cloud webhook URL when transport is cloud', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('official'));
    mockFunctionsInvoke.mockResolvedValueOnce(invokeResult({ secrets: ALL_SECRETS_OK }));

    const url = await getActiveWebhookUrl();
    expect(url).toBe(getCloudWebhookUrl());
  });

  it('returns evolution webhook URL when transport is evolution', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('unofficial'));

    const url = await getActiveWebhookUrl();
    expect(url).toBe(getEvolutionWebhookUrl());
  });

  it('returns evolution webhook URL when official mode is degraded', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('official'));
    mockFunctionsInvoke.mockResolvedValueOnce(invokeResult({ secrets: ALL_SECRETS_MISSING }));

    const url = await getActiveWebhookUrl();
    expect(url).toBe(getEvolutionWebhookUrl());
  });
});

// ── sendTemplate ──────────────────────────────────────────────────────────────

describe('sendTemplate', () => {
  it('throws when transport is evolution (unofficial mode)', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('unofficial'));

    await expect(
      sendTemplate({ remoteJid: '5511@s.whatsapp.net', name: 'my_template' }),
    ).rejects.toThrow(/Templates exigem/);
  });

  it('throws with degraded reason when official mode is degraded', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('official'));
    mockFunctionsInvoke.mockResolvedValueOnce(invokeResult({ secrets: ALL_SECRETS_MISSING }));

    await expect(
      sendTemplate({ remoteJid: '5511@s.whatsapp.net', name: 'my_template' }),
    ).rejects.toThrow(/faltam secrets/);
  });

  it('invokes whatsapp-cloud-send with correct payload for cloud transport', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('official'));
    mockFunctionsInvoke
      .mockResolvedValueOnce(invokeResult({ secrets: ALL_SECRETS_OK }))   // creds check
      .mockResolvedValueOnce(invokeResult({ success: true }));              // cloud send

    await sendTemplate({
      remoteJid: '5511@s.whatsapp.net',
      name: 'welcome_template',
      language: 'pt_BR',
    });

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('whatsapp-cloud-send', {
      body: expect.objectContaining({
        type: 'template',
        template: expect.objectContaining({ name: 'welcome_template' }),
      }),
    });
  });

  it('defaults template language to pt_BR when not specified', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('official'));
    mockFunctionsInvoke
      .mockResolvedValueOnce(invokeResult({ secrets: ALL_SECRETS_OK }))
      .mockResolvedValueOnce(invokeResult({ success: true }));

    await sendTemplate({ remoteJid: '5511@s.whatsapp.net', name: 'tmpl' });

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('whatsapp-cloud-send', {
      body: expect.objectContaining({
        template: expect.objectContaining({ language: 'pt_BR' }),
      }),
    });
  });
});

// ── sendPresence ──────────────────────────────────────────────────────────────

describe('sendPresence', () => {
  it('returns skipped object for cloud transport', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('official'));
    mockFunctionsInvoke.mockResolvedValueOnce(invokeResult({ secrets: ALL_SECRETS_OK }));

    const result = await sendPresence({ remoteJid: '5511@s.whatsapp.net', presence: 'composing' });
    expect(result).toEqual({ skipped: true, reason: 'presence_unsupported_on_cloud_api' });
  });

  it('does not call functions.invoke for the send when cloud (just skips)', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('official'));
    mockFunctionsInvoke.mockResolvedValueOnce(invokeResult({ secrets: ALL_SECRETS_OK }));

    await sendPresence({ remoteJid: '5511@s.whatsapp.net', presence: 'paused' });

    // Only the secrets-status call should have happened, not evolution-api
    expect(mockFunctionsInvoke).not.toHaveBeenCalledWith('evolution-api', expect.anything());
  });

  it('invokes evolution send-presence for unofficial transport', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('unofficial'));
    mockFunctionsInvoke.mockResolvedValueOnce(invokeResult({ success: true }));

    await sendPresence({ remoteJid: '5511@s.whatsapp.net', presence: 'recording' });

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('evolution-api', {
      body: expect.objectContaining({ action: 'send-presence', presence: 'recording' }),
    });
  });
});

// ── sendText (representative routing test) ────────────────────────────────────

describe('sendText', () => {
  it('calls evolution-api with action=send-text for unofficial transport', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('unofficial'));
    mockFunctionsInvoke.mockResolvedValueOnce(invokeResult({ success: true }));

    await sendText({ remoteJid: '5511999999999@s.whatsapp.net', text: 'Olá!' });

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('evolution-api', {
      body: expect.objectContaining({ action: 'send-text', text: 'Olá!' }),
    });
  });

  it('calls whatsapp-cloud-send with type=text for cloud transport', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('official'));
    mockFunctionsInvoke
      .mockResolvedValueOnce(invokeResult({ secrets: ALL_SECRETS_OK }))
      .mockResolvedValueOnce(invokeResult({ success: true }));

    await sendText({ remoteJid: '5511999999999@s.whatsapp.net', text: 'Hi!' });

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('whatsapp-cloud-send', {
      body: expect.objectContaining({ type: 'text', text: 'Hi!' }),
    });
  });

  it('passes stripped phone number (without @domain) to the cloud function', async () => {
    mockSafeRpc.mockResolvedValueOnce(rpcResult('official'));
    mockFunctionsInvoke
      .mockResolvedValueOnce(invokeResult({ secrets: ALL_SECRETS_OK }))
      .mockResolvedValueOnce(invokeResult({ success: true }));

    await sendText({ remoteJid: '5511999999999@s.whatsapp.net', text: 'test' });

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('whatsapp-cloud-send', {
      body: expect.objectContaining({ to: '5511999999999' }),
    });
  });
});
