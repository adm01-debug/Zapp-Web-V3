import { z } from 'https://esm.sh/zod@3.23.8';
import {
  EvolutionWebhookV1Schema,
  EvolutionWebhookV2Schema,
  MetaWebhookPayloadSchema,
  GmailWebhookV1Schema,
  GmailWebhookV2Schema,
  ElevenLabsWebhookV1Schema,
  ElevenLabsWebhookV2Schema,
} from './webhook-schemas.ts';
import { contractErrorResponse } from './validation.ts';
import {
  AiConversationSummaryV1Schema,
  AiSuggestReplyV1Schema,
  ClassifyStickerV1Schema,
  AiRouterV1Schema,
  AiProxyV1Schema,
  AiConversationAnalysisV1Schema,
  AiEnhanceMessageV1Schema,
  AiChurnAnalysisV1Schema,
  AiTranscribeAudioV1Schema,
  ClassifyAudioMemeV1Schema,
  SentimentAlertV1Schema,
  VoiceAgentV1Schema,
  VoiceChangerV1Schema,
  ChatbotL1V1Schema,
  AutomationSuggestReplyV1Schema,
  SpeechToTextV1Schema,
} from './schemas.ts';

export { z };

/**
 * Registro de contratos por Edge Function (runtime gate + testes).
 *
 * RESTAURAÇÃO: o commit a08d63e43 ("fix(base64-critical)") sobrescreveu este
 * arquivo com uma versão antiga (38 linhas) que quebrava os re-exports de
 * contract-schemas.ts. Esta versão restaura o registro completo (PR #254/#255)
 * com EDGE_FUNCTION_NAMES regenerado a partir dos diretórios reais (106 após
 * a onda de remoção #922 — auditoria A9 2026-08-06) e os schemas V1 estritos
 * das funções AI/ML vindos de _shared/schemas.ts.
 */
export const EDGE_FUNCTION_NAMES = [
  'ai-auto-tag',
  'ai-churn-analysis',
  'ai-classify-tickets',
  'ai-conversation-analysis',
  'ai-conversation-summary',
  'ai-enhance-message',
  'ai-proxy',
  'ai-router',
  'ai-suggest-reply',
  'ai-transcribe-audio',
  'approve-password-reset',
  'auto-close-conversations',
  'automation-suggest-reply',
  'batch-fetch-avatars',
  'bitrix-api',
  'chatbot-l1',
  'classify-audio-meme',
  'classify-sticker',
  'cleanup-rate-limit-logs',
  'cleanup-storage-orphans',
  'client-observability',
  'connection-health-check',
  'connection-test',
  'contact-media',
  'contacts-import',
  'create-user',
  'csat-auto-send',
  'db-health-monitor',
  'detect-new-device',
  'elevenlabs-dialogue',
  'elevenlabs-scribe-token',
  'elevenlabs-sfx',
  'elevenlabs-tts',
  'elevenlabs-tts-stream',
  'elevenlabs-voice',
  'email-health',
  'email-imap-bridge',
  'email-track-link',
  'email-track-pixel',
  'evolution-api',
  'evolution-consumer-stats',
  'evolution-credentials',
  'evolution-group-sync',
  'evolution-notification-dispatcher',
  'evolution-retry-metrics',
  'evolution-sync',
  'evolution-templates',
  'evolution-webhook',
  'fetch-whatsapp-avatar',
  'file-security-scanner',
  'followup-bridge',
  'get-mapbox-token',
  'get-sip-password',
  'gmail-oauth',
  'gmail-send',
  'gmail-sync',
  'gmail-token-refresh',
  'gmail-webhook',
  'health',
  'health-check',
  'instance-pause-control',
  'lgpd-scheduled-jobs',
  'login-attempts',
  'main',
  'mcp',
  'mcp-query',
  'mcp-server',
  'metrics',
  'migrate-media-storage',
  'nps-scheduler',
  'promogifts-catalog',
  'provider-healthcheck',
  'provider-router',
  'public-api',
  'recheck-webhook-signature',
  'recover-corrupted-audios',
  'reprocess-failed-messages',
  'secure-upload',
  'send-email',
  'send-rate-limit-alert',
  'send-scheduled-report',
  'sentiment-alert',
  'sicoob-bridge',
  'sicoob-bridge-reply',
  'sla-alert-forward',
  'sla-alert-log-failure',
  'speech-to-text',
  'status',
  'talkx-add-recipients',
  'talkx-control',
  'talkx-scheduler',
  'talkx-send',
  'ticket-router',
  'virustotal-test',
  'voice-agent',
  'voice-changer',
  'voice-copilot-action',
  'webauthn',
  'webhook-diagnostic',
  'webhook-hmac-selftest',
  'webhook-secret-status',
  'whatsapp-cloud-api',
  'whatsapp-cloud-secrets-status',
  'whatsapp-cloud-send',
  'whatsapp-cloud-webhook',
  'whatsapp-cloud-webhook-verify',
  'zapp-sentry-sync',
  'zapp-get-sip-credentials',
  'zapp-crm-sync',
] as const;

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ])
);

