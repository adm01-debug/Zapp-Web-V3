/**
 * providers/cloud/templates.ts — Janela 24h × Templates aprovados (WhatsApp Cloud API / Meta)
 *
 * Módulo W8 do Plano de Desacoplamento (work/W8_cloud_templates.ts → destino:
 * supabase/functions/_shared/providers/cloud/templates.ts). Provider Cloud da Meta
 * (Graph API) — política oficial de mensageria:
 *
 *   - DENTRO da janela de 24h (desde a última mensagem do CLIENTE): mensagens
 *     LIVRES (sendText normal), sem template.
 *   - FORA da janela: apenas TEMPLATES APROVADOS. Mensagem livre fora da janela
 *     é rejeitada pela Meta com o erro 131047 (Re-engagement message) — e a
 *     entrega de template em número inválido falha com 131026 (Message
 *     Undeliverable).
 *   - A janela é ROLANTE de 24h: abre a cada nova mensagem do cliente e não é
 *     estendida por mensagens enviadas pelo negócio (nem por templates).
 *
 * ─── Fluxo completo de envio Cloud ────────────────────────────────────────────
 * 1. INBOUND (webhook whatsapp-cloud-webhook): persistir `last_client_message_at`
 *    (timestamp da última mensagem do CLIENTE) — é a base da janela rolante.
 * 2. OUTBOUND (qualquer fluxo: inbox, followup, automação, NPS/CSAT, chatbot):
 *    a. isWithinWindow(lastClientMessageAt, now) === true
 *         → DENTRO da janela → sendText NORMAL (mensagem livre, sem template).
 *    b. isWithinWindow(...) === false
 *         → FORA da janela → TEMPLATE obrigatório (política Meta):
 *           1. suggestTemplatePath(messageKind)  → nome do template aprovado
 *              (env WHATSAPP_CLOUD_TEMPLATE_*; default documentado p/ text).
 *           2. enqueueForTemplate({to, templateName, language:'pt_BR',
 *              components}) → payload validado p/ a Graph API
 *              (POST /<PHONE_NUMBER_ID>/messages, type=template).
 *           3. Envio via whatsapp-cloud-api (action sendTemplate).
 *    c. suggestTemplatePath(...) === null (nenhum template configurado/kind
 *         sem default) → NÃO enviar mensagem livre (Meta rejeita c/ 131047) →
 *         FILA MANUAL (failed_messages / fila de revisão humana) para um
 *         atendente escolher template aprovado e disparar.
 * 3. FALHAS DE ENVIO → classifyCloudError(error) decide o destino:
 *    - 1310xx (window_closed/undeliverable/invalid_number/unverified) e auth
 *      (401/190): NÃO retryable → DLQ/fila manual — retry automático é inútil
 *      (erro permanente de política/entrega).
 *    - rate_limited (429 / code 4) e server (5xx): retryable COM backoff
 *      (computeBackoffMs de _shared/dlq-backoff.ts; respeitar Retry-After).
 *    - unknown: NÃO retryable por padrão (default seguro) → DLQ p/ revisão.
 *
 * Tabela de códigos Meta cobertos (código do campo `error.code` da Graph):
 *   code   | kind           | retryable | significado
 *   -------|----------------|-----------|---------------------------------------------
 *   131047 | window_closed  | não       | >24h desde a última resposta do cliente —
 *          |                |           |   exige template (Re-engagement message)
 *   131026 | undeliverable  | não       | template rejeitado — destinatário/entrega
 *   131030 | invalid_number | não       | número inválido/incompatível (ex.: sem DDI)
 *   131031 | invalid_number | não       | número inválido (variação da Meta)
 *   131048 | unverified     | não       | número não verificado (política de verificação)
 *   190    | auth           | não       | access token inválido/expirado
 *   401    | auth           | não       | HTTP 401 — não autorizado
 *   429    | rate_limited   | sim       | rate limit — backoff (Retry-After)
 *   4      | rate_limited   | sim       | code 4 da Graph — API rate limit
 *   5xx    | server         | sim       | falha transitória do servidor — backoff
 *   resto  | unknown        | não       | desconhecido — DLQ p/ revisão humana
 *
 * Regra de ouro (simulação documentada em denotest/rate_limit_filas_sim_test.ts):
 * erros 1310xx NÃO devem entrar em loop de retry automático — vão à DLQ/fila.
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Classificação de erro da WhatsApp Cloud API (Meta Graph). */
export type CloudErrorKind =
  | 'window_closed'
  | 'undeliverable'
  | 'invalid_number'
  | 'unverified'
  | 'rate_limited'
  | 'auth'
  | 'server'
  | 'unknown';

