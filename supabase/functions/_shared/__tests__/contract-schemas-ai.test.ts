/**
 * Contract schemas AI/voz — cobertura dos contratos V1 registrados em
 * CONTRACT_SCHEMAS (batch fix/hermes-h848298-contract-coverage).
 *
 * Cobre as 13 funções AI/voz (ai-auto-tag, ai-classify-tickets, ai-proxy,
 * ai-router, automation-suggest-reply, chatbot-l1, classify-audio-meme,
 * detect-new-device, sentiment-alert, speech-to-text, voice-agent,
 * voice-changer, voice-copilot-action) + REGRESSÃO CRÍTICA do payload real do
 * front (AIConversationAssistant.tsx:106-118 → ai-conversation-analysis@v1,
 * fix 5ec7b4aee).
 *
 * Regra de ouro: testar a REALIDADE dos schemas (comportamento real do zod
 * 3.23.8), não a spec — desvios são documentados como GAP no comentário do
 * caso. Ex.: `.max()` sem `.min()` aceita string vazia "".
 *
 * Rodar: deno test --allow-net --allow-env --allow-read contract-schemas-ai.test.ts
 */

import { assertEquals, assert } from "jsr:@std/assert";
import type { z } from "../contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../contract-schemas.ts";

const UUID = "3f0c8a4e-1b2d-4c5e-9f6a-7b8c9d0e1f2a";

/** Pega o schema V1 do registro canônico (falha se a chave/v1 sumir do registro). */
function v1(name: string): z.ZodTypeAny {
  const entry = CONTRACT_SCHEMAS[name];
  assert(entry, `chave '${name}' ausente em CONTRACT_SCHEMAS`);
  assert(entry.v1, `v1 ausente em CONTRACT_SCHEMAS['${name}']`);
  return entry.v1;
}

interface Matrix {
  name: string;
  schema: z.ZodTypeAny;
  valid: unknown[];
  invalid: Array<{ label: string; payload: unknown; expectPath?: string }>;
}

