import { describe, it, expect } from 'vitest';
import {
  isImageUrl,
  isVideoUrl,
  isYouTubeUrl,
  getYouTubeThumbnail,
  getDomain,
  getFavicon,
  extractLinks,
  escapeHtml,
  URL_REGEX,
} from '../linkPreviewUtils';

// ── URL_REGEX ─────────────────────────────────────────────────────────────────

describe('URL_REGEX', () => {
  it('matches a simple https URL', () => {
    expect('https://example.com'.match(URL_REGEX)).not.toBeNull();
  });

  it('matches an http URL', () => {
    expect('http://example.com'.match(URL_REGEX)).not.toBeNull();
  });

  it('does not match a plain word without protocol', () => {
    expect('example.com'.match(URL_REGEX)).toBeNull();
  });
});

// ── isImageUrl ────────────────────────────────────────────────────────────────

describe('isImageUrl', () => {
  it('returns true for .jpg URL', () => {
    expect(isImageUrl('https://cdn/photo.jpg')).toBe(true);
  });

  it('returns true for .jpeg URL', () => {
    expect(isImageUrl('https://cdn/photo.jpeg')).toBe(true);
  });

  it('returns true for .png URL', () => {
    expect(isImageUrl('https://cdn/image.png')).toBe(true);
  });

  it('returns true for .gif URL', () => {
    expect(isImageUrl('https://cdn/anim.gif')).toBe(true);
  });

  it('returns true for .webp URL', () => {
    expect(isImageUrl('https://cdn/img.webp')).toBe(true);
  });

  it('returns true for .svg URL', () => {
    expect(isImageUrl('https://cdn/icon.svg')).toBe(true);
  });

  it('returns true for .bmp URL', () => {
    expect(isImageUrl('https://cdn/icon.bmp')).toBe(true);
  });

  it('is case-insensitive (.JPG)', () => {
    expect(isImageUrl('https://cdn/photo.JPG')).toBe(true);
  });

  it('returns false for a non-image URL', () => {
    expect(isImageUrl('https://example.com/page')).toBe(false);
  });

  it('returns false for a video URL', () => {
    expect(isImageUrl('https://cdn/video.mp4')).toBe(false);
  });
});

// ── isVideoUrl ────────────────────────────────────────────────────────────────

describe('isVideoUrl', () => {
  it('returns true for .mp4', () => {
    expect(isVideoUrl('https://cdn/clip.mp4')).toBe(true);
  });

  it('returns true for .webm', () => {
    expect(isVideoUrl('https://cdn/clip.webm')).toBe(true);
  });

  it('returns true for .ogg', () => {
    expect(isVideoUrl('https://cdn/audio.ogg')).toBe(true);
  });

  it('returns true for .mov', () => {
    expect(isVideoUrl('https://cdn/video.mov')).toBe(true);
  });

  it('returns false for an image URL', () => {
    expect(isVideoUrl('https://cdn/image.png')).toBe(false);
  });

  it('returns false for a plain web page', () => {
    expect(isVideoUrl('https://example.com')).toBe(false);
  });
});

// ── isYouTubeUrl ──────────────────────────────────────────────────────────────

describe('isYouTubeUrl', () => {
  it('returns true for youtube.com/watch URL', () => {
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
  });

  it('returns true for youtu.be short URL', () => {
    expect(isYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
  });

  it('returns false for a non-YouTube URL', () => {
    expect(isYouTubeUrl('https://vimeo.com/12345')).toBe(false);
  });

  it('returns false for a YouTube channel URL (no /watch)', () => {
    expect(isYouTubeUrl('https://www.youtube.com/@channel')).toBe(false);
  });
});

// ── getYouTubeThumbnail ───────────────────────────────────────────────────────

describe('getYouTubeThumbnail', () => {
  it('extracts video ID from youtube.com/watch?v= and builds thumbnail URL', () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    expect(getYouTubeThumbnail(url)).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
  });

  it('extracts video ID from youtu.be short URL', () => {
    const url = 'https://youtu.be/abc123XYZ';
    expect(getYouTubeThumbnail(url)).toBe('https://img.youtube.com/vi/abc123XYZ/mqdefault.jpg');
  });

  it('strips query string from youtu.be ID', () => {
    const url = 'https://youtu.be/abc123XYZ?t=30';
    expect(getYouTubeThumbnail(url)).toBe('https://img.youtube.com/vi/abc123XYZ/mqdefault.jpg');
  });

  it('returns null for a non-YouTube URL', () => {
    expect(getYouTubeThumbnail('https://vimeo.com/12345')).toBeNull();
  });

  it('returns null for youtube.com URL without ?v= param', () => {
    expect(getYouTubeThumbnail('https://www.youtube.com/channel/UC123')).toBeNull();
  });
});

// ── getDomain ─────────────────────────────────────────────────────────────────

describe('getDomain', () => {
  it('returns bare hostname for https URL', () => {
    expect(getDomain('https://example.com/path')).toBe('example.com');
  });

  it('strips www. prefix', () => {
    expect(getDomain('https://www.example.com/page')).toBe('example.com');
  });

  it('returns subdomain (non-www) without stripping', () => {
    expect(getDomain('https://blog.example.com')).toBe('blog.example.com');
  });

  it('returns the input string when URL is invalid (error fallback)', () => {
    expect(getDomain('not-a-url')).toBe('not-a-url');
  });
});

// ── getFavicon ────────────────────────────────────────────────────────────────

describe('getFavicon', () => {
  it('returns origin + /favicon.ico for https URL', () => {
    expect(getFavicon('https://example.com/page')).toBe('https://example.com/favicon.ico');
  });

  it('includes port in origin', () => {
    expect(getFavicon('https://example.com:8080/page')).toBe('https://example.com:8080/favicon.ico');
  });

  it('returns empty string for invalid URL', () => {
    expect(getFavicon('not-a-url')).toBe('');
  });
});

// ── extractLinks ──────────────────────────────────────────────────────────────

describe('extractLinks', () => {
  it('returns empty array for text with no URLs', () => {
    expect(extractLinks('just some plain text')).toEqual([]);
  });

  it('extracts a single URL from text', () => {
    const links = extractLinks('Check this out: https://example.com cool!');
    expect(links).toContain('https://example.com');
  });

  it('extracts multiple distinct URLs', () => {
    const links = extractLinks('https://a.com and https://b.com');
    expect(links).toHaveLength(2);
  });

  it('deduplicates repeated URLs', () => {
    const links = extractLinks('https://example.com https://example.com');
    expect(links).toHaveLength(1);
  });

  it('returns empty array for empty string', () => {
    expect(extractLinks('')).toEqual([]);
  });

  it('extracts URL with query parameters', () => {
    const links = extractLinks('https://search.com/q?q=hello&page=1');
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toContain('search.com');
  });
});

// ── escapeHtml ────────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes & to &amp;', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes < to &lt;', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes > to &gt;', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('escapes double quotes to &quot;', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes to &#039;', () => {
    expect(escapeHtml("it's")).toBe('it&#039;s');
  });

  it('escapes a full XSS string', () => {
    const xss = '<script>alert("xss")</script>';
    const result = escapeHtml(xss);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).not.toContain('"');
  });

  it('returns empty string unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});
