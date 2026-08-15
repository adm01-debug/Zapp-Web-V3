// media.test.ts — regressao do hotfix da rodada 3 (2026-08-15)
// Cobre: retry 5xx, detectMediaType (m4a/webm/mismatch), INVALID_MEDIA, timer scope.
import { assertEquals } from "jsr:@std/assert";
import { downloadMedia } from "./media.ts";

const JPEG = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
const PNG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
const M4A = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4D, 0x34, 0x41, 0x20, 0x00, 0x00, 0x00, 0x00]);
const WEBM = new Uint8Array([0x1A, 0x45, 0xDF, 0xA3, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
const TEXT = new TextEncoder().encode("hello world not media");

function stub(status: number, body: BodyInit, headers: Record<string, string> = {}) {
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response(body, { status, headers }); }) as typeof fetch;
  return () => calls;
}

Deno.test("download 200 JPEG -> ok, mime jpeg", async () => {
  const c = stub(200, JPEG, { "content-type": "image/jpeg" });
  const r = await downloadMedia("m1", "tok");
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.mime, "image/jpeg");
  assertEquals(c(), 1);
});

Deno.test("download 500 -> SERVER_ERROR apos 3 attempts (retry)", async () => {
  const c = stub(500, "err");
  const r = await downloadMedia("m2", "tok");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error.code, "SERVER_ERROR");
  assertEquals(c(), 3);
});

Deno.test("PNG com content-type jpeg -> mime detectado png", async () => {
  const c = stub(200, PNG, { "content-type": "image/jpeg" });
  const r = await downloadMedia("m3", "tok");
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.mime, "image/png");
  assertEquals(c(), 1);
});

Deno.test("m4a (ftyp M4A) -> audio/mp4 (sem misdetect)", async () => {
  stub(200, M4A, { "content-type": "audio/mp4" });
  const r = await downloadMedia("m4", "tok");
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.mime, "audio/mp4");
});

Deno.test("webm (EBML) -> video/webm (sem misdetect)", async () => {
  stub(200, WEBM, { "content-type": "video/webm" });
  const r = await downloadMedia("m5", "tok");
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.mime, "video/webm");
});

Deno.test("texto + octet-stream -> INVALID_MEDIA (fail-closed)", async () => {
  stub(200, TEXT, { "content-type": "application/octet-stream" });
  const r = await downloadMedia("m6", "tok");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error.code, "INVALID_MEDIA");
});

Deno.test("404 -> NOT_FOUND, 1 chamada (sem retry)", async () => {
  const c = stub(404, "nf");
  const r = await downloadMedia("m7", "tok");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error.code, "NOT_FOUND");
  assertEquals(c(), 1);
});

Deno.test("timeout -> TIMEOUT", async () => {
  globalThis.fetch = (async () => { throw new DOMException("aborted", "AbortError"); }) as typeof fetch;
  const r = await downloadMedia("m8", "tok");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error.code, "TIMEOUT");
});