/** Resultado de classifyCloudError. */
export interface CloudErrorClassification {
  kind: CloudErrorKind;
  /** Código da Meta extraído (`error.code` / `code` / `error_subcode`), ou null se ausente. */
  code: number | null;
  /** true apenas para rate_limited (429/code 4) e server (5xx) — retry com backoff. */
  retryable: boolean;
}

/** Componente de template da Graph API (ex.: { type: 'body', parameters: [...] }). */
export type CloudTemplateComponent = Record<string, unknown>;

/** Payload validado de envio de template (POST /messages, type=template). */
export interface CloudTemplateMessagePayload {
  /** Número do destinatário (E.164 com DDI, ex.: 5511999999999). */
  to: string;
  /** Nome do template aprovado no WhatsApp Manager. */
  templateName: string;
  /** Idioma do template (default 'pt_BR'). */
  language: string;
  /** Componentes do template (body/header/button com parâmetros). */
  components: CloudTemplateComponent[];
}

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Janela de atendimento da Meta: 24h rolantes desde a última mensagem do cliente. */
export const CLOUD_WINDOW_HOURS = 24;
export const CLOUD_WINDOW_MS = CLOUD_WINDOW_HOURS * 60 * 60 * 1000;

/** Idioma padrão dos templates do ZAPP. */
export const TEMPLATE_LANGUAGE_DEFAULT = 'pt_BR';

/**
 * Variável de ambiente por tipo de mensagem (kind) para o template aprovado.
 * Ainda não existem no deploy — a ausência é tratada (null + warning), nunca crash.
 */
export const TEMPLATE_ENV_BY_KIND: Readonly<Record<string, string>> = {
  text: 'WHATSAPP_CLOUD_TEMPLATE_TEXT',
  image: 'WHATSAPP_CLOUD_TEMPLATE_IMAGE',
  video: 'WHATSAPP_CLOUD_TEMPLATE_VIDEO',
  audio: 'WHATSAPP_CLOUD_TEMPLATE_AUDIO',
  document: 'WHATSAPP_CLOUD_TEMPLATE_DOCUMENT',
  location: 'WHATSAPP_CLOUD_TEMPLATE_LOCATION',
  contact: 'WHATSAPP_CLOUD_TEMPLATE_CONTACT',
  sticker: 'WHATSAPP_CLOUD_TEMPLATE_STICKER',
};

/**
 * Defaults DOCUMENTADOS por kind (o valor recomendado a configurar no env).
 * Somente `text` tem default documentado ('zapp_resposta_padrao'); os demais
 * kinds exigem env explícito (retornam null + warning enquanto não houver).
 */
export const TEMPLATE_DEFAULTS: Readonly<Record<string, string | null>> = {
  text: 'zapp_resposta_padrao',
  image: null,
  video: null,
  audio: null,
  document: null,
  location: null,
  contact: null,
  sticker: null,
};

// ─── Helpers internos ────────────────────────────────────────────────────────

function getEnv(name: string): string | undefined {
  if (typeof Deno !== 'undefined') return Deno.env.get(name);
  // Fallback Node (vitest). Cast evita TS2580 no type-check do Deno.
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name];
}

function logWarning(message: string): void {
  console.warn(`[cloud/templates] ${message}`);
}

/**
 * Extrai o código de erro da Meta (número) de qualquer shape conhecido:
 *   { error: { code, error_subcode } } · { code } · { error_subcode } ·
 *   { details: { error: { code } } } (envelope do whatsapp-cloud-api) —
 *   números e strings numéricas ("131047") são aceitos.
 * Retorna null quando não há código reconhecível.
 */
