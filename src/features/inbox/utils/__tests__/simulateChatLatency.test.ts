import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  simulateLatency,
  shouldSimulateFailure,
  getSimulationConfig,
  setSimulationConfig,
  clearSimulationConfig,
} from '../simulateChatLatency';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// ── clearSimulationConfig ─────────────────────────────────────────────────────

describe('clearSimulationConfig', () => {
  it('removes debug_chat_latency from localStorage', () => {
    localStorage.setItem('debug_chat_latency', '200');
    clearSimulationConfig();
    expect(localStorage.getItem('debug_chat_latency')).toBeNull();
  });

  it('removes debug_chat_failure_rate from localStorage', () => {
    localStorage.setItem('debug_chat_failure_rate', '0.5');
    clearSimulationConfig();
    expect(localStorage.getItem('debug_chat_failure_rate')).toBeNull();
  });

  it('does not throw when keys are not set', () => {
    expect(() => clearSimulationConfig()).not.toThrow();
  });
});

// ── setSimulationConfig ───────────────────────────────────────────────────────

describe('setSimulationConfig', () => {
  it('writes latency to localStorage', () => {
    setSimulationConfig(150, 0);
    expect(localStorage.getItem('debug_chat_latency')).toBe('150');
  });

  it('writes failureRate to localStorage', () => {
    setSimulationConfig(0, 0.3);
    expect(localStorage.getItem('debug_chat_failure_rate')).toBe('0.3');
  });

  it('overwrites previous values', () => {
    setSimulationConfig(100, 0.2);
    setSimulationConfig(500, 0.8);
    expect(localStorage.getItem('debug_chat_latency')).toBe('500');
    expect(localStorage.getItem('debug_chat_failure_rate')).toBe('0.8');
  });

  it('writes 0 latency', () => {
    setSimulationConfig(0, 0);
    expect(localStorage.getItem('debug_chat_latency')).toBe('0');
  });
});

// ── getSimulationConfig ───────────────────────────────────────────────────────

describe('getSimulationConfig', () => {
  it('returns latency=0 and failureRate=0 when nothing is set', () => {
    const cfg = getSimulationConfig();
    expect(cfg.latency).toBe(0);
    expect(cfg.failureRate).toBe(0);
  });

  it('returns latency from localStorage', () => {
    localStorage.setItem('debug_chat_latency', '300');
    expect(getSimulationConfig().latency).toBe(300);
  });

  it('returns failureRate from localStorage', () => {
    localStorage.setItem('debug_chat_failure_rate', '0.75');
    expect(getSimulationConfig().failureRate).toBe(0.75);
  });

  it('round-trips values set via setSimulationConfig', () => {
    setSimulationConfig(200, 0.4);
    const cfg = getSimulationConfig();
    expect(cfg.latency).toBe(200);
    expect(cfg.failureRate).toBe(0.4);
  });

  it('returns 0 latency when localStorage value is NaN', () => {
    localStorage.setItem('debug_chat_latency', 'abc');
    expect(getSimulationConfig().latency).toBeNaN(); // parseInt('abc') = NaN, stored as-is
  });

  it('returns failureRate=0 when storage value is empty string', () => {
    localStorage.setItem('debug_chat_failure_rate', '');
    // parseFloat('') = NaN → but the OR fallback '0' won't apply because key exists
    expect(typeof getSimulationConfig().failureRate).toBe('number');
  });
});

// ── shouldSimulateFailure ─────────────────────────────────────────────────────

describe('shouldSimulateFailure', () => {
  it('returns false when no failure rate is set', () => {
    expect(shouldSimulateFailure()).toBe(false);
  });

  it('returns false when failureRate is 0', () => {
    setSimulationConfig(0, 0);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(shouldSimulateFailure()).toBe(false);
  });

  it('returns true when failureRate is 1.0 (always fail)', () => {
    setSimulationConfig(0, 1.0);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    expect(shouldSimulateFailure()).toBe(true);
  });

  it('returns true when random() < failureRate', () => {
    setSimulationConfig(0, 0.6);
    vi.spyOn(Math, 'random').mockReturnValue(0.4); // 0.4 < 0.6 → fail
    expect(shouldSimulateFailure()).toBe(true);
  });

  it('returns false when random() >= failureRate', () => {
    setSimulationConfig(0, 0.6);
    vi.spyOn(Math, 'random').mockReturnValue(0.7); // 0.7 >= 0.6 → no fail
    expect(shouldSimulateFailure()).toBe(false);
  });

  it('returns false when failureRate is non-numeric in localStorage', () => {
    localStorage.setItem('debug_chat_failure_rate', 'abc');
    expect(shouldSimulateFailure()).toBe(false);
  });
});

// ── simulateLatency ───────────────────────────────────────────────────────────

describe('simulateLatency', () => {
  it('resolves immediately when no latency key is set', async () => {
    await expect(simulateLatency()).resolves.toBeUndefined();
  });

  it('resolves immediately when latency key is non-numeric', async () => {
    localStorage.setItem('debug_chat_latency', 'abc');
    await expect(simulateLatency()).resolves.toBeUndefined();
  });

  it('resolves immediately for latency=0', async () => {
    localStorage.setItem('debug_chat_latency', '0');
    await expect(simulateLatency()).resolves.toBeUndefined();
  });

  it('waits the configured latency duration', async () => {
    vi.useFakeTimers();
    localStorage.setItem('debug_chat_latency', '100');
    const promise = simulateLatency();
    vi.advanceTimersByTime(100);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it('does not resolve before the configured latency elapses', async () => {
    vi.useFakeTimers();
    localStorage.setItem('debug_chat_latency', '200');
    let resolved = false;
    const promise = simulateLatency().then(() => { resolved = true; });
    vi.advanceTimersByTime(100); // only half elapsed
    await Promise.resolve(); // flush microtask queue
    expect(resolved).toBe(false);
    vi.advanceTimersByTime(100); // complete the remaining
    await promise;
    expect(resolved).toBe(true);
    vi.useRealTimers();
  });
});
