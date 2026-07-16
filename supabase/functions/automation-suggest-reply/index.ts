// Edge function: gera sugestão de resposta para uma execução de automação
// Usa Lovable AI Gateway (sem API key do usuário) + Knowledge Base + Tag Recommender
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requireServiceRoleOrCron } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { isValidUUID } from "../_shared/validation.ts";

const MAX_MESSAGE_CONTENT_LEN = 2_000;
const MAX_CONTACT_NAME_LEN = 200;
const MAX_HISTORY_MESSAGES = 8;

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

/**
 * Builds full-text search query from last N customer messages for Knowledge Base lookup.
 * Extracts last 4 customer-only messages, normalizes to lowercase, strips non-alphanumeric chars,
 * filters words <3 characters, limits to first 20 terms. Prevents FTS query injection via
 * character filtering; enables matching KB articles by customer intent.
 */
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

/**
 * Fetches relevant Knowledge Base articles via FTS search (up to 4 results).
 * Calls search_knowledge_base RPC with normalized query, extracts category/title/content.
 * Returns formatted snippet (title + first 600 chars per article) and source titles for citations.
 * Graceful failure: Network errors, empty results, parse errors → returns empty snippet + sources.
 */
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
    const hitsArray = Array.isArray(data) ? data : [];
    if (!hitsArray.length) return { snippet: "", sources: [] };
    const hits = hitsArray
      .filter((h): h is Record<string, unknown> => typeof h === 'object' && h !== null && !Array.isArray(h))
      .map(h => ({
        category: typeof h.category === 'string' ? h.category : null,
        title: typeof h.title === 'string' ? h.title : '',
        content: typeof h.content === 'string' ? h.content : '',
      }))
      .filter(h => h.title);
    if (!hits.length) return { snippet: "", sources: [] };
    const snippet = hits
      .map(
        (h) =>
          `[${h.category ?? "geral"}] ${h.title}\n${h.content.slice(0, 600)}`,
      )
      .join("\n---\n");
    return { snippet, sources: hits.map((h) => h.title) };
  } catch (e) {
    console.warn("[automation-suggest-reply] KB fetch failed:", e);
    return { snippet: "", sources: [] };
  }
}

/**
 * Fetches tag catalog from external Supabase (evolution_tags table, up to 60 rows).
 * Supports dual config: SELFHOSTED_SUPABASE_URL takes precedence; falls back to EXTERNAL_SUPABASE_URL.
 * Returns empty array if config missing or fetch fails (graceful degradation for tag recommendations).
 * Used by AI to narrow suggested tags to available taxonomy.
 */
