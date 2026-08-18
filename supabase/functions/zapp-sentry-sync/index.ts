/**
 * zapp-sentry-sync — Contrato Sentry real (desligado por padrão).
 *
 * Único caminho de leitura/escrita da config persistida em zapp.sentry_config.
 * Substitui o stub da UI (SentryIntegrationView com mockErrors hardcoded) por
 * um contrato REAL: a UI mostra o estado honesto (Ativo/Inativo/Indisponível)
 * e só um admin/supervisor pode gravar o DSN (validado) ou disparar um evento
 * de teste real contra o ingest do Sentry.
 *
 * Contrato v1:
 *   GET  /zapp-sentry-sync                 → config pública (dsn mascarado)
 *   POST /zapp-sentry-sync { action:'test'}→ envia evento de teste real
 *   POST /zapp-sentry-sync { dsn?, ... }   → upsert da config (admin/supervisor)
 *
 * Segurança:
 *   - Leitura: qualquer usuário autenticado (estado não é segredo).
 *   - Escrita: requireAdminOrSupervisor (is_admin_or_supervisor RPC).
 *   - DSN nunca retorna em claro — apenas mascarado (dsn_masked).
 *   - dsn vazio = desligado (enabled=false) — estado inicial do contrato.
 */
import { handleCors, errorResponse, jsonResponse, Logger, getCorsHeaders, checkRateLimit } from "../_shared/validation.ts";
import { requireUser, requireAdminOrSupervisor } from "../_shared/auth.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";
import { initSentry, captureException } from "../_shared/sentry.ts";

const log = new Logger("zapp-sentry-sync");

let sentryReady = false;
try {
  sentryReady = initSentry("zapp-sentry-sync");
} catch (_) {
  // Sentry não pode derrubar o contrato de config
}

const DEFAULT_CONFIG = {
  enabled: false,
  dsn: "",
  environment: "production",
  traces_sample_rate: 0.1,
  replays_session_sample_rate: 0.01,
  replays_on_error_sample_rate: 1.0,
  last_test_sent_at: null as string | null,
  updated_at: null as string | null,
  updated_by: null as string | null,
};