const MATRICES: Matrix[] = [
  // ─── ai-auto-tag (AiAutoTagV1Schema estrito: contactId uuid + messages com content + requestId) ───
  {
    name: "CONTRACT_SCHEMAS['ai-auto-tag'].v1 (AiAutoTagV1Schema estrito)",
    schema: v1("ai-auto-tag"),
    valid: [
      { contactId: UUID, messages: [{ content: "Olá, tudo bem?" }], requestId: "req-1" },
      // item com role/sender/timestamp opcionais (messageItemSchema permissivo)
      {
        contactId: UUID,
        messages: [{ role: "user", content: "x", sender: "contact", timestamp: "2026-08-01T10:00:00Z" }],
        requestId: "req-2",
      },
      // LIMITE MAX: 200 mensagens × content 10.000 chars; requestId 256 chars
      {
        contactId: UUID,
        messages: Array.from({ length: 200 }, () => ({ content: "a".repeat(10_000) })),
        requestId: "x".repeat(256),
      },
    ],
    invalid: [
      { label: "contactId ausente (obrigatório)", payload: { messages: [{ content: "x" }], requestId: "r" }, expectPath: "contactId" },
      { label: "messages ausente (obrigatório)", payload: { contactId: UUID, requestId: "r" }, expectPath: "messages" },
      { label: "requestId ausente (obrigatório p/ idempotência)", payload: { contactId: UUID, messages: [{ content: "x" }] }, expectPath: "requestId" },
      { label: "contactId não-UUID", payload: { contactId: "abc", messages: [{ content: "x" }], requestId: "r" }, expectPath: "contactId" },
      { label: "contactId string vazia ''", payload: { contactId: "", messages: [{ content: "x" }], requestId: "r" }, expectPath: "contactId" },
      { label: "contactId tipo errado (number)", payload: { contactId: 123, messages: [{ content: "x" }], requestId: "r" }, expectPath: "contactId" },
      { label: "messages vazio []", payload: { contactId: UUID, messages: [], requestId: "r" }, expectPath: "messages" },
      { label: "messages acima do max (201)", payload: { contactId: UUID, messages: Array.from({ length: 201 }, () => ({ content: "x" })), requestId: "r" }, expectPath: "messages" },
      { label: "item sem content (obrigatório no item)", payload: { contactId: UUID, messages: [{ sender: "contact" }], requestId: "r" }, expectPath: "messages.0.content" },
      { label: "role fora do enum (messageItemSchema)", payload: { contactId: UUID, messages: [{ role: "bot", content: "x" }], requestId: "r" }, expectPath: "messages.0.role" },
      { label: "campo extra (strict)", payload: { contactId: UUID, messages: [{ content: "x" }], requestId: "r", foo: 1 }, expectPath: "" },
    ],
  },

  // ─── ai-classify-tickets (AiClassifyTicketsV1Schema estrito: limit default 50, sem obrigatórios) ───
  {
    name: "CONTRACT_SCHEMAS['ai-classify-tickets'].v1 (AiClassifyTicketsV1Schema estrito)",
    schema: v1("ai-classify-tickets"),
    valid: [
      {}, // sem campos obrigatórios — limit default 50 (consumo real do router)
      { limit: 200 }, // LIMITE MAX
      { limit: 1 }, // limite min
      { limit: 50, requestId: "req-1" },
      // GAP documentado: requestId tem só .max(100), sem .min() → "" passa (comportamento real)
      { requestId: "" },
    ],
    invalid: [
      { label: "limit tipo errado (string)", payload: { limit: "50" }, expectPath: "limit" },
      { label: "limit não-inteiro", payload: { limit: 50.5 }, expectPath: "limit" },
      { label: "limit acima do max (201)", payload: { limit: 201 }, expectPath: "limit" },
      { label: "limit zero", payload: { limit: 0 }, expectPath: "limit" },
      { label: "requestId acima de 100 chars", payload: { requestId: "x".repeat(101) }, expectPath: "requestId" },
      { label: "campo extra (strict)", payload: { limit: 5, foo: 1 }, expectPath: "" },
    ],
  },

  // ─── ai-proxy (AiProxyV1Schema estrito: messages obrigatório; use_for enum) ───
  {
    name: "CONTRACT_SCHEMAS['ai-proxy'].v1 (AiProxyV1Schema estrito)",
    schema: v1("ai-proxy"),
    valid: [
      { messages: [{ role: "user", content: "oi" }] }, // use_for default 'copilot', stream default false
      // LIMITE MAX: 100 mensagens × content 50.000 chars; model 100 chars
      {
        messages: Array.from({ length: 100 }, () => ({ role: "user", content: "a".repeat(50_000) })),
        model: "x".repeat(100),
        provider_id: UUID,
        use_for: "analysis",
        stream: true,
      },
      // tools + tool_choice string
      {
        messages: [{ role: "user", content: "x" }],
        tools: [{ type: "function", function: { name: "get_weather", description: "d", parameters: { type: "object" } } }],
        tool_choice: "auto",
      },
      // tool_choice objeto
      {
        messages: [{ role: "user", content: "x" }],
        tools: [{ type: "function", function: { name: "get_weather" } }],
        tool_choice: { type: "function", function: { name: "get_weather" } },
      },
    ],
    invalid: [
      { label: "messages ausente (obrigatório)", payload: {}, expectPath: "messages" },
      { label: "messages vazio []", payload: { messages: [] }, expectPath: "messages" },
      { label: "messages tipo errado (string)", payload: { messages: "x" }, expectPath: "messages" },
      { label: "content tipo errado (number)", payload: { messages: [{ role: "user", content: 5 }] }, expectPath: "messages.0.content" },
      { label: "use_for fora do enum", payload: { messages: [{ role: "user", content: "x" }], use_for: "bogus" }, expectPath: "use_for" },
      { label: "provider_id não-UUID", payload: { messages: [{ role: "user", content: "x" }], provider_id: "x" }, expectPath: "provider_id" },
      { label: "tool function.name vazio '' (min 1)", payload: { messages: [{ role: "user", content: "x" }], tools: [{ type: "function", function: { name: "" } }] }, expectPath: "tools.0.function.name" },
      { label: "tool_choice inválido", payload: { messages: [{ role: "user", content: "x" }], tool_choice: "sometimes" }, expectPath: "tool_choice" },
      { label: "campo extra (strict)", payload: { messages: [{ role: "user", content: "x" }], foo: 1 }, expectPath: "" },
    ],
  },

  // ─── ai-router (AiRouterV1Schema — discriminated union por action, 10 ações) ───
  {
    name: "CONTRACT_SCHEMAS['ai-router'].v1 (AiRouterV1Schema discriminated union)",
    schema: v1("ai-router"),
    valid: [
      { action: "auto_tag", contactId: UUID, messages: [{ content: "x" }], requestId: "r1" },
      // LIMITE MAX na variante auto_tag: 200 mensagens
      {
        action: "auto_tag",
        contactId: UUID,
        messages: Array.from({ length: 200 }, () => ({ content: "a".repeat(10_000) })),
        requestId: "r2",
      },
      // espelho do payload REAL do front (conversation_analysis) — passa pelo router
      {
        action: "conversation_analysis",
        messages: [{
          id: "msg_1",
          sender: "contact",
          content: "oi",
          type: "text",
          created_at: "2026-08-01T10:00:00Z",
        }],
        contactName: "Maria",
        contactId: UUID,
        periodDays: 7,
        requestId: "r3",
      },
      { action: "classify_tickets", requestId: "r4" }, // limit default 50
      { action: "suggest_reply", contactId: UUID, conversationHistory: [{ role: "user", content: "oi" }], requestId: "r5" },
      { action: "transcribe_audio", audioUrl: "https://cdn.example.com/audio.mp3", requestId: "r6" },
      { action: "conversation_summary", contactId: UUID, messages: [{ role: "user", content: "x" }], requestId: "r7" },
    ],
    invalid: [
      { label: "action desconhecida (fora do union)", payload: { action: "make_coffee" }, expectPath: "action" },
      { label: "action string vazia ''", payload: { action: "" }, expectPath: "action" },
      { label: "auto_tag sem contactId", payload: { action: "auto_tag", messages: [{ content: "x" }], requestId: "r" }, expectPath: "contactId" },
      { label: "auto_tag contactId tipo errado", payload: { action: "auto_tag", contactId: 123, messages: [{ content: "x" }], requestId: "r" }, expectPath: "contactId" },
      { label: "auto_tag campo extra (variante strict)", payload: { action: "auto_tag", contactId: UUID, messages: [{ content: "x" }], requestId: "r", foo: 1 }, expectPath: "" },
      { label: "conversation_analysis messages vazio", payload: { action: "conversation_analysis", messages: [], requestId: "r" }, expectPath: "messages" },
      { label: "transcribe_audio URL http (SSRF guard)", payload: { action: "transcribe_audio", audioUrl: "http://x.com/a.mp3", requestId: "r" }, expectPath: "audioUrl" },
      { label: "suggest_reply sem requestId (obrigatório no schema)", payload: { action: "suggest_reply", contactId: UUID, conversationHistory: [{ role: "user", content: "oi" }] }, expectPath: "requestId" },
    ],
  },

  // ─── automation-suggest-reply (AutomationSuggestReplyV1Schema estrito) ───
  {
    name: "CONTRACT_SCHEMAS['automation-suggest-reply'].v1 (AutomationSuggestReplyV1Schema estrito)",
    schema: v1("automation-suggest-reply"),
    valid: [
      { executionId: UUID, ruleId: UUID },
      { executionId: UUID, ruleId: UUID, recentMessages: [{ content: "msg" }] },
      { executionId: UUID, ruleId: UUID, skipAi: false },
      // LIMITE MAX: recentMessages 8 × content 2.000; remoteJid 100; contactName 200
      {
        executionId: UUID,
        ruleId: UUID,
        remoteJid: "x".repeat(100),
        contactName: "x".repeat(200),
        skipAi: true,
        recentMessages: Array.from({ length: 8 }, () => ({ from_me: false, content: "x".repeat(2_000) })),
      },
    ],
    invalid: [
      { label: "executionId ausente (UUID obrigatório)", payload: { ruleId: UUID }, expectPath: "executionId" },
      { label: "ruleId ausente (UUID obrigatório)", payload: { executionId: UUID }, expectPath: "ruleId" },
      { label: "executionId string vazia ''", payload: { executionId: "", ruleId: UUID }, expectPath: "executionId" },
      { label: "executionId não-UUID", payload: { executionId: "abc", ruleId: UUID }, expectPath: "executionId" },
      { label: "ruleId tipo errado (number)", payload: { executionId: UUID, ruleId: 123 }, expectPath: "ruleId" },
      { label: "recentMessages tipo errado (string)", payload: { executionId: UUID, ruleId: UUID, recentMessages: "x" }, expectPath: "recentMessages" },
      { label: "recentMessages acima do max (9)", payload: { executionId: UUID, ruleId: UUID, recentMessages: Array.from({ length: 9 }, () => ({ content: "x" })) }, expectPath: "recentMessages" },
      { label: "recentMessages item sem content", payload: { executionId: UUID, ruleId: UUID, recentMessages: [{ from_me: true }] }, expectPath: "recentMessages.0.content" },
      { label: "campo extra (strict)", payload: { executionId: UUID, ruleId: UUID, foo: 1 }, expectPath: "" },
    ],
  },

  // ─── chatbot-l1 (ChatbotL1V1Schema estrito) ───
  {
    name: "CONTRACT_SCHEMAS['chatbot-l1'].v1 (ChatbotL1V1Schema estrito)",
    schema: v1("chatbot-l1"),
    valid: [
      { contactId: UUID, message: "oi" },
      { contactId: UUID, message: "oi", connectionId: "conn-1" },
      { contactId: UUID, message: "oi", connectionId: null }, // connectionId nullable
      // LIMITE MAX: message 10.000 chars; connectionId 200 chars
      { contactId: UUID, message: "a".repeat(10_000), connectionId: "x".repeat(200) },
    ],
    invalid: [
      { label: "contactId ausente", payload: { message: "oi" }, expectPath: "contactId" },
      { label: "message ausente", payload: { contactId: UUID }, expectPath: "message" },
      { label: "contactId não-UUID", payload: { contactId: "abc", message: "oi" }, expectPath: "contactId" },
      { label: "message tipo errado (number)", payload: { contactId: UUID, message: 5 }, expectPath: "message" },
      { label: "message string vazia '' (min 1)", payload: { contactId: UUID, message: "" }, expectPath: "message" },
      { label: "campo extra (strict)", payload: { contactId: UUID, message: "oi", foo: 1 }, expectPath: "" },
    ],
  },

  // ─── classify-audio-meme (ClassifyAudioMemeV1Schema estrito; tudo opcional) ───
  {
    name: "CONTRACT_SCHEMAS['classify-audio-meme'].v1 (ClassifyAudioMemeV1Schema estrito)",
    schema: v1("classify-audio-meme"),
    valid: [
      {}, // sem campos obrigatórios ({} → categoria 'outros' no handler)
      { audio_url: "https://cdn.example.com/meme.mp3" },
      { file_name: "meme.mp3", requestId: "r" },
      // LIMITE MAX: file_name 255; requestId 100; audio_url https público
      { audio_url: "https://cdn.example.com/meme.mp3", file_name: "x".repeat(255), requestId: "y".repeat(100) },
    ],
    invalid: [
      { label: "audio_url tipo errado (number)", payload: { audio_url: 123 }, expectPath: "audio_url" },
      { label: "audio_url string vazia ''", payload: { audio_url: "" }, expectPath: "audio_url" },
      { label: "audio_url http (SSRF guard exige https)", payload: { audio_url: "http://cdn.example.com/meme.mp3" }, expectPath: "audio_url" },
      { label: "audio_url localhost (SSRF guard)", payload: { audio_url: "https://localhost/meme.mp3" }, expectPath: "audio_url" },
      { label: "file_name tipo errado (number)", payload: { file_name: 5 }, expectPath: "file_name" },
      { label: "file_name acima de 255 chars", payload: { file_name: "x".repeat(256) }, expectPath: "file_name" },
      { label: "requestId acima de 100 chars", payload: { requestId: "x".repeat(101) }, expectPath: "requestId" },
      { label: "campo extra (strict)", payload: { foo: 1 }, expectPath: "" },
    ],
  },

  // ─── detect-new-device (DetectNewDeviceV1Schema estrito; 4 obrigatórios sem default) ───
  {
    name: "CONTRACT_SCHEMAS['detect-new-device'].v1 (DetectNewDeviceV1Schema estrito)",
    schema: v1("detect-new-device"),
    valid: [
      { device_fingerprint: "fp-12345678", browser: "Chrome", os: "Windows", device_name: "PC da sala" },
      { device_fingerprint: "fp-12345678", browser: "Safari", os: "iOS", device_name: "iPhone" },
      // LIMITE MAX: fingerprint 128; browser 100; os 100; device_name 200
      {
        device_fingerprint: "x".repeat(128),
        browser: "x".repeat(100),
        os: "x".repeat(100),
        device_name: "x".repeat(200),
      },
    ],
    invalid: [
      { label: "device_fingerprint ausente", payload: { browser: "C", os: "O", device_name: "D" }, expectPath: "device_fingerprint" },
      { label: "browser ausente", payload: { device_fingerprint: "fp-12345678", os: "O", device_name: "D" }, expectPath: "browser" },
      { label: "os ausente", payload: { device_fingerprint: "fp-12345678", browser: "C", device_name: "D" }, expectPath: "os" },
      { label: "device_name ausente", payload: { device_fingerprint: "fp-12345678", browser: "C", os: "O" }, expectPath: "device_name" },
      { label: "device_fingerprint curto (7 chars, min 8)", payload: { device_fingerprint: "x".repeat(7), browser: "C", os: "O", device_name: "D" }, expectPath: "device_fingerprint" },
      { label: "device_fingerprint string vazia ''", payload: { device_fingerprint: "", browser: "C", os: "O", device_name: "D" }, expectPath: "device_fingerprint" },
      { label: "browser string vazia '' (min 1)", payload: { device_fingerprint: "fp-12345678", browser: "", os: "O", device_name: "D" }, expectPath: "browser" },
      { label: "os tipo errado (number)", payload: { device_fingerprint: "fp-12345678", browser: "C", os: 5, device_name: "D" }, expectPath: "os" },
      { label: "campo extra (strict)", payload: { device_fingerprint: "fp-12345678", browser: "C", os: "O", device_name: "D", foo: 1 }, expectPath: "" },
    ],
  },

  // ─── sentiment-alert (SentimentAlertV1Schema estrito) ───
  {
    name: "CONTRACT_SCHEMAS['sentiment-alert'].v1 (SentimentAlertV1Schema estrito)",
    schema: v1("sentiment-alert"),
    valid: [
      { contactId: UUID, sentimentScore: -0.75 },
      { contactId: UUID, sentimentScore: 0 }, // score zero é válido
      { contactId: UUID, sentimentScore: -1, previousScore: null, consecutiveRequired: 2 },
      // LIMITE MAX: contactName 200; analysisId 200
      {
        contactId: UUID,
        contactName: "x".repeat(200),
        sentimentScore: 0.5,
        previousScore: 0.2,
        analysisId: "x".repeat(200),
        threshold: 0.1,
        consecutiveRequired: 3,
      },
    ],
    invalid: [
      { label: "contactId ausente", payload: { sentimentScore: 0 }, expectPath: "contactId" },
      { label: "sentimentScore ausente", payload: { contactId: UUID }, expectPath: "sentimentScore" },
      { label: "contactId não-UUID", payload: { contactId: "abc", sentimentScore: 0 }, expectPath: "contactId" },
      { label: "contactId string vazia ''", payload: { contactId: "", sentimentScore: 0 }, expectPath: "contactId" },
      { label: "sentimentScore tipo errado (string)", payload: { contactId: UUID, sentimentScore: "x" }, expectPath: "sentimentScore" },
      { label: "sentimentScore null (number não aceita null)", payload: { contactId: UUID, sentimentScore: null }, expectPath: "sentimentScore" },
      { label: "consecutiveRequired não-inteiro", payload: { contactId: UUID, sentimentScore: 0, consecutiveRequired: 1.5 }, expectPath: "consecutiveRequired" },
      { label: "campo extra (strict)", payload: { contactId: UUID, sentimentScore: 0, foo: 1 }, expectPath: "" },
    ],
  },

  // ─── speech-to-text (SpeechToTextV1Schema estrito; audio obrigatório) ───
  {
    name: "CONTRACT_SCHEMAS['speech-to-text'].v1 (SpeechToTextV1Schema estrito)",
    schema: v1("speech-to-text"),
    valid: [
      { audio: "aGVsbG8=" },
      { audio: "aGVsbG8=", languageCode: "pt" },
      // Valor grande bem ABAIXO do max real (40.000.000 chars — schemas.ts:395).
      // O max não é exercitado propositalmente (anti data-bomba: alocar 40MB
      // em teste é desnecessário). Caso válido, sem boundary inventado.
      { audio: "a".repeat(1_000_001), languageCode: "x".repeat(20) },
    ],
    invalid: [
      { label: "audio ausente (obrigatório)", payload: {}, expectPath: "audio" },
      { label: "audio tipo errado (number)", payload: { audio: 5 }, expectPath: "audio" },
      { label: "audio string vazia '' (min 1)", payload: { audio: "" }, expectPath: "audio" },
      { label: "languageCode acima de 20 chars", payload: { audio: "x", languageCode: "x".repeat(21) }, expectPath: "languageCode" },
      { label: "campo extra (strict)", payload: { audio: "x", foo: 1 }, expectPath: "" },
    ],
  },

  // ─── voice-agent (VoiceAgentV1Schema estrito; transcript obrigatório min 1 max 2000) ───
  {
    name: "CONTRACT_SCHEMAS['voice-agent'].v1 (VoiceAgentV1Schema estrito)",
    schema: v1("voice-agent"),
    valid: [
      { transcript: "Olá, tudo bem?" },
      { transcript: "a" }, // min exato (1)
      { transcript: "a".repeat(2_000) }, // LIMITE MAX
    ],
    invalid: [
      { label: "transcript ausente (obrigatório)", payload: {}, expectPath: "transcript" },
      { label: "transcript tipo errado (objeto)", payload: { transcript: {} }, expectPath: "transcript" },
      { label: "transcript string vazia '' (min 1)", payload: { transcript: "" }, expectPath: "transcript" },
      { label: "transcript acima de 2000 chars", payload: { transcript: "a".repeat(2_001) }, expectPath: "transcript" },
      { label: "campo extra (strict)", payload: { transcript: "x", foo: 1 }, expectPath: "" },
    ],
  },

  // ─── voice-changer (VoiceChangerMultipartV1Schema estrito — variante multipart do registro) ───
  {
    name: "CONTRACT_SCHEMAS['voice-changer'].v1 (VoiceChangerMultipartV1Schema estrito)",
    schema: v1("voice-changer"),
    valid: [
      { audio: new File(["abc"], "a.webm") },
      { audio: new File(["abc"], "a.webm"), voice_preset: "grave", task_id: "t1", authorized: "true" }, // authorized string (multipart)
      { audio: new File(["abc"], "a.webm"), authorized: true }, // authorized boolean (branch JSON da fila)
      // LIMITE MAX: voice_preset 50; task_id 100
      { audio: new File(["abc"], "a.webm"), voice_preset: "x".repeat(50), task_id: "x".repeat(100) },
      // GAP documentado: voice_preset/task_id têm só .max(), sem .min() → "" passa (comportamento real)
      { audio: new File(["abc"], "a.webm"), voice_preset: "", task_id: "" },
    ],
    invalid: [
      { label: "audio ausente (File obrigatório no multipart)", payload: {}, expectPath: "audio" },
      { label: "audio tipo errado (string em vez de File)", payload: { audio: "not-a-file" }, expectPath: "audio" },
      { label: "audio null", payload: { audio: null }, expectPath: "audio" },
      { label: "voice_preset acima de 50 chars", payload: { audio: new File(["abc"], "a.webm"), voice_preset: "x".repeat(51) }, expectPath: "voice_preset" },
      { label: "task_id acima de 100 chars", payload: { audio: new File(["abc"], "a.webm"), task_id: "x".repeat(101) }, expectPath: "task_id" },
      { label: "authorized tipo errado (number)", payload: { audio: new File(["abc"], "a.webm"), authorized: 123 }, expectPath: "authorized" },
      { label: "campo extra (strict)", payload: { audio: new File(["abc"], "a.webm"), foo: 1 }, expectPath: "" },
    ],
  },

  // ─── voice-copilot-action (VoiceCopilotActionV1Schema — passthrough; action obrigatória) ───
  {
    name: "CONTRACT_SCHEMAS['voice-copilot-action'].v1 (VoiceCopilotActionV1Schema passthrough)",
    schema: v1("voice-copilot-action"),
    valid: [
      { action: "start_call", params: { phone: "+5511999999999" } },
      { action: "stop" }, // params nullish
      { action: "set_voice", params: null },
      { action: "ping", params: {}, extra: 1 }, // GAP documentado: .passthrough() aceita campos extras (comportamento real)
      { action: "x".repeat(100), params: { a: 1, b: { c: [1, 2] } } }, // LIMITE MAX
    ],
    invalid: [
      { label: "action ausente (obrigatória)", payload: {}, expectPath: "action" },
      { label: "action string vazia '' (min 1)", payload: { action: "" }, expectPath: "action" },
      { label: "action tipo errado (number)", payload: { action: 5 }, expectPath: "action" },
      { label: "action acima de 100 chars", payload: { action: "x".repeat(101) }, expectPath: "action" },
      { label: "params tipo errado (string em vez de record)", payload: { action: "ping", params: "x" }, expectPath: "params" },
    ],
  },
];

