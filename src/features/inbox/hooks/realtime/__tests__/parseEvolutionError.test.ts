import { describe, it, expect } from 'vitest';
import { parseEvolutionError } from '../parseEvolutionError';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build an Evolution-style error envelope. */
function envelope(overrides: {
  message?: string;
  status?: number;
  response?: { message?: string | string[]; error?: string };
} = {}) {
  return { error: true, ...overrides };
}

// ── null / falsy inputs ───────────────────────────────────────────────────────

describe('parseEvolutionError — null / falsy inputs', () => {
  it('returns a fallback reason for null', () => {
    const r = parseEvolutionError(null);
    expect(typeof r.reason).toBe('string');
    expect(r.reason.length).toBeGreaterThan(0);
  });

  it('returns null detail for null input', () => {
    expect(parseEvolutionError(null).detail).toBeNull();
  });

  it('returns a fallback reason for undefined', () => {
    expect(typeof parseEvolutionError(undefined).reason).toBe('string');
  });

  it('returns null detail for undefined input', () => {
    expect(parseEvolutionError(undefined).detail).toBeNull();
  });

  it('returns undefined status when not provided', () => {
    expect(parseEvolutionError(null).status).toBeUndefined();
  });
});

// ── Error instances ───────────────────────────────────────────────────────────

describe('parseEvolutionError — Error instances', () => {
  it('extracts message from an Error object', () => {
    const err = new Error('network connection refused');
    const r = parseEvolutionError(err);
    expect(r.detail).toContain('network connection refused');
  });

  it('matches network pattern for Error with network message', () => {
    const r = parseEvolutionError(new Error('fetch failed ECONN'));
    expect(r.reason).toContain('rede');
  });

  it('matches timeout pattern for Error with timeout message', () => {
    const r = parseEvolutionError(new Error('Request timed out ETIMEDOUT'));
    expect(r.reason).toContain('esgotado');
  });
});

// ── plain string input ────────────────────────────────────────────────────────

describe('parseEvolutionError — plain string input', () => {
  it('uses string as raw message', () => {
    const r = parseEvolutionError('unauthorized access');
    expect(r.detail).toContain('unauthorized');
  });

  it('matches auth pattern for 401 string', () => {
    const r = parseEvolutionError('HTTP 401 Unauthorized');
    expect(r.reason).toContain('expirou');
  });

  it('returns no status for plain string', () => {
    expect(parseEvolutionError('some error').status).toBeUndefined();
  });
});

// ── Evolution envelope — HUMANIZED pattern matching ───────────────────────────

describe('parseEvolutionError — invalid number pattern', () => {
  it('matches "invalid number" in message', () => {
    const r = parseEvolutionError(envelope({ message: 'invalid number provided' }));
    expect(r.reason).toContain('Número inválido');
  });

  it('matches "not on whatsapp" in message', () => {
    const r = parseEvolutionError(envelope({ message: 'phone number is not on whatsapp' }));
    expect(r.reason).toContain('Número inválido');
  });

  it('matches "number invalid" variant', () => {
    const r = parseEvolutionError(envelope({ message: 'number is invalid' }));
    expect(r.reason).toContain('Número inválido');
  });
});

describe('parseEvolutionError — auth pattern', () => {
  it('matches HTTP 401 status', () => {
    const r = parseEvolutionError(envelope({ message: 'Access denied', status: 401 }));
    expect(r.reason).toContain('expirou');
  });

  it('matches HTTP 403 status', () => {
    const r = parseEvolutionError(envelope({ message: 'Forbidden', status: 403 }));
    expect(r.reason).toContain('expirou');
  });

  it('matches "unauthorized" keyword in message', () => {
    const r = parseEvolutionError(envelope({ message: 'unauthorized request' }));
    expect(r.reason).toContain('expirou');
  });
});

describe('parseEvolutionError — not found pattern', () => {
  it('matches HTTP 404 status', () => {
    const r = parseEvolutionError(envelope({ message: 'not found', status: 404 }));
    expect(r.reason).toContain('Instância ou recurso não encontrado');
  });

  it('matches "not found" in message text', () => {
    const r = parseEvolutionError(envelope({ message: 'Instance not found' }));
    expect(r.reason).toContain('Instância ou recurso não encontrado');
  });
});

describe('parseEvolutionError — timeout pattern', () => {
  it('matches "timeout" keyword', () => {
    const r = parseEvolutionError(envelope({ message: 'Connection timeout' }));
    expect(r.reason).toContain('Tempo esgotado');
  });

  it('matches "timed out" keyword', () => {
    const r = parseEvolutionError(envelope({ message: 'Request timed out' }));
    expect(r.reason).toContain('Tempo esgotado');
  });

  it('matches ETIMEDOUT code', () => {
    const r = parseEvolutionError(envelope({ message: 'ETIMEDOUT' }));
    expect(r.reason).toContain('Tempo esgotado');
  });
});

