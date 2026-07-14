// @ts-nocheck
/**
 * Tests for the pure utility exports from useMediaLibrary:
 *   getCategoriesForType() — category dict per MediaType
 *   getUrlField()          — field name ('image_url' | 'audio_url') per MediaType
 *   getBucket()            — storage bucket name per MediaType
 *   extractStoragePath()   — parses Supabase storage URLs, returns null on miss
 *
 * No React or Supabase dependencies are exercised here — all functions are pure.
 */
import { describe, it, expect } from 'vitest';
import {
  getCategoriesForType,
  getUrlField,
  getBucket,
  extractStoragePath,
  STICKER_CATEGORIES,
  AUDIO_CATEGORIES,
  EMOJI_CATEGORIES,
  MAX_UPLOAD_SIZE_MB,
  MAX_UPLOAD_SIZE_BYTES,
} from '../useMediaLibrary';

// ── constants ──────────────────────────────────────────────────────────────────
describe('constants', () => {
  it('MAX_UPLOAD_SIZE_MB is 10', () => {
    expect(MAX_UPLOAD_SIZE_MB).toBe(10);
  });

  it('MAX_UPLOAD_SIZE_BYTES equals 10 * 1024 * 1024', () => {
    expect(MAX_UPLOAD_SIZE_BYTES).toBe(10 * 1024 * 1024);
  });
});

// ── getCategoriesForType ───────────────────────────────────────────────────────
describe('getCategoriesForType', () => {
  it('returns STICKER_CATEGORIES for "stickers"', () => {
    expect(getCategoriesForType('stickers')).toBe(STICKER_CATEGORIES);
  });

  it('returns AUDIO_CATEGORIES for "audio_memes"', () => {
    expect(getCategoriesForType('audio_memes')).toBe(AUDIO_CATEGORIES);
  });

  it('returns EMOJI_CATEGORIES for "custom_emojis"', () => {
    expect(getCategoriesForType('custom_emojis')).toBe(EMOJI_CATEGORIES);
  });

  it('STICKER_CATEGORIES includes "memes" and "outros"', () => {
    const cats = getCategoriesForType('stickers');
    expect(cats).toHaveProperty('memes');
    expect(cats).toHaveProperty('outros');
  });

  it('AUDIO_CATEGORIES includes "bordões" and "músicas"', () => {
    const cats = getCategoriesForType('audio_memes');
    expect(cats).toHaveProperty('bordões');
    expect(cats).toHaveProperty('músicas');
  });

  it('EMOJI_CATEGORIES includes "custom" and "brand"', () => {
    const cats = getCategoriesForType('custom_emojis');
    expect(cats).toHaveProperty('custom');
    expect(cats).toHaveProperty('brand');
  });
});

// ── getUrlField ────────────────────────────────────────────────────────────────
describe('getUrlField', () => {
  it('returns "audio_url" for "audio_memes"', () => {
    expect(getUrlField('audio_memes')).toBe('audio_url');
  });

  it('returns "image_url" for "stickers"', () => {
    expect(getUrlField('stickers')).toBe('image_url');
  });

  it('returns "image_url" for "custom_emojis"', () => {
    expect(getUrlField('custom_emojis')).toBe('image_url');
  });
});

// ── getBucket ──────────────────────────────────────────────────────────────────
describe('getBucket', () => {
  it('returns "stickers" for "stickers"', () => {
    expect(getBucket('stickers')).toBe('stickers');
  });

  it('returns "audio-memes" for "audio_memes"', () => {
    expect(getBucket('audio_memes')).toBe('audio-memes');
  });

  it('returns "custom-emojis" for "custom_emojis"', () => {
    expect(getBucket('custom_emojis')).toBe('custom-emojis');
  });
});

// ── extractStoragePath ─────────────────────────────────────────────────────────
describe('extractStoragePath', () => {
  const BASE = 'https://storage.example.com';
  const BUCKET = 'stickers';

  it('extracts path from public object URL', () => {
    const url = `${BASE}/storage/v1/object/public/${BUCKET}/my-folder/file.png`;
    const result = extractStoragePath(url, BUCKET);
    expect(result).toEqual({ bucket: BUCKET, path: 'my-folder/file.png' });
  });

  it('extracts path from signed object URL', () => {
    const url = `${BASE}/storage/v1/object/sign/${BUCKET}/signed-file.webp`;
    const result = extractStoragePath(url, BUCKET);
    expect(result).toEqual({ bucket: BUCKET, path: 'signed-file.webp' });
  });

  it('extracts path from image render URL', () => {
    const url = `${BASE}/storage/v1/render/image/public/${BUCKET}/rendered.jpg`;
    const result = extractStoragePath(url, BUCKET);
    expect(result).toEqual({ bucket: BUCKET, path: 'rendered.jpg' });
  });

  it('URL-decodes the extracted path', () => {
    const url = `${BASE}/storage/v1/object/public/${BUCKET}/my%20folder/fi%20le.png`;
    const result = extractStoragePath(url, BUCKET);
    expect(result).toEqual({ bucket: BUCKET, path: 'my folder/fi le.png' });
  });

  it('returns null when the URL does not match the bucket pattern', () => {
    const url = `${BASE}/other-path/${BUCKET}/file.png`;
    expect(extractStoragePath(url, BUCKET)).toBeNull();
  });

  it('returns null for a completely different bucket in the URL', () => {
    const url = `${BASE}/storage/v1/object/public/other-bucket/file.png`;
    expect(extractStoragePath(url, BUCKET)).toBeNull();
  });

  it('returns null for an invalid (non-parseable) URL', () => {
    expect(extractStoragePath('not-a-url', BUCKET)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(extractStoragePath('', BUCKET)).toBeNull();
  });

  it('preserves nested paths', () => {
    const url = `${BASE}/storage/v1/object/public/${BUCKET}/a/b/c/d.gif`;
    const result = extractStoragePath(url, BUCKET);
    expect(result).toEqual({ bucket: BUCKET, path: 'a/b/c/d.gif' });
  });
});
