import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MAX_PTT_DURATION_SEC,
  MAX_PTT_SIZE_BYTES,
  MIN_PTT_DURATION_SEC,
  probeAudioDuration,
  validatePttBlob,
} from '../pttLimits';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeBlob(sizeBytes: number): Blob {
  return new Blob([new Uint8Array(sizeBytes)], { type: 'audio/ogg' });
}

type AudioEvent = 'loadedmetadata' | 'error' | 'none';

function mockAudio(durationValue: number | null, event: AudioEvent) {
  const handlers: Record<string, (() => void)[]> = {};
  const el = {
    preload: '' as string,
    get duration() {
      return durationValue === null ? NaN : durationValue;
    },
    addEventListener(name: string, cb: () => void) {
      handlers[name] = handlers[name] ?? [];
      handlers[name].push(cb);
    },
    removeEventListener(name: string, cb: () => void) {
      handlers[name] = (handlers[name] ?? []).filter((f) => f !== cb);
    },
  };
  Object.defineProperty(el, 'src', {
    set(_v: string) {
      if (event !== 'none') {
        setTimeout(() => handlers[event]?.forEach((cb) => cb()), 50);
      }
    },
    get() {
      return '';
    },
    configurable: true,
  });
  vi.spyOn(document, 'createElement').mockReturnValueOnce(el as unknown as HTMLElement);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── constants ─────────────────────────────────────────────────────────────────

describe('pttLimits — exported constants', () => {
  it('MAX_PTT_DURATION_SEC is 16 minutes', () => {
    expect(MAX_PTT_DURATION_SEC).toBe(16 * 60);
  });

  it('MAX_PTT_SIZE_BYTES is 16 MB', () => {
    expect(MAX_PTT_SIZE_BYTES).toBe(16 * 1024 * 1024);
  });

  it('MIN_PTT_DURATION_SEC is 0.5 seconds', () => {
    expect(MIN_PTT_DURATION_SEC).toBe(0.5);
  });

  it('MAX_PTT_DURATION_SEC is a positive integer', () => {
    expect(MAX_PTT_DURATION_SEC).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_PTT_DURATION_SEC)).toBe(true);
  });

  it('MAX_PTT_SIZE_BYTES is a positive integer', () => {
    expect(MAX_PTT_SIZE_BYTES).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_PTT_SIZE_BYTES)).toBe(true);
  });
});

// ── probeAudioDuration ────────────────────────────────────────────────────────

describe('probeAudioDuration — valid duration', () => {
  it('resolves with the duration when loadedmetadata fires', async () => {
    mockAudio(30, 'loadedmetadata');
    const p = probeAudioDuration(makeBlob(1024));
    await vi.advanceTimersByTimeAsync(100);
    expect(await p).toBe(30);
  });

  it('resolves with fractional seconds', async () => {
    mockAudio(1.5, 'loadedmetadata');
    const p = probeAudioDuration(makeBlob(1024));
    await vi.advanceTimersByTimeAsync(100);
    expect(await p).toBe(1.5);
  });
});

describe('probeAudioDuration — undefined cases', () => {
  it('resolves undefined when the audio element errors', async () => {
    mockAudio(null, 'error');
    const p = probeAudioDuration(makeBlob(1024));
    await vi.advanceTimersByTimeAsync(100);
    expect(await p).toBeUndefined();
  });

  it('resolves undefined after the 4-second safety timeout', async () => {
    mockAudio(null, 'none');
    const p = probeAudioDuration(makeBlob(1024));
    await vi.advanceTimersByTimeAsync(4001);
    expect(await p).toBeUndefined();
  });

  it('resolves undefined when duration is 0 (treated as no-op)', async () => {
    mockAudio(0, 'loadedmetadata');
    const p = probeAudioDuration(makeBlob(1024));
    await vi.advanceTimersByTimeAsync(100);
    expect(await p).toBeUndefined();
  });

  it('resolves undefined when duration is NaN', async () => {
    mockAudio(null, 'loadedmetadata'); // durationValue null → NaN
    const p = probeAudioDuration(makeBlob(1024));
    await vi.advanceTimersByTimeAsync(100);
    expect(await p).toBeUndefined();
  });
});

// ── validatePttBlob — empty / falsy ──────────────────────────────────────────

