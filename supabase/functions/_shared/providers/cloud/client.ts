/**
 * providers/cloud/client.ts — Gateway HTTP para a WhatsApp Cloud API (Meta Graph API v21.0)
 *
 * W1 do Plano de Desacoplamento: espelho do evolutionClient (12 verbos canônicos),
 * mesmo tipo de retorno ({ok, data} | {ok:false, status, message}), mas contra a
 * Cloud API oficial da Meta (graph.facebook.com).
 *
 * Diferenças deliberadas vs evolutionClient (fail-closed):
 * - getQrCode() e listGroups() LANÇAM Error('cloud: recurso nao suportado') — a Cloud
 *   API não possui esses recursos; falhar alto é mais seguro que inventar dados.
 * - restartInstance() retorna { ok:false, status:501 } — não existe restart na Cloud API.
 * - Resposta 200 com corpo inesperado (ex.: sem messaging_product) vira
 *   { ok:false, status:200, message:'resposta inesperada' } — NUNCA é engolida como ok
 *   (o evolutionClient engolia 200 malformado; este client não).
 * - Idempotência: header X-Idempotency-Key = sha256(verb|to|body) em todo POST.
 * - E.164: números BR de 10-11 dígitos recebem prefixo 55 automaticamente.
 * - sendMedia: media_id pronto (string sem http) OU upload automático via
 *   POST /{phone_number_id}/media (multipart) quando media é URL pública.
 *
 * Credenciais (lidas no construtor via createCloudClient, nunca hardcoded):
 *   WHATSAPP_CLOUD_TOKEN     — access token da Meta (Authorization: Bearer)
 *   WHATSAPP_CLOUD_PHONE_ID  — phone_number_id da conta WhatsApp Business
 *
 * Retry: 3 attempts no total (maxRetries=2), backoff full-jitter 500ms*2^n cap 8s,
 * retry SOMENTE em 408/429/5xx e timeout/erro de rede; 4xx (exceto 408/429) sem retry.
 * Timeout: 30s por tentativa. Nenhum verbo lança (exceto getQrCode/listGroups).
 */

export interface CloudClientConfig {
  /** Access token da Meta (default: env WHATSAPP_CLOUD_TOKEN). */
  token?: string;
  /** phone_number_id da conta WhatsApp Business (default: env WHATSAPP_CLOUD_PHONE_ID). */
  phoneId?: string;
  /** Base da Graph API (default: https://graph.facebook.com/v21.0/). */
  baseUrl?: string;
  /** Retries além da tentativa inicial (default: 2 → 3 attempts no total). */
  maxRetries?: number;
  /** Timeout por tentativa em ms (default: 30_000). */
  timeoutMs?: number;
}

/** Overrides permitidos por chamada (mesma ideia dos options do evolutionClient). */
export type CloudCallOptions = Pick<CloudClientConfig, 'maxRetries' | 'timeoutMs'>;

/** Tipo de retorno canônico do client (mesma forma do evolutionClient). */
export type CloudClientResponse<T = unknown> =
  | { ok: true; status: number; data: T; retries: number }
  | { ok: false; status: number; message: string; retries: number };

export interface CloudSendMediaOptions {
  /** URL pública da mídia (faz upload automático) OU media_id já enviado à Meta. */
  media: string;
  /** Tipo WhatsApp ('image' | 'video' | 'audio' | 'document' | 'sticker') ou MIME (ex.: 'image/jpeg'). */
  mediatype: string;
  /** Nome do arquivo (obrigatório para document). */
  filename?: string;
}

export interface CloudPhoneInfo {
  id: string;
  display_phone_number?: string;
  quality_rating?: string;
  platform_type?: string;
}

export interface CloudSendMessageResult {
  messaging_product: string;
  contacts?: unknown[];
  messages?: { id: string }[];
}

export interface CloudConnectionState {
  state: 'open';
  isHealthy: true;
  phone?: CloudPhoneInfo;
}

