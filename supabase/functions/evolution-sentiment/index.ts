// Evolution Sentiment Analyzer v2.0
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { requireServiceRoleOrCron } from "../_shared/auth.ts";
import { getSecret } from "../_shared/vault.ts";

import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
const supabase = createClient((Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'))!, (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!, { auth: { persistSession: false } });
interface SentimentResult {
  sentiment: string;
  score: number;
  emotions?: Record<string, number>;
  intent: string;
  urgency: string;
  keywords: string[];
  summary?: string;
}

// Vault-resolved OPENAI_API_KEY — fetched lazily on first use
let _openAiKey: string | null | undefined;
async function getOpenAIKey(): Promise<string | null> {
  if (_openAiKey === undefined) _openAiKey = await getSecret("openai_api_key");
  return _openAiKey;
}

function safeParseJson(raw: string): SentimentResult | null {
  try { return JSON.parse(raw) as SentimentResult; } catch {}
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) try { return JSON.parse(m[0]) as SentimentResult; } catch {}
  try { return JSON.parse(raw.replace(/```json?|```/g, "").trim()) as SentimentResult; } catch {}
  return null;
}

async function analyzeRule(text: string): Promise<SentimentResult> {
  const { data } = await supabase.rpc("fn_analyze_sentiment", { p_text: text });
  return (data?.[0] as SentimentResult) || { sentiment: "neutral", score: 0, intent: "geral", urgency: "low", keywords: [] };
}

async function analyzeAI(text: string): Promise<SentimentResult> {
  const openAiKey = await getOpenAIKey();
  if (!openAiKey) return analyzeRule(text);
  const prompt = `Analise o sentimento. Mensagem: "${text.slice(0, 1500)}"\nResponda APENAS JSON:\n{"sentiment":"positive|negative|neutral|mixed","score":-1..1,"emotions":{"joy":0-1,"anger":0-1,"sadness":0-1,"fear":0-1,"surprise":0-1},"intent":"pergunta|reclamacao|elogio|pedido_orcamento|acompanhamento|geral","urgency":"low|medium|high|critical","keywords":[...],"summary":"..."}`;
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Authorization": `Bearer ${openAiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }], max_tokens: 300, temperature: 0.3, response_format: { type: "json_object" } }), signal: AbortSignal.timeout(30000) });
    if (!r.ok) return analyzeRule(text);
    return safeParseJson((await r.json()).choices?.[0]?.message?.content || "{}") || analyzeRule(text);
  } catch { return analyzeRule(text); }
}

async function saveAnalysis(remoteJid: string, msgId: string | null, text: string, a: SentimentResult) {
  const { data: c } = await supabase.from("evolution_contacts").select("id").eq("remote_jid", remoteJid).maybeSingle();
  const { data: cv } = await supabase.from("evolution_conversations").select("id").eq("remote_jid", remoteJid).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const sV = ["positive","negative","neutral","mixed"].includes(a.sentiment) ? a.sentiment : "neutral";
  const uV = ["low","medium","high","critical"].includes(a.urgency) ? a.urgency : "low";
  const { data, error } = await supabase.from("evolution_sentiment_analysis").insert({
    message_id: msgId, conversation_id: cv?.id, contact_id: c?.id, remote_jid: remoteJid,
    message_text: text.slice(0, 5000), sentiment: sV, sentiment_score: typeof a.score === "number" ? a.score : 0,
    emotions: a.emotions || {}, intent: a.intent || "geral", urgency: uV,
    keywords: Array.isArray(a.keywords) ? a.keywords : [],
    requires_attention: sV === "negative" && ["high","critical"].includes(uV),
    model_used: (await getOpenAIKey()) ? "gpt-4o-mini" : "rule_based"
  }).select().maybeSingle();
  if (error) throw error;
  if (data && sV === "negative" && ["high","critical"].includes(uV)) {
    const { error: alertErr } = await supabase.from("evolution_sentiment_alerts").insert({
      sentiment_id: data.id, contact_id: c?.id, conversation_id: cv?.id,
      alert_type: uV === "critical" ? "escalation_needed" : "negative_sentiment",
      severity: uV, message_preview: text.substring(0, 200), acknowledged: false, resolved: false
    });
    if (alertErr) console.error("[saveAnalysis] alert insert error:", alertErr.message);
  }
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleCorsPreflight(req);

  // Internal endpoint — require service role or cron secret
  const authErr = requireServiceRoleOrCron(req);
  if (authErr) return authErr;

  try {
    const url = new URL(req.url);
    const action = url.pathname.split("/").filter(Boolean).pop();
    if (req.method === "GET" && action === "metrics") {
      // Clamp days to [1, 30] to prevent unbounded table scans
      const rawDays = parseInt(url.searchParams.get("days") || "7");
      const days = Math.max(1, Math.min(30, isNaN(rawDays) ? 7 : rawDays));
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data } = await supabase.from("evolution_sentiment_analysis").select("sentiment, sentiment_score, intent, urgency, created_at").gte("created_at", since);
      if (!data?.length) return new Response(JSON.stringify({ success: true, metrics: { period_days: days, total_analyzed: 0 } }), { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
      const sd: Record<string, number> = { positive: 0, negative: 0, neutral: 0, mixed: 0 };
      const ud: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
      const id: Record<string, number> = {};
      let ts = 0;
      for (const a of data) {
        sd[a.sentiment] = (sd[a.sentiment] || 0) + 1;
        ud[a.urgency || "low"] = (ud[a.urgency || "low"] || 0) + 1;
        id[a.intent || "geral"] = (id[a.intent || "geral"] || 0) + 1;
        ts += Number(a.sentiment_score) || 0;
      }
      return new Response(JSON.stringify({ success: true, metrics: { period_days: days, total_analyzed: data.length, sentiment_distribution: sd, avg_score: Math.round((ts / data.length) * 100) / 100, urgency_distribution: ud, intent_distribution: id, health_score: Math.round((sd.positive / data.length) * 100) } }), { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
    }
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body.action === "analyze" || !body.action) {
        const { text, remote_jid, message_id } = body;
        // Validate text is a non-empty string — .slice() on a non-string crashes at runtime
        if (typeof text !== "string" || !text.trim()) {
          return new Response(JSON.stringify({ error: "text deve ser uma string não vazia" }), { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
        }
        const analysis = await analyzeAI(text);
        let saved = null;
        if (remote_jid) saved = await saveAnalysis(remote_jid, message_id || null, text, analysis);
        return new Response(JSON.stringify({ success: true, analysis, saved_id: saved?.id }), { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
      }
    }
    return new Response(JSON.stringify({ error: "Endpoint não encontrado" }), { status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[evolution-sentiment] unhandled error:", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
  }
});
