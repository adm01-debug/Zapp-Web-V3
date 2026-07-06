// Edge function: gera sugestão de resposta para uma execução de automação
// Usa Lovable AI Gateway (sem API key do usuário) + Knowledge Base + Tag Recommender
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireServiceRoleOrCron } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

interface Body {
  executionId: string;
  remoteJid: string;
  ruleId: string;
  recentMessages?: Array<{ from_me: boolean; content: string }>;
  contactName?: string;
  /** Quando true, força uso do template puro (sem KB nem IA). */
  skipAi?: boolean;
}

interface KbHit {
  id: string;
  title: string;
  content: string;
  category: string | null;
  tags: string[] | null;
  rank: number;
}

interface ExtTag {
  id: string;
  name: string;
  color?: string | null;
  description?: string | null;
}

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

/** Constrói uma query textual a partir das últimas mensagens do cliente para alimentar a busca FTS na KB. */
function buildSearchQuery(messages: Array<{ from_me: boolean; content: string }>): string {
  const fromCustomer = messages.filter((m) => !m.from_me).slice(-4);
  const text = fromCustomer.map((m) => m.content).join(" ");
  // Mantém só palavras alfanuméricas com >=3 chars; limita a ~20 termos
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .slice(0, 20)
    .join(" ")
    .trim();
}

async function fetchKnowledgeContext(
  supabase: ReturnType<typeof createClient>,
  query: string,
): Promise<{ snippet: string; sources: string[] }> {
  if (!query) return { snippet: "", sources: [] };
  try {
    const { data, error } = await supabase.rpc("search_knowledge_base", {
      search_query: query,
      max_results: 4,
    });
    if (error) {
      console.warn("[automation-suggest-reply] KB search error:", error.message);
      return { snippet: "", sources: [] };
    }
    const hits = (data ?? []) as KbHit[];
    if (!hits.length) return { snippet: "", sources: [] };
    const snippet = hits
      .map(
        (h) =>
          `[${h.category ?? "geral"}] ${h.title}\n${(h.content ?? "").slice(0, 600)}`,
      )
      .join("\n---\n");
    return { snippet, sources: hits.map((h) => h.title) };
  } catch (e) {
    console.warn("[automation-suggest-reply] KB fetch failed:", e);
    return { snippet: "", sources: [] };
  }
}

