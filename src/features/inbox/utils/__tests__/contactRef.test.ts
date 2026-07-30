import { describe, it, expect } from 'vitest';
import {
  resolveContactRef,
  derivePhone,
  isGroupJid,
  type ContactRef,
  type UuidRef,
  type JidRef,
} from '../contactRef';

describe('resolveContactRef', () => {
  // ── null / undefined / empty ───────────────────────────────────────────────
  it('returns null for null input', () => {
    expect(resolveContactRef(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(resolveContactRef(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(resolveContactRef('')).toBeNull();
  });

  // ── UUID (RFC 4122) ───────────────────────────────────────────────────────
  it('resolves a valid RFC 4122 UUID as type uuid', () => {
    const ref = resolveContactRef('f47ac10b-58cc-4372-a567-0e02b2c3d479');
    expect(ref).not.toBeNull();
    expect(ref!.type).toBe('uuid');
    expect((ref as UuidRef).value).toBe('f47ac10b-58cc-4372-a567-0e02b2c3d479');
  });

  it('resolves uppercase UUID as type uuid', () => {
    const ref = resolveContactRef('F47AC10B-58CC-4372-A567-0E02B2C3D479');
    expect(ref).not.toBeNull();
    expect(ref!.type).toBe('uuid');
    expect((ref as UuidRef).value).toBe('F47AC10B-58CC-4372-A567-0E02B2C3D479');
  });

  it('rejects nil UUID (version=0, variant=0) as non-UUID per strict RFC 4122', () => {
    // The strict regex requires version nibble ∈ [1-8] and variant nibble ∈ [89ab].
    // nil UUID 00000000-... has both as 0, so it falls through to JID.
    const ref = resolveContactRef('00000000-0000-0000-0000-000000000000');
    expect(ref).not.toBeNull();
    expect(ref!.type).toBe('jid');
  });

  // ── WhatsApp JID (@s.whatsapp.net) ────────────────────────────────────────
  it('resolves a WhatsApp user JID as type jid with phone', () => {
    const ref = resolveContactRef('551146375517@s.whatsapp.net');
    expect(ref).not.toBeNull();
    expect(ref!.type).toBe('jid');
    const jidRef = ref as JidRef;
    expect(jidRef.value).toBe('551146375517@s.whatsapp.net');
    expect(jidRef.phone).toBe('551146375517');
  });

  // ── Group JID (@g.us) ─────────────────────────────────────────────────────
  it('resolves a group JID as type jid with phone and detects group', () => {
    const jid = '5511999999999-1234567890@g.us';
    const ref = resolveContactRef(jid);
    expect(ref).not.toBeNull();
    expect(ref!.type).toBe('jid');
    const jidRef = ref as JidRef;
    expect(jidRef.value).toBe(jid);
    expect(jidRef.phone).toBe('5511999999999-1234567890');
    expect(isGroupJid(jid)).toBe(true);
  });

  // ── JID with @lid suffix ──────────────────────────────────────────────────
  it('resolves a lid JID as type jid', () => {
    const jid = '551146375517@lid';
    const ref = resolveContactRef(jid);
    expect(ref).not.toBeNull();
    expect(ref!.type).toBe('jid');
    expect((ref as JidRef).phone).toBe('551146375517');
  });

  // ── JID with @broadcast suffix ────────────────────────────────────────────
  it('resolves a broadcast JID as type jid', () => {
    const jid = '551146375517@broadcast';
    const ref = resolveContactRef(jid);
    expect(ref).not.toBeNull();
    expect(ref!.type).toBe('jid');
    expect((ref as JidRef).phone).toBe('551146375517');
  });

  // ── Bare phone number (no suffix) — treated as JID ────────────────────────
  it('treats a bare phone number as type jid', () => {
    const ref = resolveContactRef('551146375517');
    expect(ref).not.toBeNull();
    expect(ref!.type).toBe('jid');
    const jidRef = ref as JidRef;
    expect(jidRef.value).toBe('551146375517');
    expect(jidRef.phone).toBe('551146375517');
  });

  // ── Bad UUID (wrong version nibble) — rejected by strict RFC 4122 ─────────
  it('rejects UUID with version 0 (invalid per RFC 4122) as jid', () => {
    // version nibble = 0 → fails [1-8]
    const ref = resolveContactRef('f47ac10b-58cc-0372-a567-0e02b2c3d479');
    expect(ref).not.toBeNull();
    expect(ref!.type).toBe('jid');
  });

  // ── Nullable edge (the 5th case per task spec) ────────────────────────────
  it('returns null for null — 5th case', () => {
    expect(resolveContactRef(null)).toBeNull();
  });
});

describe('derivePhone', () => {
  it('strips @s.whatsapp.net suffix', () => {
    expect(derivePhone('551146375517@s.whatsapp.net')).toBe('551146375517');
  });

  it('strips @g.us suffix', () => {
    expect(derivePhone('5511999999999-1234567890@g.us')).toBe('5511999999999-1234567890');
  });

  it('strips @lid suffix', () => {
    expect(derivePhone('551146375517@lid')).toBe('551146375517');
  });

  it('strips @broadcast suffix', () => {
    expect(derivePhone('551146375517@broadcast')).toBe('551146375517');
  });

  it('returns digits for a bare number', () => {
    expect(derivePhone('551146375517')).toBe('551146375517');
  });

  it('strips non-digit characters from unknown formats', () => {
    expect(derivePhone('+55 (11) 4637-5517')).toBe('551146375517');
  });
});

describe('isGroupJid', () => {
  it('returns true for @g.us', () => {
    expect(isGroupJid('5511999999999-1234567890@g.us')).toBe(true);
  });

  it('returns false for @s.whatsapp.net', () => {
    expect(isGroupJid('551146375517@s.whatsapp.net')).toBe(false);
  });

  it('returns false for bare numbers', () => {
    expect(isGroupJid('551146375517')).toBe(false);
  });
});
