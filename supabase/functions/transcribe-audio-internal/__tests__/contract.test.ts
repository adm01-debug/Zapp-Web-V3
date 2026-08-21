/**
 * Contract tests — transcribe-audio-internal@v1.
 *
 * Função interna (auth via header x-internal-secret == HEALTH_SECRET),
 * invocada por outras edges para transcrever áudio via ElevenLabs.
 * Schema testado: TranscribeAudioInternalV1Schema (contract-schemas.ts) —
 * o MESMO usado em produção via parseOrReject, não mock.
 *
 * SEC-2 (2026-08-21): audioUrl ia direto a `fetch()` sem validação de host —
 * SSRF para a rede interna a partir de qualquer caller com HEALTH_SECRET.
 * O schema agora exige HTTPS público (isSafeHttpsUrl bloqueia
 * localhost/RFC-1918/link-local/IPv6 interno).
 */
import { assertEquals } from "jsr:@std/assert";
import { TranscribeAudioInternalV1Schema } from "../../_shared/contract-schemas.ts";

const VALID = {
  messageId: "msg-abc-123",
  audioUrl: "https://supabase.atomicabr.com.br/storage/v1/object/public/whatsapp-media/audio.ogg",
};

Deno.test("Contract: transcribe-audio-internal v1 — payload válido", () => {
  const result = TranscribeAudioInternalV1Schema.safeParse(VALID);
  assertEquals(result.success, true);
});

Deno.test("Contract: transcribe-audio-internal v1 — messageId ausente é rejeitado", () => {
  const { messageId: _drop, ...rest } = VALID;
  const result = TranscribeAudioInternalV1Schema.safeParse(rest);
  assertEquals(result.success, false);
});

Deno.test("Contract: transcribe-audio-internal v1 — audioUrl ausente é rejeitado", () => {
  const { audioUrl: _drop, ...rest } = VALID;
  const result = TranscribeAudioInternalV1Schema.safeParse(rest);
  assertEquals(result.success, false);
});

Deno.test("Contract: transcribe-audio-internal v1 — messageId string vazia é rejeitado", () => {
  const result = TranscribeAudioInternalV1Schema.safeParse({ ...VALID, messageId: "" });
  assertEquals(result.success, false);
});

Deno.test("Contract: transcribe-audio-internal v1 — audioUrl não é URL (string arbitrária) é rejeitado", () => {
  const result = TranscribeAudioInternalV1Schema.safeParse({ ...VALID, audioUrl: "not-a-url" });
  assertEquals(result.success, false);
});

Deno.test("Contract: transcribe-audio-internal v1 — audioUrl tipo errado (number) é rejeitado", () => {
  const result = TranscribeAudioInternalV1Schema.safeParse({ ...VALID, audioUrl: 12345 });
  assertEquals(result.success, false);
});

Deno.test("Contract: transcribe-audio-internal v1 — payload null é rejeitado", () => {
  const result = TranscribeAudioInternalV1Schema.safeParse(null);
  assertEquals(result.success, false);
});

Deno.test("Contract: transcribe-audio-internal v1 — payload {} é rejeitado", () => {
  const result = TranscribeAudioInternalV1Schema.safeParse({});
  assertEquals(result.success, false);
});

// SEC-2 — SSRF: audioUrl apontando para rede interna deve ser rejeitada.
const SSRF_TARGETS = [
  "http://169.254.169.254/latest/meta-data/",  // AWS/GCP metadata endpoint
  "https://169.254.169.254/latest/meta-data/", // idem, https
  "https://localhost/secret",
  "https://127.0.0.1:8080/admin",
  "https://10.0.0.5/internal",
  "https://192.168.1.1/router",
  "https://172.16.0.1/internal",
  "https://[::1]/internal",
  "http://supabase.atomicabr.com.br/x", // http (não https) também deve cair
];

for (const url of SSRF_TARGETS) {
  Deno.test(`Contract: transcribe-audio-internal v1 — SSRF bloqueado: ${url}`, () => {
    const result = TranscribeAudioInternalV1Schema.safeParse({ ...VALID, audioUrl: url });
    assertEquals(result.success, false);
  });
}

Deno.test("Contract: transcribe-audio-internal v1 — audioUrl HTTPS público legítimo passa", () => {
  const result = TranscribeAudioInternalV1Schema.safeParse({
    ...VALID,
    audioUrl: "https://evolution.atomicabr.com.br/media/audio.ogg",
  });
  assertEquals(result.success, true);
});
