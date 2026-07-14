import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { getLogger } from '@/lib/logger';
import type { WhatsAppMode, ResolvedTransport } from './whatsappAdapterTypes';

const log = getLogger('whatsappAdapter');

let cachedMode: WhatsAppMode | null = null;
let cacheExpiresAt = 0;

export async function getWhatsAppMode(force = false): Promise<WhatsAppMode> {
  const now = Date.now();
  if (!force && cachedMode && now < cacheExpiresAt) return cachedMode;
  try {
    const { data, error } = await safeClient.rpc<string>('rpc_get_whatsapp_mode');
    if (error) throw error;
    const mode = (data as string) === 'official' ? 'official' : 'unofficial'; // ignore-audit: RPC returns unknown; string is the documented return type
    cachedMode = mode;
    cacheExpiresAt = now + 30_000;
    return mode;
  } catch (e) {
    log.warn('getWhatsAppMode fallback', { error: e instanceof Error ? e.message : String(e) });
    return 'unofficial';
  }
}

const REQUIRED_CLOUD_SECRETS = ['WHATSAPP_CLOUD_PHONE_NUMBER_ID', 'WHATSAPP_CLOUD_ACCESS_TOKEN'];

interface CloudSecretsStatus {
  secrets: { name: string; configured: boolean; length: number }[];
}

let cachedTransport: ResolvedTransport | null = null;
let transportExpiresAt = 0;
let cloudCredsCache: { ok: boolean; missing: string[]; expiresAt: number } | null = null;

async function checkCloudCredentials(): Promise<{ ok: boolean; missing: string[] }> {
  const now = Date.now();
  if (cloudCredsCache && now < cloudCredsCache.expiresAt) {
    return { ok: cloudCredsCache.ok, missing: cloudCredsCache.missing };
  }
  try {
    const { data, error } = await supabase.functions.invoke('whatsapp-cloud-secrets-status');
    if (error) throw error;
    const list = (data as CloudSecretsStatus)?.secrets ?? []; // ignore-audit: narrows Supabase query result to local interface
    const byName = new Map(list.map((s) => [s.name, s.configured]));
    const missing = REQUIRED_CLOUD_SECRETS.filter((n) => !byName.get(n));
    const result = { ok: missing.length === 0, missing };
    cloudCredsCache = { ...result, expiresAt: now + 30_000 };
    return result;
  } catch (e) {
    log.warn('checkCloudCredentials fallback', {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, missing: REQUIRED_CLOUD_SECRETS };
  }
}

/**
 * Resolve o transporte a usar AGORA, combinando o modo escolhido pelo admin
 * com a disponibilidade real das credenciais. Cache de 30s.
 */
export async function resolveTransport(force = false): Promise<ResolvedTransport> {
  const now = Date.now();
  if (!force && cachedTransport && now < transportExpiresAt) return cachedTransport;

  const requestedMode = await getWhatsAppMode(force);

  if (requestedMode === 'unofficial') {
    const resolved: ResolvedTransport = { transport: 'evolution', requestedMode, degraded: false };
    cachedTransport = resolved;
    transportExpiresAt = now + 30_000;
    return resolved;
  }

  const creds = await checkCloudCredentials();
  const resolved: ResolvedTransport = creds.ok
    ? { transport: 'cloud', requestedMode, degraded: false }
    : {
        transport: 'evolution',
        requestedMode,
        degraded: true,
        reason: `Modo oficial selecionado mas faltam secrets: ${creds.missing.join(', ')}. Usando Evolution como fallback.`,
        missingSecrets: creds.missing,
      };
  if (resolved.degraded) {
    log.warn('transport degraded', {
      reason: resolved.reason,
      missingSecrets: resolved.missingSecrets,
    });
  }

  cachedTransport = resolved;
  transportExpiresAt = now + 30_000;
  return resolved;
}

export function invalidateTransportCache() {
  cachedTransport = null;
  transportExpiresAt = 0;
  cloudCredsCache = null;
}

export function invalidateWhatsAppModeCache() {
  cachedMode = null;
  cacheExpiresAt = 0;
  invalidateTransportCache();
}
