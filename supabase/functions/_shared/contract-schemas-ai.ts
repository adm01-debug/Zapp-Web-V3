/**
 * Contract Schemas AI — schemas V1 das 13 edge functions AI/voz de zapp-web-v3.
 *
 * Ponto de import único para os contratos AI (batch fix/hermes-h848298-contract-coverage).
 * Regra de ouro aplicada: testar a REALIDADE, não a spec.
 *
 * Estrutura:
 *  1. RE-EXPORTS de `_shared/schemas.ts` — schemas V1 estritos que JÁ existem
 *     lá (nunca duplicados; import + re-export com o mesmo nome V1).
 *  2. Schemas NOVOS (`.strict()`) para as funções SEM V1 homônimo em schemas.ts
 *     (ai-auto-tag, ai-classify-tickets, detect-new-device) — derivados do
 *     CONSUMO REAL no index.ts de cada função / validação do ai-router.
 *  3. Registro local `CONTRAI_SCHEMAS_AI: Record<string, SchemaMap>` mapeando
 *     'nome-da-funcao' -> { v1: Schema } para as 13 funções.
 *
 * NOTA: `contract-schemas.ts` (registro principal) NÃO foi editado — este
 * arquivo é o registro AI dedicado, consumido pelo integrador do batch.
 */
import { z } from "https://esm.sh/zod@3.23.8";
import type { SchemaMap } from "./contract-kit.ts";
import {
  // Re-exports V1 (homônimos estritos já existentes em schemas.ts)
  AiProxyV1Schema,
  AiRouterV1Schema,
  AutomationSuggestReplyV1Schema,
  SpeechToTextV1Schema,
  VoiceAgentV1Schema,
  ChatbotL1V1Schema,
  ClassifyAudioMemeV1Schema,
  AiChurnAnalysisV1Schema,
  ClassifyEmojiV1Schema,
  ClassifyStickerV1Schema,
  SentimentAlertV1Schema,
  VoiceChangerV1Schema,
  VoiceCopilotActionV1Schema,
  // Bases não-V1 usadas para derivar os schemas V1 novos (consumo real)
  AiAutoTagSchema,
  AiClassifyTicketsSchema,
  DetectNewDeviceSchema,
} from "./schemas.ts";

// ─── Re-exports V1 (homônimos de schemas.ts — nunca duplicar) ────────────────
// Cada um é o schema ESTRIto real já validado em produção via parseOrReject/
// parseBody. Importados acima e re-exportados com o mesmo nome V1.

/** ai-proxy@v1 — re-export de schemas.ts:431 (strict; messages/model/use_for/provider_id/tools/tool_choice/stream). */
export { AiProxyV1Schema };
/** ai-router@v1 — re-export de schemas.ts:451 (discriminated union strict por action, 10 ações). */
export { AiRouterV1Schema };
/** automation-suggest-reply@v1 — re-export de schemas.ts:400 (strict). */
export { AutomationSuggestReplyV1Schema };
/** speech-to-text@v1 — re-export de schemas.ts:389 (strict). */
export { SpeechToTextV1Schema };
/** voice-agent@v1 — re-export de schemas.ts:372 (strict; espelho do TranscriptSchema inline). */
export { VoiceAgentV1Schema };
/** chatbot-l1@v1 — re-export de schemas.ts:160 (strict). */
export { ChatbotL1V1Schema };
/** classify-audio-meme@v1 — re-export de schemas.ts:360 (strict). */
export { ClassifyAudioMemeV1Schema };
/** ai-churn-analysis@v1 — re-export de schemas.ts:337 (strict). */
export { AiChurnAnalysisV1Schema };
/** classify-emoji@v1 — re-export de schemas.ts:350 (strict). */
export { ClassifyEmojiV1Schema };
/** classify-sticker@v1 — re-export de schemas.ts:355 (strict). */
export { ClassifyStickerV1Schema };
/** sentiment-alert@v1 — re-export de schemas.ts:369 (= SentimentAlertSchema.strict()). */
export { SentimentAlertV1Schema };
/** voice-changer@v1 — re-export de schemas.ts:380 (strict; rota JSON da fila/queue — multipart não passa por contrato JSON). */
export { VoiceChangerV1Schema };
/** voice-copilot-action@v1 — re-export de schemas.ts:290 (action + params nullish). */
export { VoiceCopilotActionV1Schema };

// ─── Schemas NOVOS (sem V1 homônimo em schemas.ts) — derivados do consumo real ─

/**
 * ai-auto-tag@v1 — schema estrito.
 *
 * DERIVADO DO CONSUMO REAL: o index.ts de ai-auto-tag é um proxy que repassa o
 * body intacto ao ai-router adicionando `action: "auto_tag"` (index.ts:47). O
 * validador real é o handler do ai-router, que faz `parseBody(AiAutoTagSchema,
 * body)` (ai-router/index.ts:1186) e consome `contactId`, `messages` e
 * `requestId` (destructuring em ai-router/index.ts:1191). Mesma forma da
 * variante `auto_tag` de AiRouterV1Schema (schemas.ts:453), sem o literal
 * `action` (injetado pelo proxy).
 */
export const AiAutoTagV1Schema = AiAutoTagSchema.strict();

/**
 * ai-classify-tickets@v1 — schema estrito.
 *
 * DERIVADO DO CONSUMO REAL: proxy que repassa o body ao ai-router com
 * `action: "classify_tickets"` (index.ts:25); o router valida com
 * `parseBody(AiClassifyTicketsSchema, body)` (ai-router/index.ts:4034) e
 * consome apenas `limit` (ai-router/index.ts:4039). O router também lê
 * `requestId` no topo para idempotência (C.35, max 100 chars — espelhado na
 * variante `classify_tickets` de AiRouterV1Schema, schemas.ts:477-479).
 */
export const AiClassifyTicketsV1Schema = AiClassifyTicketsSchema
  .extend({ requestId: z.string().max(100).optional() })
  .strict();

/**
 * detect-new-device@v1 — schema estrito.
 *
 * DERIVADO DO CONSUMO REAL: index.ts valida com
 * `parseBody(DetectNewDeviceSchema, await req.json())` (index.ts:26) e
 * consome `device_fingerprint`, `browser`, `os`, `device_name` (destructuring
 * em index.ts:29) — os 4 campos são obrigatórios, sem defaults.
 */
export const DetectNewDeviceV1Schema = DetectNewDeviceSchema.strict();

// ─── Registro local: função → { v1: Schema } (13 funções AI/voz) ─────────────

/** Registro das 13 edge functions AI/voz: 'nome-da-funcao' -> { v1: Schema }. */
