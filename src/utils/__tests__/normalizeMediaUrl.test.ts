import { describe, it, expect } from 'vitest';
import { normalizeMediaUrl } from '../normalizeMediaUrl';

// ── null / falsy inputs ───────────────────────────────────────────────────────

describe('normalizeMediaUrl — null / falsy inputs', () => {
  it('returns empty string for undefined', () => {
    expect(normalizeMediaUrl(undefined)).toBe('');
  });

  it('returns empty string for null', () => {
    expect(normalizeMediaUrl(null)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(normalizeMediaUrl('')).toBe('');
  });
});

// ── whitespace trimming ───────────────────────────────────────────────────────

describe('normalizeMediaUrl — whitespace trimming', () => {
  it('trims leading whitespace', () => {
    expect(normalizeMediaUrl('  https://example.com/file.jpg')).toBe('https://example.com/file.jpg');
  });

  it('trims trailing whitespace', () => {
    expect(normalizeMediaUrl('https://example.com/file.jpg  ')).toBe('https://example.com/file.jpg');
  });

  it('trims both leading and trailing whitespace', () => {
    expect(normalizeMediaUrl('  https://example.com/  ')).toBe('https://example.com/');
  });
});

// ── stray double-quote removal ────────────────────────────────────────────────

describe('normalizeMediaUrl — stray double-quote removal', () => {
  it('removes a leading double-quote', () => {
    expect(normalizeMediaUrl('"https://example.com/img.png')).toBe('https://example.com/img.png');
  });

  it('removes a trailing double-quote', () => {
    expect(normalizeMediaUrl('https://example.com/img.png"')).toBe('https://example.com/img.png');
  });

  it('removes both leading and trailing double-quotes', () => {
    expect(normalizeMediaUrl('"https://example.com/img.png"')).toBe('https://example.com/img.png');
  });

  it('removes multiple leading double-quotes', () => {
    expect(normalizeMediaUrl('""https://example.com/img.png')).toBe('https://example.com/img.png');
  });

  it('removes multiple trailing double-quotes', () => {
    expect(normalizeMediaUrl('https://example.com/img.png""')).toBe('https://example.com/img.png');
  });
});

// ── supabase co artifact fix ──────────────────────────────────────────────────

describe('normalizeMediaUrl — .supabase.co artifact fix', () => {
  it('fixes .supabase.co"/ artifact', () => {
    const broken = 'https://xyz.supabase.co"/storage/v1/object';
    const fixed = normalizeMediaUrl(broken);
    expect(fixed).toBe('https://xyz.supabase.co/storage/v1/object');
  });
});

// ── duplicate slash collapse ──────────────────────────────────────────────────

describe('normalizeMediaUrl — duplicate slash collapse', () => {
  it('collapses duplicate slash in path (not after protocol)', () => {
    expect(normalizeMediaUrl('https://example.com//storage//file.jpg')).toBe('https://example.com/storage/file.jpg');
  });

  it('does not collapse double-slash in https://', () => {
    expect(normalizeMediaUrl('https://example.com/file.jpg')).toBe('https://example.com/file.jpg');
  });
});

// ── clean URL pass-through ────────────────────────────────────────────────────

describe('normalizeMediaUrl — clean URL pass-through', () => {
  it('returns a clean HTTPS URL unchanged', () => {
    const url = 'https://cdn.example.com/media/photo.jpg';
    expect(normalizeMediaUrl(url)).toBe(url);
  });

  it('returns a clean URL with query string unchanged', () => {
    const url = 'https://storage.example.com/bucket/file.mp4?token=abc123';
    expect(normalizeMediaUrl(url)).toBe(url);
  });
});