async function fetchExternalTags(): Promise<ExtTag[]> {
  const url = (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('EXTERNAL_SUPABASE_URL'));
  const key = (Deno.env.get('SELFHOSTED_SUPABASE_ANON_KEY') ?? Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY'));
  if (!url || !key) return [];
  try {
    const ext = createClient(url, key, { db: { schema: "zapp" } });
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

/**
 * Calls Lovable AI Gateway with tool-use to generate suggested response + tag recommendation.
 * Validates tag against allowed list (enum constraint prevents AI tag injection).
 * Falls back to raw message content if tool parsing fails (graceful degradation).
 * Handles rate limit (429) and payment (402) errors as exceptions; network timeout = 30s AbortSignal.
 * Returns { reply: trimmed text, recommended_tag: null if no match or tag not in list }.
 */
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

/**
 * Edge Function: Automation Suggest Reply — AI-Powered Response Generation
 *
 * Generates contextual response suggestions for automation rules via LLM (Gemini 3 Flash).
 * Uses Knowledge Base search + external tag catalog to enrich AI context and guide recommendations.
 *
 * Authorization: Service-role or cron-triggered only (internal automation engine).
 * Request Body: { executionId, ruleId, recentMessages?, contactName?, skipAi? }
 *
 * Flow:
 * 1. Fetch automation rule (template, custom AI prompt)
 * 2. If skipAi=true or template+!customPrompt: return template directly
 * 3. Otherwise: build FTS query from recent messages → search KB → fetch tag catalog
 * 4. Call LLM with system prompt (template or custom) + conversation context
 * 5. Extract AI suggestion + recommended tag (validated against catalog)
 * 6. Fallback: return template or LLM content on parse errors
 *
 * Response: { suggestion, recommended_tag?, kb_sources? }
 * Handles rate limits (429), payment errors (402), and graceful fallback to template.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  // Internal-only: called by the automation engine with service role.
  const denied = requireServiceRoleOrCron(req);
  if (denied) return denied;

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SERVICE_KEY) throw new Error("Required environment variables missing");

    const rawBody = await req.json();
    if (typeof rawBody !== 'object' || rawBody === null || Array.isArray(rawBody)) {
      throw new Error("Invalid request body");
    }
    const bodyObj = rawBody as Record<string, unknown>;
    const executionId = typeof bodyObj.executionId === 'string' ? bodyObj.executionId : '';
    const ruleId = typeof bodyObj.ruleId === 'string' ? bodyObj.ruleId : '';
    const recentMessages = Array.isArray(bodyObj.recentMessages) ? bodyObj.recentMessages : undefined;
    const contactName = typeof bodyObj.contactName === 'string' ? bodyObj.contactName : undefined;
    const skipAi = bodyObj.skipAi === true;

    if (!executionId || !ruleId) throw new Error("executionId and ruleId are required");
    if (!isValidUUID(executionId)) throw new Error("executionId must be a valid UUID");
    if (!isValidUUID(ruleId)) throw new Error("ruleId must be a valid UUID");

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { db: { schema: "zapp" } });

    const { data: rule, error: ruleErr } = await supabase
      .from("automation_rules")
      .select("name, description, actions, trigger_type")
      .eq("id", ruleId)
      .maybeSingle();
    if (ruleErr || !rule) throw new Error("Rule not found");

    const ruleObj = rule as Record<string, unknown>;
    const actions = typeof ruleObj.actions === 'object' && ruleObj.actions !== null && !Array.isArray(ruleObj.actions)
      ? (ruleObj.actions as Record<string, unknown>)
      : {};
    const customPrompt = typeof actions.ai_prompt === 'string' ? actions.ai_prompt : "";
    const template = typeof actions.template === 'string' ? actions.template : "";

    let suggestion = template;
    let recommendedTag: string | null = null;
    let kbSources: string[] = [];

    const useAi = !skipAi && (!template || customPrompt);

    if (useAi) {
      const recent = Array.isArray(recentMessages) ? recentMessages : [];
      const validMessages = recent
        .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null && !Array.isArray(m));
      // Truncate each message to prevent prompt injection via oversized content
      const history = validMessages
        .slice(-MAX_HISTORY_MESSAGES)
        .map(m => {
          const isFromMe = m.from_me === true;
          const rawContent = typeof m.content === 'string' ? m.content : '';
          // Truncate and strip control characters to limit injection surface
          const content = rawContent.slice(0, MAX_MESSAGE_CONTENT_LEN).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
          return `${isFromMe ? "Atendente" : "Cliente"}: ${content}`;
        })
        .join("\n");

      // 1) Busca contexto na knowledge base (parallel com tags)
      const searchQuery = buildSearchQuery(validMessages.map(m => ({
        from_me: m.from_me === true,
        content: typeof m.content === 'string' ? m.content : '',
      })));
      const [{ snippet: kbSnippet, sources }, tags] = await Promise.all([
        fetchKnowledgeContext(supabase, searchQuery),
        fetchExternalTags(),
      ]);
      kbSources = sources;

      const validTags = tags
        .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null && !Array.isArray(t))
        .map(t => ({
          name: typeof t.name === 'string' ? t.name : '',
          description: typeof t.description === 'string' ? t.description : '',
        }))
        .filter(t => t.name);
      const tagNames = validTags.map((t) => t.name);
      const tagCatalog = validTags.length
        ? validTags
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

      const ruleName = typeof ruleObj.name === 'string' ? ruleObj.name : 'sem-nome';
      const ruleTrigger = typeof ruleObj.trigger_type === 'string' ? ruleObj.trigger_type : 'unknown';
      // Sanitize contactName — customer-controlled, strip control chars and cap length
      const safeContactName = (contactName ?? '—')
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
        .slice(0, MAX_CONTACT_NAME_LEN);
      // Wrap untrusted customer content in XML delimiters so the model can distinguish
      // instructions from data — structural defense against prompt injection.
      const userPrompt = `Regra disparada: ${ruleName} (${ruleTrigger})
Cliente: ${safeContactName}
<historico_conversa>
${history || "(sem mensagens)"}
</historico_conversa>

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
            const raw = await e.json();
            let errorMsg = 'Request failed';
            if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
              const rawObj = raw as Record<string, unknown>;
              errorMsg = (typeof rawObj.error === 'string' ? rawObj.error : null)
                || (typeof rawObj.message === 'string' ? rawObj.message : 'Request failed');
            }
            safeBody = JSON.stringify({ error: errorMsg });
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
      .eq("id", executionId);

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
