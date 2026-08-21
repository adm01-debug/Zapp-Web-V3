/**
 * Contract tests — elevenlabs-dialogue@v1.
 *
 * Gera diálogo multi-voz via ElevenLabs text-to-dialogue. Consumo real:
 * `{ script: [{voice_id, text}], languageCode? }` (index.ts,
 * src/components/voice/ElevenLabsDialogue.tsx).
 *
 * DRIFT FECHADO (2026-08-21, Bloco 2/3 do PLANO-100-CONTRATOS-EDGE): o
 * schema antigo validava action/text/voice_id/model_id/dialogue soltos —
 * nenhum desses é o shape real (`script[]`). A validação de verdade vivia
 * num bloco 400 manual, removido junto com este fix.
 */
import { assertEquals, assert } from "jsr:@std/assert";
import { ElevenLabsDialogueV1Schema, CONTRACT_SCHEMAS } from "../../_shared/contract-schemas.ts";

const VALID = {
  script: [
    { voice_id: "onwK4e9ZLuTAKqWW03F9", text: "Oi, tudo bem?" },
    { voice_id: "cgSgspJ2msm6clMCkdW9", text: "Tudo ótimo!" },
  ],
  languageCode: "pt",
};

Deno.test("Contract: elevenlabs-dialogue v1 — payload real do frontend → aceito", () => {
  assertEquals(ElevenLabsDialogueV1Schema.safeParse(VALID).success, true);
});

Deno.test("Contract: elevenlabs-dialogue v1 — sem languageCode (opcional) → aceito", () => {
  const { languageCode: _drop, ...rest } = VALID;
  assertEquals(ElevenLabsDialogueV1Schema.safeParse(rest).success, true);
});

Deno.test("Contract: elevenlabs-dialogue v1 — script ausente → rejeitado", () => {
  assertEquals(ElevenLabsDialogueV1Schema.safeParse({ languageCode: "pt" }).success, false);
});

Deno.test("Contract: elevenlabs-dialogue v1 — script vazio [] → rejeitado (min 1)", () => {
  assertEquals(ElevenLabsDialogueV1Schema.safeParse({ script: [] }).success, false);
});

Deno.test("Contract: elevenlabs-dialogue v1 — script com 101 falas → rejeitado (max 100)", () => {
  const script = Array.from({ length: 101 }, () => ({ voice_id: "v", text: "x" }));
  assertEquals(ElevenLabsDialogueV1Schema.safeParse({ script }).success, false);
});

Deno.test("Contract: elevenlabs-dialogue v1 — script com 100 falas → aceito (limite)", () => {
  const script = Array.from({ length: 100 }, () => ({ voice_id: "v", text: "x" }));
  assertEquals(ElevenLabsDialogueV1Schema.safeParse({ script }).success, true);
});

Deno.test("Contract: elevenlabs-dialogue v1 — fala sem text → rejeitado", () => {
  assertEquals(ElevenLabsDialogueV1Schema.safeParse({ script: [{ voice_id: "v" }] }).success, false);
});

Deno.test("Contract: elevenlabs-dialogue v1 — fala com text vazio → rejeitado", () => {
  assertEquals(ElevenLabsDialogueV1Schema.safeParse({ script: [{ voice_id: "v", text: "" }] }).success, false);
});

Deno.test("Contract: elevenlabs-dialogue v1 — fala sem voice_id → rejeitado", () => {
  assertEquals(ElevenLabsDialogueV1Schema.safeParse({ script: [{ text: "oi" }] }).success, false);
});

Deno.test("Contract: elevenlabs-dialogue v1 — campos do schema antigo (action/dialogue/model_id) → rejeitados", () => {
  const r = ElevenLabsDialogueV1Schema.safeParse({
    script: VALID.script,
    action: "dialogue",
    model_id: "eleven_v3",
    dialogue: {},
  });
  assertEquals(r.success, false);
});

Deno.test("Contract: elevenlabs-dialogue v1 — null → rejeitado", () => {
  assertEquals(ElevenLabsDialogueV1Schema.safeParse(null).success, false);
});

Deno.test("Contract: elevenlabs-dialogue v1 — registrado em CONTRACT_SCHEMAS", () => {
  assert(CONTRACT_SCHEMAS["elevenlabs-dialogue"]?.v1);
});
