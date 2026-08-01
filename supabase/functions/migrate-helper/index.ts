// Edge function temporária para migração de banco.
// Cole em: Cloud > Edge Functions > migrate-helper > View code
// Após a migração, remova esta função.
//
// Auditoria: toda invocação gera uma entrada estruturada (JSON em stdout)
// e é mantida num ring buffer em memória, consultável via `?action=logs`.
// Nenhum segredo é registrado — apenas metadados e um resumo do resultado.

const ACCESS_KEY = "7bdebc20c45afa11240dc19bb8680e20c3cb84d9dd6127fe";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-access-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/** Entrada de auditoria (sem qualquer dado sensível). */
interface AuditEntry {
  request_id: string;
  at: string;
  action: string;
  method: string;
  status: number;
  ok: boolean;
  duration_ms: number;
  /** Motivo/resumo textual do resultado. */
  outcome: string;
  /** Origem da chamada, útil para rastrear painéis/scripts distintos. */
  origin: string | null;
  /** IP do chamador conforme cabeçalhos do proxy. */
  ip: string | null;
  user_agent: string | null;
  /** Impressão digital (não reversível) da chave usada, para correlação. */
  key_fingerprint: string;
  auth_ok: boolean;
}

const AUDIT_LIMIT = 200;
const auditLog: AuditEntry[] = [];

function pushAudit(entry: AuditEntry): void {
  auditLog.push(entry);
  if (auditLog.length > AUDIT_LIMIT) auditLog.splice(0, auditLog.length - AUDIT_LIMIT);
  // Log estruturado: aparece nos logs da edge function e é grepável por action/request_id.
  console.log(`[migrate-helper][audit] ${JSON.stringify(entry)}`);
}

/** Hash SHA-256 truncado — permite correlacionar chaves sem expô-las. */
async function fingerprint(value: string | null): Promise<string> {
  if (!value) return "none";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest).slice(0, 6))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function clientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    null
  );
}

function json(body: unknown, status: number, requestId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "x-request-id": requestId },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "ping";
  const key = req.headers.get("x-access-key");
  const keyFingerprint = await fingerprint(key);

  const record = (status: number, outcome: string) =>
    pushAudit({
      request_id: requestId,
      at: new Date().toISOString(),
      action,
      method: req.method,
      status,
      ok: status < 400,
      duration_ms: Date.now() - startedAt,
      outcome,
      origin: req.headers.get("origin"),
      ip: clientIp(req),
      user_agent: req.headers.get("user-agent"),
      key_fingerprint: keyFingerprint,
      auth_ok: key === ACCESS_KEY,
    });

  if (key !== ACCESS_KEY) {
    record(401, "unauthorized: x-access-key inválida ou ausente");
    return json({ error: "unauthorized", request_id: requestId }, 401, requestId);
  }

  try {
    if (action === "ping") {
      record(200, "ping respondido");
      return json({ ok: true, project_ref: Deno.env.get("SUPABASE_URL"), request_id: requestId }, 200, requestId);
    }

    if (action === "logs") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, AUDIT_LIMIT);
      const entries = auditLog.slice(-limit).reverse();
      record(200, `logs retornados (${entries.length} de ${auditLog.length})`);
      return json({ ok: true, total: auditLog.length, entries, request_id: requestId }, 200, requestId);
    }

    if (action === "credentials") {
      // Auditado explicitamente: ação sensível, valores nunca são logados.
      record(200, "credentials entregues (ação sensível)");
      return json(
        {
          url: Deno.env.get("SUPABASE_URL"),
          service_role: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
          db_url: Deno.env.get("SUPABASE_DB_URL"),
          request_id: requestId,
        },
        200,
        requestId,
      );
    }

    record(400, `unknown_action: ${action}`);
    return json({ error: "unknown_action", action, request_id: requestId }, 400, requestId);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    record(500, `exceção: ${message}`);
    return json({ error: message, request_id: requestId }, 500, requestId);
  }
});
