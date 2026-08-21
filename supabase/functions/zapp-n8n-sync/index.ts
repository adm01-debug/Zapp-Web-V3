/**
 * zapp-n8n-sync — Contrato real da integração n8n (estado honesto).
 *
 * v1 (2026-08-17) — substitui o stub da UI (N8nIntegrationView usava
 * setIsConnected local: a tela "conectava" sem persistir nada). Este endpoint
 * é a fonte de verdade do estado da integração:
 *
 * Actions (POST, JWT admin/supervisor obrigatório):
 *   - { action: 'status' } → estado real lido de zapp.n8n_config:
 *       - sem linha na tabela        → { configured: false, status: 'not_configured' }
 *       - linha com enabled=false    → { configured: true,  status: 'disabled' }
 *       - linha com enabled=true     → { configured: true,  status: 'configured' }
 *     `not_configured` é o estado HONESTO por padrão: nada foi configurado,
 *     nenhum evento é enviado ao n8n.
 *   - { action: 'configure', baseUrl } → persiste a URL (upsert single-row
 *     id=1) com enabled=false: o contrato fica salvo, mas a integração
 *     permanece DESLIGADA — o pipeline de dispatch de eventos ainda não
 *     existe; a ativação (enabled=true) é passo futuro quando o dispatch
 *     for implementado.
 *
 * Segurança:
 *   - requireAdminOrSupervisor (mesmo gate do evolution-credentials)
 *   - Leitura/escrita via RPCs SECURITY DEFINER em zapp (service_role):
 *     fn_edge_get_n8n_config / fn_edge_upsert_n8n_config — nunca expõem
 *     webhook_secret.
 *   - URL validada http(s) e normalizada (sem barra final).
 */

import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { requireAdminOrSupervisor } from '../_shared/auth.ts';
import { checkRateLimit } from '../_shared/validation.ts';
import { createZappAdminClient } from '../_shared/db-client.ts';
import { parseOrReject } from '../_shared/contract-kit.ts';
import { CONTRACT_SCHEMAS } from '../_shared/contract-schemas.ts';
import { isSafeHttpsUrl } from '../_shared/schemas.ts';

/** Config row retornada pelas RPCs (webhook_secret NUNCA vem aqui). */
export interface N8nConfigRow {
  id?: number;
  base_url?: string | null;
  enabled?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type N8nSyncStatusValue = 'not_configured' | 'disabled' | 'configured';

export interface N8nSyncStatus {
  ok: boolean;
  configured: boolean;
  status: N8nSyncStatusValue;
  baseUrl: string | null;
  updatedAt: string | null;
}

/** Normaliza a URL base: trim, sem barra final, prefixo https:// se ausente. */
export function normalizeBaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

/** Deriva o estado honesto a partir da linha de config (null = not_configured). */
export function deriveStatus(config: N8nConfigRow | null): N8nSyncStatus {
  if (!config) {
    return { ok: true, configured: false, status: 'not_configured', baseUrl: null, updatedAt: null };
  }
  const enabled = config.enabled === true;
  return {
    ok: true,
    configured: true,
    status: enabled ? 'configured' : 'disabled',
    baseUrl: config.base_url ?? null,
    updatedAt: config.updated_at ?? null,
  };
}

function json(cors: Record<string, string>, status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/** Lê a config via RPC SECURITY DEFINER (service_role) — nunca via .from() direto. */
export async function fetchN8nConfig(admin: ReturnType<typeof createZappAdminClient>): Promise<N8nConfigRow | null> {
  try {
    const { data, error } = await admin.rpc('fn_edge_get_n8n_config');
    if (error) {
      console.warn('[zapp-n8n-sync] fn_edge_get_n8n_config falhou:', error.message);
      return null;
    }
    return (data && typeof data === 'object' ? data : null) as N8nConfigRow | null;
  } catch (e) {
    console.warn('[zapp-n8n-sync] fn_edge_get_n8n_config lançou:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

async function handleStatus(cors: Record<string, string>, admin: ReturnType<typeof createZappAdminClient>): Promise<Response> {
  const config = await fetchN8nConfig(admin);
  return json(cors, 200, deriveStatus(config));
}

async function handleConfigure(
  cors: Record<string, string>,
  admin: ReturnType<typeof createZappAdminClient>,
  body: { action: 'configure'; baseUrl: string },
): Promise<Response> {
  const baseUrl = normalizeBaseUrl(body.baseUrl);
  // SEC-4 (Bloco 0, 2026-08-21): isSafeHttpsUrl cobre https-only (era só
  // http(s) antes) + bloqueio de rede interna/privada (SSRF) — roda aqui,
  // DEPOIS de normalizeBaseUrl, pra não rejeitar host sem protocolo
  // legítimo (a normalização prefixa https:// antes desta checagem).
  if (!isSafeHttpsUrl(baseUrl)) {
    return json(cors, 400, { ok: false, error: 'baseUrl deve ser uma URL https pública válida' });
  }

  // Contrato real desligado: configuração persiste, mas enabled permanece
  // false — nenhum evento é enviado ao n8n até a ativação do dispatch.
  const { data, error } = await admin.rpc('fn_edge_upsert_n8n_config', {
    p_base_url: baseUrl,
    p_enabled: false,
  });

  if (error) {
    console.error('[zapp-n8n-sync] upsert RPC falhou:', error.message);
    return json(cors, 500, { ok: false, error: 'Failed to save n8n config' });
  }

  const row = (data && typeof data === 'object' ? data : null) as N8nConfigRow | null;
  return json(cors, 200, deriveStatus(row));
}

async function handleWrite(req: Request): Promise<Response> {
  const cors = getCorsHeaders(req);
  const jsonResp = (status: number, payload: unknown) => json(cors, status, payload);

  // Contrato zapp-n8n-sync@v1 — discriminatedUnion por action (estrito:
  // endpoint interno da UI; falhar cedo em payload fora do contrato).
  const raw = await req.json().catch(() => null);
  const parsed = parseOrReject('zapp-n8n-sync', CONTRACT_SCHEMAS['zapp-n8n-sync'], req, raw, {
    extraHeaders: cors,
  });
  if (parsed.ok === false) return parsed.response;
  const body = parsed.data as { action: 'status' | 'configure'; baseUrl?: string };

  // Gate de admin/supervisor antes de tocar no banco (403 p/ não-privilegiado).
  const authed = await requireAdminOrSupervisor(req);
  if (authed instanceof Response) return authed;

  const rl = checkRateLimit(`zapp-n8n-sync:${authed.user.id}`, 30, 60_000);
  if (!rl.allowed) return jsonResp(429, { ok: false, error: 'Rate limit exceeded' });

  const admin = createZappAdminClient();

  if (body.action === 'configure') {
    if (typeof body.baseUrl !== 'string' || body.baseUrl.trim() === '') {
      return jsonResp(400, { ok: false, error: 'baseUrl is required' });
    }
    return handleConfigure(cors, admin, { action: 'configure', baseUrl: body.baseUrl });
  }

  return handleStatus(cors, admin);
}

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  if (req.method === 'POST') {
    return handleWrite(req);
  }

  // GET — leitura de status sem corpo (mesma resposta da action 'status').
  if (req.method === 'GET') {
    const cors = getCorsHeaders(req);
    return (async () => {
      const authed = await requireAdminOrSupervisor(req);
      if (authed instanceof Response) return authed;
      const admin = createZappAdminClient();
      return handleStatus(cors, admin);
    })();
  }

  return new Response(
    JSON.stringify({ error: 'Method Not Allowed' }),
    { status: 405, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
  );
});
