// zapp-crm-sync — CRM plugável (Etapa 66, SIM-CRM F1)
// Roteia sync de conversa para o provider configurado em zapp.crm_sync_config.
//
// Contrato de resposta (invariantes SIM-CRM (e)):
//  - 200 para fluxos de negócio: not_configured / not_implemented / duplicate /
//    contact_not_found / error / dry_run (estados, NÃO exceções).
//  - 4xx só para auth / rate-limit / contrato inválido / provider sem env.
//  - reason é sempre string do enum fechado — o front nunca parseia mensagem livre.
//
// Fluxo: handleCors → requireUser → rate limit → parseOrReject
// (ZappCrmSyncV1Schema) → ler config (service_role, schema zapp) → dispatch
// por provider (registry interno provider_handlers).
//
// Secrets NUNCA vêm de zapp.crm_sync_config.settings (regra de ouro SIM-CRM):
// BITRIX_WEBHOOK_URL vive em env da edge (padrão provado do bitrix-api).
import { handleCors, errorResponse, jsonResponse, Logger, checkRateLimit, getCorsHeaders } from "../_shared/validation.ts";
import { requireUser } from "../_shared/auth.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";

/** Providers suportados pelo registry (espelho do CHECK da tabela). */
export const PROVIDERS = ["bitrix24", "custom_cloud"] as const;
export type CrmProvider = (typeof PROVIDERS)[number];

/** Enum fechado de reasons do contrato — o front depende destes literais. */
export type CrmSyncReason =
  | "not_configured"
  | "not_implemented"
  | "provider_not_configured"
  | "duplicate"
  | "contact_not_found"
  | "error"
  | "dry_run"
  | "invalid_config";

/** entity_data do contrato ZappCrmSyncV1Schema (espelha o payload do hook). */
export interface CrmSyncEntityData {
  phone: string;
  channel: string;
  direction: "inbound" | "outbound";
  assunto?: string | null;
  resumo?: string | null;
  sentiment?: string | null;
  message_count?: number;
  agent_name?: string | null;
  zapp_conversation_id?: string | null;
  dry_run?: boolean;
}

const RETRY_DELAYS_MS = [300, 900];
const FETCH_TIMEOUT_MS = 10_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Helpers puros (exportados para contract tests) ─────────────────────────

/** Campos do lead Bitrix (espelho do padrão create_lead_from_conversation do bitrix-api). */
export function buildBitrixLeadFields(entityData: CrmSyncEntityData): Record<string, unknown> {
  return {
    TITLE: entityData.assunto?.trim() || `Lead WhatsApp — ${entityData.phone}`,
    PHONE: [{ VALUE: entityData.phone, VALUE_TYPE: "WORK" }],
    SOURCE_ID: "WEB",
    SOURCE_DESCRIPTION: "WhatsApp via ZAPP",
    COMMENTS: entityData.resumo ?? null,
    UF_CRM_WHATSAPP_CONTACT_ID: entityData.zapp_conversation_id ?? null,
  };
}

/** Traduz erro do provider para reason do contrato (F4/F6 — nunca expõe stack). */
export function translateBitrixError(body: unknown, status: number): { reason: CrmSyncReason; provider_error?: string } {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  const upper = text.toUpperCase();
  if (status === 400 && /DUPLICATE|ALREADY.?EXISTS|J[ÁA] EXISTE/.test(upper)) {
    return { reason: "duplicate" };
  }
  return { reason: "error", provider_error: text.slice(0, 300) };
}

/** Lê a config enabled (0 rows ou todas disabled → null → not_configured honesto). */
export async function readEnabledConfig(): Promise<{ provider: CrmProvider; settings: Record<string, unknown> } | null> {
  // Cliente criado sob demanda (padrão bitrix-api): evita exigir env no import
  // e mantém os contract tests sandbox-only (sem SELFHOSTED_SUPABASE_URL).
  // deno-lint-ignore no-explicit-any
  const admin = createZappAdminClient();
  const { data, error } = await admin
    .from("crm_sync_config")
    .select("provider, enabled, settings")
    .eq("enabled", true)
    .order("provider", { ascending: true })
    .limit(1);
  if (error) throw new Error(`crm_sync_config read failed: ${error.message}`);
  const row = data?.[0];
  // Defesa em profundidade (F8): não confiar só no filtro do PostgREST —
  // re-valida `enabled` no cliente (mock/filter-drift não vira sync fantasma).
  if (!row || row.enabled !== true) return null;
  return {
    provider: row.provider as CrmProvider,
    settings: (row.settings ?? {}) as Record<string, unknown>,
  };
}

/** Fetch com retry 2x (300ms/900ms) e timeout 10s por tentativa (F4). */
export async function fetchWithRetry(url: string, init: RequestInit, log: Logger): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (err) {
      lastError = err;
      const detail = err instanceof Error ? err.message : String(err);
      if (attempt < RETRY_DELAYS_MS.length) {
        log.warn(`bitrix fetch attempt ${attempt + 1} failed, retrying`, { error: detail });
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
  }
  throw lastError;
}

