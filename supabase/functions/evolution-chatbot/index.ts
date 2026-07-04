// Evolution Chatbot IA v2.0 (2026-04-26)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, x-api-key", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const BASE_SYSTEM_PROMPT = `Você é a assistente virtual da Promo Brindes, especializada em brindes personalizados. Personalidade amigável, profissional, prestativa. Pode: orçamentos, info produtos (canetas, chaveiros, camisetas, bonés, canecas), prazos (10-15 dias úteis), pagamento (PIX, boleto, cartão 3x), personalização (silk, bordado, transfer, laser). Transfere humano: reclamações, financeiro complexo, dúvida. Português BR. Mensagens curtas (WhatsApp).`;
const STOP_WORDS = ["parar bot","desativar bot","sair do bot","falar com humano","humano agora","atendente humano","quero atendente","chamar atendente"];

async function callOpenAI(messages: any[], sysPrompt: string): Promise<string> {
  if (!OPENAI_API_KEY) return "[IA não configurada]";
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: sysPrompt }, ...messages], max_tokens: 500, temperature: 0.7 }),
      signal: AbortSignal.timeout(30000)
    });
    if (!r.ok) return "Desculpe, problema interno. Vou chamar um atendente humano.";
    return (await r.json()).choices?.[0]?.message?.content || "Não consegui processar.";
  } catch (e) { return "Desculpe, problema interno. Vou chamar um atendente humano."; }
}

async function callAnthropic(messages: any[], sysPrompt: string): Promise<string> {
  if (!ANTHROPIC_API_KEY) return "[IA não configurada]";
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 500, system: sysPrompt,
        messages: messages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })) }),
      signal: AbortSignal.timeout(30000)
    });
    if (!r.ok) return "Desculpe, problema interno. Vou chamar um atendente humano.";
    return (await r.json()).content?.[0]?.text || "Não consegui processar.";
  } catch (e) { return "Desculpe, problema interno. Vou chamar um atendente humano."; }
}

async function getHistory(remoteJid: string, limit = 10) {
  const { data } = await supabase.from("evolution_messages").select("content, from_me, created_at").eq("remote_jid", remoteJid).order("created_at", { ascending: false }).limit(limit);
  return (data || []).reverse().map(m => ({ role: m.from_me ? "assistant" : "user", content: m.content || "" })).filter(m => m.content);
}

async function getContact(remoteJid: string) {
  const { data: c } = await supabase.from("evolution_contacts").select("*").eq("remote_jid", remoteJid).maybeSingle();
  if (!c) return null;
  const { data: deals } = await supabase.from("evolution_deals").select("title, stage, value").eq("contact_id", c.id).order("updated_at", { ascending: false }).limit(3);
  return { ...c, deals: deals || [] };
}

async function checkRateLimit(remoteJid: string) {
  const since = new Date(Date.now() - 3600000).toISOString();
  const { count } = await supabase.from("evolution_chatbot_responses").select("*", { count: "exact", head: true }).eq("remote_jid", remoteJid).gte("created_at", since);
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { remote_jid, message, use_ai = true } = await req.json();
    if (!remote_jid || !message) return new Response(JSON.stringify({ error: "remote_jid e message obrigatórios" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (containsStopWord(message)) {
      const r = "👤 Entendi! Vou transferir você para um atendente humano.";
      await supabase.from("evolution_chatbot_responses").insert({ remote_jid, response_text: r, model_used: "stop_word" }).then(()=>{},()=>{});
      return new Response(JSON.stringify({ success: true, response: r, needs_human: true, model_used: "stop_word" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const rl = await checkRateLimit(remote_jid);
    if (!rl.ok) {
      const r = "💬 Muitas mensagens recentes. Vou transferir para humano.";
      return new Response(JSON.stringify({ success: true, response: r, needs_human: true, rate_limited: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    let response: string, modelUsed = "fallback";
    if (use_ai && (OPENAI_API_KEY || ANTHROPIC_API_KEY)) {
      const c = await getContact(remote_jid);
      let sys = BASE_SYSTEM_PROMPT;
      if (c) {
        const fn = (c.full_name || c.push_name || "").split(" ")[0];
        const di = c.deals?.length ? `\nDeals: ${c.deals.map((d:any)=>`"${d.title}" (${d.stage}, R$${d.value||0})`).join(", ")}` : "";
        sys = `${BASE_SYSTEM_PROMPT}\n\nContato: ${fn || "?"}${di}`;
      }
      const hist = await getHistory(remote_jid);
      hist.push({ role: "user", content: message });
      if (OPENAI_API_KEY) { response = await callOpenAI(hist, sys); modelUsed = "gpt-4o-mini"; }
      else { response = await callAnthropic(hist, sys); modelUsed = "claude-haiku-4-5"; }
    } else { response = getFallback(message); }
    await supabase.from("evolution_chatbot_responses").insert({ remote_jid, response_text: response, model_used: modelUsed }).then(()=>{},()=>{});
    const needsHuman = response.toLowerCase().includes("transferir") || response.toLowerCase().includes("atendente") || message.toLowerCase().includes("reclama");
    return new Response(JSON.stringify({ success: true, response, needs_human: needsHuman, model_used: modelUsed, rate_limit_remaining: rl.remaining }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) { return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
});