describe('validatePttBlob — empty blob', () => {
  it('returns ok=false for a zero-byte blob', async () => {
    const result = await validatePttBlob(makeBlob(0));
    expect(result.ok).toBe(false);
  });

  it('message mentions "Áudio vazio" for empty blob', async () => {
    const result = await validatePttBlob(makeBlob(0));
    expect(result.message).toContain('Áudio vazio');
  });

  it('returns ok=false when blob is falsy (null cast)', async () => {
    const result = await validatePttBlob(null as unknown as Blob);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Áudio vazio');
  });
});

// ── validatePttBlob — size limit ─────────────────────────────────────────────

describe('validatePttBlob — oversized', () => {
  it('returns ok=false when blob exceeds maxBytes limit', async () => {
    const blob = makeBlob(2 * 1024 * 1024); // 2 MB
    const result = await validatePttBlob(blob, { maxBytes: 1 * 1024 * 1024 });
    expect(result.ok).toBe(false);
  });

  it('message mentions "muito grande" for oversized blob', async () => {
    const blob = makeBlob(2 * 1024 * 1024);
    const result = await validatePttBlob(blob, { maxBytes: 1 * 1024 * 1024 });
    expect(result.message).toContain('muito grande');
  });

  it('message includes the blob size in human-readable form', async () => {
    const blob = makeBlob(2 * 1024 * 1024);
    const result = await validatePttBlob(blob, { maxBytes: 1 * 1024 * 1024 });
    expect(result.message).toContain('2.0 MB');
  });

  it('message includes the limit in human-readable form', async () => {
    const blob = makeBlob(2 * 1024 * 1024);
    const result = await validatePttBlob(blob, { maxBytes: 1 * 1024 * 1024 });
    expect(result.message).toContain('1.0 MB');
  });

  it('accepts blob exactly at the size limit', async () => {
    mockAudio(30, 'loadedmetadata');
    const maxBytes = 1024;
    const blob = makeBlob(maxBytes);
    const p = validatePttBlob(blob, { maxBytes });
    await vi.advanceTimersByTimeAsync(100);
    const result = await p;
    expect(result.ok).toBe(true);
  });
});

// ── validatePttBlob — duration too short ──────────────────────────────────────

describe('validatePttBlob — duration too short', () => {
  it('returns ok=false when duration is below minDuration', async () => {
    mockAudio(0.1, 'loadedmetadata');
    const p = validatePttBlob(makeBlob(1024), { minDurationSec: 0.5 });
    await vi.advanceTimersByTimeAsync(100);
    const result = await p;
    expect(result.ok).toBe(false);
  });

  it('message mentions "muito curto" for short audio', async () => {
    mockAudio(0.1, 'loadedmetadata');
    const p = validatePttBlob(makeBlob(1024), { minDurationSec: 0.5 });
    await vi.advanceTimersByTimeAsync(100);
    const result = await p;
    expect(result.message).toContain('muito curto');
  });

  it('includes durationSec in result when too short', async () => {
    mockAudio(0.1, 'loadedmetadata');
    const p = validatePttBlob(makeBlob(1024), { minDurationSec: 0.5 });
    await vi.advanceTimersByTimeAsync(100);
    const result = await p;
    expect(result.durationSec).toBe(0.1);
  });

  it('accepts duration exactly at the minimum boundary', async () => {
    mockAudio(0.5, 'loadedmetadata');
    const p = validatePttBlob(makeBlob(1024), { minDurationSec: 0.5 });
    await vi.advanceTimersByTimeAsync(100);
    const result = await p;
    expect(result.ok).toBe(true);
  });
});

// ── validatePttBlob — duration too long ───────────────────────────────────────