// ─── Dispatch por provider (registry interno) ───────────────────────────────

async function dispatchBitrix24(entityData: CrmSyncEntityData, log: Logger, req: Request): Promise<Response> {
  const webhookUrl = Deno.env.get("BITRIX_WEBHOOK_URL");
  if (!webhookUrl) {
    // F2 — provider habilitado sem env: 400 honesto (padrão bitrix-api L31-35).
    log.warn("bitrix24 enabled but BITRIX_WEBHOOK_URL missing");
    return jsonResponse({ synced: false, reason: "provider_not_configured", provider: "bitrix24" }, 400, req);
  }
  if (entityData.dry_run) {
    // dry_run (F3 "Testar conexão"): valida config+env SEM efeito colateral.
    return jsonResponse({ synced: false, reason: "dry_run", provider: "bitrix24", provider_ready: true }, 200, req);
  }

  const response = await fetchWithRetry(`${webhookUrl}/crm.lead.add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: buildBitrixLeadFields(entityData) }),
  }, log);

  const bodyText = await response.text().catch(() => "");
  let parsed: { result?: unknown; error?: unknown } = {};
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    // corpo não-JSON: cai no translate abaixo
  }

  if (!response.ok || parsed.error) {
    const t = translateBitrixError(parsed.error ? parsed : bodyText, response.status);
    log.warn("bitrix crm.lead.add failed", { status: response.status, reason: t.reason });
    return jsonResponse(
      { synced: false, reason: t.reason, provider: "bitrix24", provider_error: t.provider_error },
      200,
      req,
    );
  }

  log.done(200, { provider: "bitrix24", reason: "synced" });
  return jsonResponse({ synced: true, provider: "bitrix24", bitrix_lead_id: parsed.result ?? null }, 200, req);
}

function dispatchCustomCloud(_entityData: CrmSyncEntityData, req: Request): Response {
  // Stub honesto (SIM-CRM (c) 5 / F4): provider recuperável (CRM 360° histórico),
  // mas o handler ainda não foi implementado. NUNCA fingir sync.
  return jsonResponse({ synced: false, reason: "not_implemented", provider: "custom_cloud" }, 200, req);
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("zapp-crm-sync");

  // Require authenticated Supabase user (rejeita anon/service sem user).
  const authed = await requireUser(req);
  if (authed instanceof Response) return authed;

  const rl = checkRateLimit(`zapp-crm-sync:${authed.user.id}`, 30, 60_000);
  if (!rl.allowed) return errorResponse("Rate limit exceeded. Tente novamente em instantes.", 429, req);

  try {
    const raw = await req.json().catch(() => null);
    const parsed = parseOrReject("zapp-crm-sync", CONTRACT_SCHEMAS["zapp-crm-sync"], req, raw, {
      extraHeaders: getCorsHeaders(req),
    });
    if (parsed.ok === false) return parsed.response;

    const { entity_id: _entityId, entity_data: entityData } = parsed.data as {
      entity_id?: string;
      entity_data: CrmSyncEntityData;
    };

    // F1 — 0 rows ou nenhum enabled: 200 not_configured honesto (NUNCA 500).
    const config = await readEnabledConfig().catch((err: unknown) => {
      log.error("config read failed", { error: err instanceof Error ? err.message : String(err) });
      return undefined;
    });
    if (config === undefined) {
      return errorResponse("CRM sync config unavailable", 500, req);
    }
    if (config === null) {
      log.done(200, { reason: "not_configured" });
      return jsonResponse({ synced: false, reason: "not_configured", providers: [...PROVIDERS] }, 200, req);
    }

    // F8 defesa em profundidade: settings deve ser objeto plano (não string/array/null).
    // DB tem CHECK jsonb_typeof(settings)='object'; re-validamos aqui como guardrail.
    const rawSettings: unknown = config.settings;
    if (rawSettings === null || typeof rawSettings !== "object" || Array.isArray(rawSettings)) {
      log.error("crm_sync_config.settings corrompido (não é objeto)", {
        provider: config.provider,
        settingsType: typeof rawSettings,
      });
      return jsonResponse({ "synced": false, "reason": "invalid_config", provider: config.provider }, 400, req);
    }

    log.info(`dispatch provider=${config.provider}`);

    switch (config.provider) {
      case "bitrix24":
        return await dispatchBitrix24(entityData, log, req);
      case "custom_cloud":
        return dispatchCustomCloud(entityData, req);
      default:
        // F8 — config corrompida (defesa em profundidade; CHECK do DB impede).
        log.error("unknown provider in config", { provider: config.provider });
        return jsonResponse({ synced: false, reason: "invalid_config", provider: config.provider }, 400, req);
    }
  } catch (error: unknown) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse("Internal server error", 500, req);
  }
});