/** Interface canônica — espelho do evolutionClient (12 verbos). */
export interface CloudClient {
  sendText(
    instance: string,
    number: string,
    text: string,
    options?: CloudCallOptions,
  ): Promise<CloudClientResponse<CloudSendMessageResult>>;
  sendMedia(
    instance: string,
    jid: string,
    opts: CloudSendMediaOptions,
    options?: CloudCallOptions,
  ): Promise<CloudClientResponse<CloudSendMessageResult>>;
  sendSticker(
    instance: string,
    number: string,
    stickerUrl: string,
    options?: CloudCallOptions,
  ): Promise<CloudClientResponse<CloudSendMessageResult>>;
  getConnectionState(
    instance: string,
    options?: CloudCallOptions,
  ): Promise<CloudClientResponse<CloudConnectionState>>;
  /** A Cloud API não tem QR Code — lança por design (fail-closed). */
  getQrCode(instance: string): Promise<never>;
  /** A Cloud API não tem restart — 501 fail-closed (não lança). */
  restartInstance(
    instance: string,
    options?: CloudCallOptions,
  ): Promise<CloudClientResponse<unknown>>;
  listInstances(options?: CloudCallOptions): Promise<CloudClientResponse<CloudPhoneInfo[]>>;
  /** A Cloud API não tem listagem de grupos — lança por design (fail-closed). */
  listGroups(instance: string): Promise<never>;
  checkWhatsApp(
    instance: string,
    numbers: string[],
    options?: CloudCallOptions,
  ): Promise<CloudClientResponse<boolean>>;
  getProfilePicture(
    instance: string,
    number: string,
    options?: CloudCallOptions,
  ): Promise<CloudClientResponse<{ profilePicUrl: string | null }>>;
  /** Generic GET — path relativo à base da Graph API (ex.: '{phoneId}/messages'). */
  get<T = unknown>(path: string, options?: CloudCallOptions): Promise<CloudClientResponse<T>>;
  /** Generic POST — path relativo à base da Graph API. */
  post<T = unknown>(
    path: string,
    body: unknown,
    options?: CloudCallOptions,
  ): Promise<CloudClientResponse<T>>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://graph.facebook.com/v21.0/';
const RETRYABLE_STATUSES = new Set([408, 429]);

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Full jitter (AWS Architecture Blog): delay aleatório em [0, min(cap, base*2^n)). */
function jitterDelay(attempt: number, baseMs = 500, capMs = 8_000): number {
  const exp = Math.min(baseMs * 2 ** attempt, capMs);
  return Math.floor(Math.random() * exp);
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Normaliza para E.164 (dígitos com DDI).
 * - 10-11 dígitos → número BR sem DDI → prefixa 55.
 * - 12-13 dígitos → já tem DDI → mantém.
 * - fora disso → null (inválido).
 */
export function normalizeE164(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (digits.length >= 10 && digits.length <= 11) return '55' + digits;
  if (digits.length >= 12 && digits.length <= 13) return digits;
  return null;
}

/** Mapeia mediatype (tipo WhatsApp ou MIME) para o tipo WhatsApp do payload de /messages. */
function whatsappMediaType(mediatype: string): string | null {
  const t = mediatype.toLowerCase();
  if (t.includes('/')) {
    if (t.startsWith('image/')) return 'image';
    if (t.startsWith('video/')) return 'video';
    if (t.startsWith('audio/')) return 'audio';
    return 'document';
  }
  return ['image', 'video', 'audio', 'document', 'sticker'].includes(t) ? t : null;
}

/** MIME default por tipo WhatsApp (usado no upload quando o caller passa só o tipo). */
const DEFAULT_MIME: Record<string, string> = {
  image: 'image/jpeg',
  video: 'video/mp4',
  audio: 'audio/mpeg',
  document: 'application/pdf',
  sticker: 'image/webp',
};

function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const obj = body as Record<string, unknown>;
    const err = obj.error as Record<string, unknown> | undefined;
    if (err && typeof err.message === 'string' && err.message) return err.message;
    if (typeof obj.message === 'string' && obj.message) return obj.message;
  }
  return fallback;
}