// ─── Runner (padrão do repo: contract-schemas.test.ts) ──────────────────────
for (const m of MATRICES) {
  for (const [i, payload] of m.valid.entries()) {
    Deno.test(`${m.name} — válido #${i + 1}`, () => {
      const r = m.schema.safeParse(payload);
      assertEquals(r.success, true, r.success ? "" : JSON.stringify(r.error.issues));
    });
  }
  for (const c of m.invalid) {
    Deno.test(`${m.name} — inválido: ${c.label}`, () => {
      const r = m.schema.safeParse(c.payload);
      assertEquals(r.success, false, "payload inválido foi aceito");
      if (!r.success && c.expectPath) {
        const paths = r.error.issues.map((it) => it.path.join("."));
        assert(
          paths.some((p) => p === c.expectPath || p.startsWith(c.expectPath + ".")),
          `esperava issue em '${c.expectPath}', obtido: ${paths.join(" | ")}`,
        );
      }
    });
  }
}

// ─── REGRESSÃO CRÍTICA: payload REAL do front (AIConversationAssistant.tsx:106-118) ───
// O front envia messages com { id, sender, content, type, created_at } (NUNCA role),
// contactName, contactId e periodDays — fix 5ec7b4aee tornou role opcional e
// aceitou periodDays sob .strict(). Este bloco trava o comportamento.