describe('validatePttBlob — duration too long', () => {
  it('returns ok=false when duration exceeds maxDuration', async () => {
    mockAudio(61, 'loadedmetadata');
    const p = validatePttBlob(makeBlob(1024), { maxDurationSec: 60 });
    await vi.advanceTimersByTimeAsync(100);
    const result = await p;
    expect(result.ok).toBe(false);
  });

  it('message mentions "muito longo" for too long audio', async () => {
    mockAudio(61, 'loadedmetadata');
    const p = validatePttBlob(makeBlob(1024), { maxDurationSec: 60 });
    await vi.advanceTimersByTimeAsync(100);
    const result = await p;
    expect(result.message).toContain('muito longo');
  });

  it('includes durationSec in result when too long', async () => {
    mockAudio(62, 'loadedmetadata');
    const p = validatePttBlob(makeBlob(1024), { maxDurationSec: 60 });
    await vi.advanceTimersByTimeAsync(100);
    const result = await p;
    expect(result.durationSec).toBe(62);
  });

  it('message includes formatted duration "1m 2s" for 62 seconds', async () => {
    mockAudio(62, 'loadedmetadata');
    const p = validatePttBlob(makeBlob(1024), { maxDurationSec: 60 });
    await vi.advanceTimersByTimeAsync(100);
    const result = await p;
    expect(result.message).toContain('1m 2s');
  });

  it('message includes formatted limit "1m 0s" for 60-second limit', async () => {
    mockAudio(62, 'loadedmetadata');
    const p = validatePttBlob(makeBlob(1024), { maxDurationSec: 60 });
    await vi.advanceTimersByTimeAsync(100);
    const result = await p;
    expect(result.message).toContain('1m 0s');
  });

  it('accepts duration exactly at the maximum boundary', async () => {
    mockAudio(60, 'loadedmetadata');
    const p = validatePttBlob(makeBlob(1024), { maxDurationSec: 60 });
    await vi.advanceTimersByTimeAsync(100);
    const result = await p;
    expect(result.ok).toBe(true);
  });
});

// ── validatePttBlob — happy path ──────────────────────────────────────────────

describe('validatePttBlob — valid audio', () => {
  it('returns ok=true for a blob with valid duration', async () => {
    mockAudio(30, 'loadedmetadata');
    const p = validatePttBlob(makeBlob(1024));
    await vi.advanceTimersByTimeAsync(100);
    expect((await p).ok).toBe(true);
  });

  it('includes durationSec when duration is known', async () => {
    mockAudio(30, 'loadedmetadata');
    const p = validatePttBlob(makeBlob(1024));
    await vi.advanceTimersByTimeAsync(100);
    expect((await p).durationSec).toBe(30);
  });

  it('returns ok=true even when duration cannot be probed (codec failure)', async () => {
    mockAudio(null, 'error');
    const p = validatePttBlob(makeBlob(1024));
    await vi.advanceTimersByTimeAsync(100);
    const result = await p;
    expect(result.ok).toBe(true);
    expect(result.durationSec).toBeUndefined();
  });

  it('returns ok=true when probe times out (4-second safety)', async () => {
    mockAudio(null, 'none');
    const p = validatePttBlob(makeBlob(1024));
    await vi.advanceTimersByTimeAsync(4001);
    const result = await p;
    expect(result.ok).toBe(true);
    expect(result.durationSec).toBeUndefined();
  });

  it('has no message property on success', async () => {
    mockAudio(30, 'loadedmetadata');
    const p = validatePttBlob(makeBlob(1024));
    await vi.advanceTimersByTimeAsync(100);
    expect((await p).message).toBeUndefined();
  });
});

// ── validatePttBlob — limits override ────────────────────────────────────────

describe('validatePttBlob — limits override', () => {
  it('respects custom maxBytes override', async () => {
    const blob = makeBlob(500);
    const result = await validatePttBlob(blob, { maxBytes: 100 });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('muito grande');
  });

  it('respects custom maxDurationSec override', async () => {
    mockAudio(35, 'loadedmetadata');
    const p = validatePttBlob(makeBlob(1024), { maxDurationSec: 30 });
    await vi.advanceTimersByTimeAsync(100);
    const result = await p;
    expect(result.ok).toBe(false);
    expect(result.message).toContain('muito longo');
  });

  it('respects custom minDurationSec override', async () => {
    mockAudio(1, 'loadedmetadata');
    const p = validatePttBlob(makeBlob(1024), { minDurationSec: 2 });
    await vi.advanceTimersByTimeAsync(100);
    const result = await p;
    expect(result.ok).toBe(false);
    expect(result.message).toContain('muito curto');
  });

  it('uses global defaults when no limits are provided', async () => {
    mockAudio(30, 'loadedmetadata');
    const p = validatePttBlob(makeBlob(1024));
    await vi.advanceTimersByTimeAsync(100);
    expect((await p).ok).toBe(true);
  });

  it('size check fires before duration probe (short-circuits)', async () => {
    // No audio mock set up — if size check fires first, duration probe never runs
    const blob = makeBlob(200);
    const result = await validatePttBlob(blob, { maxBytes: 100 });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('muito grande');
  });
});
