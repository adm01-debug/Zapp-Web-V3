// Evolution Chatbot IA v2.0 (2026-04-26)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { callOpenAICompatible, withRetry } from "../_shared/ai-providers.ts";
import { requireServiceRoleOrCron } from "../_shared/auth.ts";
import { getSecret } from "../_shared/vault.ts";

import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
const SUPABASE_URL = (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'))!;
const SUPABASE_SERVICE_ROLE_KEY = (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, db: { schema: "zapp" } });

interface ChatMessage { role: "user" | "assistant" | "system"; content: string; }
const BASE_SYSTEM_PROMPT = `Você é a assistente virtual da Promo Brindes, especializada em brindes personalizados. Personalidade amigável, profissional, prestativa. Pode: orçamentos, info produtos (canetas, chaveiros, camisetas, bonés, canecas), prazos (10-15 dias úteis), pagamento (PIX, boleto, cartão 3x), personalização (silk, bordado, transfer, laser). Transfere humano: reclamações, financeiro complexo, dúvida. Português BR. Mensagens curtas (WhatsApp).`;
const STOP_WORDS = ["parar bot","desativar bot","sair do bot","falar com humano","humano agora","atendente humano","quero atendente","chamar atendente"];

// Vault-resolved AI keys — fetched on first call and cached in-process
let _openAiKey: string | null | undefined;
let _anthropicKey: string | null | undefined;

async function getOpenAIKey(): Promise<string | null> {
  if (_openAiKey === undefined) _openAiKey = await getSecret("openai_api_key");
  return _openAiKey;
}

async function getAnthropicKey(): Promise<string | null> {
  if (_anthropicKey === undefined) _anthropicKey = await getSecret("anthropic_api_key");
  return _anthropicKey;
}

async function callOpenAI(messages: ChatMessage[], sysPrompt: string): Promise<string> {
  const apiKey = await getOpenAIKey();
  if (!apiKey) return "[IA não configurada]";
  try {
    const resp = await withRetry(() => callOpenAICompatible({
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKey,
      messages: [{ role: "system", content: sysPrompt }, ...messages],
      model: "gpt-4o-mini",
      config: { max_tokens: 500, temperature: 0.7 },
    }));
    if (!resp.ok) return "Desculpe, problema interno. Vou chamar um atendente humano.";
    return (await resp.json()).choices?.[0]?.message?.content || "Não consegui processar.";
  } catch { return "Desculpe, problema interno. Vou chamar um atendente humano."; }
}

async function callAnthropic(messages: ChatMessage[], sysPrompt: string): Promise<string> {
  const apiKey = await getAnthropicKey();
  if (!apiKey) return "[IA não configurada]";
  try {
    const resp = await withRetry(() => fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", max_tokens: 500, system: sysPrompt,
        messages: messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }))
      }),
      signal: AbortSignal.timeout(30000),
    }));
    if (!resp.ok) return "Desculpe, problema interno. Vou chamar um atendente humano.";
    return (await resp.json()).content?.[0]?.text || "Não consegui processar.";
  } catch { return "Desculpe, problema interno. Vou chamar um atendente humano."; }
}

async function getHistory(remoteJid: string, limit = 10) {
  const { data } = await supabase.from("evolution_messages").select("content, from_me, created_at").eq("remote_jid", remoteJid).order("created_at", { ascending: false }).limit(limit);
  return (data || []).reverse().map((m: { from_me: boolean; content: string | null }) => ({ role: (m.from_me ? "assistant" : "user") as "assistant" | "user", content: m.content || "" })).filter((m: ChatMessage) => m.content);
}

async function getContact(remoteJid: string) {
  const { data: c } = await supabase.from("evolution_contacts").select("*").eq("remote_jid", remoteJid).maybeSingle();
  if (!c) return null;
  const { data: deals } = await supabase.from("evolution_deals").select("title, stage, value").eq("contact_id", c.id).order("updated_at", { ascending: false }).limit(3);
  return { ...c, deals: deals || [] };
}

async function checkRateLimit(remoteJid: string) {
  const since = new Date(Date.now() - 3600000).toISOString();
  const { count, error } = await supabase.from("evolution_chatbot_responses").select("*", { count: "exact", head: true }).eq("remote_jid", remoteJid).gte("created_at", since);
  // Fail open on DB error — a transient failure must not block every user (DoS).
  if (error) {
    console.warn('[evolution-chatbot] rate limit DB check failed — failing open', error.message);
    return { ok: true, remaining: 30 };
  }
  return { ok: (30 - (count || 0)) > 0, remaining: 30 - (count || 0) };
}

