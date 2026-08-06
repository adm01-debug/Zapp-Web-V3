/**
 * Contract tests — casos negativos (tipos incorretos) para contratos que a
 * auditoria 2026-08-06 marcou SEM cobertura de tipos/vazios (gaps A3):
 *
 *   elevenlabs-tts-stream, elevenlabs-sfx, elevenlabs-dialogue,
 *   whatsapp-cloud-api, webhook-hmac-selftest,
 *   gmail-token-refresh, bitrix-api
 *
 * (elevenlabs-voice-design saiu da lista: função removida na onda #922.)
 * Todos os campos desses contratos são opcionais/nullish (permissivos por
 * design), EXCETO bitrix-api (action enum obrigatório) — o teste negativo
 * trava o TIPO de cada campo tipado: payload com tipo errado DEVE falhar;
 * `{}` DEVE passar onde não há obrigatórios.
 */
import { assertEquals } from "jsr:@std/assert";
import { CONTRACT_SCHEMAS } from "../contract-schemas.ts";

interface NegativeCase {
  label: string;
  payload: Record<string, unknown>;
  expectPath: string;
}

interface Matrix {
  name: string;
  invalid: NegativeCase[];
}

const MATRICES: Matrix[] = [
  {
    name: "elevenlabs-tts-stream",
    invalid: [
      { label: "speed string onde number", payload: { speed: "1.0" }, expectPath: "speed" },
      { label: "stability string", payload: { stability: "0.5" }, expectPath: "stability" },
      { label: "similarity boolean", payload: { similarity: true }, expectPath: "similarity" },
      { label: "text number", payload: { text: 42 }, expectPath: "text" },
    ],
  },
  {
    name: "elevenlabs-sfx",
    invalid: [
      { label: "duration_seconds string", payload: { duration_seconds: "10" }, expectPath: "duration_seconds" },
      { label: "prompt_influence string", payload: { prompt_influence: "0.3" }, expectPath: "prompt_influence" },
      { label: "text objeto", payload: { text: { x: 1 } }, expectPath: "text" },
    ],
  },
  {
    name: "elevenlabs-dialogue",
    invalid: [
      { label: "text number", payload: { text: 42 }, expectPath: "text" },
      { label: "voice_id objeto", payload: { voice_id: { x: 1 } }, expectPath: "voice_id" },
      { label: "model_id number", payload: { model_id: 7 }, expectPath: "model_id" },
    ],
  },
  {
    name: "whatsapp-cloud-api",
    invalid: [
      { label: "linkPreview string onde boolean", payload: { linkPreview: "yes" }, expectPath: "linkPreview" },
      { label: "number objeto", payload: { number: { x: 1 } }, expectPath: "number" },
      { label: "components string onde array", payload: { components: "x" }, expectPath: "components" },
      { label: "text boolean", payload: { text: true }, expectPath: "text" },
    ],
  },
  {
    name: "webhook-hmac-selftest",
    invalid: [
      { label: "tolerance_seconds string", payload: { tolerance_seconds: "30" }, expectPath: "tolerance_seconds" },
      { label: "include_negative string onde boolean", payload: { include_negative: "yes" }, expectPath: "include_negative" },
      { label: "instance objeto", payload: { instance: { a: 1 } }, expectPath: "instance" },
    ],
  },
  {
    name: "gmail-token-refresh",
    invalid: [
      { label: "action number", payload: { action: 42 }, expectPath: "action" },
      { label: "accountId objeto", payload: { accountId: { x: 1 } }, expectPath: "accountId" },
    ],
  },
  {
    name: "bitrix-api",
    // action é OBRIGATÓRIO (enum) — `{}` falha; os demais campos opcionais.
    invalid: [
      { label: "action ausente (body {})", payload: {}, expectPath: "action" },
      { label: "action number onde enum", payload: { action: 42 }, expectPath: "action" },
      { label: "action vazio ''", payload: { action: "" }, expectPath: "action" },
      { label: "entityType string fora do enum", payload: { action: "list", entityType: "invoice" }, expectPath: "entityType" },
      { label: "data string onde objeto", payload: { action: "list", data: "x" }, expectPath: "data" },
    ],
  },
];

for (const m of MATRICES) {
  const schema = CONTRACT_SCHEMAS[m.name]?.v1;
  if (!schema) {
    Deno.test(`gaps: ${m.name} registrado em CONTRACT_SCHEMAS`, () => {
      assertEquals(schema !== undefined, true, `${m.name} sem schema v1`);
    });
    continue;
  }

  Deno.test(`gaps: ${m.name} — {} aceito (permissivo, sem obrigatórios)`, () => {
    assertEquals(schema.safeParse({}).success, true);
  });

  for (const c of m.invalid) {
    Deno.test(`gaps: ${m.name} — ${c.label}`, () => {
      const r = schema.safeParse(c.payload);
      assertEquals(r.success, false, `${c.label}: deveria falhar`);
      if (!r.success) {
        const paths = r.error.issues.map((i) => i.path.join("."));
        assertEquals(paths.includes(c.expectPath), true, `path esperado ${c.expectPath}, obtido ${paths.join(",")}`);
      }
    });
  }
}