function extractMetaCode(input: unknown, depth = 0): number | null {
  if (depth > 3 || input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isInteger(input) ? input : null;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isInteger(n) ? n : null;
  }
  if (typeof input !== 'object' || Array.isArray(input)) return null;
  const obj = input as Record<string, unknown>;
  for (const key of ['code', 'error_subcode', 'subcode']) {
    const value = obj[key];
    if (typeof value === 'number' && Number.isInteger(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const n = Number(value.trim());
      if (Number.isInteger(n)) return n;
    }
  }
  if (obj.error !== null && typeof obj.error === 'object') {
    const nested = extractMetaCode(obj.error, depth + 1);
    if (nested !== null) return nested;
  }
  if (obj.details !== null && typeof obj.details === 'object') {
    return extractMetaCode(obj.details, depth + 1);
  }
  return null;
}

/**
 * Extrai o status HTTP (número) de shapes conhecidos de erro/wrapper:
 *   { status } · { http_status } · { statusCode } · { status_code } ·
 *   { response: { status } } · { error: { status } } · { details: { status } }.
 * Retorna null quando não há status reconhecível.
 */
function extractHttpStatus(input: unknown, depth = 0): number | null {
  if (depth > 3 || input === null || input === undefined) return null;
  if (typeof input !== 'object' || Array.isArray(input)) return null;
  const obj = input as Record<string, unknown>;
  for (const key of ['status', 'http_status', 'statusCode', 'status_code']) {
    const value = obj[key];
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
    if (typeof value === 'string' && /^\d{3}$/.test(value.trim())) return Number(value.trim());
  }
  for (const key of ['response', 'error', 'details']) {
    const nestedObj = obj[key];
    if (nestedObj !== null && typeof nestedObj === 'object') {
      const nested = extractHttpStatus(nestedObj, depth + 1);
      if (nested !== null) return nested;
    }
  }
  return null;
}

// ─── 1) classifyCloudError ───────────────────────────────────────────────────

/**
 * Classifica um erro da WhatsApp Cloud API (Meta Graph).
 *
 * Entradas aceitas (qualquer shape realista):
 *   - corpo de erro da Meta: { error: { code: 131047, message, error_subcode } }
 *   - envelope do whatsapp-cloud-api: { status: 400, details: { error: { code } } }
 *   - HTTP puro: { status: 429 } · { http_status: 500 } · { statusCode: 401 }
 *   - código avulso: 131047 | "131047" | { code: 190 }
 *
 * Regra de decisão (nesta ordem):
 *   1. código específico da Meta (1310xx/190/4/429/401) → kind fixo;
 *   2. código 500-599 → server;
 *   3. status HTTP (401/429/5xx) → kind por status;
 *   4. resto → unknown (retryable=false — default seguro, DLQ p/ revisão).
 */
export function classifyCloudError(error: unknown): CloudErrorClassification {
  const code = extractMetaCode(error);
  const httpStatus = extractHttpStatus(error);

  // 1) Códigos específicos da Meta — permanentes, NUNCA retryable.
  if (code === 131047) return { kind: 'window_closed', code, retryable: false };
  if (code === 131026) return { kind: 'undeliverable', code, retryable: false };
  if (code === 131030 || code === 131031) return { kind: 'invalid_number', code, retryable: false };
  if (code === 131048) return { kind: 'unverified', code, retryable: false };
  if (code === 190 || code === 401) return { kind: 'auth', code, retryable: false };
  if (code === 429 || code === 4) return { kind: 'rate_limited', code, retryable: true };
  if (code !== null && code >= 500 && code <= 599) {
    return { kind: 'server', code, retryable: true };
  }

  // 2) Status HTTP.
  if (httpStatus === 401) return { kind: 'auth', code, retryable: false };
  if (httpStatus === 429) return { kind: 'rate_limited', code, retryable: true };
  if (httpStatus !== null && httpStatus >= 500 && httpStatus < 600) {
    return { kind: 'server', code, retryable: true };
  }

  // 3) Desconhecido — default seguro: sem retry automático, vai à DLQ/fila manual.
  return { kind: 'unknown', code, retryable: false };
}

// ─── 2) isWithinWindow ───────────────────────────────────────────────────────

/** Normaliza timestamp (Date | epoch ms | epoch s | ISO string) → epoch ms. null se inválido/ausente. */
function toEpochMs(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    // > 1e12 → epoch ms (13 dígitos); caso contrário → epoch s (10 dígitos).
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    if (/^\d{10}$/.test(trimmed) || /^\d{13}$/.test(trimmed)) {
      const n = Number(trimmed);
      return n > 1e12 ? n : n * 1000;
    }
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Janela de atendimento de 24h ROLANTES da Meta: true se `now` está a menos de
 * 24h da última mensagem do CLIENTE (`lastClientMessageAt`).
 *
 * - lastClientMessageAt ausente/null/undefined/vazio/ inválido → false
 *   (sem janela aberta → só template).
 * - Aceita Date, epoch ms, epoch s ou string ISO/numeric.
 * - `now` opcional (default: new Date()) — passado explicitamente nos testes.
 * - Timestamp futuro (clock skew) conta como janela aberta (grace, não bloqueia envio).
 */
export function isWithinWindow(
  lastClientMessageAt: unknown,
  now: Date | number = new Date(),
): boolean {
  const lastMs = toEpochMs(lastClientMessageAt);
  if (lastMs === null) return false;

  const nowMs = typeof now === 'number' ? now : now.getTime();
  if (!Number.isFinite(nowMs)) return false;

  return nowMs - lastMs <= CLOUD_WINDOW_MS;
}

// ─── 3) suggestTemplatePath ──────────────────────────────────────────────────

/**
 * Sugere o nome do template APROVADO para um tipo de mensagem (kind), lendo o
 * env WHATSAPP_CLOUD_TEMPLATE_<KIND> (default documentado: text →
 * 'zapp_resposta_padrao' via WHATSAPP_CLOUD_TEMPLATE_TEXT).
 *
 * Retorno:
 *   - env configurado (não-vazio)  → valor do env;
 *   - env AUSENTE + default documentado → default + warning (ex.: text →
 *     'zapp_resposta_padrao');
 *   - env AUSENTE sem default documentado → null + warning (env pode não
 *     existir ainda no deploy — NUNCA lança);
 *   - kind desconhecido → null + warning.
 *
 * null = "nenhum template aprovado disponível" → o chamador NÃO deve enviar
 * mensagem livre (Meta rejeita com 131047) e deve cair na FILA MANUAL.
 */
export function suggestTemplatePath(messageKind: string): string | null {
  const kind = messageKind.trim().toLowerCase();

  const envName = TEMPLATE_ENV_BY_KIND[kind];
  if (envName === undefined) {
    logWarning(
      `suggestTemplatePath: messageKind desconhecido '${messageKind}' — sem template sugerido (retornando null)`,
    );
    return null;
  }

  const envValue = getEnv(envName);
  if (envValue !== undefined && envValue.trim() !== '') {
    return envValue.trim();
  }

  const documentedDefault = TEMPLATE_DEFAULTS[kind] ?? null;
  if (documentedDefault !== null) {
    logWarning(
      `${envName} não configurado (env pode não existir ainda); usando default documentado '${documentedDefault}' para kind '${kind}'`,
    );
    return documentedDefault;
  }

  logWarning(
    `${envName} não configurado e sem default documentado para kind '${kind}' — retornando null; envio fora da janela exigirá FILA MANUAL`,
  );
  return null;
}

// ─── 4) enqueueForTemplate ───────────────────────────────────────────────────

/**
 * Monta e VALIDA o payload de envio de template da Graph API:
 * { to, templateName, language: 'pt_BR', components: [] }.
 *
 * Validações (falha → throw com mensagem descritiva — lixo nunca entra na fila):
 *   - message: objeto (não null/array);
 *   - to: string obrigatória, 8-15 dígitos (E.164 com DDI — corrige o gap do
 *     whatsapp-cloud-send legado que aceitava 'abcde'); espaços/hífens são
 *     removidos no retorno (normalização E.164);
 *   - templateName: string obrigatória, ≤ 512 chars (limite da Meta);
 *   - language: opcional, default 'pt_BR', formato BCP-47 `aa_AA`;
 *   - components: opcional, default [], array de objetos.
 */
export function enqueueForTemplate(message: unknown): CloudTemplateMessagePayload {
  if (message === null || typeof message !== 'object' || Array.isArray(message)) {
    throw new Error("enqueueForTemplate: 'message' deve ser um objeto não-nulo");
  }
  const input = message as Record<string, unknown>;

  const toRaw = typeof input.to === 'string' ? input.to.trim() : '';
  if (toRaw === '') {
    throw new Error("enqueueForTemplate: campo 'to' é obrigatório (número E.164 do destinatário)");
  }
  const toDigits = toRaw.replace(/[\s-]/g, '');
  if (!/^\+?\d{8,15}$/.test(toDigits)) {
    throw new Error(
      `enqueueForTemplate: campo 'to' inválido '${toRaw}' — esperado número com DDI, 8-15 dígitos (ex.: 5511999999999)`,
    );
  }

  const templateName = typeof input.templateName === 'string' ? input.templateName.trim() : '';
  if (templateName === '') {
    throw new Error("enqueueForTemplate: campo 'templateName' é obrigatório");
  }
  if (templateName.length > 512) {
    throw new Error(
      `enqueueForTemplate: campo 'templateName' excede 512 caracteres (limite da Meta): ${templateName.length}`,
    );
  }

  const languageRaw = typeof input.language === 'string' ? input.language.trim() : '';
  const language = languageRaw === '' ? TEMPLATE_LANGUAGE_DEFAULT : languageRaw;
  if (!/^[a-z]{2}_[A-Z]{2}$/.test(language)) {
    throw new Error(
      `enqueueForTemplate: campo 'language' inválido '${language}' — esperado BCP-47 (ex.: pt_BR)`,
    );
  }

  const components = input.components === undefined ? [] : input.components;
  if (!Array.isArray(components)) {
    throw new Error("enqueueForTemplate: campo 'components' deve ser um array");
  }
  for (const component of components) {
    if (component === null || typeof component !== 'object' || Array.isArray(component)) {
      throw new Error('enqueueForTemplate: cada item de components deve ser um objeto');
    }
  }

  return {
    to: toDigits,
    templateName,
    language,
    components: components as CloudTemplateComponent[],
  };
}
