/**
 * Contract Version Registry
 *
 * Fonte única de verdade sobre versões suportadas de cada contrato público
 * (webhooks + Edge Functions). Consumido por `parseOrReject` para anotar o
 * envelope de erro e por `assertContractError` nos testes.
 *
 * Regras:
 * - `current` é a versão preferida. Novos clientes devem usá-la.
 * - `supported` lista TODAS as versões ainda aceitas (inclui `current`).
 * - `sunset` (opcional, ISO date) marca quando uma versão legacy será
 *   removida. Enquanto `Date.now() < sunset`, requests dessa versão são
 *   aceitos, mas a resposta ganha o header `x-contract-deprecated: true`.
 */

export interface ContractSpec {
  current: string;
  supported: string[];
  sunset?: Partial<Record<string, string>>; // { v1: "2027-01-01" }
}

export const CONTRACTS: Record<string, ContractSpec> = {
  // Webhooks externos
  "evolution-webhook":            { current: "v1", supported: ["v1", "v2"] },
  "whatsapp-webhook":             { current: "v1", supported: ["v1"] },
  "whatsapp-cloud-webhook":       { current: "v1", supported: ["v1", "v2"] },
  "whatsapp-cloud-webhook-verify":{ current: "v1", supported: ["v1"] },
  "gmail-webhook":                { current: "v1", supported: ["v1"] },
  "elevenlabs-webhook":           { current: "v1", supported: ["v1"] },
  "sicoob-bridge":                { current: "v1", supported: ["v1"] },
  "sicoob-bridge-reply":          { current: "v1", supported: ["v1"] },
  "bitrix-api":                   { current: "v1", supported: ["v1"] },
  "auth-email-hook":              { current: "v1", supported: ["v1"] },
  "recheck-webhook-signature":    { current: "v1", supported: ["v1"] },
  "webhook-diagnostic":           { current: "v1", supported: ["v1"] },
  "webhook-hmac-selftest":        { current: "v1", supported: ["v1"] },

  // Envio
  "evolution-sender":             { current: "v1", supported: ["v1"] },
  "whatsapp-cloud-send":          { current: "v1", supported: ["v1"] },
  "gmail-send":                   { current: "v1", supported: ["v1"] },
  "send-email":                   { current: "v1", supported: ["v1"] },
  "talkx-send":                   { current: "v1", supported: ["v1"] },
  "public-api":                   { current: "v1", supported: ["v1"] },

  // IA
  "ai-proxy":                     { current: "v1", supported: ["v1"] },
  "ai-suggest-reply":             { current: "v1", supported: ["v1"] },
  "ai-enhance-message":           { current: "v1", supported: ["v1"] },
  "ai-transcribe-audio":          { current: "v1", supported: ["v1"] },
  "ai-conversation-analysis":     { current: "v1", supported: ["v1"] },
  "ai-conversation-summary":      { current: "v1", supported: ["v1"] },
  "ai-auto-tag":                  { current: "v1", supported: ["v1"] },

  // ElevenLabs
  "elevenlabs-tts":               { current: "v1", supported: ["v1"] },
  "elevenlabs-tts-stream":        { current: "v1", supported: ["v1"] },
  "elevenlabs-sts":               { current: "v1", supported: ["v1"] },
  "elevenlabs-sfx":               { current: "v1", supported: ["v1"] },
  "elevenlabs-dialogue":          { current: "v1", supported: ["v1"] },
  "elevenlabs-voice-design":      { current: "v1", supported: ["v1"] },

  // Auth / admin
  "create-user":                  { current: "v1", supported: ["v1"] },
  "approve-password-reset":       { current: "v1", supported: ["v1"] },
  "detect-new-device":            { current: "v1", supported: ["v1"] },
  "webauthn":                     { current: "v1", supported: ["v1"] },
};

/** Retorna a label canônica usada no envelope de erro (`<contract>@<version>`). */
export function contractLabel(name: string, version?: string): string {
  const spec = CONTRACTS[name];
  const v = version ?? spec?.current ?? "v1";
  return `${name}@${v}`;
}

/** Verifica se uma versão está dentro do período de sunset (deprecated mas ainda aceita). */
export function isDeprecatedVersion(name: string, version: string): boolean {
  const spec = CONTRACTS[name];
  if (!spec) return false;
  const sunset = spec.sunset?.[version];
  if (!sunset) return false;
  return Date.parse(sunset) > Date.now();
}
