/**
 * e2e-webhook-fixture — synthetic webhook driver for E2E parity tests.
 *
 * Sends synthetic webhook events to BOTH provider endpoints
 * (`evolution-webhook` and `whatsapp-cloud-webhook`) using server-side
 * signing so secrets never leave the edge runtime.
 *
 * Hard guard: every action requires a `runId` starting with `e2e-`.
 * All seeded rows use `e2e-` prefixed identifiers and the cleanup action
 * refuses to touch anything else.
 *
 * Auth: service-role JWT OR an admin user JWT (same pattern as e2e-fixtures).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const E2E_PREFIX = "e2e-";

type Action =
  | "seed-cloud-creds"
  | "send-evolution"
  | "send-cloud"
  | "cleanup";

interface RequestBody {
  action: Action;
  runId: string;
  /** For send-cloud: the phone_number_id seeded by `seed-cloud-creds`. */
  phoneNumberId?: string;
  /** Optional override for content / messageId — defaults to deterministic e2e values. */
  content?: string;
  messageId?: string;
  remotePhone?: string; // bare digits, e.g. 5511999990000
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function envOrThrow(key: string): string {
  const v = Deno.env.get(key);
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

async function authorize(req: Request): Promise<{ ok: boolean; reason?: string }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, reason: "missing-bearer" };
  const serviceKey = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");
  if (token === serviceKey) return { ok: true };
  const url = envOrThrow("SUPABASE_URL");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return { ok: false, reason: "invalid-jwt" };
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return { ok: false, reason: "not-admin" };
  return { ok: true };
}

function validateBody(raw: unknown): { ok: true; body: RequestBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "body must be JSON object" };
  const b = raw as Record<string, unknown>;
  const allowed: Action[] = ["seed-cloud-creds", "send-evolution", "send-cloud", "cleanup"];
  if (!allowed.includes(b.action as Action)) {
    return { ok: false, error: `action must be one of ${allowed.join(", ")}` };
  }
  if (typeof b.runId !== "string" || !b.runId.startsWith(E2E_PREFIX) || b.runId.length > 64) {
    return { ok: false, error: `runId must start with "${E2E_PREFIX}" and be <=64 chars` };
  }
  return { ok: true, body: b as unknown as RequestBody };
}