/** Espelho EXATO do body montado em AIConversationAssistant.tsx:106-118. */
function frontAnalysisPayload(): {
  messages: Array<Record<string, unknown>>;
  contactName: string;
  contactId: string | null | undefined;
  periodDays: number;
} {
  return {
    messages: [
      {
        id: "msg_01J6X2Y3Z4A5B6C7D8E9F0G1H",
        sender: "contact",
        content: "Olá! Gostaria de saber o status do meu pedido #1234.",
        type: "text",
        created_at: "2026-08-01T10:00:00.000Z",
      },
      {
        id: "msg_01J6X2Y3Z4A5B6C7D8E9F0G1I",
        sender: "agent",
        content: "Oi! Vou verificar para você. Um momento...",
        type: "text",
        created_at: "2026-08-01T10:05:00.000Z",
      },
    ],
    contactName: "Maria Silva",
    contactId: UUID,
    periodDays: 7,
  };
}

Deno.test(
  "ai-conversation-analysis@v1 — payload REAL do front DEVE passar (regressão fix 5ec7b4aee)",
  () => {
    const r = v1("ai-conversation-analysis").safeParse(frontAnalysisPayload());
    assertEquals(r.success, true, r.success ? "" : JSON.stringify(r.error.issues));
  },
);

Deno.test("ai-conversation-analysis@v1 — variantes reais: sender 'agent' e type 'audio'", () => {
  const schema = v1("ai-conversation-analysis");
  const p = frontAnalysisPayload();
  p.messages = [
    { id: "m1", sender: "agent", content: "áudio transcrito", type: "audio", created_at: "2026-08-01T10:00:00Z" },
    { id: "m2", sender: "contact", content: "ok", type: "text", created_at: null }, // created_at null (item permissivo)
  ];
  const r = schema.safeParse(p);
  assertEquals(r.success, true, r.success ? "" : JSON.stringify(r.error.issues));
});