function containsStopWord(t: string) { return STOP_WORDS.some(w => t.toLowerCase().includes(w)); }

function getFallback(msg: string): string {
  const l = msg.toLowerCase();
  if (l.match(/oi|olá|bom dia|boa tarde|boa noite/)) return "👋 Olá! Bem-vindo à Promo Brindes!\n\nPosso ajudar com:\n• Orçamentos\n• Produtos\n• Prazos\n• Pagamento\n\nComo posso ajudar?";
  if (l.match(/orçamento|preço|quanto custa|valor/)) return "📝 Para orçamento, preciso de:\n\n1⃣ Produto\n2⃣ Quantidade\n3⃣ Personalização\n\nMe passa esses dados?";
  if (l.match(/prazo|entrega|quando chega/)) return "🚚 Prazos:\n\n• Produção: 10-15 dias úteis\n• Frete: varia por região\n\nMe informe seu CEP!";
  if (l.match(/pagamento|pagar|parcela/)) return "💳 Pagamento:\n\n• PIX (5% desconto)\n• Boleto\n• Cartão 3x sem juros\n\n50% aprovação + 50% entrega";
  if (l.match(/atendente|humano|pessoa|falar com/)) return "👤 Vou transferir você para um atendente.\n\nAguarde. Atendimento: Seg-Sex, 8h-18h.";
  return "🤔 Não entendi muito bem.\n\nPosso ajudar com:\n• Orçamentos\n• Produtos\n• Prazos\n• Pagamento";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleCorsPreflight(req);

  // Only POST is supported for chatbot requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
  }

  // Internal endpoint — require service role or cron secret
  const authErr = requireServiceRoleOrCron(req);
  if (authErr) return authErr;

  try {
    let body: Record<string, unknown>;
    try { body = await req.json() as Record<string, unknown>; } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }); }

    const { remote_jid, message, use_ai = true } = body;

    // Validate that remote_jid and message are non-empty strings
    if (typeof remote_jid !== "string" || !remote_jid.trim()) {
      return new Response(JSON.stringify({ error: "remote_jid deve ser uma string não vazia" }), { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
    }
    if (typeof message !== "string" || !message.trim()) {
      return new Response(JSON.stringify({ error: "message deve ser uma string não vazia" }), { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
    }

    if (containsStopWord(message)) {
      const r = "👤 Entendi! Vou transferir você para um atendente humano.";
      await supabase.from("evolution_chatbot_responses").insert({ remote_jid, response_text: r, model_used: "stop_word" }).then(()=>{},()=>{});
      return new Response(JSON.stringify({ success: true, response: r, needs_human: true, model_used: "stop_word" }), { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
    }
    const rl = await checkRateLimit(remote_jid);
    if (!rl.ok) {
      const r = "💬 Muitas mensagens recentes. Vou transferir para humano.";
      return new Response(JSON.stringify({ success: true, response: r, needs_human: true, rate_limited: true }), { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
    }
    const openAiKey = await getOpenAIKey();
    const anthropicKey = await getAnthropicKey();
    let response: string, modelUsed = "fallback";
    if (use_ai && (openAiKey || anthropicKey)) {
      const c = await getContact(remote_jid);
      let sys = BASE_SYSTEM_PROMPT;
      if (c) {
        const fn = (c.full_name || c.push_name || "").split(" ")[0];
        const di = c.deals?.length ? `\nDeals: ${c.deals.map((d:any)=>`"${d.title}" (${d.stage}, R$${d.value||0})`).join(", ")}` : "";
        sys = `${BASE_SYSTEM_PROMPT}\n\nContato: ${fn || "?"}${di}`;
      }
      const hist = await getHistory(remote_jid);
      hist.push({ role: "user", content: message });
      if (openAiKey) { response = await callOpenAI(hist, sys); modelUsed = "gpt-4o-mini"; }
      else { response = await callAnthropic(hist, sys); modelUsed = "claude-haiku-4-5"; }
    } else { response = getFallback(message); }
    await supabase.from("evolution_chatbot_responses").insert({ remote_jid, response_text: response, model_used: modelUsed }).then(()=>{},()=>{});
    const needsHuman = response.toLowerCase().includes("transferir") || response.toLowerCase().includes("atendente") || message.toLowerCase().includes("reclama");
    return new Response(JSON.stringify({ success: true, response, needs_human: needsHuman, model_used: modelUsed, rate_limit_remaining: rl.remaining }), { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[evolution-chatbot] unhandled error:", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
  }
});
