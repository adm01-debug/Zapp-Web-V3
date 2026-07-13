import { describe, it, expect, beforeEach } from 'vitest';
import {
  canCall,
  recordSuccess,
  recordFailure,
  inspect,
  getAllBreakerStates,
  subscribeBreakerEvents,
  CircuitOpenError,
  DEFAULT_BREAKER_CONFIG,
  __resetBreakerState,
  __setBreakerNow,
} from '@/lib/evolutionCircuitBreaker';
import type { CircuitBreakerConfig, BreakerEvent } from '@/lib/evolutionCircuitBreaker';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeCfg(overrides: Partial<CircuitBreakerConfig> = {}): CircuitBreakerConfig {
  return { ...DEFAULT_BREAKER_CONFIG, ...overrides };
}

beforeEach(() => {
  __resetBreakerState();
  __setBreakerNow(() => 1_000); // deterministic time
});

// ── DEFAULT_BREAKER_CONFIG ────────────────────────────────────────────────────

describe('DEFAULT_BREAKER_CONFIG', () => {
  it('failureThreshold is 5', () => {
    expect(DEFAULT_BREAKER_CONFIG.failureThreshold).toBe(5);
  });

  it('cooldownMs is 30_000', () => {
    expect(DEFAULT_BREAKER_CONFIG.cooldownMs).toBe(30_000);
  });
});

// ── inspect — initial state ───────────────────────────────────────────────────

describe('inspect — initial state', () => {
  it('new instance starts CLOSED', () => {
    expect(inspect('new-instance').state).toBe('CLOSED');
  });

  it('new instance has 0 consecutiveFailures', () => {
    expect(inspect('new-instance').consecutiveFailures).toBe(0);
  });

  it('new instance has openUntil = 0', () => {
    expect(inspect('new-instance').openUntil).toBe(0);
  });

  it('inspect does not mutate state', () => {
    inspect('x');
    inspect('x');
    expect(inspect('x').state).toBe('CLOSED');
  });
});

// ── canCall — CLOSED ──────────────────────────────────────────────────────────

describe('canCall — CLOSED state', () => {
  it('returns allowed=true for a fresh instance', () => {
    const result = canCall('inst');
    expect(result.allowed).toBe(true);
  });

  it('returns state=CLOSED for a fresh instance', () => {
    const result = canCall('inst');
    expect(result.state).toBe('CLOSED');
  });

  it('does not include retryAfterMs when allowed', () => {
    const result = canCall('inst');
    expect(result.retryAfterMs).toBeUndefined();
  });
});

// ── recordFailure — CLOSED → OPEN ────────────────────────────────────────────

describe('recordFailure — accumulates below threshold', () => {
  it('stays CLOSED after one failure (threshold=5)', () => {
    recordFailure('inst', makeCfg({ failureThreshold: 5 }));
    expect(inspect('inst').state).toBe('CLOSED');
  });

  it('increments consecutiveFailures on each failure', () => {
    recordFailure('inst', makeCfg());
    recordFailure('inst', makeCfg());
    expect(inspect('inst').consecutiveFailures).toBe(2);
  });

  it('stays CLOSED after threshold-1 failures', () => {
    const cfg = makeCfg({ failureThreshold: 3 });
    recordFailure('inst', cfg);
    recordFailure('inst', cfg);
    expect(inspect('inst').state).toBe('CLOSED');
  });
});

describe('recordFailure — CLOSED → OPEN at threshold', () => {
  it('opens circuit when consecutiveFailures reaches threshold', () => {
    const cfg = makeCfg({ failureThreshold: 3, cooldownMs: 5_000 });
    recordFailure('inst', cfg);
    recordFailure('inst', cfg);
    const result = recordFailure('inst', cfg);
    expect(result.state).toBe('OPEN');
    expect(inspect('inst').state).toBe('OPEN');
  });

  it('sets openUntil = now + cooldownMs', () => {
    __setBreakerNow(() => 10_000);
    const cfg = makeCfg({ failureThreshold: 1, cooldownMs: 5_000 });
    recordFailure('inst', cfg);
    expect(inspect('inst').openUntil).toBe(15_000);
  });

  it('returns failure count in result', () => {
    const cfg = makeCfg({ failureThreshold: 2 });
    recordFailure('inst', cfg);
    const result = recordFailure('inst', cfg);
    expect(result.failures).toBe(2);
  });
});