Deno.test("ai-conversation-analysis@v1 — periodDays: 1 e 365 passam; 0 e 366 falham", () => {
  const schema = v1("ai-conversation-analysis");
  for (const n of [1, 365]) {
    const r = schema.safeParse({ ...frontAnalysisPayload(), periodDays: n });
    assertEquals(r.success, true, `periodDays ${n} deveria passar: ${JSON.stringify(r.error?.issues)}`);
  }
  for (const n of [0, 366]) {
    const r = schema.safeParse({ ...frontAnalysisPayload(), periodDays: n });
    assertEquals(r.success, false, `periodDays ${n} deveria falhar`);
  }
});

Deno.test("ai-conversation-analysis@v1 — messages vazio [] falha (min 1)", () => {
  const r = v1("ai-conversation-analysis").safeParse({ ...frontAnalysisPayload(), messages: [] });
  assertEquals(r.success, false, "messages [] foi aceito");
});

Deno.test("ai-conversation-analysis@v1 — item sem content falha (content obrigatório no item)", () => {
  const p = frontAnalysisPayload();
  p.messages = [{ id: "m1", sender: "contact", type: "text", created_at: "2026-08-01T10:00:00Z" }];
  const r = v1("ai-conversation-analysis").safeParse(p);
  assertEquals(r.success, false, "item sem content foi aceito");
});

