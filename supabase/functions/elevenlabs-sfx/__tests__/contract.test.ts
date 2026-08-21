/**
 * Contract tests — elevenlabs-sfx@v1.
 *
 * Gera efeito sonoro ou música curta via ElevenLabs. Consumo real:
 * `{ prompt, duration?, mode? }` (index.ts,
 * src/components/settings/media-library/AIGenerateDialog.tsx).
 *
 * DRIFT FECHADO (2026-08-21, Bloco 2/3 do PLANO-100-CONTRATOS-EDGE): o
 * schema antigo validava text/duration_seconds/prompt_influence — campos
 * do body de SAÍDA (para a API da ElevenLabs), não do body de entrada do
 * cliente. A validação de verdade vivia num bloco 400 manual, removido.
 */
import { assertEquals, assert } from "jsr:@std/assert";
import { ElevenLabsSfxV1Schema, CONTRACT_SCHEMAS } from "../../_shared/contract-schemas.ts";

Deno.test("Contract: elevenlabs-sfx v1 — payload real do frontend (sfx) → aceito", () => {
  assertEquals(ElevenLabsSfxV1Schema.safeParse({ prompt: "explosão distante", duration: 5, mode: "sfx" }).success, true);
});

Deno.test("Contract: elevenlabs-sfx v1 — payload real do frontend (music) → aceito", () => {
  assertEquals(ElevenLabsSfxV1Schema.safeParse({ prompt: "trilha épica", duration: 15, mode: "music" }).success, true);
});

Deno.test("Contract: elevenlabs-sfx v1 — só prompt (duration/mode opcionais) → aceito", () => {
  assertEquals(ElevenLabsSfxV1Schema.safeParse({ prompt: "chuva" }).success, true);
});

Deno.test("Contract: elevenlabs-sfx v1 — prompt ausente → rejeitado", () => {
  assertEquals(ElevenLabsSfxV1Schema.safeParse({ duration: 5 }).success, false);
});

Deno.test("Contract: elevenlabs-sfx v1 — prompt vazio → rejeitado", () => {
  assertEquals(ElevenLabsSfxV1Schema.safeParse({ prompt: "" }).success, false);
});

Deno.test("Contract: elevenlabs-sfx v1 — prompt acima de 2000 chars → rejeitado", () => {
  assertEquals(ElevenLabsSfxV1Schema.safeParse({ prompt: "x".repeat(2001) }).success, false);
});

Deno.test("Contract: elevenlabs-sfx v1 — mode fora do enum → rejeitado", () => {
  assertEquals(ElevenLabsSfxV1Schema.safeParse({ prompt: "x", mode: "voice" }).success, false);
});

Deno.test("Contract: elevenlabs-sfx v1 — duration negativa → rejeitado", () => {
  assertEquals(ElevenLabsSfxV1Schema.safeParse({ prompt: "x", duration: -1 }).success, false);
});

Deno.test("Contract: elevenlabs-sfx v1 — duration tipo errado (string) → rejeitado", () => {
  assertEquals(ElevenLabsSfxV1Schema.safeParse({ prompt: "x", duration: "5" }).success, false);
});

Deno.test("Contract: elevenlabs-sfx v1 — campos do schema antigo (text/duration_seconds/prompt_influence) → rejeitados", () => {
  const r = ElevenLabsSfxV1Schema.safeParse({
    prompt: "x",
    text: "x",
    duration_seconds: 5,
    prompt_influence: 0.3,
  });
  assertEquals(r.success, false);
});

Deno.test("Contract: elevenlabs-sfx v1 — null → rejeitado", () => {
  assertEquals(ElevenLabsSfxV1Schema.safeParse(null).success, false);
});

Deno.test("Contract: elevenlabs-sfx v1 — registrado em CONTRACT_SCHEMAS", () => {
  assert(CONTRACT_SCHEMAS["elevenlabs-sfx"]?.v1);
});
