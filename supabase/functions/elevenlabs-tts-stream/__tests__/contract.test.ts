/**
 * Contract tests — elevenlabs-tts-stream@v1.
 *
 * Streaming de texto para áudio via ElevenLabs. Consumo real:
 * `{ text, voiceId?, modelId?, languageCode?, applyTextNormalization? }`
 * (index.ts, src/features/inbox/hooks/voice/playTtsAudio.ts).
 *
 * DRIFT FECHADO (2026-08-21, Bloco 2/3 do PLANO-100-CONTRATOS-EDGE): o
 * schema antigo validava voice_id/model_id (snake_case, nunca lidos —
 * o handler usa camelCase) e speed/stability/similarity (campos que não
 * existem no handler — voice_settings é hardcoded). A validação de
 * verdade vivia num bloco 400 manual, removido junto com este fix.
 */
import { assertEquals, assert } from "jsr:@std/assert";
import { ElevenLabsTtsStreamV1Schema, CONTRACT_SCHEMAS } from "../../_shared/contract-schemas.ts";

Deno.test("Contract: elevenlabs-tts-stream v1 — payload mínimo real (só text) → aceito", () => {
  assertEquals(ElevenLabsTtsStreamV1Schema.safeParse({ text: "Olá, tudo bem?" }).success, true);
});

Deno.test("Contract: elevenlabs-tts-stream v1 — payload completo → aceito", () => {
  const r = ElevenLabsTtsStreamV1Schema.safeParse({
    text: "Oi",
    voiceId: "TY3h8ANhQUsJaa0Bga5F",
    modelId: "eleven_flash_v2_5",
    languageCode: "pt",
    applyTextNormalization: "auto",
  });
  assertEquals(r.success, true);
});

Deno.test("Contract: elevenlabs-tts-stream v1 — text ausente → rejeitado", () => {
  assertEquals(ElevenLabsTtsStreamV1Schema.safeParse({ voiceId: "v1" }).success, false);
});

Deno.test("Contract: elevenlabs-tts-stream v1 — text vazio → rejeitado", () => {
  assertEquals(ElevenLabsTtsStreamV1Schema.safeParse({ text: "" }).success, false);
});

Deno.test("Contract: elevenlabs-tts-stream v1 — text acima de 10000 chars → rejeitado", () => {
  assertEquals(ElevenLabsTtsStreamV1Schema.safeParse({ text: "x".repeat(10001) }).success, false);
});

Deno.test("Contract: elevenlabs-tts-stream v1 — voiceId tipo errado (number) → rejeitado", () => {
  assertEquals(ElevenLabsTtsStreamV1Schema.safeParse({ text: "x", voiceId: 123 }).success, false);
});

Deno.test("Contract: elevenlabs-tts-stream v1 — campos do schema antigo (voice_id/speed/stability/similarity) → rejeitados", () => {
  const r = ElevenLabsTtsStreamV1Schema.safeParse({
    text: "x",
    voice_id: "v1",
    speed: 1,
    stability: 0.5,
    similarity: 0.75,
  });
  assertEquals(r.success, false);
});

Deno.test("Contract: elevenlabs-tts-stream v1 — null → rejeitado", () => {
  assertEquals(ElevenLabsTtsStreamV1Schema.safeParse(null).success, false);
});

Deno.test("Contract: elevenlabs-tts-stream v1 — registrado em CONTRACT_SCHEMAS", () => {
  assert(CONTRACT_SCHEMAS["elevenlabs-tts-stream"]?.v1);
});