const JsonObjectSchema = z.record(JsonValueSchema);
const NonEmptyObjectSchema = JsonObjectSchema.refine((value) => Object.keys(value).length > 0, {
  message: 'payload must include at least one field',
});
const NoBodySchema = z.undefined().optional();

// W6_BEGIN_CLOUD_CONTRACTS
// CloudWebhookV1Schema: envelope do webhook da Meta. `object` é literal e
// `entry[].changes[].value` é PERMISSIVO (metadata + contacts/messages/
// statuses/errors como arrays de any) porque o normalizer
// (whatsapp-cloud-normalizer.ts) valida o conteúdo DEPOIS — o gate só garante
// o shape do envelope e nunca derruba ingestão por campo novo do provedor.
export const CloudWebhookV1Schema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        changes: z
          .array(
            z.object({
              field: z.string().trim().min(1),
              value: z
                .object({
                  messaging_product: z.literal('whatsapp').optional(),
                  metadata: z
                    .object({
                      display_phone_number: z.string().trim().min(1).optional(),
                      phone_number_id: z.string().trim().min(1).optional(),
                    })
                    .optional(),
                  contacts: z.array(z.any()).optional(),
                  messages: z.array(z.any()).optional(),
                  statuses: z.array(z.any()).optional(),
                  errors: z.array(z.any()).optional(),
                })
                .passthrough(),
            })
          )
          .min(1),
      })
    )
    .min(1),
});

// CloudSendV1Schema: corpo de envio da Graph API da Meta (whatsapp-cloud-send).
// `to` E.164 — regex de 10 a 15 dígitos (DDI+DDD+número); `type` restrito aos
// 6 tipos de envio suportados; `text` ≤ 4096 (limite real da API Meta);
// media/mediatype/filename opcionais. Permissivo (extras passam) — provedor
// externo, mesmo padrão dos demais contratos Meta.
export const CloudSendV1Schema = z
  .object({
    to: z.string().regex(/^\d{10,15}$/, 'to: 10-15 dígitos (DDI+DDD+número)'),
    type: z.enum(['text', 'image', 'audio', 'video', 'document', 'sticker']),
    text: z.string().max(4096).optional(),
    media: z.string().url().optional(),
    mediatype: z.string().optional(),
    filename: z.string().max(255).optional(),
  })
  .passthrough();
// W6_END_CLOUD_CONTRACTS

export const WebhookContractSchemas = {
  'evolution-webhook': {
    v1: EvolutionWebhookV1Schema,
    v2: EvolutionWebhookV2Schema,
  },
  'whatsapp-cloud-webhook': {
    v1: MetaWebhookPayloadSchema,
    v2: MetaWebhookPayloadSchema.extend({
      version: z.literal('2.0'),
      received_at: z.string().datetime().optional(),
    }),
  },
  // v1+v2 reais (alinhado com ContractLifecycles — validação Claude C1, 2ª rodada:
  // lifecycle diz current v2; sem o schema v2 o caminho legado devolvia undefined).
  'gmail-webhook': {
    v1: GmailWebhookV1Schema,
    v2: GmailWebhookV2Schema,
  },
  'e2e-webhook-fixture': { v1: NonEmptyObjectSchema },
  'webhook-diagnostic': { v1: NonEmptyObjectSchema },
  'webhook-hmac-selftest': { v1: NonEmptyObjectSchema },
} as const;

export type ContractVersionMap = Record<string, z.ZodTypeAny>;

export interface ContractLifecycle {
  current: string;
  supported: string[];
  deprecated?: Record<string, { sunset: string; replacement: string }>;
}

export const ContractLifecycles: Record<string, ContractLifecycle> = {
  'evolution-webhook': {
    current: 'v2',
    supported: ['v1', 'v2'],
    deprecated: {
      v1: { sunset: '2027-01-01', replacement: 'v2' },
    },
  },
  'whatsapp-cloud-webhook': {
    current: 'v2',
    supported: ['v1', 'v2'],
    deprecated: {
      // Alinhado com CONTRACTS (contract-versions.ts:26) — 2027-06-01.
      v1: { sunset: '2027-06-01', replacement: 'v2' },
    },
  },
  // Alinhados com CONTRACTS (validação Claude C1 2026-08-04) — os 4 webhooks
  // V2 precisam de lifecycle idêntico ao registro canônico.
  'gmail-webhook': {
    current: 'v2',
    supported: ['v1', 'v2'],
    deprecated: {
      v1: { sunset: '2027-06-01', replacement: 'v2' },
    },
  },
};

