// Teste de conexão por modo (oficial / não-oficial).
// Verifica:
//  - credenciais do provedor (Evolution ou Meta Cloud)
//  - permissões/escopos (instância autenticada / phone number alcançável)
//  - entrega de webhook (POST sintético assinado contra a URL pública correta)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/validation.ts";

type Mode = "official" | "unofficial";
type Status = "pass" | "warn" | "fail" | "skip";
interface Check {
  id: string;
  label: string;
  status: Status;
  detail?: string;
  durationMs?: number;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PROJECT_FUNCTIONS_BASE = SUPABASE_URL.replace(".supabase.co", ".functions.supabase.co");

const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

async function timed<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: string; ms: number }> {
  const t0 = Date.now();
  try {
    const value = await fn();
    return { value, ms: Date.now() - t0 };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 };
  }
}

async function hmacSha256Hex(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ==================== Modo NÃO-OFICIAL (Evolution) ====================
async function runEvolutionChecks(): Promise<Check[]> {
  const checks: Check[] = [];
  const url = (Deno.env.get("EVOLUTION_API_URL") ?? "").replace(/\/+$/, "");
  const key = Deno.env.get("EVOLUTION_API_KEY") ?? "";
  const instance = Deno.env.get("EVOLUTION_DEFAULT_INSTANCE") ?? "wpp2";
  const webhookSecret =
    Deno.env.get("EVOLUTION_WEBHOOK_SECRET") ??
    (Deno.env.get("EVOLUTION_WEBHOOK_SECRETS") ?? "").split(",").map((s) => s.trim()).filter(Boolean)[0] ??
    Deno.env.get("WEBHOOK_SECRET") ??
    "";

  // 1. Credenciais presentes
  checks.push({
    id: "evo.credentials",
    label: "Credenciais Evolution (URL + API Key)",
    status: url && key ? "pass" : "fail",
    detail: url && key ? `Endpoint: ${url}` : "Defina EVOLUTION_API_URL e EVOLUTION_API_KEY nos secrets.",
  });
  if (!url || !key) return appendWebhookCheck(checks, "unofficial", webhookSecret);

  // 2. Provider alcançável
  const reach = await timed(async () => {
    const r = await fetch(`${url}/`, { headers: { apikey: key } });
    return { status: r.status, body: (await r.text()).slice(0, 120) };
  });
  checks.push({
    id: "evo.reachable",
    label: "Provedor Evolution alcançável",
    status: reach.value && reach.value.status < 500 ? "pass" : "fail",
    detail: reach.error ?? `HTTP ${reach.value?.status}`,
    durationMs: reach.ms,
  });

  // 3. Instância autenticada (connectionState)
  const conn = await timed(async () => {
    const r = await fetch(`${url}/instance/connectionState/${encodeURIComponent(instance)}`, {
      headers: { apikey: key },
    });
    const txt = await r.text();
    let parsed: any = null;
    try { parsed = JSON.parse(txt); } catch { /* keep raw */ }
    return { status: r.status, parsed, raw: txt.slice(0, 200) };
  });
  const state =
    conn.value?.parsed?.instance?.state ??
    conn.value?.parsed?.state ??
    conn.value?.parsed?.status ??
    null;
  checks.push({
    id: "evo.instance",
    label: `Instância "${instance}" autenticada`,
    status: state === "open" ? "pass" : conn.value?.status === 200 ? "warn" : "fail",
    detail: conn.error ?? `state=${state ?? "desconhecido"} (HTTP ${conn.value?.status})`,
    durationMs: conn.ms,
  });

  // 4. Webhook configurado no provedor
  const wh = await timed(async () => {
    const r = await fetch(`${url}/webhook/find/${encodeURIComponent(instance)}`, {
      headers: { apikey: key },
    });
    const txt = await r.text();
    let parsed: any = null;
    try { parsed = JSON.parse(txt); } catch { /* keep raw */ }
    return { status: r.status, parsed };
  });
  const expectedWebhook = `${PROJECT_FUNCTIONS_BASE}/evolution-webhook`;
  const configuredUrl: string = wh.value?.parsed?.url ?? wh.value?.parsed?.webhook?.url ?? "";
  const enabled: boolean =
    wh.value?.parsed?.enabled ?? wh.value?.parsed?.webhook?.enabled ?? false;
  const matchesUrl = configuredUrl.includes("/evolution-webhook");
  checks.push({
    id: "evo.webhook.config",
    label: "Webhook configurado na Evolution",
    status: matchesUrl && enabled ? "pass" : matchesUrl ? "warn" : "fail",
    detail: configuredUrl
      ? `${enabled ? "Ativo" : "Desativado"} → ${configuredUrl}${matchesUrl ? "" : ` (esperado: ${expectedWebhook})`}`
      : "Nenhum webhook configurado para esta instância.",
    durationMs: wh.ms,
  });

  return appendWebhookCheck(checks, "unofficial", webhookSecret);
}

// ==================== Modo OFICIAL (Meta Cloud API) ====================
async function runCloudChecks(): Promise<Check[]> {
  const checks: Check[] = [];
  const phoneId = Deno.env.get("WHATSAPP_CLOUD_PHONE_NUMBER_ID") ?? "";
  const token = Deno.env.get("WHATSAPP_CLOUD_ACCESS_TOKEN") ?? "";
  const verifyToken = Deno.env.get("WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN") ?? "";
  const appSecret = Deno.env.get("WHATSAPP_CLOUD_APP_SECRET") ?? "";
  const graphVersion = "v21.0";

  // 1. Credenciais presentes
  checks.push({
    id: "cloud.credentials",
    label: "Credenciais Meta (Phone Number ID + Access Token)",
    status: phoneId && token ? "pass" : "fail",
    detail: phoneId && token
      ? `Phone Number ID: ${phoneId}`
      : "Defina WHATSAPP_CLOUD_PHONE_NUMBER_ID e WHATSAPP_CLOUD_ACCESS_TOKEN.",
  });
  if (!phoneId || !token) {
    checks.push({
      id: "cloud.permissions", label: "Permissões na Graph API", status: "skip",
      detail: "Aguardando credenciais.",
    });
    return appendCloudWebhookChecks(checks, verifyToken, appSecret);
  }

  // 2. Phone Number alcançável + escopo whatsapp_business_messaging
  const meta = await timed(async () => {
    const r = await fetch(
      `https://graph.facebook.com/${graphVersion}/${phoneId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const txt = await r.text();
    let parsed: any = null;
    try { parsed = JSON.parse(txt); } catch { /* keep raw */ }
    return { status: r.status, parsed, raw: txt.slice(0, 250) };
  });
  if (meta.error || !meta.value) {
    checks.push({
      id: "cloud.permissions", label: "Acesso ao Phone Number", status: "fail",
      detail: meta.error ?? "Falha ao consultar Graph API",
      durationMs: meta.ms,
    });
  } else if (meta.value.status >= 400) {
    const errMsg = meta.value.parsed?.error?.message ?? meta.value.raw;
    checks.push({
      id: "cloud.permissions", label: "Acesso ao Phone Number", status: "fail",
      detail: `HTTP ${meta.value.status}: ${errMsg}`,
      durationMs: meta.ms,
    });
  } else {
    const display = meta.value.parsed?.display_phone_number ?? "?";
    const name = meta.value.parsed?.verified_name ?? "?";
    const quality = meta.value.parsed?.quality_rating ?? "?";
    checks.push({
      id: "cloud.permissions", label: "Acesso ao Phone Number", status: "pass",
      detail: `${display} (${name}) — qualidade ${quality}`,
      durationMs: meta.ms,
    });
  }

  return appendCloudWebhookChecks(checks, verifyToken, appSecret);
}

// ==================== Webhook delivery ====================
function appendCloudWebhookChecks(checks: Check[], verifyToken: string, appSecret: string): Promise<Check[]> {
  const baseChecks: Promise<Check>[] = [];

  // Verify token configurado
  checks.push({
    id: "cloud.webhook.verify_token",
    label: "Verify token configurado",
    status: verifyToken ? "pass" : "fail",
    detail: verifyToken
      ? "WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN definido"
      : "Defina WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN para o handshake da Meta.",
  });

  // App secret (assinatura HMAC)
  checks.push({
    id: "cloud.webhook.app_secret",
    label: "App Secret para validação de assinatura",
    status: appSecret ? "pass" : "warn",
    detail: appSecret
      ? "Validação X-Hub-Signature-256 ativa"
      : "Sem WHATSAPP_CLOUD_APP_SECRET — assinaturas serão aceitas sem verificação.",
  });

  // 1. Handshake GET
  baseChecks.push((async (): Promise<Check> => {
    if (!verifyToken) {
      return { id: "cloud.webhook.handshake", label: "Handshake GET (Meta verification)", status: "skip", detail: "Sem verify token." };
    }
    const challenge = `lov-${Date.now()}`;
    const u = new URL(`${PROJECT_FUNCTIONS_BASE}/whatsapp-cloud-webhook`);
    u.searchParams.set("hub.mode", "subscribe");
    u.searchParams.set("hub.verify_token", verifyToken);
    u.searchParams.set("hub.challenge", challenge);
    const t0 = Date.now();
    const r = await fetch(u.toString());
    const body = await r.text();
    return {
      id: "cloud.webhook.handshake",
      label: "Handshake GET (Meta verification)",
      status: r.status === 200 && body === challenge ? "pass" : "fail",
      detail: `HTTP ${r.status} · echo=${body.slice(0, 32) === challenge ? "ok" : "mismatch"}`,
      durationMs: Date.now() - t0,
    };
  })());

  // 2. POST sintético assinado
  baseChecks.push((async (): Promise<Check> => {
    const payload = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: "lov-test", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: {}, statuses: [{ id: `lov-test-${Date.now()}`, status: "delivered", timestamp: `${Math.floor(Date.now() / 1000)}` }] } }] }],
    });
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-lovable-test": "1",
    };
    if (appSecret) {
      headers["x-hub-signature-256"] = `sha256=${await hmacSha256Hex(payload, appSecret)}`;
    }
    if (ANON_KEY) headers["Authorization"] = `Bearer ${ANON_KEY}`;
    const t0 = Date.now();
    const r = await fetch(`${PROJECT_FUNCTIONS_BASE}/whatsapp-cloud-webhook`, {
      method: "POST", headers, body: payload,
    });
    const body = await r.text();
    return {
      id: "cloud.webhook.delivery",
      label: "Entrega POST assinada",
      status: r.status === 200 ? "pass" : "fail",
      detail: `HTTP ${r.status} — ${body.slice(0, 160)}`,
      durationMs: Date.now() - t0,
    };
  })());

  return Promise.all(baseChecks).then((res) => [...checks, ...res]);
}

async function appendWebhookCheck(checks: Check[], _mode: Mode, secret: string): Promise<Check[]> {
  // Para Evolution: testa entrega POST assinada com x-evolution-signature
  checks.push({
    id: "evo.webhook.secret",
    label: "Secret de webhook configurado",
    status: secret ? "pass" : "warn",
    detail: secret
      ? "Validação HMAC ativa"
      : "Sem EVOLUTION_WEBHOOK_SECRET — webhook aceita eventos sem assinatura.",
  });

  const payload = JSON.stringify({
    event: "connection.update",
    instance: "lov-test",
    data: { state: "open", _lovableTest: true, ts: Date.now() },
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-lovable-test": "1",
  };
  if (secret) {
    headers["x-evolution-signature"] = `sha256=${await hmacSha256Hex(payload, secret)}`;
  }
  if (ANON_KEY) headers["Authorization"] = `Bearer ${ANON_KEY}`;

  const t0 = Date.now();
  let res: Response | null = null;
  let body = "";
  try {
    res = await fetch(`${PROJECT_FUNCTIONS_BASE}/evolution-webhook`, {
      method: "POST", headers, body: payload,
    });
    body = (await res.text()).slice(0, 200);
  } catch (e) {
    checks.push({
      id: "evo.webhook.delivery",
      label: "Entrega POST assinada ao webhook",
      status: "fail",
      detail: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - t0,
    });
    return checks;
  }

  checks.push({
    id: "evo.webhook.delivery",
    label: "Entrega POST assinada ao webhook",
    status: res.status === 200 ? "pass" : res.status === 503 ? "warn" : "fail",
    detail: `HTTP ${res.status} — ${body}`,
    durationMs: Date.now() - t0,
  });
  return checks;
}

// ==================== HTTP entry ====================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: corsHeaders });
  }

  // Auth: precisa de usuário logado (admin idealmente). Validamos JWT.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let mode: Mode = "unofficial";
  try {
    const body = await req.json();
    if (body?.mode === "official" || body?.mode === "unofficial") mode = body.mode;
  } catch { /* default */ }

  const startedAt = Date.now();
  const checks = mode === "official" ? await runCloudChecks() : await runEvolutionChecks();
  const summary = checks.reduce(
    (acc, c) => { acc[c.status] = (acc[c.status] ?? 0) + 1; return acc; },
    {} as Record<Status, number>,
  );
  const overall: Status = checks.some((c) => c.status === "fail")
    ? "fail"
    : checks.some((c) => c.status === "warn") ? "warn" : "pass";

  return new Response(
    JSON.stringify({
      mode,
      overall,
      summary,
      durationMs: Date.now() - startedAt,
      checks,
      webhookUrl: mode === "official"
        ? `${PROJECT_FUNCTIONS_BASE}/whatsapp-cloud-webhook`
        : `${PROJECT_FUNCTIONS_BASE}/evolution-webhook`,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
