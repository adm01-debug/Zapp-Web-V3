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
  "evolution-webhook":            { current: "v2", supported: ["v1", "v2"], sunset: { v1: "2027-01-01" } },
  "evolution-consumer-stats":     { current: "v1", supported: ["v1"] },
  "whatsapp-cloud-webhook":       { current: "v2", supported: ["v1", "v2"], sunset: { v1: "2027-06-01" } },
  "whatsapp-cloud-webhook-verify":{ current: "v1", supported: ["v1"] },
  "gmail-webhook":                { current: "v2", supported: ["v1", "v2"], sunset: { v1: "2027-06-01" } },
  "sicoob-bridge":                { current: "v2", supported: ["v1", "v2"], sunset: { v1: "2027-06-01" } },
  "sicoob-bridge-reply":          { current: "v2", supported: ["v1", "v2"], sunset: { v1: "2027-06-01" } },
  "bitrix-api":                   { current: "v1", supported: ["v1"] },
  "recheck-webhook-signature":    { current: "v1", supported: ["v1"] },
  "reprocess-failed-messages":    { current: "v1", supported: ["v1"] },
  "instance-pause-control":       { current: "v1", supported: ["v1"] },
  "evolution-notification-dispatcher": { current: "v1", supported: ["v1"] },
  "contacts-import":              { current: "v1", supported: ["v1"] },
  "voice-copilot-action":         { current: "v1", supported: ["v1"] },
  "evolution-sync":               { current: "v1", supported: ["v1"] },
  "evolution-group-sync":         { current: "v1", supported: ["v1"] },
  "gmail-sync":                   { current: "v1", supported: ["v1"] },
  "webhook-diagnostic":           { current: "v1", supported: ["v1"] },
  "webhook-hmac-selftest":        { current: "v1", supported: ["v1"] },
  "webhook-secret-status":        { current: "v1", supported: ["v1"] },
  "whatsapp-cloud-secrets-status":{ current: "v1", supported: ["v1"] },
  "whatsapp-cloud-api":           { current: "v1", supported: ["v1"] },
  "gmail-token-refresh":          { current: "v1", supported: ["v1"] },
  "email-health":                 { current: "v1", supported: ["v1"] },
  "email-track-link":             { current: "v1", supported: ["v1"] },
  "email-track-pixel":            { current: "v1", supported: ["v1"] },

  // Envio
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
  "ai-churn-analysis":            { current: "v1", supported: ["v1"] },
  "classify-sticker":             { current: "v1", supported: ["v1"] },

  // ElevenLabs
  "elevenlabs-tts":               { current: "v1", supported: ["v1"] },
  "elevenlabs-tts-stream":        { current: "v1", supported: ["v1"] },
  "elevenlabs-sfx":               { current: "v1", supported: ["v1"] },
  "elevenlabs-dialogue":          { current: "v1", supported: ["v1"] },

  // Auth / admin
  "create-user":                  { current: "v1", supported: ["v1"] },
  "approve-password-reset":       { current: "v1", supported: ["v1"] },
  "detect-new-device":            { current: "v1", supported: ["v1"] },
  "webauthn":                     { current: "v1", supported: ["v1"] },

  // Business / infra (v1)
  "gmail-oauth":                  { current: "v1", supported: ["v1"] },
  "email-imap-bridge":            { current: "v1", supported: ["v1"] },
  "evolution-api":                { current: "v1", supported: ["v1"] },
  "evolution-credentials":        { current: "v1", supported: ["v1"] },
  "evolution-credentials-write":   { current: "v1", supported: ["v1"] },
  "evolution-templates":          { current: "v1", supported: ["v1"] },
  "evolution-retry-metrics":      { current: "v1", supported: ["v1"] },
  "followup-bridge":              { current: "v1", supported: ["v1"] },
  "db-health-monitor":            { current: "v1", supported: ["v1"] },
  "connection-health-check":      { current: "v1", supported: ["v1"] },
  "health-check":                 { current: "v1", supported: ["v1"] },
  "health":                       { current: "v1", supported: ["v1"] },
  "status":                       { current: "v1", supported: ["v1"] },
  "metrics":                      { current: "v1", supported: ["v1"] },
  "send-scheduled-report":        { current: "v1", supported: ["v1"] },
  "auto-close-conversations":     { current: "v1", supported: ["v1"] },
  "csat-auto-send":               { current: "v1", supported: ["v1"] },
  "elevenlabs-voice":             { current: "v1", supported: ["v1"] },
  "ai-classify-tickets":          { current: "v1", supported: ["v1"] },
  "ai-router":                    { current: "v1", supported: ["v1"] },
  "automation-suggest-reply":     { current: "v1", supported: ["v1"] },
  "batch-fetch-avatars":          { current: "v1", supported: ["v1"] },
  "chatbot-l1":                   { current: "v1", supported: ["v1"] },
  "classify-audio-meme":          { current: "v1", supported: ["v1"] },
  "cleanup-rate-limit-logs":      { current: "v1", supported: ["v1"] },
  "cleanup-storage-orphans":      { current: "v1", supported: ["v1"] },
  "client-observability":         { current: "v1", supported: ["v1"] },
  "connection-test":              { current: "v1", supported: ["v1"] },
  "contact-media":                { current: "v1", supported: ["v1"] },
  "elevenlabs-scribe-token":      { current: "v1", supported: ["v1"] },
  "fetch-whatsapp-avatar":        { current: "v1", supported: ["v1"] },
  "file-security-scanner":        { current: "v1", supported: ["v1"] },
  "get-mapbox-token":             { current: "v1", supported: ["v1"] },
  "get-sip-password":             { current: "v1", supported: ["v1"] },
  "lgpd-scheduled-jobs":          { current: "v1", supported: ["v1"] },
  "login-attempts":               { current: "v1", supported: ["v1"] },
  "main":                         { current: "v1", supported: ["v1"] },
  "mcp":                          { current: "v1", supported: ["v1"] },
  "mcp-server":                   { current: "v1", supported: ["v1"] },
  "mcp-query":                    { current: "v1", supported: ["v1"] },
  "migrate-media-storage":        { current: "v1", supported: ["v1"] },
  "nps-scheduler":                { current: "v1", supported: ["v1"] },
  "promogifts-catalog":           { current: "v1", supported: ["v1"] },
  "provider-healthcheck":         { current: "v1", supported: ["v1"] },
  "provider-router":              { current: "v1", supported: ["v1"] },
  "recover-corrupted-audios":     { current: "v1", supported: ["v1"] },
  "secure-upload":                { current: "v1", supported: ["v1"] },
  "send-rate-limit-alert":        { current: "v1", supported: ["v1"] },
  "sentiment-alert":              { current: "v1", supported: ["v1"] },
  "sla-alert-forward":            { current: "v1", supported: ["v1"] },
  "sla-alert-log-failure":        { current: "v1", supported: ["v1"] },
  "speech-to-text":               { current: "v1", supported: ["v1"] },
  "talkx-add-recipients":         { current: "v1", supported: ["v1"] },
  "talkx-control":                { current: "v1", supported: ["v1"] },
  "talkx-scheduler":              { current: "v1", supported: ["v1"] },
  "ticket-router":                { current: "v1", supported: ["v1"] },
  "virustotal-test":              { current: "v1", supported: ["v1"] },
  "voice-agent":                  { current: "v1", supported: ["v1"] },
  "voice-changer":                { current: "v1", supported: ["v1"] },

  // CRM plugável (Etapa 66)
  "zapp-crm-sync":                { current: "v1", supported: ["v1"] },
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
