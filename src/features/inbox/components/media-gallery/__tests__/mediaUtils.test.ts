import { describe, it, expect } from 'vitest';
import { getMediaType, getFilename } from '../mediaUtils';

describe('getMediaType', () => {
  // Image detection via extension
  it('returns image for .jpg extension', () => {
    expect(getMediaType('https://cdn.example.com/photo.jpg', '')).toBe('image');
  });

  it('returns image for .jpeg extension', () => {
    expect(getMediaType('file.jpeg', '')).toBe('image');
  });

  it('returns image for .png extension', () => {
    expect(getMediaType('image.PNG', '')).toBe('image');
  });

  it('returns image for .gif extension', () => {
    expect(getMediaType('anim.gif', '')).toBe('image');
  });

  it('returns image for .webp extension', () => {
    expect(getMediaType('img.webp', '')).toBe('image');
  });

  // Image detection via messageType
  it('returns image when messageType is "image" regardless of url', () => {
    expect(getMediaType('https://cdn.example.com/file.dat', 'image')).toBe('image');
  });

  // Video detection
  it('returns video for .mp4 extension', () => {
    expect(getMediaType('clip.mp4', '')).toBe('video');
  });

  it('returns video for .webm extension', () => {
    expect(getMediaType('clip.webm', '')).toBe('video');
  });

  it('returns video when messageType is "video"', () => {
    expect(getMediaType('file.dat', 'video')).toBe('video');
  });

  // Audio detection
  it('returns audio for .mp3 extension', () => {
    expect(getMediaType('track.mp3', '')).toBe('audio');
  });

  it('returns audio for .ogg extension', () => {
    expect(getMediaType('sound.ogg', '')).toBe('audio');
  });

  it('returns audio for .opus extension', () => {
    expect(getMediaType('voice.opus', '')).toBe('audio');
  });

  it('returns audio when messageType is "audio"', () => {
    expect(getMediaType('file.bin', 'audio')).toBe('audio');
  });

  it('returns audio when messageType is "ptt" (push-to-talk)', () => {
    expect(getMediaType('file.bin', 'ptt')).toBe('audio');
  });

  // Document fallback
  it('returns document for unknown extension', () => {
    expect(getMediaType('report.pdf', '')).toBe('document');
  });

  it('returns document for .docx extension', () => {
    expect(getMediaType('file.docx', '')).toBe('document');
  });

  it('returns document when extension is empty and messageType is unknown', () => {
    expect(getMediaType('https://cdn.example.com/file', '')).toBe('document');
  });

  // Extension takes lowercase
  it('is case-insensitive for extensions', () => {
    expect(getMediaType('photo.JPG', '')).toBe('image');
  });
});

describe('getFilename', () => {
  it('extracts filename from a full URL', () => {
    expect(getFilename('https://cdn.example.com/media/photo.jpg')).toBe('photo.jpg');
  });

  it('extracts filename from a URL with query params (pathname only)', () => {
    // URL.pathname does not include query string
    expect(getFilename('https://cdn.example.com/file.pdf?token=abc')).toBe('file.pdf');
  });

  it('handles a relative path-like string', () => {
    const result = getFilename('/path/to/document.docx');
    expect(result).toBe('document.docx');
  });

  it('returns "arquivo" when URL has no filename segment', () => {
    // For a URL like "https://cdn.example.com/", pathname split gives ['','']
    // pop() of empty string is falsy → returns 'arquivo'
    const result = getFilename('https://cdn.example.com/');
    expect(result).toBe('arquivo');
  });

  it('handles malformed URL strings gracefully via fallback path split', () => {
    // "not-a-url" is not a valid URL; fallback uses string split
    expect(getFilename('not-a-url/filename.txt')).toBe('filename.txt');
  });

  it('handles empty string without throwing', () => {
    expect(() => getFilename('')).not.toThrow();
  });
});
