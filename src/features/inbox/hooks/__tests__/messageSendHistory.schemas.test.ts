import { describe, it, expect } from 'vitest';
import {
  dedupeAuditEntries,
  deriveFinalStatus,
  normalizeFinalStatus,
  normalizeRetryReasons,
  padRetryAttempts,
} from '../messageSendHistory.schemas';

describe('normalizeRetryReasons', () => {
  it('retorna [] para null / undefined / string vazia', () => {
    expect(normalizeRetryReasons(null)).toEqual([]);
    expect(normalizeRetryReasons(undefined)).toEqual([]);
    expect(normalizeRetryReasons('')).toEqual([]);
    expect(normalizeRetryReasons('   ')).toEqual([]);
  });

  it('aceita array canônico já ordenado', () => {
    const out = normalizeRetryReasons([
      { attempt: 2, reason: 'timeout' },
      { attempt: 1, reason: '5xx' },
    ]);
    expect(out.map((a) => a.attempt)).toEqual([1, 2]);
  });

  it('desserializa string JSON de array', () => {
    const out = normalizeRetryReasons('[{"attempt":1,"reason":"timeout"}]');
    expect(out).toHaveLength(1);
    expect(out[0].reason).toBe('timeout');
  });

  it('aceita objeto único (bug legado)', () => {
    const out = normalizeRetryReasons({ attempt: 1, reason: 'fail' });
    expect(out).toHaveLength(1);
  });

  it('preenche attempt ausente com index+1 e descarta at inválido', () => {
    const out = normalizeRetryReasons([
      { reason: 'a', at: 'not-a-date' },
      { reason: 'b' },
    ]);
    expect(out.map((a) => a.attempt)).toEqual([1, 2]);
    expect(out[0].at).toBeUndefined();
  });

  it('retorna [] para JSON malformado', () => {
    expect(normalizeRetryReasons('{not json}')).toEqual([]);
  });

  it('substitui reason vazia por "unknown"', () => {
    const [a] = normalizeRetryReasons([{ attempt: 1, reason: '' }]);
    expect(a.reason).toBe('unknown');
  });
});

describe('padRetryAttempts', () => {
  it('preenche até `expected`', () => {
    const out = padRetryAttempts([{ attempt: 1, reason: 'x' }], 3);
    expect(out).toHaveLength(3);
    expect(out[2].reason).toBe('unknown');
  });

  it('não altera quando já >= expected', () => {
    const src = [{ attempt: 1, reason: 'x' }];
    expect(padRetryAttempts(src, 1)).toEqual(src);
  });
});

describe('normalizeFinalStatus', () => {
  it('cai em "unknown" para valores desconhecidos', () => {
    expect(normalizeFinalStatus('weird')).toBe('unknown');
    expect(normalizeFinalStatus(null)).toBe('unknown');
  });
  it('preserva enum válido', () => {
    expect(normalizeFinalStatus('success')).toBe('success');
    expect(normalizeFinalStatus('exhausted')).toBe('exhausted');
  });
});

describe('deriveFinalStatus', () => {
  const now = new Date('2026-07-12T12:00:00Z');

  it('success quando external_message_id presente', () => {
    expect(
      deriveFinalStatus({ externalMessageId: 'evo-1', storedFinalStatus: 'success', now }),
    ).toBe('success');
  });

  it('exhausted quando retry_count >= max_retries e sem external id', () => {
    expect(
      deriveFinalStatus({ retryCount: 3, maxRetries: 3, storedFinalStatus: 'failed', now }),
    ).toBe('exhausted');
  });

  it('retrying quando next_retry_at no futuro', () => {
    expect(
      deriveFinalStatus({
        retryCount: 1,
        maxRetries: 5,
        nextRetryAt: '2026-07-12T13:00:00Z',
        storedFinalStatus: 'failed',
        now,
      }),
    ).toBe('retrying');
  });

  it('failed para tentativa > 0 sem sucesso e sem retry futuro', () => {
    expect(
      deriveFinalStatus({ retryCount: 1, maxRetries: 5, storedFinalStatus: 'failed', now }),
    ).toBe('failed');
  });

  it('unknown como fallback', () => {
    expect(deriveFinalStatus({ storedFinalStatus: null, now })).toBe('unknown');
  });
});

describe('dedupeAuditEntries', () => {
  it('remove duplicatas por (action, createdAt, external_id)', () => {
    const a = { id: '1', action: 'send', createdAt: 't1', details: { external_id: 'x' } };
    const b = { id: '2', action: 'send', createdAt: 't1', details: { external_id: 'x' } };
    const c = { id: '3', action: 'send', createdAt: 't2', details: { external_id: 'x' } };
    expect(dedupeAuditEntries([a, b, c]).map((e) => e.id)).toEqual(['1', '3']);
  });
});
