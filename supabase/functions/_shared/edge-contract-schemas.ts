import { z } from 'https://esm.sh/zod@3.23.8';
import {
  EvolutionWebhookV1Schema,
  EvolutionWebhookV2Schema,
  MetaWebhookPayloadSchema,
} from './webhook-schemas.ts';
import { contractErrorResponse } from './validation.ts';

export { z };

export const EDGE_FUNCTION_NAMES = [
  'ai-auto-tag',
  'ai-churn-analysis',
  'ai-classify-tickets',
  'ai-conversation-analysis',
  'ai-conversation-summary',
  'ai-enhance-message',
  'ai-proxy',
  'ai-suggest-reply',
  'ai-transcribe-audio',
  'analyze-external-db',
  'approve-password-reset',
  'audio-transcribe',
  'auto-close-conversations',
  'auto-escalate-sla',
  'automation-suggest-reply',
  'batch-fetch-avatars',
  'bitrix-api',
  'chatbot-l1',
  'classify-audio-meme',
  'classify-emoji',
  'classify-sticker',
  'cleanup-rate-limit-logs',
  'cleanup-storage-orphans',
  'client-observability',
  'connection-health-check',
  'connection-test',
  'contact-media',
  'contacts-import',
  'create-user',
  'detect-new-device',
  'e2e-fixtures',
  'e2e-webhook-fixture',
  'elevenlabs-agent-token',
  'elevenlabs-dialogue',
  'elevenlabs-scribe-token',
  'elevenlabs-sfx',
  'elevenlabs-sts',
  'elevenlabs-tts',
  'elevenlabs-tts-stream',
  'elevenlabs-voice',
  'elevenlabs-voice-design',
  'elevenlabs-webhook',
  'email-imap-bridge',
  'email-track-link',
  'email-track-pixel',
  'evolution-api',
  'evolution-bitrix-sync',
  'evolution-chatbot',
  'evolution-credentials',
  'evolution-followup',
  'evolution-health',
  'evolution-retry-metrics',
  'evolution-sender',
  'evolution-sentiment',
  'evolution-sync',
  'evolution-templates',
  'evolution-webhook',
  'external-db-bridge',
  'external-db-proxy',
  'fetch-whatsapp-avatar',
  'file-security-scanner',
  'get-mapbox-token',
  'get-sip-password',
  'gmail-health',
  'gmail-oauth',
  'gmail-send',
  'gmail-sync',
  'gmail-token-refresh',
  'gmail-webhook',
  'health-check',
  'hello',
  'instance-pause-control',
  'lgpd-scheduled-jobs',
  'login-attempts',
  'main',
  'mcp',
  'mcp-server',
  'migrate-media-storage',
  'nps-scheduler',
  'outlook-oauth',
  'promogifts-catalog',
  'provider-healthcheck',
  'provider-router',
  'proxy-health',
  'proxy-metrics',
  'public-api',
  'queue-rebalance',
  'recheck-webhook-signature',
  'recover-corrupted-audios',
  'reprocess-failed-messages',
  'secure-upload',
  'seed-teams-users',
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
  'whatsapp-webhook',
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
  'whatsapp-webhook': { v1: NonEmptyObjectSchema },
  'gmail-webhook': { v1: NonEmptyObjectSchema },
  'elevenlabs-webhook': { v1: NonEmptyObjectSchema },
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
      v1: { sunset: '2027-01-01', replacement: 'v2' },
    },
  },
};

const specificEdgeFunctionSchemas: Partial<
  Record<(typeof EDGE_FUNCTION_NAMES)[number], ContractVersionMap>
> = {
  'ai-conversation-summary': {
    v1: z
      .object({
        messages: z.array(z.object({ role: z.string().min(1), content: z.string().min(1) })).min(1),
      })
      .passthrough(),
  },
  'ai-suggest-reply': {
    v1: z
      .object({
        conversationHistory: z.array(
          z.object({ role: z.string().min(1), content: z.string().min(1) })
        ),
      })
      .passthrough(),
  },
  'classify-emoji': {
    v1: z
      .object({
        image_url: z.string().url().optional().nullable(),
        file_name: z.string().optional().nullable(),
      })
      .passthrough(),
  },
  'classify-sticker': {
    v1: z.object({ image_url: z.string().url().optional().nullable() }).passthrough(),
  },
  'create-user': { v1: z.object({ email: z.string().email() }).passthrough() },
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
  ...WebhookContractSchemas,
};

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