Deno.test("ai-conversation-analysis@v1 — campo extra no topo falha (strict) — id/type/created_at dentro do item passam", () => {
  const schema = v1("ai-conversation-analysis");
  const ok = schema.safeParse(frontAnalysisPayload());
  assertEquals(ok.success, true, ok.success ? "" : JSON.stringify(ok.error.issues));
  const bad = schema.safeParse({ ...frontAnalysisPayload(), extraField: true });
  assertEquals(bad.success, false, "campo extra no topo foi aceito sob .strict()");
});

Deno.test("ai-conversation-analysis@v1 — requestId: 100 chars passa; 101 falha", () => {
  const schema = v1("ai-conversation-analysis");
  const ok = schema.safeParse({ ...frontAnalysisPayload(), requestId: "x".repeat(100) });
  assertEquals(ok.success, true, ok.success ? "" : JSON.stringify(ok.error.issues));
  const bad = schema.safeParse({ ...frontAnalysisPayload(), requestId: "x".repeat(101) });
  assertEquals(bad.success, false, "requestId 101 chars foi aceito");
});

Deno.test("ai-conversation-analysis@v1 — contactId/contactName nulláveis e ausentes passam (opcionais)", () => {
  const schema = v1("ai-conversation-analysis");
  for (const p of [
    { ...frontAnalysisPayload(), contactId: null, contactName: null },
    { ...frontAnalysisPayload(), contactId: undefined, contactName: undefined },
  ]) {
    const r = schema.safeParse(p);
    assertEquals(r.success, true, r.success ? "" : JSON.stringify(r.error.issues));
  }
});

