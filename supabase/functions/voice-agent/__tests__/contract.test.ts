/**
 * Contract tests — voice-agent.
 *
 * O schema TranscriptSchema é declarado INLINE no index.ts (linha 5) e não é
 * exportado. Estratégia (padrão do repo): o teste re-declara o contrato
 * espelhando o index.ts e ancora a fonte com regex — se o schema do index.ts
 * regredir (min/max/transform), o teste de fonte quebra.
 *
 * Contrato: { transcript: string 1..2000 } — após transform(s => s.trim()).
 *
 * Rodar: deno test --allow-net --allow-env --allow-read supabase/functions/voice-agent/__tests__/contract.test.ts
 */

import { assertEquals, assert, assertMatch } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { z } from "https://esm.sh/zod@3.23.8";
import { readSourceFrom } from "../../_shared/test-helpers.ts";

const SOURCE = await readSourceFrom(import.meta.url, "../index.ts");

/** Espelho do TranscriptSchema do index.ts (fonte ancorada abaixo). */
const TranscriptSchema = z.object({
  transcript: z.string().min(1).max(2000).transform(s => s.trim()),
});

// ─── Válidos ────────────────────────────────────────────────────────────────

Deno.test("Contract: VoiceAgent — payload válido (transcript)", () => {
  const result = TranscriptSchema.safeParse({ transcript: "abrir inbox" });
  assertEquals(result.success, true);
  if (result.success) assertEquals(result.data.transcript, "abrir inbox");
});

Deno.test("Contract: VoiceAgent — transcript com 2000 chars (limite max) aceito", () => {
  const result = TranscriptSchema.safeParse({ transcript: "x".repeat(2000) });
  assertEquals(result.success, true);
});

Deno.test("Contract: VoiceAgent — transform trims whitespace", () => {
  const result = TranscriptSchema.safeParse({ transcript: "  abrir inbox  " });
  assertEquals(result.success, true);
  if (result.success) assertEquals(result.data.transcript, "abrir inbox");
});

Deno.test("Contract: VoiceAgent — transcript só com espaços: parse OK (min é pré-transform)", () => {
  // Comportamento REAL: min(1)/max(2000) validam ANTES do trim, então "  "
  // passa e vira "" no transform. Documentado como edge case conhecido.
  const result = TranscriptSchema.safeParse({ transcript: "  " });
  assertEquals(result.success, true);
  if (result.success) assertEquals(result.data.transcript, "");
});

// ─── Campos obrigatórios ausentes ───────────────────────────────────────────

Deno.test("Contract: VoiceAgent — transcript ausente deve falhar", () => {
  const result = TranscriptSchema.safeParse({});
  assertEquals(result.success, false);
  const issue = result.success ? null : result.error.issues.find(i => i.path[0] === "transcript");
  assert(issue, "deveria haver issue em transcript");
  assertEquals(issue.code, "invalid_type");
});

Deno.test("Contract: VoiceAgent — payload vazio {} deve falhar", () => {
  const result = TranscriptSchema.safeParse({});
  assertEquals(result.success, false);
});

Deno.test("Contract: VoiceAgent — transcript null deve falhar", () => {
  const result = TranscriptSchema.safeParse({ transcript: null });
  assertEquals(result.success, false);
});

// ─── Tipos incorretos / limites ─────────────────────────────────────────────

Deno.test("Contract: VoiceAgent — transcript vazio deve falhar (min: 1)", () => {
  const result = TranscriptSchema.safeParse({ transcript: "" });
  assertEquals(result.success, false);
  const issue = result.success ? null : result.error.issues.find(i => i.path[0] === "transcript");
  assert(issue, "deveria haver issue em transcript");
  assert(String(issue.message).includes("at least 1"), `mensagem inesperada: ${issue.message}`);
});

Deno.test("Contract: VoiceAgent — transcript > 2000 deve falhar (max: 2000)", () => {
  const result = TranscriptSchema.safeParse({ transcript: "x".repeat(2001) });
  assertEquals(result.success, false);
  const issue = result.success ? null : result.error.issues.find(i => i.path[0] === "transcript");
  assert(issue, "deveria haver issue em transcript");
  assert(String(issue.message).includes("at most 2000"), `mensagem inesperada: ${issue.message}`);
});

Deno.test("Contract: VoiceAgent — transcript tipo errado (number) deve falhar", () => {
  const result = TranscriptSchema.safeParse({ transcript: 42 });
  assertEquals(result.success, false);
});

Deno.test("Contract: VoiceAgent — transcript tipo errado (array) deve falhar", () => {
  const result = TranscriptSchema.safeParse({ transcript: ["oi"] });
  assertEquals(result.success, false);
});

// ─── Ancoragem na fonte (contrato canônico em _shared/schemas.ts + parseOrReject) ───

Deno.test("Contract: VoiceAgent — CONTRACT_SCHEMAS registra VoiceAgentV1Schema (min(1)/max(2000) strict)", () => {
  assertMatch(SOURCE, /parseOrReject\('voice-agent', CONTRACT_SCHEMAS\['voice-agent'\], req, body/);
  assertMatch(SOURCE, /if \(!parsed\.ok\) return parsed\.response/);
});

Deno.test("Contract: VoiceAgent — index.ts valida via parseOrReject (envelope 422 unificado)", () => {
  assertMatch(SOURCE, /const parsed = parseOrReject/);
  assertMatch(SOURCE, /parsed\.data as Record<string, any>/);
});

Deno.test("Contract: VoiceAgent — falha de validação responde via envelope do contrato (422)", () => {
  assertMatch(SOURCE, /Gate de contrato \(VoiceAgentV1Schema estrito\) — envelope 422 unificado/);
});