type ExpectShape = 'messages' | 'media' | 'phone' | 'profile' | 'none';

/**
 * Fail-closed: valida a forma esperada do corpo 2xx. Resposta 200 com JSON
 * inesperado (ex.: sem messaging_product) NÃO é ok — vira 'resposta inesperada'.
 */
function validateShape(shape: ExpectShape, data: unknown): boolean {
  if (shape === 'none') return true;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const obj = data as Record<string, unknown>;
  switch (shape) {
    case 'messages':
      // fail-closed completo (validacao final): 200 sem messages[0].id nao e ok
      return obj.messaging_product === 'whatsapp'
        && Array.isArray(obj.messages)
        && obj.messages.length > 0
        && typeof (obj.messages[0] as { id?: unknown } | null | undefined)?.id === 'string';
    case 'media':
      return typeof obj.id === 'string' && obj.id.length > 0;
    case 'phone':
      return typeof obj.id === 'string' && obj.id.length > 0;
    case 'profile':
      return true; // profile_picture_url pode vir vazio → fallback null no verbo
  }
}

async function parseJsonBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function pickOptions(options?: CloudCallOptions): CloudCallOptions {
  const out: CloudCallOptions = {};
  if (options?.maxRetries !== undefined) out.maxRetries = options.maxRetries;
  if (options?.timeoutMs !== undefined) out.timeoutMs = options.timeoutMs;
  return out;
}

function getEnv(name: string): string | undefined {
  if (typeof Deno !== 'undefined') return Deno.env.get(name);
  // Fallback Node (vitest). Cast evita TS2580 no type-check do Deno.
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name];
}

interface RequestOpts {
  path: string;
  method: 'GET' | 'POST';
  body?: unknown;
  formData?: FormData;
  expect?: ExpectShape;
  /** Destinatário (ou path) usado na chave de idempotência de POSTs. */
  idemTo?: string;
  maxRetries?: number;
  timeoutMs?: number;
}

interface ResolvedConfig {
  token: string;
  phoneId: string;
  baseUrl: string;
  maxRetries: number;
  timeoutMs: number;
}

/**
 * Núcleo HTTP: retry, timeout, idempotência e fail-closed.
 * - Retry SOMENTE em 408/429/5xx e timeout/erro de rede; 4xx (exceto 408/429) sem retry.
 * - 3 attempts no total; backoff full-jitter 500ms*2^n cap 8s; timeout 30s por tentativa.
 * - X-Idempotency-Key = sha256(verb|to|body) em todo POST (estável entre retries).
 * - NUNCA lança: todo erro vira {ok:false, status, message}.
 */
