/**
 * Matriz de testes de contrato — schemas business/infra (v1) adicionados pelo
 * Agent 3 (contract tests webhooks v1). Mesmo padrão de contract-schemas.test.ts:
 * casos válidos, campos ausentes, tipos incorretos e valores vazios, por endpoint.
 *
 * Rodar: deno test supabase/functions/_shared/__tests__/contract-schemas-business.test.ts
 */

import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  GmailSyncV1Schema,
  GmailOauthV1Schema,
  EmailImapBridgeV1Schema,
  EvolutionSenderV1Schema,
  EvolutionHealthV1Schema,
  EvolutionCredentialsV1Schema,
  EvolutionTemplatesV1Schema,
  EvolutionSentimentV1Schema,
  EvolutionRetryMetricsV1Schema,
  EvolutionFollowupV1Schema,
  EvolutionChatbotV1Schema,
  EvolutionBitrixSyncV1Schema,
  DbHealthMonitorV1Schema,
  ConnectionHealthCheckV1Schema,
  HealthCheckV1Schema,
  HealthV1Schema,
  StatusV1Schema,
  MetricsV1Schema,
  SendScheduledReportV1Schema,
  AutoEscalateSlaV1Schema,
  AutoCloseConversationsV1Schema,
  BackfillMessagesV1Schema,
  ElevenLabsVoiceV1Schema,
  ElevenLabsTtsV1Schema,
  ElevenLabsStsV1Schema,
} from "../contract-schemas.ts";
import type { z } from "../contract-kit.ts";

interface Matrix {
  name: string;
  schema: z.ZodTypeAny;
  valid: unknown[];
  invalid: Array<{ label: string; payload: unknown; expectPath?: string }>;
}

const UUID = "3f0c8a4e-1b2d-4c5e-9f6a-7b8c9d0e1f2a";

