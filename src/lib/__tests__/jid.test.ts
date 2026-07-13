import { describe, it, expect } from 'vitest';
import {
  toPhone,
  toNumber,
  toIndividualJid,
  toGroupJid,
  toJid,
  toJidStrict,
  toPhoneStrict,
  isGroup,
  isBroadcast,
  isStatus,
  isStatusBroadcast,
  isIndividual,
  isNewsletter,
  isValidPhone,
  isValidIndividualJid,
  isValidGroupJid,
  isValidBroadcastJid,
  isValidNewsletterJid,
  isValidJid,
  assertValidJid,
  ensureBrazilDDI,
  JID_SUFFIXES,
} from '@/lib/jid';

// ── toPhone / toNumber ────────────────────────────────────────────────────────
describe('toPhone / toNumber', () => {
  it('extracts digits from a formatted BR number', () => {
    expect(toPhone('+55 (11) 99999-9999')).toBe('5511999999999');
  });

  it('strips the @s.whatsapp.net suffix', () => {
    expect(toPhone('5511999999999@s.whatsapp.net')).toBe('5511999999999');
  });

  it('strips the @g.us suffix', () => {
    expect(toPhone('120363021111111111-1700000001@g.us')).toBe('1203630211111111111700000001');
  });

  it('returns empty string for null', () => {
    expect(toPhone(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(toPhone(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(toPhone('')).toBe('');
  });

  it('returns empty string for status@broadcast (no digits)', () => {
    expect(toPhone('status@broadcast')).toBe('');
  });

  it('strips NBSP, zero-width and BOM chars', () => {
    // NBSP (\u00A0) and zero-width space (\u200B) are stripped along with tabs/spaces
    expect(toPhone('55\u00A011\u200B99999\u200B9999')).toBe('5511999999999');
  });

  it('is idempotent', () => {
    const phone = '5511999999999';
    expect(toPhone(toPhone(phone))).toBe(toPhone(phone));
  });

  it('toNumber is an alias for toPhone', () => {
    expect(toNumber).toBe(toPhone);
  });

  it('handles US number', () => {
    expect(toPhone('+1 (415) 555-0132')).toBe('14155550132');
  });
});

// ── toIndividualJid ───────────────────────────────────────────────────────────
describe('toIndividualJid', () => {
  it('converts phone number to individual JID', () => {
    expect(toIndividualJid('5511999999999')).toBe('5511999999999@s.whatsapp.net');
  });

  it('returns empty string for null', () => {
    expect(toIndividualJid(null)).toBe('');
  });

  it('strips formatting then wraps', () => {
    expect(toIndividualJid('+55 (11) 99999-9999')).toBe('5511999999999@s.whatsapp.net');
  });

  it('is idempotent when given a JID', () => {
    const jid = '5511999999999@s.whatsapp.net';
    expect(toIndividualJid(jid)).toBe('5511999999999@s.whatsapp.net');
  });
});

// ── toGroupJid ────────────────────────────────────────────────────────────────
describe('toGroupJid', () => {
  it('passes through an already-valid group JID', () => {
    expect(toGroupJid('120363@g.us')).toBe('120363@g.us');
  });

  it('appends @g.us to a bare group ID', () => {
    expect(toGroupJid('120363021111111111-1700000001')).toBe('120363021111111111-1700000001@g.us');
  });

  it('returns empty string for null', () => {
    expect(toGroupJid(null)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(toGroupJid('')).toBe('');
  });
});

// ── toJid ─────────────────────────────────────────────────────────────────────
describe('toJid', () => {
  it('passes through individual JID unchanged', () => {
    expect(toJid('5511999999999@s.whatsapp.net')).toBe('5511999999999@s.whatsapp.net');
  });

  it('passes through group JID unchanged', () => {
    expect(toJid('120363@g.us')).toBe('120363@g.us');
  });

  it('passes through status@broadcast unchanged', () => {
    expect(toJid('status@broadcast')).toBe('status@broadcast');
  });

  it('passes through newsletter JID unchanged', () => {
    expect(toJid('news123@newsletter')).toBe('news123@newsletter');
  });

  it('converts bare phone number to individual JID', () => {
    expect(toJid('5511999999999')).toBe('5511999999999@s.whatsapp.net');
  });

  it('converts formatted BR number to individual JID', () => {
    expect(toJid('+55 (11) 99999-9999')).toBe('5511999999999@s.whatsapp.net');
  });

  it('returns empty string for null', () => {
    expect(toJid(null)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(toJid('')).toBe('');
  });
});

// ── isGroup ───────────────────────────────────────────────────────────────────
describe('isGroup', () => {
  it('returns true for a group JID', () => {
    expect(isGroup('120363021111111111-1700000001@g.us')).toBe(true);
  });

  it('returns false for individual JID', () => {
    expect(isGroup('5511999999999@s.whatsapp.net')).toBe(false);
  });

  it('returns false for status@broadcast', () => {
    expect(isGroup('status@broadcast')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isGroup(null)).toBe(false);
  });

  it('returns false for bare phone number', () => {
    expect(isGroup('5511999999999')).toBe(false);
  });
});

// ── isBroadcast ───────────────────────────────────────────────────────────────
describe('isBroadcast', () => {
  it('returns true for status@broadcast', () => {
    expect(isBroadcast('status@broadcast')).toBe(true);
  });

  it('returns true for a custom broadcast list JID', () => {
    expect(isBroadcast('5511900000000@broadcast')).toBe(true);
  });

  it('returns false for individual JID', () => {
    expect(isBroadcast('5511999999999@s.whatsapp.net')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isBroadcast(null)).toBe(false);
  });
});

// ── isStatus / isStatusBroadcast ──────────────────────────────────────────────
describe('isStatus / isStatusBroadcast', () => {
  it('returns true only for the exact "status@broadcast" literal', () => {
    expect(isStatus('status@broadcast')).toBe(true);
  });

  it('returns false for a custom broadcast list', () => {
    expect(isStatus('5511900000000@broadcast')).toBe(false);
  });

  it('returns false for group JID', () => {
    expect(isStatus('120363@g.us')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isStatus(null)).toBe(false);
  });

  it('isStatusBroadcast is an alias for isStatus', () => {
    expect(isStatusBroadcast).toBe(isStatus);
  });
});

// ── isIndividual ──────────────────────────────────────────────────────────────
describe('isIndividual', () => {
  it('returns true for an individual JID', () => {
    expect(isIndividual('5511999999999@s.whatsapp.net')).toBe(true);
  });

  it('returns false for a group JID', () => {
    expect(isIndividual('120363@g.us')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isIndividual(null)).toBe(false);
  });
});

// ── isNewsletter ──────────────────────────────────────────────────────────────
describe('isNewsletter', () => {
  it('returns true for a newsletter JID', () => {
    expect(isNewsletter('news123@newsletter')).toBe(true);
  });

  it('returns false for individual JID', () => {
    expect(isNewsletter('5511@s.whatsapp.net')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isNewsletter(null)).toBe(false);
  });
});

// ── ensureBrazilDDI ───────────────────────────────────────────────────────────
describe('ensureBrazilDDI', () => {
  it('returns number unchanged when it already has BR DDI', () => {
    expect(ensureBrazilDDI('5511999999999')).toBe('5511999999999');
  });

  it('prepends 55 when number lacks DDI and is long enough', () => {
    expect(ensureBrazilDDI('11999999999')).toBe('5511999999999');
  });

  it('returns empty string for empty input', () => {
    expect(ensureBrazilDDI('')).toBe('');
  });

  it('handles formatted input', () => {
    expect(ensureBrazilDDI('+55 (11) 9 9999-9999')).toBe('5511999999999');
  });
});

// ── isValidPhone ──────────────────────────────────────────────────────────────
describe('isValidPhone', () => {
  it('returns true for valid 13-digit BR phone', () => {
    expect(isValidPhone('5511999999999')).toBe(true);
  });

  it('returns false for number with fewer than 8 digits', () => {
    expect(isValidPhone('1234567')).toBe(false);
  });

  it('returns false for number with more than 15 digits', () => {
    expect(isValidPhone('1234567890123456')).toBe(false);
  });

  it('returns false for non-string', () => {
    expect(isValidPhone(5511999999999)).toBe(false);
  });

  it('returns false for JID (has @)', () => {
    expect(isValidPhone('5511999999999@s.whatsapp.net')).toBe(false);
  });
});

// ── isValidIndividualJid ──────────────────────────────────────────────────────
describe('isValidIndividualJid', () => {
  it('returns true for canonical individual JID', () => {
    expect(isValidIndividualJid('5511999999999@s.whatsapp.net')).toBe(true);
  });

  it('returns false for phone without suffix', () => {
    expect(isValidIndividualJid('5511999999999')).toBe(false);
  });

  it('returns false for group JID', () => {
    expect(isValidIndividualJid('120363@g.us')).toBe(false);
  });

  it('returns false for non-string', () => {
    expect(isValidIndividualJid(null)).toBe(false);
  });
});

// ── isValidGroupJid ───────────────────────────────────────────────────────────
describe('isValidGroupJid', () => {
  it('returns true for a standard group JID', () => {
    expect(isValidGroupJid('120363021111111111@g.us')).toBe(true);
  });

  it('returns true for a group JID with participant-ts format', () => {
    expect(isValidGroupJid('120363021111111111-1700000001@g.us')).toBe(true);
  });

  it('returns false for individual JID', () => {
    expect(isValidGroupJid('5511999999999@s.whatsapp.net')).toBe(false);
  });

  it('returns false for non-string', () => {
    expect(isValidGroupJid(null)).toBe(false);
  });
});

// ── isValidBroadcastJid ───────────────────────────────────────────────────────
describe('isValidBroadcastJid', () => {
  it('returns true for status@broadcast', () => {
    expect(isValidBroadcastJid('status@broadcast')).toBe(true);
  });

  it('returns true for custom broadcast list', () => {
    expect(isValidBroadcastJid('5511900000000@broadcast')).toBe(true);
  });

  it('returns false for bare @broadcast (no local part)', () => {
    expect(isValidBroadcastJid('@broadcast')).toBe(false);
  });

  it('returns false for individual JID', () => {
    expect(isValidBroadcastJid('5511@s.whatsapp.net')).toBe(false);
  });
});

// ── isValidNewsletterJid ─────────────────────────────────────────────────────
describe('isValidNewsletterJid', () => {
  it('returns true for a newsletter JID', () => {
    expect(isValidNewsletterJid('news123@newsletter')).toBe(true);
  });

  it('returns false for bare @newsletter', () => {
    expect(isValidNewsletterJid('@newsletter')).toBe(false);
  });
});

// ── isValidJid (aggregate) ────────────────────────────────────────────────────
describe('isValidJid', () => {
  it('returns true for individual JID', () => {
    expect(isValidJid('5511999999999@s.whatsapp.net')).toBe(true);
  });

  it('returns true for group JID', () => {
    expect(isValidJid('120363021111111111@g.us')).toBe(true);
  });

  it('returns true for broadcast JID', () => {
    expect(isValidJid('status@broadcast')).toBe(true);
  });

  it('returns true for newsletter JID', () => {
    expect(isValidJid('chan123@newsletter')).toBe(true);
  });

  it('returns false for bare phone number', () => {
    expect(isValidJid('5511999999999')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isValidJid(null)).toBe(false);
  });
});

// ── assertValidJid ────────────────────────────────────────────────────────────
describe('assertValidJid', () => {
  it('does not throw for a valid JID', () => {
    expect(() => assertValidJid('5511999999999@s.whatsapp.net')).not.toThrow();
  });

  it('throws TypeError for an invalid JID', () => {
    expect(() => assertValidJid('not-a-jid')).toThrow(TypeError);
  });

  it('includes context in the error message', () => {
    expect(() => assertValidJid('bad', 'remoteJid'))
      .toThrowError(/remoteJid/);
  });
});

// ── toPhoneStrict ─────────────────────────────────────────────────────────────
describe('toPhoneStrict', () => {
  it('returns the phone string for a valid 13-digit number', () => {
    expect(toPhoneStrict('5511999999999')).toBe('5511999999999');
  });

  it('returns null for too-short input', () => {
    expect(toPhoneStrict('123')).toBeNull();
  });

  it('returns null for null', () => {
    expect(toPhoneStrict(null)).toBeNull();
  });

  it('strips formatting before checking', () => {
    expect(toPhoneStrict('+55 (11) 99999-9999')).toBe('5511999999999');
  });
});

// ── toJidStrict ───────────────────────────────────────────────────────────────
describe('toJidStrict', () => {
  it('returns the JID for a valid individual JID', () => {
    expect(toJidStrict('5511999999999@s.whatsapp.net')).toBe('5511999999999@s.whatsapp.net');
  });

  it('converts a valid phone to an individual JID', () => {
    expect(toJidStrict('5511999999999')).toBe('5511999999999@s.whatsapp.net');
  });

  it('returns null for null input', () => {
    expect(toJidStrict(null)).toBeNull();
  });

  it('returns null for too-short phone number', () => {
    expect(toJidStrict('123')).toBeNull();
  });

  it('returns valid group JID as-is', () => {
    expect(toJidStrict('120363021111111111@g.us')).toBe('120363021111111111@g.us');
  });
});

// ── JID_SUFFIXES constant ─────────────────────────────────────────────────────
describe('JID_SUFFIXES', () => {
  it('has the expected individual suffix', () => {
    expect(JID_SUFFIXES.individual).toBe('@s.whatsapp.net');
  });

  it('has the expected group suffix', () => {
    expect(JID_SUFFIXES.group).toBe('@g.us');
  });

  it('has the expected broadcast suffix', () => {
    expect(JID_SUFFIXES.broadcast).toBe('@broadcast');
  });

  it('has the expected newsletter suffix', () => {
    expect(JID_SUFFIXES.newsletter).toBe('@newsletter');
  });

  it('has the expected status JID', () => {
    expect(JID_SUFFIXES.status).toBe('status@broadcast');
  });
});