Deno.test("ai-conversation-analysis@v1 — LIMITE MAX: 200 mensagens × content 10.000 chars", () => {
  const p = frontAnalysisPayload();
  p.messages = Array.from({ length: 200 }, (_, i) => ({
    id: `m${i}`,
    sender: "contact",
    content: "a".repeat(10_000),
    type: "text",
    created_at: "2026-08-01T10:00:00Z",
  }));
  const r = v1("ai-conversation-analysis").safeParse(p);
  assertEquals(r.success, true, r.success ? "" : JSON.stringify(r.error.issues));
  const bad = v1("ai-conversation-analysis").safeParse({ ...p, messages: [...p.messages, { content: "x" }] });
  assertEquals(bad.success, false, "201 mensagens foi aceito");
});

Deno.test("ai-conversation-analysis@v1 — payload antigo com role (auto-tag/summary) continua aceito", () => {
  const r = v1("ai-conversation-analysis").safeParse({
    contactId: UUID,
    messages: [{ role: "user", content: "oi" }],
    periodDays: 7,
  });
  assertEquals(r.success, true, r.success ? "" : JSON.stringify(r.error.issues));
});

// ─── Integridade do registro ─────────────────────────────────────────────────
Deno.test("CONTRACT_SCHEMAS — 13 funções AI/voz + ai-conversation-analysis registradas com v1", () => {
  const keys = [
    "ai-auto-tag",
    "ai-classify-tickets",
    "ai-proxy",
    "ai-router",
    "automation-suggest-reply",
    "chatbot-l1",
    "classify-audio-meme",
    "detect-new-device",
    "sentiment-alert",
    "speech-to-text",
    "voice-agent",
    "voice-changer",
    "voice-copilot-action",
    "ai-conversation-analysis",
  ];
  for (const k of keys) {
    const entry = CONTRACT_SCHEMAS[k];
    assert(entry, `chave '${k}' ausente em CONTRACT_SCHEMAS`);
    assert(entry.v1, `v1 ausente em CONTRACT_SCHEMAS['${k}']`);
  }
});