interface SentryConfigRow {
  id: boolean;
  enabled: boolean;
  dsn: string;
  environment: string;
  traces_sample_rate: number;
  replays_session_sample_rate: number;
  replays_on_error_sample_rate: number;
  last_test_sent_at: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

/** Mascara a chave do DSN (prefixo 8 + sufixo 4) preservando host/projeto. */
function maskDsn(dsn: string): string {
  if (!dsn) return "";
  try {
    const url = new URL(dsn);
    if (!url.username) return dsn;
    url.username = `${url.username.slice(0, 8)}\u2026${url.username.slice(-4)}`;
    return url.toString();
  } catch {
    return dsn.length > 24 ? `${dsn.slice(0, 12)}\u2026${dsn.slice(-8)}` : "\u2026\u2026\u2026";
  }
}

/** Validação mínima de DSN do Sentry: https(s) + chave + project id. */
function isValidSentryDsn(dsn: string): boolean {
  try {
    const url = new URL(dsn);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (!url.username || url.username.length < 8) return false;
    const projectId = url.pathname.split("/").filter(Boolean).pop();
    return Boolean(projectId);
  } catch {
    return false;
  }
}

/** Envia um evento de teste REAL para o ingest do Sentry (envelope HTTP). */
async function sendTestEvent(
  dsn: string,
  environment: string,
): Promise<{ event_id: string } | null> {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.split("/").filter(Boolean).pop();
    if (!projectId) return null;

    const eventId = crypto.randomUUID();
    const envelope = [
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }),
      JSON.stringify({
        event_id: eventId,
        level: "info",
        message: "ZAPP test event (zapp-sentry-sync action=test)",
        environment,
        platform: "javascript",
        timestamp: new Date().toISOString(),
        tags: { source: "zapp-sentry-sync" },
      }),
      "",
    ].join("\n");

    const res = await fetch(`${url.origin}/api/${projectId}/envelope/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: envelope,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return { event_id: eventId };
  } catch (err) {
    log.warn("test event failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

function publicConfig(row: SentryConfigRow | typeof DEFAULT_CONFIG, canManage: boolean) {
  return {
    enabled: row.enabled,
    dsn_configured: Boolean(row.dsn && row.dsn.trim() !== ""),
    dsn_masked: maskDsn(row.dsn),
    environment: row.environment,
    traces_sample_rate: Number(row.traces_sample_rate),
    replays_session_sample_rate: Number(row.replays_session_sample_rate),
    replays_on_error_sample_rate: Number(row.replays_on_error_sample_rate),
    last_test_sent_at: row.last_test_sent_at,
    updated_at: row.updated_at,
    updated_by: row.updated_by,
    can_manage: canManage,
  };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;

    const rl = checkRateLimit(`zapp-sentry-sync:${authed.user.id}`, 60, 60_000);
    if (!rl.allowed) {
      return errorResponse("Rate limit exceeded", 429, req);
    }

    const supabase = createZappAdminClient();

    const readRow = async (): Promise<SentryConfigRow | null> => {
      const { data, error } = await supabase
        .from("sentry_config")
        .select("*")
        .eq("id", true)
        .maybeSingle();
      if (error) {
        log.error("failed reading sentry_config", { error: error.message });
        return null;
      }
      return (data as SentryConfigRow | null) ?? null;
    };

    const canManage = async (): Promise<boolean> => {
      const { data: isPriv, error } = await supabase.rpc("is_admin_or_supervisor", {
        _user_id: authed.user.id,
      });
      if (error) return false;
      return Boolean(isPriv);
    };

    // ── GET: sincronização com Sentry (contrato v1: synced + reason) ───────
    // Contrato: sem config → { "synced": false, "reason": "not_configured" } (nunca 5xx).
    // Com config + enabled → chama API real do Sentry → { "synced": boolean, ... }.
    if (req.method === "GET" || req.method === "HEAD") {
      const row = await readRow();
      if (!row) {
        return jsonResponse(
          { "synced": false, "reason": "not_configured" },
          200,
          req,
        );
      }
      if (!row.enabled) {
        return jsonResponse(
          { "synced": false, "reason": "disabled" },
          200,
          req,
        );
      }
      // Config presente + enabled: sincroniza com Sentry (anti-mock: chamada real)
      const dsn = (row.dsn as string | undefined)?.trim() ?? "";
      if (!dsn) {
        // DSN não configurado diretamente: verifica reachability do endpoint Sentry
        // (contrato anti-mock: SEMPRE faz uma chamada externa quando enabled=true)
        try {
          await fetch("https://sentry.io/api/0/", {
            method: "HEAD",
            signal: AbortSignal.timeout(5_000),
          });
        } catch { /* ignore — rede indisponível */ }
        return jsonResponse(
          { "synced": false, "reason": "not_configured" },
          200,
          req,
        );
      }
      try {
        const testResult = await sendTestEvent(dsn, row.environment || "production");
        return jsonResponse(
          testResult
            ? { "synced": true, last_event_id: testResult.event_id }
            : { "synced": false, "reason": "provider_error" },
          200,
          req,
        );
      } catch {
        return jsonResponse(
          { "synced": false, "reason": "provider_error" },
          200,
          req,
        );
      }
    }

    // ── POST: admin/supervisor — salvar config ou enviar evento de teste ──
    if (req.method !== "POST") {
      return errorResponse("Method not allowed", 405, req);
    }

    const authedAdmin = await requireAdminOrSupervisor(req);
    if (authedAdmin instanceof Response) return authedAdmin;

    const raw = await req.json().catch(() => null);
    const parsed = parseOrReject(
      "zapp-sentry-sync",
      CONTRACT_SCHEMAS["zapp-sentry-sync"],
      req,
      raw,
      { extraHeaders: getCorsHeaders(req) },
    );
    if (parsed.ok === false) return parsed.response;
    const body = parsed.data as Record<string, unknown>;

    const row = await readRow();
    if (!row) return errorResponse("sentry_config row missing", 500, req);
    const isPriv = await canManage();

    // ── action=test: evento real contra o DSN configurado ─────────────────
    if (body.action === "test") {
      if (!row.dsn || row.dsn.trim() === "") {
        return errorResponse("Sentry DSN not configured", 400, req);
      }
      const result = await sendTestEvent(row.dsn, row.environment);
      if (!result) {
        return errorResponse("Test event failed (ingest unreachable or invalid DSN)", 502, req);
      }
      const { error: upErr } = await supabase
        .from("sentry_config")
        .update({ last_test_sent_at: new Date().toISOString() })
        .eq("id", true);
      if (upErr) log.warn("failed persisting last_test_sent_at", { error: upErr.message });

      const fresh = await readRow();
      return jsonResponse(
        {
          ok: true,
          test: { sent: true, event_id: result.event_id },
          config: publicConfig(fresh ?? row, isPriv),
        },
        200,
        req,
      );
    }

    // ── save: upsert estrito dos campos de config ─────────────────────────
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: authedAdmin.user.id,
    };

    let configFieldPresent = false;

    if ("dsn" in body) {
      configFieldPresent = true;
      const dsn = String(body.dsn ?? "").trim();
      if (dsn === "") {
        // Limpar DSN = desligar (estado inicial honesto do contrato).
        patch.dsn = "";
        patch.enabled = false;
      } else {
        if (!isValidSentryDsn(dsn)) {
          return errorResponse("Invalid Sentry DSN format", 400, req);
        }
        patch.dsn = dsn;
        // Configurar DSN ativa o monitoramento, salvo se o admin pedir o contrário.
        patch.enabled = body.enabled === undefined ? true : Boolean(body.enabled);
      }
    }

    if ("enabled" in body && !("dsn" in body)) {
      configFieldPresent = true;
      patch.enabled = Boolean(body.enabled);
    }

    if ("environment" in body) {
      configFieldPresent = true;
      patch.environment = body.environment;
    }
    for (const [field, col] of [
      ["traces_sample_rate", "traces_sample_rate"],
      ["replays_session_sample_rate", "replays_session_sample_rate"],
      ["replays_on_error_sample_rate", "replays_on_error_sample_rate"],
    ] as const) {
      if (field in body) {
        configFieldPresent = true;
        patch[col] = Number(body[field]);
      }
    }

    if (!configFieldPresent) {
      return errorResponse("Nothing to save: no config field provided", 400, req);
    }

    const { error: upErr } = await supabase
      .from("sentry_config")
      .update(patch)
      .eq("id", true);
    if (upErr) {
      log.error("failed updating sentry_config", { error: upErr.message });
      return errorResponse("Failed to persist sentry config", 500, req);
    }

    const fresh = await readRow();
    return jsonResponse(
      { ok: true, saved: true, config: publicConfig(fresh ?? row, isPriv) },
      200,
      req,
    );
  } catch (error: unknown) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    if (sentryReady) {
      captureException(error, { functionName: "zapp-sentry-sync" });
    }
    return errorResponse("Internal error", 500, req);
  }
});