async function request<T>(
  cfg: ResolvedConfig,
  opts: RequestOpts,
): Promise<CloudClientResponse<T>> {
  const maxRetries = opts.maxRetries ?? cfg.maxRetries;
  const timeoutMs = opts.timeoutMs ?? cfg.timeoutMs;
  const url = cfg.baseUrl + opts.path.replace(/^\//, '');

  const idemKey = opts.method === 'POST'
    ? await sha256Hex(
      `${opts.method}|${opts.idemTo ?? opts.path}|${opts.body === undefined ? '' : JSON.stringify(opts.body)}`,
    )
    : undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await sleep(jitterDelay(attempt - 1));

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        const headers = new Headers({ Authorization: `Bearer ${cfg.token}` });
        if (opts.formData) {
          // fetch define o boundary multipart/form-data automaticamente
        } else if (opts.body !== undefined) {
          headers.set('Content-Type', 'application/json');
        }
        if (idemKey) headers.set('X-Idempotency-Key', idemKey);
        res = await fetch(url, {
          method: opts.method,
          headers,
          body: opts.formData ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      // Retry ONLY em 408/429/5xx (e timeout/erro de rede). 4xx (exceto 408/429) SEM retry.
      if (RETRYABLE_STATUSES.has(res.status) || res.status >= 500) {
        if (attempt < maxRetries) {
          await res.body?.cancel().catch(() => {});
          continue;
        }
        const errBody = await parseJsonBody(res).catch(() => null);
        return {
          ok: false,
          status: res.status,
          message: extractMessage(errBody, `HTTP ${res.status}`),
          retries: attempt,
        };
      }

      const data = await parseJsonBody(res);
      if (res.status >= 400) {
        return {
          ok: false,
          status: res.status,
          message: extractMessage(data, `HTTP ${res.status}`),
          retries: attempt,
        };
      }

      // Fail-closed: 2xx com corpo inesperado NUNCA é ok.
      if (!validateShape(opts.expect ?? 'none', data)) {
        return { ok: false, status: res.status, message: 'resposta inesperada', retries: attempt };
      }
      return { ok: true, status: res.status, data: data as T, retries: attempt };
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const message = isAbort
        ? `timeout apos ${timeoutMs}ms`
        : err instanceof Error
        ? err.message
        : String(err);
      if (attempt >= maxRetries) {
        return { ok: false, status: 0, message, retries: attempt };
      }
      // timeout / erro de rede → retry
    }
  }
  return { ok: false, status: 0, message: 'falha na requisicao', retries: maxRetries };
}

/**
 * Upload de mídia a partir de URL pública: baixa o arquivo e POSTa em
 * /{phone_number_id}/media (multipart) → retorna o media_id da Meta.
 */
async function uploadPublicMedia(
  cfg: ResolvedConfig,
  url: string,
  wtype: string,
  mediatype: string,
  filename: string | undefined,
  options?: CloudCallOptions,
): Promise<CloudClientResponse<{ id: string }>> {
  const timeoutMs = options?.timeoutMs ?? cfg.timeoutMs;

  let dl: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      dl = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      message: isAbort
        ? `timeout ao baixar midia (${timeoutMs}ms)`
        : err instanceof Error
        ? err.message
        : String(err),
      retries: 0,
    };
  }
  if (!dl.ok) {
    await dl.body?.cancel().catch(() => {});
    return {
      ok: false,
      status: dl.status,
      message: `falha ao baixar midia da URL publica (HTTP ${dl.status})`,
      retries: 0,
    };
  }

  const blob = await dl.blob();
  const mime = mediatype.includes('/') ? mediatype : (DEFAULT_MIME[wtype] ?? 'application/octet-stream');
  const ext = mime.split('/')[1] ?? 'bin';

  const fd = new FormData();
  fd.set('messaging_product', 'whatsapp');
  fd.set('type', mime);
  fd.set('file', new Blob([blob], { type: mime }), filename ?? `media.${ext}`);

  return request<{ id: string }>(cfg, {
    path: `${cfg.phoneId}/media`,
    method: 'POST',
    formData: fd,
    expect: 'media',
    idemTo: cfg.phoneId,
    ...pickOptions(options),
  });
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Cria o client cloud. Lê WHATSAPP_CLOUD_TOKEN e WHATSAPP_CLOUD_PHONE_ID do
 * ambiente no construtor (nunca hardcoded); config explícita sobrescreve a env.
 * Lança no construtor se as credenciais estiverem ausentes (fail-closed).
 */
