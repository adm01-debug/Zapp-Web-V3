import { describe, it, expect } from 'vitest';
import { calculateContactHealth, getHealthColor } from '@/lib/contact-health';

// ── helpers ───────────────────────────────────────────────────────────────────

type HealthContact = {
  id: string;
  name: string | null;
  surname: string | null;
  nickname: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  company: string | null;
  job_title: string | null;
  tags: string[] | null;
  contact_type: string | null;
  created_at: string;
};

function makeContact(overrides: Partial<HealthContact> = {}): HealthContact {
  return {
    id: 'c1',
    name: null,
    surname: null,
    nickname: null,
    phone: null,
    email: null,
    avatar_url: null,
    company: null,
    job_title: null,
    tags: null,
    contact_type: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── calculateContactHealth ────────────────────────────────────────────────────

describe('calculateContactHealth', () => {
  it('returns 0 for a completely empty contact', () => {
    expect(calculateContactHealth(makeContact())).toBe(0);
  });

  it('returns 100 for a fully populated contact', () => {
    const contact = makeContact({
      name: 'Alice Costa',
      phone: '11999887766',
      email: 'alice@example.com',
      company: 'Acme Corp',
      job_title: 'Developer',
      tags: ['vip', 'customer'],
      avatar_url: 'https://cdn.example.com/alice.jpg',
    });
    expect(calculateContactHealth(contact)).toBe(100);
  });

  it('adds 25 points for a valid phone (>5 chars)', () => {
    const contact = makeContact({ phone: '11999887766' });
    expect(calculateContactHealth(contact)).toBe(25);
  });

  it('does not add phone points for a short phone (<= 5 chars)', () => {
    const contact = makeContact({ phone: '1199' });
    expect(calculateContactHealth(contact)).toBe(0);
  });

  it('adds 15 points for a name longer than 2 chars', () => {
    const contact = makeContact({ name: 'Alice' });
    expect(calculateContactHealth(contact)).toBe(15);
  });

  it('does not add name points for a short name (<= 2 chars)', () => {
    const contact = makeContact({ name: 'Al' });
    expect(calculateContactHealth(contact)).toBe(0);
  });

  it('does not add name points for a name with only whitespace', () => {
    const contact = makeContact({ name: '   ' });
    expect(calculateContactHealth(contact)).toBe(0);
  });

  it('adds 20 points for an email containing "@"', () => {
    const contact = makeContact({ email: 'user@example.com' });
    expect(calculateContactHealth(contact)).toBe(20);
  });

  it('does not add email points when "@" is absent', () => {
    const contact = makeContact({ email: 'notanemail' });
    expect(calculateContactHealth(contact)).toBe(0);
  });

  it('adds 10 points for a company value', () => {
    const contact = makeContact({ company: 'Acme' });
    expect(calculateContactHealth(contact)).toBe(10);
  });

  it('adds 10 points for a job_title value', () => {
    const contact = makeContact({ job_title: 'Engineer' });
    expect(calculateContactHealth(contact)).toBe(10);
  });

  it('adds 10 points for non-empty tags array', () => {
    const contact = makeContact({ tags: ['vip'] });
    expect(calculateContactHealth(contact)).toBe(10);
  });

  it('does not add tag points for an empty tags array', () => {
    const contact = makeContact({ tags: [] });
    expect(calculateContactHealth(contact)).toBe(0);
  });

  it('adds 10 points for an avatar_url', () => {
    const contact = makeContact({ avatar_url: 'https://cdn.example.com/a.jpg' });
    expect(calculateContactHealth(contact)).toBe(10);
  });

  it('accumulates score correctly for name + phone', () => {
    const contact = makeContact({ name: 'Alice', phone: '11999887766' });
    expect(calculateContactHealth(contact)).toBe(40); // 15 + 25
  });

  it('accumulates score correctly for name + email + company', () => {
    const contact = makeContact({ name: 'Bob', email: 'bob@x.com', company: 'Corp' });
    expect(calculateContactHealth(contact)).toBe(45); // 15 + 20 + 10
  });

  it('returns an integer (rounds fractional scores)', () => {
    const contact = makeContact({ name: 'Alice' });
    const score = calculateContactHealth(contact);
    expect(Number.isInteger(score)).toBe(true);
  });

  it('returns a value between 0 and 100', () => {
    const contact = makeContact({ name: 'Alice', phone: '11999887766', tags: ['x'] });
    const score = calculateContactHealth(contact);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ── getHealthColor ────────────────────────────────────────────────────────────

describe('getHealthColor', () => {
  it('returns primary class for score >= 90', () => {
    expect(getHealthColor(90)).toBe('text-primary bg-primary/10');
    expect(getHealthColor(100)).toBe('text-primary bg-primary/10');
    expect(getHealthColor(95)).toBe('text-primary bg-primary/10');
  });

  it('returns primary class for score in 70-89 range', () => {
    expect(getHealthColor(70)).toBe('text-primary bg-primary/10');
    expect(getHealthColor(89)).toBe('text-primary bg-primary/10');
    expect(getHealthColor(75)).toBe('text-primary bg-primary/10');
  });

  it('returns warning class for score in 40-69 range', () => {
    expect(getHealthColor(40)).toBe('text-warning-foreground bg-warning/10');
    expect(getHealthColor(69)).toBe('text-warning-foreground bg-warning/10');
    expect(getHealthColor(55)).toBe('text-warning-foreground bg-warning/10');
  });

  it('returns destructive class for score < 40', () => {
    expect(getHealthColor(0)).toBe('text-destructive bg-destructive/10');
    expect(getHealthColor(39)).toBe('text-destructive bg-destructive/10');
    expect(getHealthColor(25)).toBe('text-destructive bg-destructive/10');
  });
});