const MATRICES: Matrix[] = [
  {
    name: "gmail-sync@v1 (estrito — UI)",
    schema: GmailSyncV1Schema,
    valid: [
      { accountId: "acc_1" }, // action default listThreads
      { accountId: "acc_1", action: "listThreads", labelIds: ["INBOX"], q: "from:x", pageToken: "p1", maxResults: 50 },
      { accountId: "acc_1", action: "syncFull", maxResults: 100 },
      { accountId: "acc_1", action: "syncLabels" },
    ],
    invalid: [
      { label: "accountId ausente", payload: { action: "listThreads" }, expectPath: "accountId" },
      { label: "accountId vazio", payload: { accountId: "" }, expectPath: "accountId" },
      { label: "action fora do enum", payload: { accountId: "a", action: "deleteAll" }, expectPath: "action" },
      { label: "maxResults acima de 100", payload: { accountId: "a", maxResults: 101 }, expectPath: "maxResults" },
      { label: "labelIds com tipo errado", payload: { accountId: "a", labelIds: "INBOX" }, expectPath: "labelIds" },
      { label: "campo extra (strict)", payload: { accountId: "a", hack: true } },
    ],
  },
  {
    name: "gmail-oauth@v1 (estrito — roteado por action)",
    schema: GmailOauthV1Schema,
    valid: [
      { action: "getAuthUrl" },
      { action: "exchangeCode", code: "4/abc", userId: "u1", state: "st" },
      { action: "refresh", accountId: "acc_1" },
      { action: "revoke", accountId: "acc_1" },
      { action: "listAccounts" },
      { action: "get-auth-url" }, // alias kebab-case aceito
      { action: "disconnect", accountId: "acc_1" },
    ],
    invalid: [
      { label: "action ausente", payload: {}, expectPath: "action" },
      { label: "action desconhecida", payload: { action: "hack" }, expectPath: "action" },
      { label: "code com tipo errado", payload: { action: "exchangeCode", code: 42 }, expectPath: "code" },
      { label: "accountId com tipo errado", payload: { action: "refresh", accountId: 7 }, expectPath: "accountId" },
      { label: "campo extra (strict)", payload: { action: "listAccounts", token: "x" } },
    ],
  },
  {
    name: "email-imap-bridge@v1 (estrito — action + config)",
    schema: EmailImapBridgeV1Schema,
    valid: [
      { action: "listProviders" },
      { action: "getProviderConfig", provider: "outlook" },
      { action: "saveCredentials", config: { email: "a@b.com", password: "secret123", provider: "outlook" } },
      { action: "testConnection", config: { email: "a@b.com", password: "secret123", imap_host: "imap.x.com", imap_port: 993, smtp_host: "smtp.x.com", smtp_port: 587 } },
    ],
    invalid: [
      { label: "action ausente", payload: {}, expectPath: "action" },
      { label: "action desconhecida", payload: { action: "fetchInbox" }, expectPath: "action" },
      { label: "provider com tipo errado", payload: { action: "getProviderConfig", provider: 5 }, expectPath: "provider" },
      { label: "config com tipo errado", payload: { action: "saveCredentials", config: "raw" }, expectPath: "config" },
      { label: "config.provider fora do enum", payload: { action: "saveCredentials", config: { provider: "aol" } }, expectPath: "config.provider" },
      { label: "config.imap_port fora da faixa", payload: { action: "testConnection", config: { imap_port: 70000 } }, expectPath: "config.imap_port" },
      { label: "campo extra (strict)", payload: { action: "listProviders", hack: true } },
    ],
  },
  {
    name: "evolution-sender@v1 (cron — body opcional)",
    schema: EvolutionSenderV1Schema,
    valid: [{}],
    invalid: [
      { label: "campo extra (strict)", payload: { batchSize: 10 } },
    ],
  },
  {
    name: "evolution-health@v1 (cron — body opcional)",
    schema: EvolutionHealthV1Schema,
    valid: [{}],
    invalid: [{ label: "campo extra (strict)", payload: { instance: "wpp2" } }],
  },
  {
    name: "evolution-credentials@v1 (GET admin — body opcional)",
    schema: EvolutionCredentialsV1Schema,
    valid: [{}],
    invalid: [{ label: "campo extra (strict)", payload: { instance: "wpp2" } }],
  },
  {
    name: "evolution-templates@v1 (estrito — action send|preview)",
    schema: EvolutionTemplatesV1Schema,
    valid: [
      { template_name: "Bem-vindo", remote_jid: "5511999999999@s.whatsapp.net" },
      { action: "send", template_name: "T1", remote_jid: "5511@s.whatsapp.net", variables: { nome: "João" } },
      { action: "preview", template_name: "T1", variables: { nome: null } },
    ],
    invalid: [
      { label: "action desconhecida", payload: { action: "delete" }, expectPath: "action" },
      { label: "template_name com tipo errado", payload: { template_name: 5 }, expectPath: "template_name" },
      { label: "variables com tipo errado", payload: { variables: ["a"] }, expectPath: "variables" },
      { label: "campo extra (strict)", payload: { action: "send", hack: true } },
    ],
  },
  {
    name: "evolution-sentiment@v1 (estrito — text obrigatório)",
    schema: EvolutionSentimentV1Schema,
    valid: [
      { text: "Ótimo atendimento!" },
      { action: "analyze", text: "Ruim", remote_jid: "5511@s.whatsapp.net", message_id: "ABC123", instance_name: "wpp2" },
    ],
    invalid: [
      { label: "text ausente", payload: { remote_jid: "5511@s.whatsapp.net" }, expectPath: "text" },
      { label: "text vazio", payload: { text: "" }, expectPath: "text" },
      { label: "text com tipo errado", payload: { text: 42 }, expectPath: "text" },
      { label: "text acima de 5000", payload: { text: "x".repeat(5001) }, expectPath: "text" },
      { label: "campo extra (strict)", payload: { text: "ok", model: "gpt" } },
    ],
  },
  {
    name: "evolution-retry-metrics@v1 (GET admin — body opcional)",
    schema: EvolutionRetryMetricsV1Schema,
    valid: [{}],
    invalid: [{ label: "campo extra (strict)", payload: { hours: 24 } }],
  },
  {
    name: "evolution-followup@v1 (cron — body opcional)",
    schema: EvolutionFollowupV1Schema,
    valid: [{}],
    invalid: [{ label: "campo extra (strict)", payload: { limit: 50 } }],
  },
  {
    name: "evolution-chatbot@v1 (estrito — remote_jid + message)",
    schema: EvolutionChatbotV1Schema,
    valid: [
      { remote_jid: "5511@s.whatsapp.net", message: "Olá" },
      { remote_jid: "5511@s.whatsapp.net", message: "Olá", use_ai: false },
    ],
    invalid: [
      { label: "remote_jid ausente", payload: { message: "Olá" }, expectPath: "remote_jid" },
      { label: "message vazio", payload: { remote_jid: "5511@s.whatsapp.net", message: "" }, expectPath: "message" },
      { label: "use_ai com tipo errado", payload: { remote_jid: "j", message: "m", use_ai: "yes" }, expectPath: "use_ai" },
      { label: "campo extra (strict)", payload: { remote_jid: "j", message: "m", lang: "pt" } },
    ],
  },
  {
    name: "evolution-bitrix-sync@v1 (cron — body opcional)",
    schema: EvolutionBitrixSyncV1Schema,
    valid: [{}],
    invalid: [{ label: "campo extra (strict)", payload: { operation: "create" } }],
  },
  {
    name: "db-health-monitor@v1 (cron — body opcional)",
    schema: DbHealthMonitorV1Schema,
    valid: [{}],
    invalid: [{ label: "campo extra (strict)", payload: { notify: true } }],
  },
  {
    name: "connection-health-check@v1 (estrito — instanceName opcional)",
    schema: ConnectionHealthCheckV1Schema,
    valid: [{}, { instanceName: "wpp2" }],
    invalid: [
      { label: "instanceName vazio", payload: { instanceName: "" }, expectPath: "instanceName" },
      { label: "instanceName com tipo errado", payload: { instanceName: 7 }, expectPath: "instanceName" },
      { label: "campo extra (strict)", payload: { force: true } },
    ],
  },
  {
    name: "health-check@v1 (probe GET — body opcional)",
    schema: HealthCheckV1Schema,
    valid: [{}],
    invalid: [{ label: "campo extra (strict)", payload: { deep: true } }],
  },
  {
    name: "health@v1 (probe GET — body opcional)",
    schema: HealthV1Schema,
    valid: [{}],
    invalid: [{ label: "campo extra (strict)", payload: { probe: 1 } }],
  },
  {
    name: "status@v1 (probe GET — body opcional)",
    schema: StatusV1Schema,
    valid: [{}],
    invalid: [{ label: "campo extra (strict)", payload: { service: "x" } }],
  },
  {
    name: "metrics@v1 (scrape GET — body opcional)",
    schema: MetricsV1Schema,
    valid: [{}],
    invalid: [{ label: "campo extra (strict)", payload: { token: "x" } }],
  },
  {
    name: "send-scheduled-report@v1 (estrito — reportId)",
    schema: SendScheduledReportV1Schema,
    valid: [{ reportId: "rep_1" }],
    invalid: [
      { label: "reportId ausente", payload: {}, expectPath: "reportId" },
      { label: "reportId vazio", payload: { reportId: "" }, expectPath: "reportId" },
      { label: "reportId com tipo errado", payload: { reportId: 42 }, expectPath: "reportId" },
      { label: "campo extra (strict)", payload: { reportId: "r", force: true } },
    ],
  },
  {
    name: "auto-escalate-sla@v1 (cron — body opcional)",
    schema: AutoEscalateSlaV1Schema,
    valid: [{}],
    invalid: [{ label: "campo extra (strict)", payload: { dryRun: true } }],
  },
  {
    name: "auto-close-conversations@v1 (cron — body opcional)",
    schema: AutoCloseConversationsV1Schema,
    valid: [{}],
    invalid: [{ label: "campo extra (strict)", payload: { hours: 24 } }],
  },
  {
    name: "backfill-messages@v1 (estrito — campos opcionais)",
    schema: BackfillMessagesV1Schema,
    valid: [
      {},
      { instance_name: "wpp2", connection_id: "c1" },
      { instance: "wpp2", offset: 100, limit: 200, dryRun: true },
    ],
    invalid: [
      { label: "offset negativo", payload: { offset: -1 }, expectPath: "offset" },
      { label: "limit acima de 500", payload: { limit: 501 }, expectPath: "limit" },
      { label: "dryRun com tipo errado", payload: { dryRun: "yes" }, expectPath: "dryRun" },
      { label: "campo extra (strict)", payload: { force: true } },
    ],
  },
  {
    name: "elevenlabs-voice@v1 (estrito — action + textToSpeech)",
    schema: ElevenLabsVoiceV1Schema,
    valid: [
      {}, // action default listVoices
      { action: "listVoices" },
      { action: "textToSpeech", text: "Olá", voiceId: "v1" },
      { action: "textToSpeech", text: "Olá", voiceId: "v1", settings: { modelId: "m1", stability: 0.5, similarityBoost: 0.75, style: 0.3, useSpeakerBoost: true } },
    ],
    invalid: [
      { label: "action desconhecida", payload: { action: "clone" }, expectPath: "action" },
      { label: "textToSpeech sem text", payload: { action: "textToSpeech", voiceId: "v1" }, expectPath: "text" },
      { label: "textToSpeech sem voiceId", payload: { action: "textToSpeech", text: "Olá" }, expectPath: "voiceId" },
      { label: "stability fora de [0,1]", payload: { action: "textToSpeech", text: "t", voiceId: "v", settings: { stability: 1.5 } }, expectPath: "settings.stability" },
      { label: "text com tipo errado", payload: { action: "textToSpeech", text: 5, voiceId: "v" }, expectPath: "text" },
      { label: "campo extra (strict)", payload: { action: "listVoices", lang: "pt" } },
    ],
  },
  {
    name: "elevenlabs-tts@v1 (estrito — text obrigatório)",
    schema: ElevenLabsTtsV1Schema,
    valid: [
      { text: "Olá" },
      { text: "Olá", voiceId: "v1", modelId: "eleven_v3", languageCode: "pt-BR", applyTextNormalization: "auto" },
    ],
    invalid: [
      { label: "text ausente", payload: {}, expectPath: "text" },
      { label: "text vazio", payload: { text: "" }, expectPath: "text" },
      { label: "text acima de 10000", payload: { text: "x".repeat(10001) }, expectPath: "text" },
      { label: "voiceId com tipo errado", payload: { text: "t", voiceId: 5 }, expectPath: "voiceId" },
      { label: "campo extra (strict)", payload: { text: "t", speed: 2 } },
    ],
  },
  {
    name: "elevenlabs-sts@v1 (estrito — multipart File)",
    schema: ElevenLabsStsV1Schema,
    valid: [
      { audio: new File(["fake-mp3"], "a.mp3", { type: "audio/mpeg" }), voiceId: "v1" },
      { audio: new File(["fake-mp3"], "a.mp3"), voiceId: "v1", modelId: "eleven_multilingual_sts_v2" },
    ],
    invalid: [
      { label: "audio ausente", payload: { voiceId: "v1" }, expectPath: "audio" },
      { label: "audio com tipo errado (string)", payload: { audio: "not-a-file", voiceId: "v1" }, expectPath: "audio" },
      { label: "voiceId ausente", payload: { audio: new File(["x"], "a.mp3") }, expectPath: "voiceId" },
      { label: "voiceId com caractere inseguro", payload: { audio: new File(["x"], "a.mp3"), voiceId: "../etc" }, expectPath: "voiceId" },
      { label: "modelId com caractere inseguro", payload: { audio: new File(["x"], "a.mp3"), voiceId: "v1", modelId: "a/b" }, expectPath: "modelId" },
      { label: "campo extra (strict)", payload: { audio: new File(["x"], "a.mp3"), voiceId: "v1", text: "x" } },
    ],
  },
];

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

// Sanity: cron schemas (body opcional) aceitam {} — exigido pela regra 2 do contrato.
Deno.test("business/infra: cron jobs sem body aceitam {} (body opcional)", () => {
  const cronSchemas = [
    EvolutionSenderV1Schema,
    EvolutionHealthV1Schema,
    EvolutionCredentialsV1Schema,
    EvolutionRetryMetricsV1Schema,
    EvolutionFollowupV1Schema,
    EvolutionBitrixSyncV1Schema,
    DbHealthMonitorV1Schema,
    HealthCheckV1Schema,
    HealthV1Schema,
    StatusV1Schema,
    MetricsV1Schema,
    AutoEscalateSlaV1Schema,
    AutoCloseConversationsV1Schema,
  ];
  for (const s of cronSchemas) {
    assertEquals(s.safeParse({}).success, true, "cron schema deve aceitar body vazio");
  }
});