// ── canCall — OPEN ────────────────────────────────────────────────────────────

describe('canCall — OPEN state', () => {
  function openCircuit(instance = 'inst') {
    const cfg = makeCfg({ failureThreshold: 1, cooldownMs: 10_000 });
    recordFailure(instance, cfg);
  }

  it('returns allowed=false when circuit is OPEN and cooldown not elapsed', () => {
    openCircuit();
    // now=1000, openUntil=11000 → remaining=10000 > 0
    const result = canCall('inst');
    expect(result.allowed).toBe(false);
  });

  it('returns state=OPEN when circuit is open', () => {
    openCircuit();
    const result = canCall('inst');
    expect(result.state).toBe('OPEN');
  });

  it('returns retryAfterMs when circuit is open', () => {
    openCircuit(); // openUntil=11000, now=1000
    const result = canCall('inst');
    expect(result.retryAfterMs).toBe(10_000);
  });

  it('transitions to HALF_OPEN when cooldown has elapsed', () => {
    openCircuit(); // openUntil=11000
    __setBreakerNow(() => 12_000); // past cooldown
    const result = canCall('inst');
    expect(result.allowed).toBe(true);
    expect(result.state).toBe('HALF_OPEN');
  });

  it('sets state to HALF_OPEN in the entry after cooldown elapsed', () => {
    openCircuit();
    __setBreakerNow(() => 12_000);
    canCall('inst');
    expect(inspect('inst').state).toBe('HALF_OPEN');
  });
});

// ── recordSuccess ─────────────────────────────────────────────────────────────

describe('recordSuccess — CLOSED', () => {
  it('stays CLOSED on success when already closed with no failures', () => {
    recordSuccess('inst');
    expect(inspect('inst').state).toBe('CLOSED');
  });

  it('resets consecutiveFailures to 0 when failures had accumulated', () => {
    recordFailure('inst', makeCfg({ failureThreshold: 5 }));
    recordFailure('inst', makeCfg({ failureThreshold: 5 }));
    recordSuccess('inst');
    expect(inspect('inst').consecutiveFailures).toBe(0);
  });
});

describe('recordSuccess — HALF_OPEN → CLOSED', () => {
  it('closes circuit after a successful probe', () => {
    // Open then wait for cooldown
    const cfg = makeCfg({ failureThreshold: 1, cooldownMs: 5_000 });
    recordFailure('inst', cfg);
    __setBreakerNow(() => 10_000);
    canCall('inst'); // transitions to HALF_OPEN
    recordSuccess('inst');
    expect(inspect('inst').state).toBe('CLOSED');
  });
});

// ── recordFailure — HALF_OPEN → OPEN ─────────────────────────────────────────

describe('recordFailure — HALF_OPEN → OPEN (probe failure)', () => {
  function toHalfOpen(instance = 'inst') {
    const cfg = makeCfg({ failureThreshold: 1, cooldownMs: 5_000 });
    recordFailure(instance, cfg);
    __setBreakerNow(() => 10_000);
    canCall(instance); // OPEN → HALF_OPEN
  }

  it('re-opens circuit when probe fails', () => {
    toHalfOpen();
    recordFailure('inst', makeCfg({ cooldownMs: 5_000 }));
    expect(inspect('inst').state).toBe('OPEN');
  });

  it('sets fresh openUntil = now + cooldown after probe failure', () => {
    toHalfOpen(); // now=10000
    recordFailure('inst', makeCfg({ cooldownMs: 5_000 }));
    expect(inspect('inst').openUntil).toBe(15_000);
  });
});

// ── getAllBreakerStates ────────────────────────────────────────────────────────

describe('getAllBreakerStates', () => {
  it('returns empty array when no instances have been accessed', () => {
    expect(getAllBreakerStates()).toHaveLength(0);
  });

  it('includes entries for each accessed instance', () => {
    canCall('a');
    canCall('b');
    const states = getAllBreakerStates();
    const names = states.map(s => s.instance);
    expect(names).toContain('a');
    expect(names).toContain('b');
  });

  it('returns state with instance field', () => {
    canCall('x');
    const [entry] = getAllBreakerStates();
    expect(entry.instance).toBe('x');
    expect(entry.state).toBe('CLOSED');
  });
});