describe('parseEvolutionError — network pattern', () => {
  it('matches "network" keyword', () => {
    const r = parseEvolutionError(envelope({ message: 'network unreachable' }));
    expect(r.reason).toContain('rede');
  });

  it('matches ECONNREFUSED', () => {
    const r = parseEvolutionError(envelope({ message: 'ECONNREFUSED 127.0.0.1:8080' }));
    expect(r.reason).toContain('rede');
  });

  it('matches ENETUNREACH', () => {
    const r = parseEvolutionError(envelope({ message: 'ENETUNREACH' }));
    expect(r.reason).toContain('rede');
  });
});

describe('parseEvolutionError — rate limit pattern', () => {
  it('matches "rate limit" phrase', () => {
    const r = parseEvolutionError(envelope({ message: 'rate limit exceeded' }));
    expect(r.reason).toContain('sequência');
  });

  it('matches "too many" phrase', () => {
    const r = parseEvolutionError(envelope({ message: 'too many requests' }));
    expect(r.reason).toContain('sequência');
  });
});

describe('parseEvolutionError — media pattern', () => {
  it('matches "file too big"', () => {
    const r = parseEvolutionError(envelope({ message: 'file too big for upload' }));
    expect(r.reason).toContain('mídia');
  });

  it('matches "audio" keyword', () => {
    const r = parseEvolutionError(envelope({ message: 'invalid audio format' }));
    expect(r.reason).toContain('mídia');
  });
});

describe('parseEvolutionError — JID / recipient pattern', () => {
  it('matches "jid" keyword', () => {
    const r = parseEvolutionError(envelope({ message: 'invalid jid format' }));
    expect(r.reason).toContain('Destinatário inválido');
  });

  it('matches "recipient" keyword', () => {
    const r = parseEvolutionError(envelope({ message: 'recipient not valid' }));
    expect(r.reason).toContain('Destinatário inválido');
  });
});

describe('parseEvolutionError — 5xx server error pattern', () => {
  it('matches HTTP 500 status in message', () => {
    const r = parseEvolutionError(envelope({ message: 'server returned 500 error' }));
    expect(r.reason).toContain('instável');
  });

  it('matches HTTP 503 in message', () => {
    const r = parseEvolutionError(envelope({ message: '503 Service Unavailable' }));
    expect(r.reason).toContain('instável');
  });
});

// ── nested response extraction ────────────────────────────────────────────────

describe('parseEvolutionError — nested response extraction', () => {
  it('reads response.message string', () => {
    const r = parseEvolutionError(envelope({ response: { message: 'nested error text' } }));
    expect(r.detail).toContain('nested error text');
  });

  it('reads first element of response.message array', () => {
    const r = parseEvolutionError(envelope({ response: { message: ['first error', 'second'] } }));
    expect(r.detail).toContain('first error');
  });

  it('falls back to response.error string when no message', () => {
    const r = parseEvolutionError(envelope({ response: { error: 'response error' } }));
    expect(r.detail).toContain('response error');
  });

  it('can match nested message against HUMANIZED patterns', () => {
    const r = parseEvolutionError(envelope({
      message: 'upstream error',
      response: { message: 'invalid jid abc123' },
    }));
    expect(r.reason).toContain('Destinatário inválido');
  });
});

// ── status propagation ────────────────────────────────────────────────────────

describe('parseEvolutionError — status propagation', () => {
  it('includes HTTP status in returned object', () => {
    const r = parseEvolutionError(envelope({ status: 422 }));
    expect(r.status).toBe(422);
  });

  it('includes "HTTP {status}" in detail when status present', () => {
    const r = parseEvolutionError(envelope({ message: 'some error', status: 500 }));
    expect(r.detail).toContain('HTTP 500');
  });

  it('does not include "HTTP undefined" in detail when status absent', () => {
    const r = parseEvolutionError(envelope({ message: 'some error' }));
    expect(r.detail).not.toContain('HTTP undefined');
  });
});

// ── unknown / fallback ────────────────────────────────────────────────────────

describe('parseEvolutionError — fallback for unrecognized errors', () => {
  it('returns a non-empty reason string for unrecognized messages', () => {
    const r = parseEvolutionError(envelope({ message: 'completely unknown xyz error' }));
    expect(r.reason.length).toBeGreaterThan(0);
  });

  it('uses the message itself as reason when no pattern matches', () => {
    const r = parseEvolutionError(envelope({ message: 'completely unknown xyz error' }));
    expect(r.reason).toBe('completely unknown xyz error');
  });

  it('uses nested message as reason when outer message is generic', () => {
    const r = parseEvolutionError(envelope({
      message: '',
      response: { message: 'detailed nested info' },
    }));
    expect(r.reason).toContain('detailed nested info');
  });

  it('returns Evolution fallback when all inputs are empty', () => {
    const r = parseEvolutionError(envelope({}));
    expect(r.reason).toContain('Evolution');
  });
});
