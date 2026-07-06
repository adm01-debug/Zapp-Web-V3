/**
 * Zap Webb — Evolution API Client (ESCRITA / envio)
 *
 * Wrapper HTTP fino sobre a Evolution API (Baileys / WhatsApp Web).
 * Carrega credenciais por instância da tabela
 * `evolution_instance_credentials` (Lovable Cloud) — fallback para
 * envs `VITE_EVOLUTION_*` em desenvolvimento.
 *
 * Endpoints cobertos (ver HANDOFF_LOVABLE_ZAP_WEBB.md):
 *  - POST /message/sendText/{instance}
 *  - POST /message/sendMedia/{instance}
 *  - POST /message/sendWhatsAppAudio/{instance}
 *  - PUT  /chat/markChatUnread/{instance}
 *  - GET  /instance/fetchInstances
 *  - GET  /instance/connectionState/{instance}
 */
import { safeClient } from '@/integrations/supabase/safeClient';
import { log } from '@/lib/logger';

export interface EvolutionCredentials {
  api_url: string;
  api_key: string;
  instance_name: string;
}

const DEFAULT_URL =
  (import.meta.env.VITE_EVOLUTION_API_URL as string | undefined) ||
  'https://evolution.atomicabr.com.br';
const DEFAULT_KEY =
  (import.meta.env.VITE_EVOLUTION_API_KEY as string | undefined) || '';
const DEFAULT_INSTANCE =
  (import.meta.env.VITE_ZAPPWEB_INSTANCE as string | undefined) || 'wpp2';

const credsCache = new Map<string, { creds: EvolutionCredentials; at: number }>();
const CREDS_TTL_MS = 60_000;

function normalizeUrl(url: string): string {
  let u = (url || '').trim();
  if (!u) return u;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u.replace(/\/+$/, '');
}

export function stripJid(numberOrJid: string): string {
  return (numberOrJid || '').replace(/@s\.whatsapp\.net$/i, '').replace(/@c\.us$/i, '');
}

export async function getEvolutionCredentials(
  instance: string = DEFAULT_INSTANCE,
): Promise<EvolutionCredentials> {
  const cached = credsCache.get(instance);
  if (cached && Date.now() - cached.at < CREDS_TTL_MS) return cached.creds;

  try {
    const { data } = await safeClient.from<{
      instance_name: string;
      api_url: string;
      api_key: string;
      is_active: boolean;
    }>(
      'evolution_instance_credentials',
      (q) => q
        .select('instance_name, api_url, api_key, is_active')
        .eq('instance_name', instance)
        .eq('is_active', true)
        .limit(1),
    );
    const credData = data[0] ?? null;

    if (credData?.api_url && credData?.api_key) {
      const creds: EvolutionCredentials = {
        api_url: normalizeUrl(credData.api_url),
        api_key: credData.api_key,
        instance_name: credData.instance_name,
      };
      credsCache.set(instance, { creds, at: Date.now() });
      return creds;
    }
  } catch (err) {
    log.warn('[evolutionClient] Falha ao carregar credenciais da BD, usando fallback env:', err);
  }

  return {
    api_url: normalizeUrl(DEFAULT_URL),
    api_key: DEFAULT_KEY,
    instance_name: instance,
  };
}

async function evoFetch<T>(
  path: string,
  init: RequestInit,
  instance: string = DEFAULT_INSTANCE,
): Promise<T> {
  const creds = await getEvolutionCredentials(instance);
  if (!creds.api_key) {
    throw new Error(
      'Evolution API key não configurada. Vá em Integrações → Evolution API.',
    );
  }
  const url = `${creds.api_url}${path}`;
  const headers = new Headers(init.headers);
  headers.set('apikey', creds.api_key);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw Object.assign(
      new Error(`Evolution API ${res.status}: ${body || res.statusText}`),
      { status: res.status },
    );
  }
  try {
    return (await res.json()) as T;
  } catch (err) {
    log.error('[evolutionClient] Falha ao processar JSON de resposta:', err);
    return {} as T;
  }
}

// ─── Mensageria ──────────────────────────────────────────────────────────

export async function sendText(
  number: string,
  text: string,
  instance: string = DEFAULT_INSTANCE,
) {
  return evoFetch(`/message/sendText/${instance}`, {
    method: 'POST',
    body: JSON.stringify({ number: stripJid(number), text }),
  }, instance);
}

export async function sendMedia(
  params: {
    number: string;
    mediatype: 'image' | 'video' | 'document';
    media: string; // URL pública
    caption?: string;
    fileName?: string;
  },
  instance: string = DEFAULT_INSTANCE,
) {
  return evoFetch(`/message/sendMedia/${instance}`, {
    method: 'POST',
    body: JSON.stringify({ ...params, number: stripJid(params.number) }),
  }, instance);
}

export async function sendWhatsAppAudio(
  number: string,
  audioUrl: string,
  instance: string = DEFAULT_INSTANCE,
) {
  return evoFetch(`/message/sendWhatsAppAudio/${instance}`, {
    method: 'POST',
    body: JSON.stringify({ number: stripJid(number), audio: audioUrl }),
  }, instance);
}

export async function markChatRead(
  number: string,
  instance: string = DEFAULT_INSTANCE,
) {
  return evoFetch(`/chat/markChatUnread/${instance}`, {
    method: 'PUT',
    body: JSON.stringify({ number: stripJid(number), unread: false }),
  }, instance);
}

// ─── Status / Healthcheck ────────────────────────────────────────────────

export async function fetchInstances(instance: string = DEFAULT_INSTANCE) {
  return evoFetch<unknown[]>(`/instance/fetchInstances`, { method: 'GET' }, instance);
}

export async function connectionState(instance: string = DEFAULT_INSTANCE) {
  return evoFetch<{ instance?: { state?: string } }>(
    `/instance/connectionState/${instance}`,
    { method: 'GET' },
    instance,
  );
}

export function clearEvolutionCredentialsCache(instance?: string) {
  if (instance) credsCache.delete(instance);
  else credsCache.clear();
}