async function fetchExternalTags(): Promise<ExtTag[]> {
  const url = (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('EXTERNAL_SUPABASE_URL'));
  const key = (Deno.env.get('SELFHOSTED_SUPABASE_ANON_KEY') ?? Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY'));
  if (!url || !key) return [];
  try {
    const ext = createClient(url, key);
    const { data, error } = await ext
      .from("evolution_tags")
      .select("id, name, color, description")
      .limit(60);
    if (error) {
      console.warn("[automation-suggest-reply] tags fetch error:", error.message);
      return [];
    }
    return (data ?? []) as ExtTag[];
  } catch (e) {
    console.warn("[automation-suggest-reply] tags fetch failed:", e);
    return [];
  }
}

/** Chama o LLM com tool-calling para devolver { reply, recommended_tag }. */
async function callAi(
  systemPrompt: string,
  userPrompt: string,
  tagNames: string[],
  apiKey: string,
): Promise<{ reply: string; recommended_tag: string | null }> {
  const tools = [
    {
      type: "function",
      function: {
        name: "suggest_response",
        description:
          "Gera a melhor próxima resposta do atendente e recomenda uma única tag dentre as existentes.",
        parameters: {
          type: "object",
          properties: {
            reply: {
              type: "string",
              description:
                "Resposta curta (máx 2 frases), profissional, em PT-BR.",
            },
            recommended_tag: {
              type: ["string", "null"],
              enum: [...tagNames, null],
              description:
                "Nome EXATO de uma tag existente que melhor classifica a conversa. Use null se nenhuma se encaixa bem.",
            },
          },
          required: ["reply", "recommended_tag"],
          additionalProperties: false,
        },
      },
    },
  ];

  const resp = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools,
      tool_choice: { type: "function", function: { name: "suggest_response" } },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (resp.status === 429) throw new Response(
    JSON.stringify({ error: "Rate limit. Tente novamente em instantes." }),
    { status: 429, headers: { "Content-Type": "application/json" } },
  );
  if (resp.status === 402) throw new Response(
    JSON.stringify({ error: "Créditos de IA esgotados na workspace." }),
    { status: 402, headers: { "Content-Type": "application/json" } },
  );
  if (!resp.ok) throw new Error(`AI gateway: ${resp.status}`);

  const json = await resp.json();
  const toolCall = json?.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try {
      const args = JSON.parse(toolCall.function.arguments);
      const reply = typeof args.reply === "string" ? args.reply.trim() : "";
      const tag =
        typeof args.recommended_tag === "string" && tagNames.includes(args.recommended_tag)
          ? args.recommended_tag
          : null;
      return { reply, recommended_tag: tag };
    } catch (e) {
      console.warn("[automation-suggest-reply] tool args parse failed", e);
    }
  }
  // Fallback: usa o conteúdo direto
  const fallback = json?.choices?.[0]?.message?.content?.trim?.() ?? "";
  return { reply: fallback, recommended_tag: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  // Internal-only: called by the automation engine with service role.
  const denied = requireServiceRoleOrCron(req);
  if (denied) return denied;

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'))!;
    const SERVICE_KEY = (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const body = (await req.json()) as Body;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: rule, error: ruleErr } = await supabase
      .from("automation_rules")
      .select("name, description, actions, trigger_type")
      .eq("id", body.ruleId)
      .maybeSingle();
    if (ruleErr || !rule) throw new Error("Rule not found");

    const actions = (rule.actions ?? {}) as Record<string, unknown>;
    const customPrompt = (actions.ai_prompt as string) ?? "";
    const template = (actions.template as string) ?? "";

    let suggestion = template;
    let recommendedTag: string | null = null;
    let kbSources: string[] = [];

    const useAi = !body.skipAi && (!template || customPrompt);

    if (useAi) {
      const recent = body.recentMessages ?? [];
      const history = recent
        .slice(-8)
        .map((m) => `${m.from_me ? "Atendente" : "Cliente"}: ${m.content}`)
        .join("\n");

      // 1) Busca contexto na knowledge base (parallel com tags)
      const searchQuery = buildSearchQuery(recent);
      const [{ snippet: kbSnippet, sources }, tags] = await Promise.all([
        fetchKnowledgeContext(supabase, searchQuery),
        fetchExternalTags(),
      ]);
      kbSources = sources;

      const tagNames = tags.map((t) => t.name).filter(Boolean);
      const tagCatalog = tags.length
        ? tags
            .map((t) => `- ${t.name}${t.description ? `: ${t.description}` : ""}`)
            .join("\n")
        : "(nenhuma tag cadastrada)";

      const systemPrompt =
        `Você é um assistente de atendimento via WhatsApp em PT-BR. ` +
        `Gere UMA resposta curta (máx 2 frases), profissional e cordial. ` +
        `Não use saudações redundantes se a conversa já está em andamento. Não invente informações. ` +
        `Quando a base de conhecimento contiver a resposta, USE-A literalmente; ` +
        `quando não contiver, mantenha-se genérico e não fabrique fatos.` +
        (customPrompt ? `\n\nContexto da regra: ${customPrompt}` : "") +
        (kbSnippet
          ? `\n\nBASE DE CONHECIMENTO (use como referência):\n${kbSnippet}`
          : "") +
        `\n\nTAGS DISPONÍVEIS NO CRM (escolha no MÁXIMO uma para classificar a conversa, ou null):\n${tagCatalog}`;

      const userPrompt = `Regra disparada: ${rule.name} (${rule.trigger_type})
Cliente: ${body.contactName ?? "—"}
Histórico recente:
${history || "(sem mensagens)"}

Gere a melhor próxima resposta do atendente e recomende a tag mais adequada.`;

      try {
        const ai = await callAi(systemPrompt, userPrompt, tagNames, LOVABLE_API_KEY);
        suggestion = ai.reply || template || "";
        recommendedTag = ai.recommended_tag;
      } catch (e) {
        if (e instanceof Response) {
          // Re-wrap with CORS headers so browsers receive the 429/402 error properly.
          // Parse and re-serialise so stack traces or internal details from the upstream
          // API are never forwarded verbatim to the browser (CodeQL: stack-trace exposure).
          let safeBody: string;
          try {
            const raw = await e.json() as Record<string, unknown>;
            safeBody = JSON.stringify({ error: raw.error ?? raw.message ?? 'Request failed' });
          } catch {
            safeBody = JSON.stringify({ error: 'Request failed' });
          }
          return new Response(safeBody, {
            status: e.status,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }
        throw e;
      }
    }

    await supabase
      .from("automation_executions")
      .update({
        suggestion_text: suggestion,
        recommended_tag: recommendedTag,
        kb_sources: kbSources,
      })
      .eq("id", body.executionId);

    return new Response(
      JSON.stringify({
        suggestion,
        recommended_tag: recommendedTag,
        kb_sources: kbSources,
      }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("automation-suggest-reply error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  }
});
