import { describe, it, expect } from 'vitest';
import { extractMessageType } from '../messageTypes';

describe('extractMessageType', () => {
  // ── Null / empty inputs ───────────────────────────────────────────────────
  it('returns text/text/supported for null', () => {
    const result = extractMessageType(null);
    expect(result.internalType).toBe('text');
    expect(result.category).toBe('text');
    expect(result.supported).toBe(true);
    expect(result.rawType).toBe('');
  });

  it('returns text defaults for undefined', () => {
    const result = extractMessageType(undefined);
    expect(result.internalType).toBe('text');
    expect(result.rawType).toBe('');
  });

  it('returns text defaults for empty string', () => {
    const result = extractMessageType('');
    expect(result.internalType).toBe('text');
  });

  it('returns text defaults for whitespace-only string', () => {
    const result = extractMessageType('   ');
    expect(result.internalType).toBe('text');
    expect(result.rawType).toBe('');
  });

  // ── Full canonical keys ───────────────────────────────────────────────────
  it('maps conversation → text', () => {
    const r = extractMessageType('conversation');
    expect(r.internalType).toBe('text');
    expect(r.category).toBe('text');
    expect(r.supported).toBe(true);
    expect(r.rawType).toBe('conversation');
  });

  it('maps extendedTextMessage → text', () => {
    const r = extractMessageType('extendedTextMessage');
    expect(r.internalType).toBe('text');
  });

  it('maps imageMessage → image / media', () => {
    const r = extractMessageType('imageMessage');
    expect(r.internalType).toBe('image');
    expect(r.category).toBe('media');
    expect(r.supported).toBe(true);
  });

  it('maps videoMessage → video / media', () => {
    const r = extractMessageType('videoMessage');
    expect(r.internalType).toBe('video');
    expect(r.category).toBe('media');
  });

  it('maps ptvMessage → video / media', () => {
    const r = extractMessageType('ptvMessage');
    expect(r.internalType).toBe('video');
  });

  it('maps audioMessage → audio / media', () => {
    const r = extractMessageType('audioMessage');
    expect(r.internalType).toBe('audio');
    expect(r.category).toBe('media');
  });

  it('maps documentMessage → document / media', () => {
    const r = extractMessageType('documentMessage');
    expect(r.internalType).toBe('document');
  });

  it('maps stickerMessage → sticker / media', () => {
    const r = extractMessageType('stickerMessage');
    expect(r.internalType).toBe('sticker');
  });

  it('maps locationMessage → location', () => {
    const r = extractMessageType('locationMessage');
    expect(r.internalType).toBe('location');
    expect(r.category).toBe('location');
  });

  it('maps liveLocationMessage → location', () => {
    const r = extractMessageType('liveLocationMessage');
    expect(r.internalType).toBe('location');
  });

  it('maps contactMessage → unsupported / contact', () => {
    const r = extractMessageType('contactMessage');
    expect(r.internalType).toBe('unsupported');
    expect(r.category).toBe('contact');
    expect(r.supported).toBe(false);
  });

  it('maps pollCreationMessage → unsupported / poll', () => {
    const r = extractMessageType('pollCreationMessage');
    expect(r.supported).toBe(false);
    expect(r.category).toBe('poll');
  });

  it('maps reactionMessage → unsupported / reaction', () => {
    const r = extractMessageType('reactionMessage');
    expect(r.supported).toBe(false);
    expect(r.category).toBe('reaction');
  });

  it('maps viewOnceMessage → unsupported / media', () => {
    const r = extractMessageType('viewOnceMessage');
    expect(r.supported).toBe(false);
    expect(r.category).toBe('media');
  });

  it('maps buttonsMessage → interactive', () => {
    const r = extractMessageType('buttonsMessage');
    expect(r.internalType).toBe('interactive');
    expect(r.category).toBe('interactive');
    expect(r.supported).toBe(true);
  });

  it('maps listMessage → interactive', () => {
    const r = extractMessageType('listMessage');
    expect(r.internalType).toBe('interactive');
  });

  it('maps templateMessage → interactive', () => {
    const r = extractMessageType('templateMessage');
    expect(r.internalType).toBe('interactive');
  });

  // ── Short aliases ─────────────────────────────────────────────────────────
  it('short alias "text" resolves to conversation (text/text)', () => {
    const r = extractMessageType('text');
    expect(r.internalType).toBe('text');
    expect(r.rawType).toBe('text');
  });

  it('short alias "image" resolves to imageMessage (image/media)', () => {
    const r = extractMessageType('image');
    expect(r.internalType).toBe('image');
    expect(r.rawType).toBe('image');
  });

  it('short alias "video" resolves to videoMessage', () => {
    expect(extractMessageType('video').internalType).toBe('video');
  });

  it('short alias "audio" resolves to audioMessage', () => {
    expect(extractMessageType('audio').internalType).toBe('audio');
  });

  it('short alias "ptv" resolves to ptvMessage (video-note)', () => {
    expect(extractMessageType('ptv').internalType).toBe('video');
  });

  it('short alias "document" resolves to documentMessage', () => {
    expect(extractMessageType('document').internalType).toBe('document');
  });

  it('short alias "sticker" resolves to stickerMessage', () => {
    expect(extractMessageType('sticker').internalType).toBe('sticker');
  });

  it('short alias "location" resolves to locationMessage', () => {
    expect(extractMessageType('location').internalType).toBe('location');
  });

  it('short alias "interactive" resolves to buttonsMessage', () => {
    expect(extractMessageType('interactive').internalType).toBe('interactive');
  });

  // ── Unknown / unsupported types ───────────────────────────────────────────
  it('returns unsupported/unknown for unrecognised type with raw preserved', () => {
    const r = extractMessageType('ephemeralMessage');
    expect(r.internalType).toBe('unsupported');
    expect(r.category).toBe('unknown');
    expect(r.supported).toBe(false);
    expect(r.label).toBe('ephemeralMessage');
    expect(r.rawType).toBe('ephemeralMessage');
  });

  it('trims whitespace from raw input', () => {
    const r = extractMessageType('  imageMessage  ');
    expect(r.internalType).toBe('image');
    expect(r.rawType).toBe('imageMessage');
  });
});
