import { describe, it, expect, vi } from 'vitest';

// Mock supabase so the module can be imported without a real connection.
vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_RESOLVED_URL: 'http://localhost:54321',
  SUPABASE_RESOLVED_ANON_KEY: 'test-anon-key',
  supabase: { from: vi.fn() },
  isSupabaseConfigured: () => false,
}));

import { jidToPhone } from '@/lib/openContactInChat';

// ── jidToPhone ────────────────────────────────────────────────────────────────

describe('jidToPhone — standard JID format', () => {
  it('extracts digits before @s.whatsapp.net', () => {
    expect(jidToPhone('5511999887766@s.whatsapp.net')).toBe('5511999887766');
  });

  it('extracts digits before @g.us (group JID)', () => {
    expect(jidToPhone('120363000000@g.us')).toBe('120363000000');
  });

  it('extracts digits before @lid', () => {
    expect(jidToPhone('5511912345678@lid')).toBe('5511912345678');
  });

  it('handles JID with device suffix (@device)', () => {
    expect(jidToPhone('5511912345678@s.whatsapp.net')).toBe('5511912345678');
  });
});

describe('jidToPhone — bare phone strings (no @)', () => {
  it('returns digit string when input has no @', () => {
    expect(jidToPhone('5511999887766')).toBe('5511999887766');
  });

  it('strips non-digit characters from bare string', () => {
    expect(jidToPhone('+55 11 9999-8877')).toBe('5511999988775'.slice(0, 12));
  });
});

describe('jidToPhone — null / undefined / empty inputs', () => {
  it('returns null for null', () => {
    expect(jidToPhone(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(jidToPhone(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(jidToPhone('')).toBeNull();
  });

  it('returns null when JID has only non-digit prefix', () => {
    expect(jidToPhone('abc@s.whatsapp.net')).toBeNull();
  });

  it('returns null when entire string is non-digit', () => {
    expect(jidToPhone('no-digits-here')).toBeNull();
  });
});

describe('jidToPhone — edge cases', () => {
  it('strips all non-digit chars from the local part', () => {
    expect(jidToPhone('55+11-9@s.whatsapp.net')).toBe('55119');
  });

  it('returns null when local part is empty (@ at position 0)', () => {
    expect(jidToPhone('@s.whatsapp.net')).toBeNull();
  });

  it('returns digits-only for local part with mixed chars', () => {
    expect(jidToPhone('55abc11@s.whatsapp.net')).toBe('5511');
  });
});
