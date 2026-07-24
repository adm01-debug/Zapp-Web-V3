/**
 * Tests para sanitize-extra.ts
 */
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

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
} from "../sanitize-extra.ts";

Deno.test("sanitizeEmail: aceita email válido", () => {
  assertEquals(sanitizeEmail("User@Example.com"), "user@example.com");
});

Deno.test("sanitizeEmail: rejeita email sem @", () => {
  assertEquals(sanitizeEmail("notanemail"), null);
});

Deno.test("sanitizeEmail: rejeita email muito longo", () => {
  const long = "a".repeat(300) + "@example.com";
  assertEquals(sanitizeEmail(long), null);
});

Deno.test("sanitizeEmail: rejeita email com pontos consecutivos", () => {
  assertEquals(sanitizeEmail("user..name@example.com"), null);
});

Deno.test("sanitizeEmail: aceita email com subdomain", () => {
  assertEquals(sanitizeEmail("user@mail.example.com"), "user@mail.example.com");
});

Deno.test("sanitizeEmail: rejeita null/undefined", () => {
  assertEquals(sanitizeEmail(null as unknown as string), null);
  assertEquals(sanitizeEmail(undefined as unknown as string), null);
});

Deno.test("normalizePhoneBR: normaliza telefone sem código do país", () => {
  assertEquals(normalizePhoneBR("11999998888"), "5511999998888");
});

Deno.test("normalizePhoneBR: mantém código do país se presente", () => {
  assertEquals(normalizePhoneBR("5511999998888"), "5511999998888");
});

Deno.test("normalizePhoneBR: aceita formatação com parênteses", () => {
  assertEquals(normalizePhoneBR("(11) 99999-8888"), "5511999998888");
});

Deno.test("normalizePhoneBR: rejeita telefone muito curto", () => {
  assertEquals(normalizePhoneBR("123"), null);
});

Deno.test("normalizePhoneBR: rejeita telefone muito longo", () => {
  assertEquals(normalizePhoneBR("123456789012345"), null);
});

Deno.test("maskPhoneBR: formata 11 dígitos", () => {
  assertEquals(maskPhoneBR("11999998888"), "(11) 99999-8888");
});

Deno.test("maskPhoneBR: formata 10 dígitos", () => {
  assertEquals(maskPhoneBR("1199998888"), "(11) 9999-8888");
});

Deno.test("validateMimeType: aceita MIME permitido", () => {
  assertEquals(validateMimeType("image/png", ["image/png", "image/jpeg"]), true);
});

Deno.test("validateMimeType: rejeita MIME não permitido", () => {
  assertEquals(validateMimeType("application/x-evil", ["image/png"]), false);
});

Deno.test("validateFileExtension: aceita extensão permitida", () => {
  assertEquals(validateFileExtension("foto.png", ["png", "jpg"]), true);
});

Deno.test("validateFileExtension: rejeita extensão perigosa", () => {
  assertEquals(validateFileExtension("virus.exe", ["png", "jpg"]), false);
});

Deno.test("sanitizeFilename: remove path traversal", () => {
  assertEquals(sanitizeFilename("../../etc/passwd"), "etcpasswd");
});

Deno.test("sanitizeFilename: remove separadores", () => {
  assertEquals(sanitizeFilename("path/to/file.txt"), "pathtofile.txt");
});

Deno.test("sanitizeFilename: trunca nomes longos", () => {
  const long = "a".repeat(300) + ".txt";
  const clean = sanitizeFilename(long);
  assertEquals(clean.length <= 255, true);
});

Deno.test("sanitizeUrl: aceita http", () => {
  assertEquals(sanitizeUrl("http://example.com"), "http://example.com");
});

Deno.test("sanitizeUrl: aceita https", () => {
  assertEquals(sanitizeUrl("https://example.com"), "https://example.com");
});

Deno.test("sanitizeUrl: rejeita javascript:", () => {
  assertEquals(sanitizeUrl("javascript:alert(1)"), null);
});

Deno.test("sanitizeUrl: rejeita data:", () => {
  assertEquals(sanitizeUrl("data:text/html,<script>"), null);
});

Deno.test("sanitizeUrl: aceita mailto", () => {
  assertEquals(sanitizeUrl("mailto:user@example.com"), "mailto:user@example.com");
});

Deno.test("sanitizeUrl: aceita relative", () => {
  assertEquals(sanitizeUrl("/path/to/page"), "/path/to/page");
});

Deno.test("sanitizeLogMessage: remove CPF", () => {
  assertEquals(sanitizeLogMessage("User CPF: 123.456.789-00"), "User CPF: [CPF]");
});

Deno.test("sanitizeLogMessage: remove email", () => {
  assertEquals(sanitizeLogMessage("Contact: user@example.com"), "Contact: [EMAIL]");
});

Deno.test("sanitizeLogMessage: remove bearer token", () => {
  assertEquals(
    sanitizeLogMessage("Auth: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"),
    "Auth: Bearer [TOKEN]"
  );
});

Deno.test("sanitizeLogMessage: remove API keys OpenAI", () => {
  const key = "sk-" + "a".repeat(50);
  assertEquals(sanitizeLogMessage(`Key: ${key}`), "Key: sk-[REDACTED]");
});

Deno.test("truncate: trunca texto longo", () => {
  assertEquals(truncate("Hello World", 8), "Hello...");
});

Deno.test("truncate: mantém texto curto", () => {
  assertEquals(truncate("Hi", 10), "Hi");
});

Deno.test("validateFileSize: aceita tamanho válido", () => {
  const result = validateFileSize(1024 * 1024, 10 * 1024 * 1024);
  assertEquals(result.valid, true);
});

Deno.test("validateFileSize: rejeita arquivo vazio", () => {
  const result = validateFileSize(0, 10 * 1024 * 1024);
  assertEquals(result.valid, false);
  assertExists(result.error);
});

Deno.test("validateFileSize: rejeita arquivo muito grande", () => {
  const result = validateFileSize(20 * 1024 * 1024, 10 * 1024 * 1024);
  assertEquals(result.valid, false);
  assertExists(result.error);
});
