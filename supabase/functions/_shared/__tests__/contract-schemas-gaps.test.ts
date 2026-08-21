/**
 * Contract tests — casos negativos (tipos incorretos) para contratos que a
 * auditoria 2026-08-06 marcou SEM cobertura de tipos/vazios (gaps A3):
 *
 *   elevenlabs-tts-stream, elevenlabs-sfx, elevenlabs-dialogue,
 *   whatsapp-cloud-api, webhook-hmac-selftest,
 *   gmail-token-refresh, bitrix-api
 *
 * (elevenlabs-voice-design saiu da lista: função removida na onda #922.)
 * O teste negativo trava o TIPO de cada campo tipado: payload com tipo
 * errado DEVE falhar; `{}` só passa onde o contrato não tem obrigatórios
 * (`acceptsEmpty`, default true — false em bitrix-api e nos 3 elevenlabs-*,
 * que ganharam campo obrigatório real no Bloco 2/3, 2026-08-21).
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
  /** false quando o contrato tem obrigatórios (ex.: bitrix-api action enum) */
  acceptsEmpty?: boolean;
  invalid: NegativeCase[];
}

const MATRICES: Matrix[] = [
  {
    // Bloco 2/3 (2026-08-21): text é obrigatório desde o fix do drift
    // (campos reais são text/voiceId/modelId/languageCode/
    // applyTextNormalization — o schema antigo validava voice_id/speed/
    // stability/similarity, que não existem no handler). {} agora falha.
    name: "elevenlabs-tts-stream",
    acceptsEmpty: false,
    invalid: [
      { label: "text ausente (body {})", payload: {}, expectPath: "text" },
      { label: "text number", payload: { text: 42 }, expectPath: "text" },
      { label: "text vazio", payload: { text: "" }, expectPath: "text" },
      { label: "voiceId objeto", payload: { text: "oi", voiceId: { x: 1 } }, expectPath: "voiceId" },
      { label: "modelId number", payload: { text: "oi", modelId: 7 }, expectPath: "modelId" },
      // .strict(): erro de chave desconhecida vem com path raiz ([] → ""),
      // não path.speed — o nome da chave fica em issue.keys, não issue.path.
      { label: "campo do schema antigo (speed) → extra desconhecido", payload: { text: "oi", speed: 1 }, expectPath: "" },
    ],
  },
  {
    // Bloco 2/3 (2026-08-21): prompt é obrigatório desde o fix do drift
    // (campos reais são prompt/duration/mode — o schema antigo validava
    // text/duration_seconds/prompt_influence, campos de SAÍDA para a API
    // da ElevenLabs, não de entrada do cliente). {} agora falha.
    name: "elevenlabs-sfx",
    acceptsEmpty: false,
    invalid: [
      { label: "prompt ausente (body {})", payload: {}, expectPath: "prompt" },
      { label: "prompt objeto", payload: { prompt: { x: 1 } }, expectPath: "prompt" },
      { label: "prompt vazio", payload: { prompt: "" }, expectPath: "prompt" },
      { label: "duration string onde number", payload: { prompt: "x", duration: "10" }, expectPath: "duration" },
      { label: "mode fora do enum", payload: { prompt: "x", mode: "voice" }, expectPath: "mode" },
    ],
  },
  {
    // Bloco 2/3 (2026-08-21): script é obrigatório desde o fix do drift
    // (campo real é script[]/languageCode — o schema antigo validava
    // text/voice_id/model_id soltos, que não existem no handler). {} agora falha.
    name: "elevenlabs-dialogue",
    acceptsEmpty: false,
    invalid: [
      { label: "script ausente (body {})", payload: {}, expectPath: "script" },
      { label: "script vazio []", payload: { script: [] }, expectPath: "script" },
      { label: "script item sem text", payload: { script: [{ voice_id: "v" }] }, expectPath: "script.0.text" },
      { label: "languageCode number", payload: { script: [{ voice_id: "v", text: "x" }], languageCode: 7 }, expectPath: "languageCode" },
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
    acceptsEmpty: false,
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

  if (m.acceptsEmpty !== false) {
    Deno.test(`gaps: ${m.name} — {} aceito (permissivo, sem obrigatórios)`, () => {
      assertEquals(schema.safeParse({}).success, true);
    });
  }

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
