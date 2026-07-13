import { describe, it, expect } from 'vitest';
import { extractEvolutionMessageId } from '@/lib/evolutionMessageId';

const ID = 'ABCDEF1234567890';

describe('extractEvolutionMessageId', () => {
  // ── Non-object / empty inputs ──────────────────────────────────────────────
  it('returns null for null', () => {
    expect(extractEvolutionMessageId(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(extractEvolutionMessageId(undefined)).toBeNull();
  });

  it('returns null for a plain string', () => {
    expect(extractEvolutionMessageId('some-id')).toBeNull();
  });

  it('returns null for a number', () => {
    expect(extractEvolutionMessageId(42)).toBeNull();
  });

  it('returns null for an empty object', () => {
    expect(extractEvolutionMessageId({})).toBeNull();
  });

  it('returns null when all candidate fields are missing', () => {
    expect(extractEvolutionMessageId({ foo: 'bar', baz: 123 })).toBeNull();
  });

  // ── Top-level direct fields ────────────────────────────────────────────────
  it('extracts from key.id (sendText v2)', () => {
    expect(extractEvolutionMessageId({ key: { id: ID } })).toBe(ID);
  });

  it('extracts from messageId', () => {
    expect(extractEvolutionMessageId({ messageId: ID })).toBe(ID);
  });

  it('extracts from keyId', () => {
    expect(extractEvolutionMessageId({ keyId: ID })).toBe(ID);
  });

  it('extracts from id (sendSticker rare shape)', () => {
    expect(extractEvolutionMessageId({ id: ID })).toBe(ID);
  });

  // ── One level of nesting (message / response / data / result) ─────────────
  it('extracts from message.key.id (sendWhatsAppAudio)', () => {
    expect(extractEvolutionMessageId({ message: { key: { id: ID } } })).toBe(ID);
  });

  it('extracts from message.messageId', () => {
    expect(extractEvolutionMessageId({ message: { messageId: ID } })).toBe(ID);
  });

  it('extracts from message.id', () => {
    expect(extractEvolutionMessageId({ message: { id: ID } })).toBe(ID);
  });

  it('extracts from response.key.id (proxied shape)', () => {
    expect(extractEvolutionMessageId({ response: { key: { id: ID } } })).toBe(ID);
  });

  it('extracts from data.key.id (wrapped envelope)', () => {
    expect(extractEvolutionMessageId({ data: { key: { id: ID } } })).toBe(ID);
  });

  it('extracts from result.key.id', () => {
    expect(extractEvolutionMessageId({ result: { key: { id: ID } } })).toBe(ID);
  });

  // ── Two levels of nesting (message.message.key.id) ────────────────────────
  it('extracts from message.message.key.id (retry shape)', () => {
    expect(
      extractEvolutionMessageId({ message: { message: { key: { id: ID } } } })
    ).toBe(ID);
  });

  it('extracts from message.message.messageId', () => {
    expect(
      extractEvolutionMessageId({ message: { message: { messageId: ID } } })
    ).toBe(ID);
  });

  // ── Priority: key.id wins over other fields ────────────────────────────────
  it('prefers key.id over messageId when both are present', () => {
    const response = { key: { id: 'KEY_ID' }, messageId: 'MSG_ID' };
    expect(extractEvolutionMessageId(response)).toBe('KEY_ID');
  });

  // ── Trimming ───────────────────────────────────────────────────────────────
  it('trims whitespace from the extracted id', () => {
    expect(extractEvolutionMessageId({ key: { id: `  ${ID}  ` } })).toBe(ID);
  });

  it('returns null when key.id is an empty string', () => {
    expect(extractEvolutionMessageId({ key: { id: '' } })).toBeNull();
  });

  it('returns null when key.id is whitespace only', () => {
    expect(extractEvolutionMessageId({ key: { id: '   ' } })).toBeNull();
  });

  // ── Type guard: non-string candidates are skipped ─────────────────────────
  it('ignores numeric id field', () => {
    expect(extractEvolutionMessageId({ id: 42 })).toBeNull();
  });

  it('ignores boolean messageId field', () => {
    expect(extractEvolutionMessageId({ messageId: true })).toBeNull();
  });

  // ── Full realistic payloads ────────────────────────────────────────────────
  it('handles realistic sendText v2 payload', () => {
    const payload = {
      key: {
        remoteJid: '5511999999999@s.whatsapp.net',
        fromMe: true,
        id: ID,
      },
      message: { conversation: 'Hello' },
      messageTimestamp: 1700000000,
      status: 'PENDING',
    };
    expect(extractEvolutionMessageId(payload)).toBe(ID);
  });

  it('handles realistic sendWhatsAppAudio payload', () => {
    const payload = {
      message: {
        key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: true, id: ID },
        audioMessage: {},
      },
    };
    expect(extractEvolutionMessageId(payload)).toBe(ID);
  });

  it('handles data-wrapped envelope payload', () => {
    const payload = {
      status: 'success',
      data: {
        key: { id: ID, remoteJid: '5511@s.whatsapp.net', fromMe: true },
        messageTimestamp: 1700000001,
      },
    };
    expect(extractEvolutionMessageId(payload)).toBe(ID);
  });
});
