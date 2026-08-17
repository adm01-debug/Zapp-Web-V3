/**
 * warroom-monthly-test — teste mensal do pipeline de alerta Warroom.
 *
 * Contrato:
 *   - POST (qualquer outro método → 405; OPTIONS → 204)
 *   - Auth: Authorization: Bearer <JWT service_role>. O gateway (VERIFY_JWT)
 *     já validou a assinatura; aqui confere-se a claim role=service_role.
 *     Sem token / claim errada → 401 fail-closed.
 *   - Sem parâmetros de entrada: o body da requisição é IGNORADO
 *     (payload de saída é fixo — zero risco de injeção/reflexão).
 *   - Saída: POST https://n8n.atomicabr.com.br/webhook/warroom-alert
 *     com timeout 15s via AbortController.
 *   - Respostas:
 *       200 {"ok":true,"status":<http_status_do_webhook>}
 *       502 {"ok":false,"error":"webhook_fetch_failed","status":0}
 *       401 {"error":"Unauthorized"} / 405 {"error":"Method not allowed"}
 *
 * Self-contained: zero imports de _shared/ ou externos.
 * Sem logs de segredos: nunca loga token/header/payload de resposta.
 */
const WEBHOOK_URL = "https://n8n.atomicabr.com.br/webhook/warroom-alert";
const WEBHOOK_TIMEOUT_MS = 15_000;

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** Decodifica as claims de um JWT (sem verificar assinatura — o gateway já o fez). */
function decodeJwtClaims(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const b64 = padded.padEnd(Math.ceil(padded.length / 4) * 4, "=");
    const bin = atob(b64);
    const bytes = Uint8Array.from([...bin].map((c) => c.charCodeAt(0)));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  // ---- Auth: claim role === service_role (assinatura validada pelo gateway) ----
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const claims = token ? decodeJwtClaims(token) : null;
  if (!claims || claims.role !== "service_role") return json(401, { error: "Unauthorized" });

  // ---- Payload FIXO (body da requisição é descartado de propósito) ----
  const payload = {
    source: "warroom-monthly-test",
    entity: "warroom",
    alert_type: "warning",
    title: "[TESTE-MENSAL] Alerta programado",
    message: "Teste automatico mensal do pipeline de alerta.",
    ts: new Date().toISOString(),
  };

  // ---- POST no webhook com timeout/abort ----
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    await res.arrayBuffer().catch(() => {});
    console.log(`[warroom-monthly-test] webhook_status=${res.status}`);
    return json(200, { ok: true, status: res.status });
  } catch {
    console.log("[warroom-monthly-test] fetch_failed");
    return json(502, { ok: false, error: "webhook_fetch_failed", status: 0 });
  } finally {
    clearTimeout(timer);
  }
});