const specificEdgeFunctionSchemas: Partial<
  Record<(typeof EDGE_FUNCTION_NAMES)[number], ContractVersionMap>
> = {

  'evolution-consumer-stats': { v1: z.object({
    collected_at: z.string().optional(),
    replica: z.string().optional(),
    ok: z.number().optional(), shadow: z.number().optional(),
    retry: z.number().optional(), drop: z.number().optional(), err: z.number().optional(),
    pg_log_ok: z.number().optional(), pg_log_err: z.number().optional(),
    sentry_sent: z.number().optional(), resub: z.number().optional(),
    pg_stats_ok: z.number().optional(), pg_stats_err: z.number().optional(),
    drop_by: z.record(z.string(), z.number()).optional(),
    retry_by: z.record(z.string(), z.number()).optional(),
  }).passthrough() },
  // AI/ML — schemas V1 estritos derivados do consumo real (agent 2, contrato-tests-webhooks)
  'ai-router': { v1: AiRouterV1Schema },
  'ai-proxy': { v1: AiProxyV1Schema },
  'ai-conversation-summary': { v1: AiConversationSummaryV1Schema },
  'ai-conversation-analysis': { v1: AiConversationAnalysisV1Schema },
  'ai-enhance-message': { v1: AiEnhanceMessageV1Schema },
  'ai-churn-analysis': { v1: AiChurnAnalysisV1Schema },
  'ai-transcribe-audio': { v1: AiTranscribeAudioV1Schema },
  'ai-suggest-reply': { v1: AiSuggestReplyV1Schema },
  'classify-sticker': { v1: ClassifyStickerV1Schema },
  'classify-audio-meme': { v1: ClassifyAudioMemeV1Schema },
  'sentiment-alert': { v1: SentimentAlertV1Schema },
  'voice-agent': { v1: VoiceAgentV1Schema },
  'voice-changer': { v1: VoiceChangerV1Schema },
  'chatbot-l1': { v1: ChatbotL1V1Schema },
  'automation-suggest-reply': { v1: AutomationSuggestReplyV1Schema },
  'speech-to-text': { v1: SpeechToTextV1Schema },
  // GET autenticado sem body (credenciais SIP por perfil — fallback legado flag)
  'zapp-get-sip-credentials': { v1: z.object({}).strict() },
  // Demais endpoints internos com schema específico
  'create-user': { v1: z.object({ email: z.string().email() }).passthrough() },
  'evolution-notification-dispatcher': {
    v1: z
      .object({
        limit: z.number().int().min(1).max(50).optional(),
        dryRun: z.boolean().optional(),
      })
      .strict(),
  },
  'detect-new-device': {
    v1: z
      .object({
        device_fingerprint: z.string().min(8),
        browser: z.string().min(1),
        os: z.string().min(1),
        device_name: z.string().min(1),
      })
      .passthrough(),
  },
  // zapp-sentry-sync@v1 — config Sentry persistida em zapp.sentry_config.
  // Espelho inline do SentrySyncV1Schema (contract-schemas.ts) — nunca importar
  // de contract-schemas.ts (ciclo). Estrito: endpoint interno da UI.
  'zapp-sentry-sync': {
    v1: z
      .object({
        dsn: z.string().max(500).optional(),
        enabled: z.boolean().optional(),
        environment: z.enum(['production', 'staging', 'development']).optional(),
        traces_sample_rate: z.number().min(0).max(1).optional(),
        replays_session_sample_rate: z.number().min(0).max(1).optional(),
        replays_on_error_sample_rate: z.number().min(0).max(1).optional(),
        action: z.enum(['save', 'test']).optional(),
  // CRM plugável (Etapa 66) — schema INLINE (nunca importar de contract-schemas.ts: ciclo)
  'zapp-crm-sync': {
    v1: z
      .object({
        entity_id: z.string().uuid().optional(),
        entity_data: z.object({
          phone: z.string().min(1),
          channel: z.string().min(1),
          direction: z.enum(['inbound', 'outbound']),
          assunto: z.string().nullable().optional(),
          resumo: z.string().nullable().optional(),
          sentiment: z.string().nullable().optional(),
          message_count: z.number().int().min(0).optional(),
          agent_name: z.string().nullable().optional(),
          zapp_conversation_id: z.string().nullable().optional(),
          dry_run: z.boolean().optional(),
        }),
      })
      .strict(),
  },
  ...WebhookContractSchemas,
};

/**
 * Registro paralelo LEGADO (espelho): EdgeFunctionContractSchemas.
 *
 * Consolidação 2026-08-04 (onda 4): este registro NÃO é a fonte que o gate
 * lê em runtime — `parseOrReject` usa `CONTRACT_SCHEMAS` (contract-schemas.ts).
 * O drift entre os dois foi a causa-raiz do incidente P0 (ai-churn-analysis/
 * classify-emoji registrados aqui mas não no canônico) e está travado pelo
 * Invariante 8 (`EdgeFunctionContractSchemas ⊆ CONTRACT_SCHEMAS`) em
 * contract-registry-integrity.test.ts. Mantido apenas para compatibilidade de
 * chamadores legados (parseContractRequest) e testes.
 */
export const EdgeFunctionContractSchemas: Record<string, ContractVersionMap> = Object.fromEntries(
  EDGE_FUNCTION_NAMES.map((name) => [
    name,
    specificEdgeFunctionSchemas[name] ?? { v1: NonEmptyObjectSchema.or(NoBodySchema) },
  ])
);

export function getContractSchema(name: string, version = 'v1'): z.ZodTypeAny | undefined {
  return EdgeFunctionContractSchemas[name]?.[version];
}

export function getContractLifecycle(name: string): ContractLifecycle {
  const versions = Object.keys(EdgeFunctionContractSchemas[name] ?? {});
  return (
    ContractLifecycles[name] ?? {
      current: versions.includes('v1') ? 'v1' : (versions[0] ?? 'v1'),
      supported: versions,
    }
  );
}

export function validateContractPayload(name: string, version: string, payload: unknown) {
  const schema = getContractSchema(name, version);
  if (!schema) {
    return {
      success: false as const,
      error: new z.ZodError([
        { code: 'custom', path: ['contract'], message: `unsupported contract ${name}@${version}` },
      ]),
    };
  }
  return schema.safeParse(payload);
}

export interface ContractParseOptions {
  version?: string;
  requestId?: string;
}

export type ContractParseResult<T = unknown> =
  | { success: true; data: T; version: string; lifecycle: ContractLifecycle }
  | { success: false; response: Response; version: string; lifecycle: ContractLifecycle };

function inferContractVersion(name: string, payload: unknown, explicitVersion?: string): string {
  if (explicitVersion) return explicitVersion;
  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    'version' in payload &&
    (payload as { version?: unknown }).version === '2.0' &&
    getContractSchema(name, 'v2')
  ) {
    return 'v2';
  }
  return getContractSchema(name, 'v1') ? 'v1' : getContractLifecycle(name).current;
}

/**
 * Runtime contract gate for Edge Functions.
 *
 * Handlers should call this once at the HTTP boundary and return
 * `result.response` whenever `success === false`. All schema failures use the
 * same 422 payload shape: `{ error, code, message, requestId, fields, details }`.
 */
/**
 * @deprecated — use `parseOrReject` de contract-kit.ts (envelope 422 único com
 * `contract` e `details`). Este gate legado usa `contractErrorResponse`
 * (envelope antigo com `fields[]`, sem `contract`). 0 chamadores em produção.
 * Mantido para compatibilidade de testes legados (edge-contract-schemas.test.ts).
 */
export async function parseContractRequest<T = unknown>(
  req: Request,
  contractName: string,
  options: ContractParseOptions = {}
): Promise<ContractParseResult<T>> {
  let payload: unknown;
  const lifecycle = getContractLifecycle(contractName);

  try {
    payload = await req.json();
  } catch {
    const version = options.version ?? lifecycle.current;
    return {
      success: false,
      version,
      lifecycle,
      response: contractErrorResponse(
        'invalid_json',
        `Invalid JSON body for ${contractName}@${version}`,
        [{ path: ['body'], message: 'Request body must be valid JSON' }],
        options.requestId,
        req
      ),
    };
  }

  const version = inferContractVersion(contractName, payload, options.version);
  const result = validateContractPayload(contractName, version, payload);

  if (!result.success) {
    return {
      success: false,
      version,
      lifecycle,
      response: contractErrorResponse(
        'contract_violation',
        `Payload validation failed for ${contractName}@${version}`,
        result.error.issues,
        options.requestId,
        req
      ),
    };
  }

  return { success: true, data: result.data as T, version, lifecycle };
}
