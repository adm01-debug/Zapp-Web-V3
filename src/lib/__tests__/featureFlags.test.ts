import { describe, it, expect } from 'vitest';
import {
  isFeatureEnabled,
  getAllFlags,
} from '@/lib/featureFlags';

// ── isFeatureEnabled — defaults (no flagCache loaded) ─────────────────────────
//
// When loadFeatureFlags() has NOT been called, flagCache is null and the
// function falls back to DEFAULTS. These tests exercise the logic branches
// without touching Supabase.

describe('isFeatureEnabled — default-enabled flags', () => {
  it('ai_agents is enabled by default', () => {
    expect(isFeatureEnabled('ai_agents')).toBe(true);
  });

  it('sla_siren is enabled by default', () => {
    expect(isFeatureEnabled('sla_siren')).toBe(true);
  });

  it('message_queue_retry is enabled by default', () => {
    expect(isFeatureEnabled('message_queue_retry')).toBe(true);
  });

  it('optimistic_messages is enabled by default', () => {
    expect(isFeatureEnabled('optimistic_messages')).toBe(true);
  });

  it('auto_retry_failed is enabled by default', () => {
    expect(isFeatureEnabled('auto_retry_failed')).toBe(true);
  });

  it('whisper_mode is enabled by default', () => {
    expect(isFeatureEnabled('whisper_mode')).toBe(true);
  });

  it('dark_mode is enabled by default', () => {
    expect(isFeatureEnabled('dark_mode')).toBe(true);
  });
});

describe('isFeatureEnabled — default-disabled flags', () => {
  it('advanced_transcription is disabled by default', () => {
    expect(isFeatureEnabled('advanced_transcription')).toBe(false);
  });
});

// ── isFeatureEnabled — percentage-based (v2_audio_recorder: percentage=0) ─────

describe('isFeatureEnabled — percentage=0 flag', () => {
  it('v2_audio_recorder returns false for any userId when percentage=0', () => {
    expect(isFeatureEnabled('v2_audio_recorder', { userId: 'user-abc' })).toBe(false);
  });

  it('v2_audio_recorder returns false without context when percentage=0', () => {
    // No userId → percentage check returns false immediately
    expect(isFeatureEnabled('v2_audio_recorder')).toBe(false);
  });

  it('v2_audio_recorder returns false even when userId provided', () => {
    expect(isFeatureEnabled('v2_audio_recorder', { userId: 'any-user' })).toBe(false);
  });
});

// ── isFeatureEnabled — context: userId ────────────────────────────────────────

describe('isFeatureEnabled — context with userId', () => {
  it('simple enabled flag returns true regardless of userId', () => {
    expect(isFeatureEnabled('ai_agents', { userId: 'user-xyz' })).toBe(true);
  });

  it('simple enabled flag returns true regardless of tenantId', () => {
    expect(isFeatureEnabled('ai_agents', { tenantId: 'tenant-1' })).toBe(true);
  });

  it('disabled flag returns false even with userId provided', () => {
    expect(isFeatureEnabled('advanced_transcription', { userId: 'user-abc' })).toBe(false);
  });
});

// ── isFeatureEnabled — percentage-based hashing ───────────────────────────────

describe('isFeatureEnabled — percentage hash stability', () => {
  it('same userId produces same result on repeated calls (deterministic hash)', () => {
    // We can't control which side of the threshold 'user-1' falls on,
    // but the result must be stable.
    const r1 = isFeatureEnabled('v2_audio_recorder', { userId: 'user-1' });
    const r2 = isFeatureEnabled('v2_audio_recorder', { userId: 'user-1' });
    expect(r1).toBe(r2);
  });
});

// ── getAllFlags ────────────────────────────────────────────────────────────────

describe('getAllFlags', () => {
  it('returns an object when flagCache is null (returns DEFAULTS)', () => {
    const flags = getAllFlags();
    expect(typeof flags).toBe('object');
    expect(flags).not.toBeNull();
  });

  it('returned object includes ai_agents flag', () => {
    const flags = getAllFlags();
    expect('ai_agents' in flags).toBe(true);
  });

  it('ai_agents config shows enabled: true', () => {
    const flags = getAllFlags();
    expect(flags['ai_agents'].enabled).toBe(true);
  });

  it('advanced_transcription config shows enabled: false', () => {
    const flags = getAllFlags();
    expect(flags['advanced_transcription'].enabled).toBe(false);
  });

  it('returns the same object on repeated calls (no flagCache side-effect)', () => {
    const f1 = getAllFlags();
    const f2 = getAllFlags();
    expect(f1).toBe(f2);
  });
});
