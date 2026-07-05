/**
 * evolutionCredentialsProvider.ts
 * 
 * Provider seguro para credenciais da Evolution API.
 * Substitui a leitura via PostgREST (revogada 2026-07-05).
 * 
 * ARQUITETURA:
 * 1. Tenta buscar via edge function evolution-credentials (SEGURO: JWT + Vault)
 * 2. Fallback: env vars de build (VITE_EVOLUTION_API_KEY / VITE_EVOLUTION_API_URL)
 * 3. Circuit breaker: após 3 falhas consecutivas, suspende por 30min
 * 
 * VANTAGEM sobre env var no Vercel:
 * - Rotacão de key sem redeploy
 * - api_key nunca aparece no bundle JS
 * - Auditoria de acesso via logs do Supabase
 */
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  'https://supabase.atomicabr.com.br';

const EDGE_FN_URL = `${SUPABASE_URL}/functions/v1/evolution-credentials`;

const FALLBACK_KEY =
  (import.meta.env.VITE_EVOLUTION_API_KEY as string | undefined) || '';
const FALLBACK_URL =
  (import.meta.env.VITE_EVOLUTION_API_URL as string | undefined) ||
  'https://evolution.atomicabr.com.br';
const FALLBACK_INSTANCE =
  (import.meta.env.VITE_ZAPPWEB_INSTANCE as string | undefined) || 'wpp2';

interface EvolutionCreds {
  api_url: string;
  api_key: string;
  instance_name: string;
  health_status: string;
  source: 'edge_function' | 'fallback_env' | 'cache';
}

// Cache em memória com TTL + jitter
let cache: { creds: EvolutionCreds; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60_000;
const jitterMs = () => Math.random() * 60_000; // ±1min jitter

// Circuit breaker
const cb = {
  failures: 0,
  openUntil: 0,
  THRESHOLD: 3,
  OPEN_MS: 30 * 60_000,
  isOpen() {
    if (Date.now() < this.openUntil) return true;
    if (this.openUntil > 0) {
      this.openUntil = 0;
      this.failures = 0;
    }
    return false;
  },
  recordFailure() {
    this.failures++;
    if (this.failures >= this.THRESHOLD) {
      this.openUntil = Date.now() + this.OPEN_MS;
      log.error('[evolutionCredentials] circuit breaker OPEN por 30min');
    }
  },
  recordSuccess() { this.failures = 0; },
};

async function fetchFromEdgeFn(): Promise<EvolutionCreds | null> {
  // Pegar sessão atual
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    log.warn('[evolutionCredentials] sem sessão JWT ativa, usando fallback');
    return null;
  }

  const resp = await fetch(EDGE_FN_URL, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(5000),
  });

  if (!resp.ok) {
    log.warn(`[evolutionCredentials] edge function retornou ${resp.status}`);
    return null;
  }

  const body = await resp.json();
  // api_key vem no header (não no body)
  const apiKey = resp.headers.get('X-Evolution-Key') || '';

  if (!apiKey || !body.api_url) return null;

  return {
    api_url: body.api_url,
    api_key: apiKey,
    instance_name: body.instance_name || FALLBACK_INSTANCE,
    health_status: body.health_status || 'unknown',
    source: 'edge_function',
  };
}

export async function getEvolutionCreds(): Promise<EvolutionCreds> {
  // 1. Cache
  if (cache && Date.now() < cache.expiresAt) {
    return { ...cache.creds, source: 'cache' };
  }

  // 2. Circuit breaker
  if (cb.isOpen()) {
    log.warn('[evolutionCredentials] circuit breaker OPEN, usando fallback');
    return {
      api_url: FALLBACK_URL,
      api_key: FALLBACK_KEY,
      instance_name: FALLBACK_INSTANCE,
      health_status: 'unknown',
      source: 'fallback_env',
    };
  }

  // 3. Edge function (fonte principal)
  try {
    const creds = await fetchFromEdgeFn();
    if (creds) {
      cb.recordSuccess();
      cache = { creds, expiresAt: Date.now() + CACHE_TTL_MS + jitterMs() };
      return creds;
    }
  } catch (err) {
    log.warn('[evolutionCredentials] edge function falhou:', err);
    cb.recordFailure();
  }

  // 4. Fallback: env vars
  log.info('[evolutionCredentials] usando fallback env vars');
  return {
    api_url: FALLBACK_URL,
    api_key: FALLBACK_KEY,
    instance_name: FALLBACK_INSTANCE,
    health_status: 'unknown',
    source: 'fallback_env',
  };
}

export function clearCredentialsCache(): void {
  cache = null;
}