function lovableClient() {
  return createClient(envOrThrow("SUPABASE_URL"), envOrThrow("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

function externalClient() {
  return createClient(
    envOrThrow("EXTERNAL_SUPABASE_URL"),
    envOrThrow("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
}

// ------------------------------------------------------------------
// HMAC helpers (sha256 hex over raw body)
// ------------------------------------------------------------------
async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ------------------------------------------------------------------
// Action: seed-cloud-creds
//   Creates a temporary whatsapp_connections + whatsapp_official_credentials
//   row keyed by phone_number_id = `e2e-phone-<runId>`. Returns the
//   phone_number_id for subsequent send-cloud calls.
// ------------------------------------------------------------------
async function seedCloudCreds(runId: string) {
  const supabase = lovableClient();
  const phoneNumberId = `${E2E_PREFIX}phone-${runId}`;
  const appSecret = `${E2E_PREFIX}secret-${crypto.randomUUID()}`;
  const verifyToken = `${E2E_PREFIX}verify-${crypto.randomUUID()}`;

  // Connection (parent FK)
  const { data: conn, error: connErr } = await supabase
    .from("whatsapp_connections")
    .insert({
      name: `${E2E_PREFIX}conn-${runId}`,
      phone_number: `+${phoneNumberId.replace(/\D/g, "0").slice(-10) || "0000000000"}`,
      api_type: "official",
      status: "disconnected",
      metadata: { e2e: true, runId },
    })
    .select("id")
    .single();
  if (connErr) throw new Error(`whatsapp_connections insert: ${connErr.message}`);

  const { error: credErr } = await supabase
    .from("whatsapp_official_credentials")
    .insert({
      connection_id: conn.id,
      phone_number_id: phoneNumberId,
      access_token: `${E2E_PREFIX}token-${crypto.randomUUID()}`,
      app_secret: appSecret,
      verify_token: verifyToken,
      graph_api_version: "v21.0",
    });
  if (credErr) {
    // Roll back connection so we don't leak FK rows on failure.
    await supabase.from("whatsapp_connections").delete().eq("id", conn.id);
    throw new Error(`whatsapp_official_credentials insert: ${credErr.message}`);
  }

  return { phoneNumberId, connectionId: conn.id };
}

// ------------------------------------------------------------------
// Action: send-evolution
//   Builds a messages.upsert payload, signs with EVOLUTION_WEBHOOK_SECRET,
//   POSTs to /functions/v1/evolution-webhook, returns response status +
//   normalized remote_jid + messageId for the test to poll.
// ------------------------------------------------------------------
async function sendEvolution(runId: string, body: RequestBody) {
  const supabaseUrl = envOrThrow("SUPABASE_URL");
  const secret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET")
    ?? Deno.env.get("WEBHOOK_SECRET")
    ?? "";

  const remotePhone = body.remotePhone ?? `5511${runId.slice(-9).padStart(9, "0").replace(/[^0-9]/g, "0")}`;
  const remoteJid = `${remotePhone}@s.whatsapp.net`;
  const messageId = body.messageId ?? `${E2E_PREFIX}wa-${runId}-${crypto.randomUUID()}`;
  const content = body.content ?? `e2e parity ping ${runId}`;
  const instanceName = `${E2E_PREFIX}${runId}`;

  const payload = {
    event: "messages.upsert",
    instance: instanceName,
    data: {
      key: { remoteJid, fromMe: false, id: messageId },
      pushName: `${E2E_PREFIX}name-${runId}`,
      message: { conversation: content },
      messageType: "conversation",
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  };
  const raw = JSON.stringify(payload);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-evolution-instance": instanceName,
  };
  if (secret) {
    const sig = await hmacSha256Hex(secret, raw);
    headers["x-hub-signature-256"] = `sha256=${sig}`;
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/evolution-webhook`, {
    method: "POST",
    headers,
    body: raw,
  });
  const text = await res.text();
  return {
    provider: "evolution",
    status: res.status,
    response: safeJson(text),
    remoteJid,
    messageId,
    instanceName,
    content,
  };
}

// ------------------------------------------------------------------
// Action: send-cloud
//   Builds a Meta whatsapp_business_account payload, signs with the
//   seeded credential's app_secret, POSTs to /functions/v1/whatsapp-cloud-webhook.
// ------------------------------------------------------------------
async function sendCloud(runId: string, body: RequestBody) {
  if (!body.phoneNumberId || !body.phoneNumberId.startsWith(`${E2E_PREFIX}phone-`)) {
    throw new Error("phoneNumberId must be the value returned by seed-cloud-creds");
  }
  const supabase = lovableClient();
  const { data: cred, error } = await supabase
    .from("whatsapp_official_credentials")
    .select("app_secret, connection_id, phone_number_id")
    .eq("phone_number_id", body.phoneNumberId)
    .maybeSingle();
  if (error || !cred) throw new Error(`credentials not found for ${body.phoneNumberId}`);

  const supabaseUrl = envOrThrow("SUPABASE_URL");
  const remotePhone = body.remotePhone ?? `5511${runId.slice(-9).padStart(9, "0").replace(/[^0-9]/g, "0")}`;
  const remoteJid = `${remotePhone}@s.whatsapp.net`;
  const messageId = body.messageId ?? `${E2E_PREFIX}wamid-${runId}-${crypto.randomUUID()}`;
  const content = body.content ?? `e2e parity ping ${runId}`;

  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: `${E2E_PREFIX}waba-${runId}`,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: remotePhone,
                phone_number_id: body.phoneNumberId,
              },
              contacts: [
                { wa_id: remotePhone, profile: { name: `${E2E_PREFIX}name-${runId}` } },
              ],
              messages: [
                {
                  id: messageId,
                  from: remotePhone,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: content },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const raw = JSON.stringify(payload);
  const sig = await hmacSha256Hex(cred.app_secret as string, raw);

  const res = await fetch(`${supabaseUrl}/functions/v1/whatsapp-cloud-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": `sha256=${sig}`,
    },
    body: raw,
  });
  const text = await res.text();
  return {
    provider: "cloud",
    status: res.status,
    response: safeJson(text),
    remoteJid,
    messageId,
    instanceName: `official_${cred.connection_id}`,
    content,
  };
}

// ------------------------------------------------------------------
// Action: cleanup
//   Removes the seeded creds + connection for this runId AND any
//   evolution_messages / evolution_contacts rows whose remote_jid or
//   instance_name carry the e2e prefix for this run.
// ------------------------------------------------------------------
async function cleanup(runId: string) {
  const supabase = lovableClient();
  const ext = externalClient();
  const result: Record<string, unknown> = { runId };

  // 1. Delete external messages + contacts for this runId pattern.
  const phoneSuffix = `5511${runId.slice(-9).padStart(9, "0").replace(/[^0-9]/g, "0")}`;
  const remoteJidLike = `${phoneSuffix}@s.whatsapp.net`;
  const instLike = `${E2E_PREFIX}${runId}`;

  const { data: delMsg, error: delMsgErr } = await ext
    .from("evolution_messages")
    .delete()
    .or(`remote_jid.eq.${remoteJidLike},instance_name.like.${instLike}%`)
    .select("id");
  if (delMsgErr) result.messages_error = delMsgErr.message;
  else result.messages_deleted = delMsg?.length ?? 0;

  const { data: delCon, error: delConErr } = await ext
    .from("evolution_contacts")
    .delete()
    .or(`remote_jid.eq.${remoteJidLike},instance_name.like.${instLike}%`)
    .select("id");
  if (delConErr) result.contacts_error = delConErr.message;
  else result.contacts_deleted = delCon?.length ?? 0;

  // 2. Delete creds (cascade on connection_id will not fire because
  // creds reference connection, not the other way around — delete creds
  // first, then the connection).
  const phoneNumberId = `${E2E_PREFIX}phone-${runId}`;
  await supabase
    .from("whatsapp_official_credentials")
    .delete()
    .eq("phone_number_id", phoneNumberId);
  const { data: delConn } = await supabase
    .from("whatsapp_connections")
    .delete()
    .eq("name", `${E2E_PREFIX}conn-${runId}`)
    .select("id");
  result.connections_deleted = delConn?.length ?? 0;

  return result;
}

function safeJson(text: string) {
  try { return JSON.parse(text); } catch { return text.slice(0, 500); }
}

// ------------------------------------------------------------------
// Handler
// ------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method-not-allowed" });

  const authz = await authorize(req);
  if (!authz.ok) return json(401, { error: "unauthorized", reason: authz.reason });

  let raw: unknown;
  try { raw = await req.json(); } catch { return json(400, { error: "invalid-json" }); }
  const parsed = validateBody(raw);
  if (!parsed.ok) return json(400, { error: parsed.error });
  const body = parsed.body;

  try {
    switch (body.action) {
      case "seed-cloud-creds":
        return json(200, await seedCloudCreds(body.runId));
      case "send-evolution":
        return json(200, await sendEvolution(body.runId, body));
      case "send-cloud":
        return json(200, await sendCloud(body.runId, body));
      case "cleanup":
        return json(200, await cleanup(body.runId));
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(500, { error: "fixture-op-failed", message: msg });
  }
});
