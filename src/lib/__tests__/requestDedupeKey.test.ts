import { describe, it, expect } from 'vitest';
import { shouldIncludeBody, normalizeEndpoint } from '@/lib/requestDedupeKey';

// ── shouldIncludeBody ─────────────────────────────────────────────────────────

describe('shouldIncludeBody', () => {
  it('returns false for GET', () => {
    expect(shouldIncludeBody('GET')).toBe(false);
  });

  it('returns false for HEAD', () => {
    expect(shouldIncludeBody('HEAD')).toBe(false);
  });

  it('returns false for OPTIONS', () => {
    expect(shouldIncludeBody('OPTIONS')).toBe(false);
  });

  it('returns true for POST', () => {
    expect(shouldIncludeBody('POST')).toBe(true);
  });

  it('returns true for PUT', () => {
    expect(shouldIncludeBody('PUT')).toBe(true);
  });

  it('returns true for PATCH', () => {
    expect(shouldIncludeBody('PATCH')).toBe(true);
  });

  it('returns true for DELETE', () => {
    expect(shouldIncludeBody('DELETE')).toBe(true);
  });

  it('is case-insensitive — "get" returns false', () => {
    expect(shouldIncludeBody('get')).toBe(false);
  });

  it('is case-insensitive — "post" returns true', () => {
    expect(shouldIncludeBody('post')).toBe(true);
  });

  it('trims whitespace before comparing', () => {
    expect(shouldIncludeBody('  GET  ')).toBe(false);
  });

  it('returns true for mixed-case "Post"', () => {
    expect(shouldIncludeBody('Post')).toBe(true);
  });
});

// ── normalizeEndpoint ─────────────────────────────────────────────────────────

describe('normalizeEndpoint — empty / whitespace', () => {
  it('returns "" for an empty string', () => {
    expect(normalizeEndpoint('')).toBe('');
  });

  it('returns "" for a whitespace-only string', () => {
    expect(normalizeEndpoint('   ')).toBe('');
  });
});

describe('normalizeEndpoint — relative paths', () => {
  it('returns a plain path unchanged', () => {
    expect(normalizeEndpoint('/api/users')).toBe('/api/users');
  });

  it('collapses double slashes', () => {
    expect(normalizeEndpoint('/api//users')).toBe('/api/users');
  });

  it('removes trailing slash from a path', () => {
    expect(normalizeEndpoint('/api/users/')).toBe('/api/users');
  });

  it('preserves root slash', () => {
    expect(normalizeEndpoint('/')).toBe('/');
  });

  it('resolves . segments', () => {
    expect(normalizeEndpoint('/api/./users')).toBe('/api/users');
  });

  it('resolves .. segments', () => {
    expect(normalizeEndpoint('/api/v1/../v2/users')).toBe('/api/v2/users');
  });

  it('sorts query parameters alphabetically', () => {
    const result = normalizeEndpoint('/search?z=1&a=2&m=3');
    expect(result).toBe('/search?a=2&m=3&z=1');
  });

  it('drops fragment (#...)', () => {
    expect(normalizeEndpoint('/page#section')).toBe('/page');
  });

  it('drops empty-effective query string (?)', () => {
    expect(normalizeEndpoint('/api?')).toBe('/api');
  });

  it('drops empty-effective query string (?&)', () => {
    expect(normalizeEndpoint('/api?&')).toBe('/api');
  });

  it('preserves explicit empty value (?a=)', () => {
    const result = normalizeEndpoint('/api?a=');
    expect(result).toBe('/api?a=');
  });

  it('relative path without leading slash returns the path', () => {
    const result = normalizeEndpoint('api/users');
    expect(result).toBe('api/users');
  });

  it('two equivalent paths normalize to the same string', () => {
    const a = normalizeEndpoint('/api//v1/./users/?z=2&a=1');
    const b = normalizeEndpoint('/api/v1/users?a=1&z=2');
    expect(a).toBe(b);
  });
});

describe('normalizeEndpoint — absolute URLs', () => {
  it('lowercases the host', () => {
    const result = normalizeEndpoint('https://API.EXAMPLE.COM/v1');
    expect(result).toMatch(/^https:\/\/api\.example\.com\//);
  });

  it('lowercases the protocol', () => {
    const result = normalizeEndpoint('HTTPS://api.example.com/v1');
    expect(result).toMatch(/^https:\/\//);
  });

  it('removes the fragment', () => {
    const result = normalizeEndpoint('https://api.example.com/page#anchor');
    expect(result).not.toContain('#');
  });

  it('removes trailing slash from absolute URL path', () => {
    const result = normalizeEndpoint('https://api.example.com/v1/');
    expect(result).toBe('https://api.example.com/v1');
  });

  it('sorts query params in absolute URLs', () => {
    const result = normalizeEndpoint('https://api.example.com/search?z=last&a=first');
    expect(result).toContain('a=');
    expect(result.indexOf('a=')).toBeLessThan(result.indexOf('z='));
  });

  it('two equivalent absolute URLs normalize to the same string', () => {
    const a = normalizeEndpoint('https://API.EXAMPLE.COM/v1//users/?z=2&a=1#frag');
    const b = normalizeEndpoint('https://api.example.com/v1/users?a=1&z=2');
    expect(a).toBe(b);
  });

  it('preserves port in absolute URLs', () => {
    const result = normalizeEndpoint('http://localhost:3000/api');
    expect(result).toContain('3000');
  });
});