export function createCloudClient(config: CloudClientConfig = {}): CloudClient {
  const token = config.token ?? getEnv('WHATSAPP_CLOUD_TOKEN') ?? '';
  const phoneId = config.phoneId ?? getEnv('WHATSAPP_CLOUD_PHONE_ID') ?? '';
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '') + '/';
  const maxRetries = config.maxRetries ?? 2; // 3 attempts no total
  const timeoutMs = config.timeoutMs ?? 30_000;

  if (!token || !phoneId) {
    throw new Error(
      'cloud client: WHATSAPP_CLOUD_TOKEN e WHATSAPP_CLOUD_PHONE_ID sao obrigatorios (env ou config)',
    );
  }

  const cfg: ResolvedConfig = { token, phoneId, baseUrl, maxRetries, timeoutMs };

  return {
    async sendText(
      _instance: string,
      number: string,
      text: string,
      options?: CloudCallOptions,
    ): Promise<CloudClientResponse<CloudSendMessageResult>> {
      const to = normalizeE164(number);
      if (!to) return { ok: false, status: 400, message: `numero invalido (E.164): ${number}`, retries: 0 };
      return request<CloudSendMessageResult>(cfg, {
        path: `${phoneId}/messages`,
        method: 'POST',
        body: { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } },
        expect: 'messages',
        idemTo: to,
        ...pickOptions(options),
      });
    },

    async sendMedia(
      _instance: string,
      jid: string,
      opts: CloudSendMediaOptions,
      options?: CloudCallOptions,
    ): Promise<CloudClientResponse<CloudSendMessageResult>> {
      const to = normalizeE164(jid);
      if (!to) return { ok: false, status: 400, message: `numero invalido (E.164): ${jid}`, retries: 0 };
      const wtype = whatsappMediaType(opts.mediatype);
      if (!wtype) return { ok: false, status: 400, message: `mediatype invalido: ${opts.mediatype}`, retries: 0 };
      if (!opts.media) return { ok: false, status: 400, message: 'media obrigatoria (URL ou media_id)', retries: 0 };
      try {
        let mediaId: string;
        if (/^https?:\/\//i.test(opts.media)) {
          const up = await uploadPublicMedia(cfg, opts.media, wtype, opts.mediatype, opts.filename, options);
          if (up.ok === false) return up;
          mediaId = up.data.id;
        } else {
          mediaId = opts.media; // caller passou media_id pronto
        }

        const mediaObj: Record<string, unknown> = { id: mediaId };
        if (wtype === 'document' && opts.filename) mediaObj.filename = opts.filename;

        return request<CloudSendMessageResult>(cfg, {
          path: `${phoneId}/messages`,
          method: 'POST',
          body: { messaging_product: 'whatsapp', to, type: wtype, [wtype]: mediaObj },
          expect: 'messages',
          idemTo: to,
          ...pickOptions(options),
        });
      } catch (err) {
        return { ok: false, status: 0, message: err instanceof Error ? err.message : String(err), retries: 0 };
      }
    },

    async sendSticker(
      _instance: string,
      number: string,
      stickerUrl: string,
      options?: CloudCallOptions,
    ): Promise<CloudClientResponse<CloudSendMessageResult>> {
      const to = normalizeE164(number);
      if (!to) return { ok: false, status: 400, message: `numero invalido (E.164): ${number}`, retries: 0 };
      return request<CloudSendMessageResult>(cfg, {
        path: `${phoneId}/messages`,
        method: 'POST',
        body: { messaging_product: 'whatsapp', to, type: 'sticker', sticker: { link: stickerUrl } },
        expect: 'messages',
        idemTo: to,
        ...pickOptions(options),
      });
    },

    async getConnectionState(
      _instance: string,
      options?: CloudCallOptions,
    ): Promise<CloudClientResponse<CloudConnectionState>> {
      const r = await request<CloudPhoneInfo>(cfg, {
        path: `${phoneId}?fields=id,display_phone_number,quality_rating,platform_type`,
        method: 'GET',
        expect: 'phone',
        ...pickOptions(options),
      });
      if (r.ok === false) return r; // 401/403/5xx/etc → {ok:false, status}
      return {
        ok: true,
        status: r.status,
        data: { state: 'open', isHealthy: true, phone: r.data },
        retries: r.retries,
      };
    },

    async getQrCode(_instance: string): Promise<never> {
      throw new Error('cloud: recurso nao suportado');
    },

    async restartInstance(
      _instance: string,
      _options?: CloudCallOptions,
    ): Promise<CloudClientResponse<unknown>> {
      return { ok: false, status: 501, message: 'cloud: recurso nao suportado', retries: 0 };
    },

    async listInstances(options?: CloudCallOptions): Promise<CloudClientResponse<CloudPhoneInfo[]>> {
      const r = await request<CloudPhoneInfo>(cfg, {
        path: `${phoneId}?fields=id,display_phone_number,quality_rating,platform_type`,
        method: 'GET',
        expect: 'phone',
        ...pickOptions(options),
      });
      if (r.ok === false) return r;
      return { ok: true, status: r.status, data: [r.data], retries: r.retries };
    },

    async listGroups(_instance: string): Promise<never> {
      throw new Error('cloud: recurso nao suportado');
    },

    async checkWhatsApp(
      _instance: string,
      numbers: string[],
      options?: CloudCallOptions,
    ): Promise<CloudClientResponse<boolean>> {
      const number = Array.isArray(numbers) ? numbers[0] : undefined;
      if (!number) return { ok: false, status: 400, message: 'lista de numeros vazia', retries: 0 };
      const to = normalizeE164(number);
      if (!to) return { ok: false, status: 400, message: `numero invalido (E.164): ${number}`, retries: 0 };

      const r = await request<Record<string, unknown>>(cfg, {
        path: `${phoneId}/contacts`,
        method: 'POST',
        body: { blocking: 'no', contacts: [to] },
        expect: 'none',
        idemTo: to,
        ...pickOptions(options),
      });
      if (r.ok === false) return r;

      const body = r.data;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { ok: false, status: 200, message: 'resposta inesperada', retries: r.retries };
      }
      const topErr = body.error as Record<string, unknown> | undefined;
      if (topErr?.code === 131030) return { ok: true, status: 200, data: false, retries: r.retries };
      if (topErr) {
        return { ok: false, status: 200, message: extractMessage(body, 'resposta inesperada'), retries: r.retries };
      }
      if (!Array.isArray(body.contacts)) {
        return { ok: false, status: 200, message: 'resposta inesperada', retries: r.retries };
      }
      const contact = body.contacts[0] as Record<string, unknown> | undefined;
      if (contact?.status === 'valid') return { ok: true, status: 200, data: true, retries: r.retries };
      if ((contact?.error as Record<string, unknown> | undefined)?.code === 131030) {
        return { ok: true, status: 200, data: false, retries: r.retries };
      }
      return { ok: true, status: 200, data: false, retries: r.retries };
    },

    async getProfilePicture(
      _instance: string,
      _number: string,
      options?: CloudCallOptions,
    ): Promise<CloudClientResponse<{ profilePicUrl: string | null }>> {
      const r = await request<Record<string, unknown>>(cfg, {
        path: `${phoneId}?fields=profile_picture_url`,
        method: 'GET',
        expect: 'profile',
        ...pickOptions(options),
      });
      if (r.ok === false) return r;
      const url = typeof r.data.profile_picture_url === 'string' && r.data.profile_picture_url
        ? r.data.profile_picture_url
        : null;
      return { ok: true, status: r.status, data: { profilePicUrl: url }, retries: r.retries };
    },

    async get<T = unknown>(path: string, options?: CloudCallOptions): Promise<CloudClientResponse<T>> {
      return request<T>(cfg, { path, method: 'GET', expect: 'none', ...pickOptions(options) });
    },

    async post<T = unknown>(
      path: string,
      body: unknown,
      options?: CloudCallOptions,
    ): Promise<CloudClientResponse<T>> {
      return request<T>(cfg, { path, method: 'POST', body, expect: 'none', idemTo: path, ...pickOptions(options) });
    },
  };
}

let _defaultClient: CloudClient | undefined;

/** Instância default (lazy): lê WHATSAPP_CLOUD_TOKEN / WHATSAPP_CLOUD_PHONE_ID do ambiente. */
export function getCloudClient(): CloudClient {
  if (!_defaultClient) _defaultClient = createCloudClient();
  return _defaultClient;
}
