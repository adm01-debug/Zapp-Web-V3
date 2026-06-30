// fetch-whatsapp-avatar
// Contrato (frontend src/features/contacts/hooks/useContactAvatarFetch.ts):
//   IN : { phone: string }
//   OUT: { avatar_url: string | null }
//
// Versão on-demand (1 contato) da lógica de batch-fetch-avatars. Resolve uma
// instância Evolution conectada, busca a foto de perfil, persiste no Storage
// ('avatars') para não expirar e devolve a URL pública.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  handleCors,
  errorResponse,
  jsonResponse,
  requireEnv,
  Logger,
  checkRateLimit,
  getClientIP,
} from "../_shared/validation.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("fetch-whatsapp-avatar");

  try {
    const ip = getClientIP(req);
    const rl = checkRateLimit(`avatar:${ip}`, 30, 60_000);
    if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    const body = await req.json().catch(() => null);
    const phoneRaw = body?.phone;
    if (!phoneRaw || typeof phoneRaw !== "string") {
      return errorResponse("Campo 'phone' é obrigatório.", 400, req);
    }
    const phone = phoneRaw.replace(/\D/g, "");
    if (!phone) return errorResponse("Telefone inválido.", 400, req);

    const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
    const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");
    if (!evolutionUrl || !evolutionKey) {
      return jsonResponse({ avatar_url: null, error: "EVOLUTION_NOT_CONFIGURED" }, 200, req);
    }

    // 1) Tenta a conexão específica do contato; senão usa a primeira conectada.
    let instanceId: string | null = null;
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, whatsapp_connection_id")
      .or(`phone.eq.${phone},phone.eq.+${phone}`)
      .not("whatsapp_connection_id", "is", null)
      .limit(1)
      .maybeSingle();

    if (contact?.whatsapp_connection_id) {
      const { data: conn } = await supabase
        .from("whatsapp_connections")
        .select("instance_id")
        .eq("id", contact.whatsapp_connection_id)
        .eq("status", "connected")
        .maybeSingle();
      instanceId = conn?.instance_id ?? null;
    }
    if (!instanceId) {
      const { data: anyConn } = await supabase
        .from("whatsapp_connections")
        .select("instance_id")
        .eq("status", "connected")
        .limit(1)
        .maybeSingle();
      instanceId = anyConn?.instance_id ?? null;
    }
    if (!instanceId) {
      return jsonResponse({ avatar_url: null, error: "NO_ACTIVE_CONNECTION" }, 200, req);
    }

    // 2) Busca a URL da foto de perfil no Evolution.
    const baseUrl = evolutionUrl.replace(/\/+$/, "");
    const resp = await fetch(`${baseUrl}/chat/fetchProfilePictureUrl/${instanceId}`, {
      method: "POST",
      headers: { apikey: evolutionKey, "Content-Type": "application/json" },
      body: JSON.stringify({ number: phone }),
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      log.warn("Evolution fetchProfilePictureUrl failed", { status: resp.status });
      return jsonResponse({ avatar_url: null }, 200, req);
    }
    const result = await resp.json().catch(() => ({}));
    const picUrl: string | null = result?.profilePictureUrl || result?.picture || result?.url || null;
    if (!picUrl) return jsonResponse({ avatar_url: null }, 200, req);

    // 3) Persiste no Storage para evitar expiração das URLs do WhatsApp.
    try {
      const imgResp = await fetch(picUrl, { signal: AbortSignal.timeout(8000) });
      if (imgResp.ok) {
        const bytes = new Uint8Array(await imgResp.arrayBuffer());
        if (bytes.length >= 100) {
          const storagePath = `avatars/${phone}_${Date.now()}.jpg`;
          const { error: upErr } = await supabase.storage
            .from("avatars")
            .upload(storagePath, bytes, { contentType: "image/jpeg", cacheControl: "604800", upsert: true });
          if (!upErr) {
            const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(storagePath);
            log.done(200, { persisted: true });
            return jsonResponse({ avatar_url: urlData.publicUrl }, 200, req);
          }
        }
      }
    } catch (e) {
      log.warn("Avatar persistence failed; returning raw URL", { error: e instanceof Error ? e.message : String(e) });
    }

    // Fallback: devolve a URL bruta do Evolution (frontend faz cache de 30min).
    log.done(200, { persisted: false });
    return jsonResponse({ avatar_url: picUrl }, 200, req);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.error("Avatar fetch error", { error: msg });
    return errorResponse(msg, 500, req);
  }
});