// ── subscribeBreakerEvents ────────────────────────────────────────────────────

describe('subscribeBreakerEvents', () => {
  it('receives CLOSED→OPEN event when circuit trips', () => {
    const events: BreakerEvent[] = [];
    subscribeBreakerEvents(e => events.push(e));
    const cfg = makeCfg({ failureThreshold: 1 });
    recordFailure('inst', cfg);
    expect(events).toHaveLength(1);
    expect(events[0].from).toBe('CLOSED');
    expect(events[0].to).toBe('OPEN');
  });

  it('receives OPEN→HALF_OPEN event when cooldown elapses', () => {
    const events: BreakerEvent[] = [];
    const cfg = makeCfg({ failureThreshold: 1, cooldownMs: 5_000 });
    recordFailure('inst', cfg);
    subscribeBreakerEvents(e => events.push(e));
    __setBreakerNow(() => 10_000);
    canCall('inst');
    expect(events.some(e => e.from === 'OPEN' && e.to === 'HALF_OPEN')).toBe(true);
  });

  it('returns unsubscribe function that stops delivery', () => {
    const events: BreakerEvent[] = [];
    const unsub = subscribeBreakerEvents(e => events.push(e));
    unsub();
    recordFailure('inst', makeCfg({ failureThreshold: 1 }));
    expect(events).toHaveLength(0);
  });

  it('event has tag = "evolution-breaker"', () => {
    const events: BreakerEvent[] = [];
    subscribeBreakerEvents(e => events.push(e));
    recordFailure('inst', makeCfg({ failureThreshold: 1 }));
    expect(events[0].tag).toBe('evolution-breaker');
  });

  it('event has instance field', () => {
    const events: BreakerEvent[] = [];
    subscribeBreakerEvents(e => events.push(e));
    recordFailure('my-instance', makeCfg({ failureThreshold: 1 }));
    expect(events[0].instance).toBe('my-instance');
  });

  it('event includes cooldownMs when transitioning to OPEN', () => {
    const events: BreakerEvent[] = [];
    subscribeBreakerEvents(e => events.push(e));
    recordFailure('inst', makeCfg({ failureThreshold: 1, cooldownMs: 9_000 }));
    expect(events[0].cooldownMs).toBe(9_000);
  });
});

// ── CircuitOpenError ──────────────────────────────────────────────────────────

describe('CircuitOpenError', () => {
  it('is an instance of Error', () => {
    expect(new CircuitOpenError('inst', 5000)).toBeInstanceOf(Error);
  });

  it('has name CircuitOpenError', () => {
    expect(new CircuitOpenError('inst', 5000).name).toBe('CircuitOpenError');
  });

  it('has code = "circuit_open"', () => {
    expect(new CircuitOpenError('inst', 5000).code).toBe('circuit_open');
  });

  it('stores retryAfterMs', () => {
    expect(new CircuitOpenError('inst', 12_000).retryAfterMs).toBe(12_000);
  });

  it('message includes instance name', () => {
    const err = new CircuitOpenError('whatsapp-main', 5000);
    expect(err.message).toContain('whatsapp-main');
  });

  it('message includes retry wait in seconds', () => {
    const err = new CircuitOpenError('inst', 30_000);
    expect(err.message).toContain('30s');
  });
});

// ── instance isolation ────────────────────────────────────────────────────────

describe('instance isolation', () => {
  it('failures on one instance do not affect another', () => {
    const cfg = makeCfg({ failureThreshold: 3 });
    recordFailure('a', cfg);
    recordFailure('a', cfg);
    recordFailure('a', cfg); // 'a' is now OPEN
    expect(inspect('b').state).toBe('CLOSED');
  });

  it('success on one instance does not affect another', () => {
    const cfg = makeCfg({ failureThreshold: 1 });
    recordFailure('a', cfg); // a=OPEN
    recordSuccess('b');       // b=CLOSED
    expect(inspect('a').state).toBe('OPEN');
  });
});
