/**
 * Tests para sanitize-extra.ts
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
} from "../sanitize-extra";

describe('sanitizeEmail', () => {
  it('aceita email válido', () => {
    expect(sanitizeEmail("User@Example.com")).toEqual("user@example.com");
  });

  it('rejeita email sem @', () => {
    expect(sanitizeEmail("notanemail")).toEqual(null);
  });

  it('rejeita email muito longo', () => {
    const long = "a".repeat(300) + "@example.com";
    expect(sanitizeEmail(long)).toEqual(null);
  });

  it('rejeita email com pontos consecutivos', () => {
    expect(sanitizeEmail("user..name@example.com")).toEqual(null);
  });

  it('aceita email com subdomain', () => {
    expect(sanitizeEmail("user@mail.example.com")).toEqual("user@mail.example.com");
  });

  it('rejeita null/undefined', () => {
    expect(sanitizeEmail(null as unknown as string)).toEqual(null);
    expect(sanitizeEmail(undefined as unknown as string)).toEqual(null);
  });
});

describe('normalizePhoneBR', () => {
  it('normaliza telefone sem código do país', () => {
    expect(normalizePhoneBR("11999998888")).toEqual("5511999998888");
  });

  it('mantém código do país se presente', () => {
    expect(normalizePhoneBR("5511999998888")).toEqual("5511999998888");
  });

  it('aceita formatação com parênteses', () => {
    expect(normalizePhoneBR("(11) 99999-8888")).toEqual("5511999998888");
  });

  it('rejeita telefone muito curto', () => {
    expect(normalizePhoneBR("123")).toEqual(null);
  });

  it('rejeita telefone muito longo', () => {
    expect(normalizePhoneBR("123456789012345")).toEqual(null);
  });
});

describe('maskPhoneBR', () => {
  it('formata 11 dígitos', () => {
    expect(maskPhoneBR("11999998888")).toEqual("(11) 99999-8888");
  });

  it('formata 10 dígitos', () => {
    expect(maskPhoneBR("1199998888")).toEqual("(11) 9999-8888");
  });
});

describe('validateMimeType', () => {
  it('aceita MIME permitido', () => {
    expect(validateMimeType("image/png", ["image/png", "image/jpeg"])).toEqual(true);
  });

  it('rejeita MIME não permitido', () => {
    expect(validateMimeType("application/x-evil", ["image/png"])).toEqual(false);
  });
});

describe('validateFileExtension', () => {
  it('aceita extensão permitida', () => {
    expect(validateFileExtension("foto.png", ["png", "jpg"])).toEqual(true);
  });

  it('rejeita extensão perigosa', () => {
    expect(validateFileExtension("virus.exe", ["png", "jpg"])).toEqual(false);
  });
});

describe('sanitizeFilename', () => {
  it('remove path traversal', () => {
    expect(sanitizeFilename("../../etc/passwd")).toEqual("etcpasswd");
  });

  it('remove separadores', () => {
    expect(sanitizeFilename("path/to/file.txt")).toEqual("pathtofile.txt");
  });

  it('trunca nomes longos', () => {
    const long = "a".repeat(300) + ".txt";
    const clean = sanitizeFilename(long);
    expect(clean.length <= 255).toEqual(true);
  });
});

describe('sanitizeUrl', () => {
  it('aceita http', () => {
    expect(sanitizeUrl("http://example.com")).toEqual("http://example.com");
  });

  it('aceita https', () => {
    expect(sanitizeUrl("https://example.com")).toEqual("https://example.com");
  });

  it('rejeita javascript:', () => {
    expect(sanitizeUrl("javascript:alert(1)")).toEqual(null);
  });

  it('rejeita data:', () => {
    expect(sanitizeUrl("data:text/html,<script>")).toEqual(null);
  });

  it('aceita mailto', () => {
    expect(sanitizeUrl("mailto:user@example.com")).toEqual("mailto:user@example.com");
  });

  it('aceita relative', () => {
    expect(sanitizeUrl("/path/to/page")).toEqual("/path/to/page");
  });
});

describe('sanitizeLogMessage', () => {
  it('remove CPF', () => {
    expect(sanitizeLogMessage("User CPF: 123.456.789-00")).toEqual("User CPF: [CPF]");
  });

  it('remove email', () => {
    expect(sanitizeLogMessage("Contact: user@example.com")).toEqual("Contact: [EMAIL]");
  });

  it('remove bearer token', () => {
    expect(
      sanitizeLogMessage("Auth: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")
    ).toEqual("Auth: Bearer [TOKEN]");
  });

  it('remove API keys OpenAI', () => {
    const key = "sk-" + "a".repeat(50);
    expect(sanitizeLogMessage(`Key: ${key}`)).toEqual("Key: sk-[REDACTED]");
  });
});

describe('truncate', () => {
  it('trunca texto longo', () => {
    expect(truncate("Hello World", 8)).toEqual("Hello...");
  });

  it('mantém texto curto', () => {
    expect(truncate("Hi", 10)).toEqual("Hi");
  });
});

describe('validateFileSize', () => {
  it('aceita tamanho válido', () => {
    const result = validateFileSize(1024 * 1024, 10 * 1024 * 1024);
    expect(result.valid).toEqual(true);
  });

  it('rejeita arquivo vazio', () => {
    const result = validateFileSize(0, 10 * 1024 * 1024);
    expect(result.valid).toEqual(false);
    expect(result.error).toBeDefined();
  });

  it('rejeita arquivo muito grande', () => {
    const result = validateFileSize(20 * 1024 * 1024, 10 * 1024 * 1024);
    expect(result.valid).toEqual(false);
    expect(result.error).toBeDefined();
  });
});
