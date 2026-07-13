import { describe, it, expect } from 'vitest';
import {
  nn,
  strOrEmpty,
  boolOrFalse,
  numOrZero,
  normalizePaymentLink,
  normalizeBlockedIP,
  normalizeSecurityAlert,
  normalizeUserDevice,
  normalizeUserSession,
} from '@/lib/normalizers';

// ── Core helpers ─────────────────────────────────────────────────────────────

describe('nn (non-null helper)', () => {
  it('returns the value when it is defined and non-null', () => {
    expect(nn('hello', 'default')).toBe('hello');
    expect(nn(0, 42)).toBe(0);
    expect(nn(false, true)).toBe(false);
  });

  it('returns the fallback for null', () => {
    expect(nn(null, 'default')).toBe('default');
  });

  it('returns the fallback for undefined', () => {
    expect(nn(undefined, 99)).toBe(99);
  });
});

describe('strOrEmpty', () => {
  it('returns the string when defined', () => {
    expect(strOrEmpty('hello')).toBe('hello');
  });

  it('returns empty string for null', () => {
    expect(strOrEmpty(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(strOrEmpty(undefined)).toBe('');
  });

  it('preserves empty string as-is', () => {
    expect(strOrEmpty('')).toBe('');
  });
});

describe('boolOrFalse', () => {
  it('returns true when value is true', () => {
    expect(boolOrFalse(true)).toBe(true);
  });

  it('returns false when value is false', () => {
    expect(boolOrFalse(false)).toBe(false);
  });

  it('returns false for null', () => {
    expect(boolOrFalse(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(boolOrFalse(undefined)).toBe(false);
  });
});

describe('numOrZero', () => {
  it('returns the number when defined', () => {
    expect(numOrZero(42)).toBe(42);
    expect(numOrZero(-1)).toBe(-1);
  });

  it('returns 0 for null', () => {
    expect(numOrZero(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(numOrZero(undefined)).toBe(0);
  });

  it('returns 0 as-is (falsy but defined)', () => {
    expect(numOrZero(0)).toBe(0);
  });
});

// ── normalizePaymentLink ──────────────────────────────────────────────────────

describe('normalizePaymentLink', () => {
  const base = {
    id: 'link_1',
    title: 'Assinatura mensal',
    amount: 99.9,
    currency: 'BRL',
    status: 'active',
    payment_method: 'pix',
    created_at: '2026-01-01T00:00:00Z',
  };

  it('preserves all provided fields', () => {
    const result = normalizePaymentLink(base);
    expect(result.id).toBe('link_1');
    expect(result.title).toBe('Assinatura mensal');
    expect(result.amount).toBe(99.9);
    expect(result.currency).toBe('BRL');
    expect(result.status).toBe('active');
    expect(result.payment_method).toBe('pix');
    expect(result.created_at).toBe('2026-01-01T00:00:00Z');
  });

  it('defaults currency to BRL when missing', () => {
    const result = normalizePaymentLink({ ...base, currency: null });
    expect(result.currency).toBe('BRL');
  });

  it('defaults status to "active" when missing', () => {
    const result = normalizePaymentLink({ ...base, status: null });
    expect(result.status).toBe('active');
  });

  it('defaults payment_method to "pix" when missing', () => {
    const result = normalizePaymentLink({ ...base, payment_method: null });
    expect(result.payment_method).toBe('pix');
  });

  it('defaults amount to 0 when missing', () => {
    const result = normalizePaymentLink({ ...base, amount: null });
    expect(result.amount).toBe(0);
  });

  it('preserves null for nullable fields (description, contact_id, etc)', () => {
    const result = normalizePaymentLink(base);
    expect(result.description).toBeNull();
    expect(result.payment_url).toBeNull();
    expect(result.contact_id).toBeNull();
    expect(result.paid_at).toBeNull();
    expect(result.expires_at).toBeNull();
  });

  it('populates nullable fields when provided', () => {
    const result = normalizePaymentLink({ ...base, description: 'Plano Pro', contact_id: 'c_1' });
    expect(result.description).toBe('Plano Pro');
    expect(result.contact_id).toBe('c_1');
  });
});

// ── normalizeBlockedIP ────────────────────────────────────────────────────────

describe('normalizeBlockedIP', () => {
  const base = {
    id: 'bip_1',
    ip_address: '192.168.0.1',
    reason: 'brute_force',
    blocked_at: '2026-01-01T00:00:00Z',
    is_permanent: false,
    request_count: 5,
  };

  it('maps all provided fields', () => {
    const result = normalizeBlockedIP(base);
    expect(result.id).toBe('bip_1');
    expect(result.ip_address).toBe('192.168.0.1');
    expect(result.reason).toBe('brute_force');
    expect(result.is_permanent).toBe(false);
    expect(result.request_count).toBe(5);
  });

  it('defaults is_permanent to false when null', () => {
    const result = normalizeBlockedIP({ ...base, is_permanent: null });
    expect(result.is_permanent).toBe(false);
  });

  it('defaults request_count to 0 when null', () => {
    const result = normalizeBlockedIP({ ...base, request_count: null });
    expect(result.request_count).toBe(0);
  });

  it('preserves null for expires_at and last_attempt_at', () => {
    const result = normalizeBlockedIP(base);
    expect(result.expires_at).toBeNull();
    expect(result.last_attempt_at).toBeNull();
  });
});

// ── normalizeSecurityAlert ────────────────────────────────────────────────────

describe('normalizeSecurityAlert', () => {
  const base = {
    id: 'sa_1',
    alert_type: 'brute_force',
    title: 'Multiple failed logins',
    created_at: '2026-01-01T00:00:00Z',
    is_resolved: false,
  };

  it('maps provided fields', () => {
    const result = normalizeSecurityAlert(base);
    expect(result.id).toBe('sa_1');
    expect(result.alert_type).toBe('brute_force');
    expect(result.title).toBe('Multiple failed logins');
    expect(result.is_resolved).toBe(false);
  });

  it('defaults severity to "medium" when missing', () => {
    const result = normalizeSecurityAlert(base);
    expect(result.severity).toBe('medium');
  });

  it('uses provided severity', () => {
    const result = normalizeSecurityAlert({ ...base, severity: 'critical' });
    expect(result.severity).toBe('critical');
  });

  it('preserves null for description and ip_address', () => {
    const result = normalizeSecurityAlert(base);
    expect(result.description).toBeNull();
    expect(result.ip_address).toBeNull();
  });
});

// ── normalizeUserDevice ───────────────────────────────────────────────────────

describe('normalizeUserDevice', () => {
  const base = {
    id: 'd_1',
    device_name: 'iPhone 15',
    browser: 'Safari',
    os: 'iOS 17',
    ip_address: '10.0.0.1',
    is_trusted: true,
    last_seen_at: '2026-06-01T12:00:00Z',
  };

  it('maps all provided fields', () => {
    const result = normalizeUserDevice(base);
    expect(result.device_name).toBe('iPhone 15');
    expect(result.browser).toBe('Safari');
    expect(result.os).toBe('iOS 17');
    expect(result.is_trusted).toBe(true);
  });

  it('defaults device_name to "Dispositivo" when missing', () => {
    const result = normalizeUserDevice({ ...base, device_name: null });
    expect(result.device_name).toBe('Dispositivo');
  });

  it('defaults browser to "Desconhecido" when missing', () => {
    const result = normalizeUserDevice({ ...base, browser: null });
    expect(result.browser).toBe('Desconhecido');
  });

  it('defaults os to "Desconhecido" when missing', () => {
    const result = normalizeUserDevice({ ...base, os: null });
    expect(result.os).toBe('Desconhecido');
  });

  it('defaults is_trusted to false when null', () => {
    const result = normalizeUserDevice({ ...base, is_trusted: null });
    expect(result.is_trusted).toBe(false);
  });
});

// ── normalizeUserSession ──────────────────────────────────────────────────────

describe('normalizeUserSession', () => {
  const base = {
    id: 's_1',
    device_id: 'd_1',
    ip_address: '10.0.0.1',
    started_at: '2026-06-01T00:00:00Z',
  };

  it('maps all provided fields', () => {
    const result = normalizeUserSession(base);
    expect(result.id).toBe('s_1');
    expect(result.device_id).toBe('d_1');
    expect(result.ip_address).toBe('10.0.0.1');
    expect(result.started_at).toBe('2026-06-01T00:00:00Z');
  });

  it('defaults device_id to empty string when null', () => {
    const result = normalizeUserSession({ ...base, device_id: null });
    expect(result.device_id).toBe('');
  });

  it('defaults ip_address to empty string when null', () => {
    const result = normalizeUserSession({ ...base, ip_address: null });
    expect(result.ip_address).toBe('');
  });
});
