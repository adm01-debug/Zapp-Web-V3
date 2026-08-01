// Verifica o webhook oficial WhatsApp Cloud:
//  1) Faz handshake GET ?hub.mode=subscribe&hub.verify_token=... no próprio endpoint
//     comparando com WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN configurado nos secrets.
//  2) Reporta últimos pings registrados em whatsapp_cloud_webhook_pings (handshakes,
//     eventos recebidos, assinaturas inválidas) — útil para confirmar entrega real.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth obrigatória
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ error: "unauthorized" }, 401);

  const verifyTokenConfigured = VERIFY_TOKEN.length > 0;

  // ---- 1) Handshake real contra o próprio webhook ----
  const challenge = `lovable-verify-${crypto.randomUUID().slice(0, 8)}`;
  const webhookUrl = `${SUPABASE_URL}/functions/v1/whatsapp-cloud-webhook`;
  const handshakeUrl =
    `${webhookUrl}?hub.mode=subscribe` +
    `&hub.verify_token=${encodeURIComponent(VERIFY_TOKEN)}` +
    `&hub.challenge=${encodeURIComponent(challenge)}`;

  let handshake: {
    status: "pass" | "fail" | "skip";
    httpStatus?: number;
    echoMatches?: boolean;
    durationMs?: number;
    error?: string;
  };

  if (!verifyTokenConfigured) {
    handshake = {
      status: "skip",
      error: "WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN não está configurado nos secrets.",
    };
  } else {
    const t0 = performance.now();
    try {
      const r = await fetch(handshakeUrl, { method: "GET" });
      const text = await r.text();
      handshake = {
        status: r.ok && text === challenge ? "pass" : "fail",
        httpStatus: r.status,
        echoMatches: text === challenge,
        durationMs: Math.round(performance.now() - t0),
      };
    } catch (e) {
      handshake = {
        status: "fail",
        durationMs: Math.round(performance.now() - t0),
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // ---- 2) Atividade recente do webhook ----
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: pings } = await adminClient
    .from("whatsapp_cloud_webhook_pings")
    .select("kind, meta, created_at")
    .gte("created_at", since24h)
    .order("created_at", { ascending: false })
    .limit(50);

  const counts = { handshake: 0, event: 0, invalid_signature: 0, invalid_token: 0 };
  let lastEvent: string | null = null;
  let lastHandshake: string | null = null;
  for (const p of pings ?? []) {
    counts[p.kind as keyof typeof counts] = (counts[p.kind as keyof typeof counts] ?? 0) + 1;
    if (p.kind === "event" && !lastEvent) lastEvent = p.created_at;
    if (p.kind === "handshake" && !lastHandshake) lastHandshake = p.created_at;
  }

  const delivery = {
    status: lastEvent ? ("pass" as const) : ("warn" as const),
    lastEventAt: lastEvent,
    lastHandshakeAt: lastHandshake,
    counts24h: counts,
    message: lastEvent
      ? `Último evento recebido em ${lastEvent}.`
      : "Nenhum evento recebido nas últimas 24h. Envie uma mensagem de teste do número conectado para confirmar.",
    recent: (pings ?? []).slice(0, 10),
  };

  return json({
    verifyTokenConfigured,
    webhookUrl,
    handshake,
    delivery,
    checkedAt: new Date().toISOString(),
  });
});
