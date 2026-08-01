// Reporta presença (não valor!) dos secrets necessários para o modo OFICIAL.
// Usado pela tela /admin/settings/whatsapp-mode para sinalizar o que falta.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/validation.ts";

const SECRET_KEYS = [
  "WHATSAPP_CLOUD_PHONE_NUMBER_ID",
  "WHATSAPP_CLOUD_ACCESS_TOKEN",
  "WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN",
  "WHATSAPP_CLOUD_APP_SECRET",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: corsHeaders });
  }

  // Auth obrigatória — só admin/supervisor logado deve ver este status.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: u, error: uErr } = await supabase.auth.getUser();
  if (uErr || !u?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const status = SECRET_KEYS.map((name) => {
    const v = Deno.env.get(name) ?? "";
    return {
      name,
      configured: v.length > 0,
      // dica de tamanho ajuda admin a perceber valores absurdamente curtos
      length: v.length,
    };
  });

  return new Response(
    JSON.stringify({ secrets: status }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
