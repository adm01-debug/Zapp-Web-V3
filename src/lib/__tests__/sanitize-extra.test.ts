/**
 * Tests para sanitize-extra.ts (convertido de Deno → vitest)
 */
import { describe, it, expect } from 'vitest';

import {
  sanitizeEmail,
  normalizePhoneBR,
  maskPhoneBR,
  validateMimeType,
  validateFileExtension,
  sanitizeFilename,
  sanitizeUrl,
  sanitizeLogMessage,
  truncate,
  validateFileSize,
} from '../sanitize-extra';

describe('sanitize-extra', () => {
  it('sanitizeEmail: aceita email válido', () => {
    expect(sanitizeEmail('User@Example.com')).toBe('user@example.com');
  });

  it('sanitizeEmail: rejeita email sem @', () => {
    expect(sanitizeEmail('notanemail')).toBeNull();
  });

  it('sanitizeEmail: rejeita email muito longo', () => {
    const long = 'a'.repeat(300) + '@example.com';
    expect(sanitizeEmail(long)).toBeNull();
  });

  it('sanitizeEmail: rejeita email com pontos consecutivos', () => {
    expect(sanitizeEmail('user..name@example.com')).toBeNull();
  });

  it('sanitizeEmail: aceita email com subdomain', () => {
    expect(sanitizeEmail('user@mail.example.com')).toBe('user@mail.example.com');
  });

  it('sanitizeEmail: rejeita null/undefined', () => {
    expect(sanitizeEmail(null as unknown as string)).toBeNull();
    expect(sanitizeEmail(undefined as unknown as string)).toBeNull();
  });

  it('normalizePhoneBR: normaliza telefone sem código do país', () => {
    expect(normalizePhoneBR('11999998888')).toBe('5511999998888');
  });

  it('normalizePhoneBR: mantém código do país se presente', () => {
    expect(normalizePhoneBR('5511999998888')).toBe('5511999998888');
  });

  it('normalizePhoneBR: aceita formatação com parênteses', () => {
    expect(normalizePhoneBR('(11) 99999-8888')).toBe('5511999998888');
  });

  it('normalizePhoneBR: rejeita telefone muito curto', () => {
    expect(normalizePhoneBR('123')).toBeNull();
  });

  it('normalizePhoneBR: rejeita telefone muito longo', () => {
    expect(normalizePhoneBR('123456789012345')).toBeNull();
  });

  it('maskPhoneBR: formata 11 dígitos', () => {
    expect(maskPhoneBR('11999998888')).toBe('(11) 99999-8888');
  });

  it('maskPhoneBR: formata 10 dígitos', () => {
    expect(maskPhoneBR('1199998888')).toBe('(11) 9999-8888');
  });

  it('validateMimeType: aceita MIME permitido', () => {
    expect(validateMimeType('image/png', ['image/png', 'image/jpeg'])).toBe(true);
  });

  it('validateMimeType: rejeita MIME não permitido', () => {
    expect(validateMimeType('application/x-evil', ['image/png'])).toBe(false);
  });

  it('validateFileExtension: aceita extensão permitida', () => {
    expect(validateFileExtension('foto.png', ['png', 'jpg'])).toBe(true);
  });

  it('validateFileExtension: rejeita extensão perigosa', () => {
    expect(validateFileExtension('virus.exe', ['png', 'jpg'])).toBe(false);
  });

  it('sanitizeFilename: remove path traversal', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('etcpasswd');
  });

  it('sanitizeFilename: remove separadores', () => {
    expect(sanitizeFilename('path/to/file.txt')).toBe('pathtofile.txt');
  });

  it('sanitizeFilename: trunca nomes longos', () => {
    const long = 'a'.repeat(300) + '.txt';
    const clean = sanitizeFilename(long);
    expect(clean.length <= 255).toBe(true);
  });

  it('sanitizeUrl: aceita http', () => {
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('sanitizeUrl: aceita https', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
  });

  it('sanitizeUrl: rejeita javascript:', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
  });

  it('sanitizeUrl: rejeita data:', () => {
    expect(sanitizeUrl('data:text/html,<script>')).toBeNull();
  });

  it('sanitizeUrl: aceita mailto', () => {
    expect(sanitizeUrl('mailto:user@example.com')).toBe('mailto:user@example.com');
  });

  it('sanitizeUrl: aceita relative', () => {
    expect(sanitizeUrl('/path/to/page')).toBe('/path/to/page');
  });

  it('sanitizeLogMessage: remove CPF', () => {
    expect(sanitizeLogMessage('User CPF: 123.456.789-00')).toBe('User CPF: [CPF]');
  });

  it('sanitizeLogMessage: remove email', () => {
    expect(sanitizeLogMessage('Contact: user@example.com')).toBe('Contact: [EMAIL]');
  });

  it('sanitizeLogMessage: remove bearer token', () => {
    expect(sanitizeLogMessage('Auth: Bearer eyJhbG...VCJ9')).toBe(
      'Auth: Bearer [TOKEN]'
    );
  });

  it('sanitizeLogMessage: remove API keys OpenAI', () => {
    const key = 'sk-' + 'a'.repeat(50);
    expect(sanitizeLogMessage(`Key: ${key}`)).toBe('Key: sk-[REDACTED]');
  });

  it('truncate: trunca texto longo', () => {
    expect(truncate('Hello World', 8)).toBe('Hello...');
  });

  it('truncate: mantém texto curto', () => {
    expect(truncate('Hi', 10)).toBe('Hi');
  });

  it('validateFileSize: aceita tamanho válido', () => {
    const result = validateFileSize(1024 * 1024, 10 * 1024 * 1024);
    expect(result.valid).toBe(true);
  });

  it('validateFileSize: rejeita arquivo vazio', () => {
    const result = validateFileSize(0, 10 * 1024 * 1024);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('validateFileSize: rejeita arquivo muito grande', () => {
    const result = validateFileSize(20 * 1024 * 1024, 10 * 1024 * 1024);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});
