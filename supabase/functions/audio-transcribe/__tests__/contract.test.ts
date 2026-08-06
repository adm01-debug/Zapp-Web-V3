/**
 * Contract tests — audio-transcribe.
 *
 * Cobre o contrato AudioTranscribeV1Schema (registro canônico em
 * contract-schemas.ts, espelho fiel do TranscribeInput inline v2.2) e a
 * integração do gate no index.ts (parseOrReject com envelope 422 unificado).
 *
 * Comportamento REAL (zod 3.23.8, verificado):
 *  - action/language/format têm .default() → payload {} falha no refine
 *    (audio_base64|audio_url obrigatório) mesmo com defaults aplicados.
 *  - audio_base64 exige min(100) chars.
 *  - refine dispara em contract_violation (path root).
 *
 * Rodar: deno test --allow-net --allow-env --allow-read supabase/functions/audio-transcribe/__tests__/contract.test.ts
 */

import { assertEquals, assert, assertMatch } from "jsr:@std/assert";
import { parseOrReject } from "../../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../../_shared/contract-schemas.ts";
import { readSourceFrom } from "../../_shared/test-helpers.ts";

const SOURCE = await readSourceFrom(import.meta.url, "../index.ts");
const SCHEMA = CONTRACT_SCHEMAS["audio-transcribe"].v1!;

// base64 de um áudio fake com >100 chars (min exigido)
const AUDIO_B64 = "a".repeat(200);

function req(body: unknown): Request {
  return new Request("https://edge.local/audio-transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function gate(body: unknown) {
  return parseOrReject("audio-transcribe", CONTRACT_SCHEMAS["audio-transcribe"], req(body), body, { extraHeaders: {} });
}

// ─── Válidos ────────────────────────────────────────────────────────────────

Deno.test("Contract: audio-transcribe — audio_base64 válido (defaults aplicados)", () => {
  const r = SCHEMA.safeParse({ audio_base64: AUDIO_B64 });
  assertEquals(r.success, true);
  if (r.success) {
    assertEquals(r.data.action, "transcribe");
    assertEquals(r.data.language, "pt");
    assertEquals(r.data.format, "text");
  }
});

Deno.test("Contract: audio-transcribe — audio_url https válido", () => {
  const r = SCHEMA.safeParse({ audio_url: "https://cdn.example.com/audio.wav", action: "translate", format: "srt" });
  assertEquals(r.success, true);
  if (r.success) {
    assertEquals(r.data.action, "translate");
    assertEquals(r.data.format, "srt");
  }
});

Deno.test("Contract: audio-transcribe — action translate + language es + format json", () => {
  const r = SCHEMA.safeParse({ audio_base64: AUDIO_B64, action: "translate", language: "es", format: "json" });
  assertEquals(r.success, true);
});

// ─── Inválidos ──────────────────────────────────────────────────────────────

Deno.test("Contract: audio-transcribe — sem audio_base64 nem audio_url → refine falha", () => {
  const r = SCHEMA.safeParse({ action: "transcribe" });
  assertEquals(r.success, false);
  if (!r.success) {
    assertMatch(JSON.stringify(r.error.issues), /audio_base64 or audio_url is required/);
  }
});

Deno.test("Contract: audio-transcribe — {} → refine falha (mesmo com defaults)", () => {
  const r = SCHEMA.safeParse({});
  assertEquals(r.success, false);
});

Deno.test("Contract: audio-transcribe — audio_base64 curto demais (min 100)", () => {
  const r = SCHEMA.safeParse({ audio_base64: "short" });
  assertEquals(r.success, false);
  if (!r.success) {
    const issue = r.error.issues.find(i => i.path[0] === "audio_base64");
    assert(issue, "deveria haver issue em audio_base64");
  }
});

Deno.test("Contract: audio-transcribe — action inválida (enum fechado)", () => {
  const r = SCHEMA.safeParse({ audio_base64: AUDIO_B64, action: "summarize" });
  assertEquals(r.success, false);
});

Deno.test("Contract: audio-transcribe — format inválido", () => {
  const r = SCHEMA.safeParse({ audio_base64: AUDIO_B64, format: "pdf" });
  assertEquals(r.success, false);
});

Deno.test("Contract: audio-transcribe — audio_url http:// é URL válida no schema (SSRF é do handler)", () => {
  // REALIDADE: z.string().url() aceita http:// — a proteção https/SSRF vive no
  // handler (isSafeAudioUrl, ancorada abaixo). O schema só valida formato URL.
  const r = SCHEMA.safeParse({ audio_url: "http://example.com/a.wav" });
  assertEquals(r.success, true);
});

Deno.test("Contract: audio-transcribe — audio_url string inválida", () => {
  const r = SCHEMA.safeParse({ audio_url: "not-a-url" });
  assertEquals(r.success, false);
});

// ─── Gate (parseOrReject, envelope 422) ─────────────────────────────────────

Deno.test("Contract: audio-transcribe — body null → 422 invalid_json", async () => {
  const r = gate(null);
  assertEquals(r.ok, false);
  if (!r.ok) {
    assertEquals(r.response.status, 422);
    const body = await r.response.json() as { code: string };
    assertEquals(body.code, "invalid_json");
  }
});

Deno.test("Contract: audio-transcribe — payload sem audio → 422 contract_violation", async () => {
  const r = gate({ action: "transcribe" });
  assertEquals(r.ok, false);
  if (!r.ok) {
    assertEquals(r.response.status, 422);
    const body = await r.response.json() as { code: string; contract: string };
    assertEquals(body.code, "contract_violation");
    assertEquals(body.contract, "audio-transcribe@v1");
  }
});

Deno.test("Contract: audio-transcribe — payload válido → ok (gate passa)", () => {
  const r = gate({ audio_base64: AUDIO_B64 });
  assertEquals(r.ok, true);
});

// ─── Ancoragem na fonte (o index.ts usa o gate canônico) ────────────────────

Deno.test("Contract: audio-transcribe — index.ts usa parseOrReject com o registro", () => {
  assertMatch(SOURCE, /parseOrReject\('audio-transcribe', CONTRACT_SCHEMAS\['audio-transcribe'\]/);
  assertMatch(SOURCE, /if \(!parsed\.ok\) return parsed\.response/);
});

Deno.test("Contract: audio-transcribe — SSRF guard isSafeAudioUrl preservado", () => {
  assertMatch(SOURCE, /function isSafeAudioUrl/);
  assertMatch(SOURCE, /redirect: 'error'/);
});

Deno.test("Contract: audio-transcribe — health GET público preservado", () => {
  assertMatch(SOURCE, /req\.method === 'GET'/);
  assertMatch(SOURCE, /status: 'healthy'/);
});
