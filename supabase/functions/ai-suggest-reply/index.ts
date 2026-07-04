import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, checkRateLimit, getClientIP, requireEnv, Logger } from "../_shared/validation.ts";
import { AiSuggestReplySchema, parseBody } from "../_shared/schemas.ts";
import { callAiWithTracking } from "../_shared/ai-usage.ts";
import { requireUser } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("ai-suggest-reply");

  try {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;
    const userId = authed.user.id;
    const ip = getClientIP(req);
    const { allowed } = checkRateLimit(`suggest:${ip}`, 15, 60_000);
    if (!allowed) return errorResponse("Rate limit exceeded. Please try again later.", 429, req);

    const parsed = parseBody(AiSuggestReplySchema, await req.json());
    if (!parsed.success) return errorResponse(parsed.error, 400, req);

    const { conversationHistory, contactName, contactId, context } = parsed.data;
    const LOVABLE_API_KEY = requireEnv("LOVABLE_API_KEY");

    // Fetch Knowledge Base articles for context
    let knowledgeContext = '';
    try {
      const supabaseUrl = requireEnv("SUPABASE_URL");
      const supabaseKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: articles } = await supabase
        .from('knowledge_base_articles')
        .select('title, content, category')
        .eq('is_published', true)
        .limit(10);

      if (articles && articles.length > 0) {
        knowledgeContext = `\n\nBASE DE CONHECIMENTO DA EMPRESA (use como referência para suas respostas):\n${
          articles.map((a: { category: string | null; title: string; content: string }) =>
            `[${a.category || 'Geral'}] ${a.title}: ${a.content.substring(0, 500)}`
          ).join('\n---\n')
        }`;
      }

      if (contactId) {
        // Verify the contact belongs to this user before fetching its data
        const { data: ownedContact } = await supabase
          .from('contacts')
          .select('id')
          .eq('id', contactId)
          .eq('user_id', userId)
          .maybeSingle();

        if (ownedContact) {
          const { data: notes } = await supabase
            .from('contact_notes')
            .select('content')
            .eq('contact_id', contactId)
            .order('created_at', { ascending: false })
            .limit(5);

          if (notes && notes.length > 0) {
            knowledgeContext += `\n\nNOTAS DO CONTATO:\n${notes.map((n: { content: string }) => n.content).join('\n')}`;
          }

          const { data: customFields } = await supabase
            .from('contact_custom_fields')
            .select('field_name, field_value')
            .eq('contact_id', contactId);

          if (customFields && customFields.length > 0) {
            knowledgeContext += `\n\nDADOS DO CONTATO:\n${customFields.map((f: { field_name: string; field_value: string | null }) => `${f.field_name}: ${f.field_value}`).join('\n')}`;
          }
        }
      }
    } catch (e) {
      log.warn("Error fetching knowledge base", { error: e instanceof Error ? e.message : String(e) });
    }

    log.info("Generating reply suggestions", { contactName, kbContext: knowledgeContext.length > 0 });

    const sanitizeForPrompt = (s: string) => s.replace(/[\n\r\t"'`\\<>]/g, ' ').trim().slice(0, 200);
    const safeContactName = contactName ? sanitizeForPrompt(contactName) : null;
    const safeContext = context ? sanitizeForPrompt(context) : null;
    const firstName = safeContactName ? sanitizeForPrompt(safeContactName.split(' ')[0]).slice(0, 50) : null;

    const systemPrompt = `Você é um Copilot de IA especializado em comunicação empresarial via WhatsApp de uma empresa distribuidora/comercial.

CONTEXTO DO NEGÓCIO — Nossos departamentos se comunicam com diferentes públicos:
• VENDAS: Vendedores ↔ clientes (empresas/lojistas) — pedidos, condições, follow-ups.
• COMPRAS: Compradores ↔ fornecedores — cotações, prazos, acompanhamento de produção.
• LOGÍSTICA: Logística ↔ transportadoras — fretes, rastreio, ocorrências.
• RH: RH ↔ colaboradores — questões trabalhistas, benefícios.
• FINANCEIRO: Cobranças, pagamentos, boletos.
• SAC: Reclamações, trocas, pós-venda.

Identifique o tipo de conversa e adapte o tom e conteúdo da sugestão ao contexto correto.

Contexto do contato: ${safeContactName ?? ''}
${safeContext ? `Informações adicionais: ${safeContext}` : ''}
${knowledgeContext}

IMPORTANTE: Use as informações da Base de Conhecimento e dados do contato para personalizar suas sugestões.
Se houver artigos relevantes, cite informações específicas nas respostas.

${firstName && firstName !== 'Cliente' ? `REGRA CRÍTICA DE HUMANIZAÇÃO: O primeiro nome do contato é "${firstName}". TODA sugestão de resposta DEVE obrigatoriamente começar mencionando o nome "${firstName}" de forma natural e humana (ex: "${firstName}, entendi sua solicitação..." ou "${firstName}, compreendo sua situação..."). O contato JAMAIS deve perceber que a resposta foi gerada por IA. Isso é OBRIGATÓRIO em todas as 3 sugestões.` : ''}

Baseado na conversa, gere exatamente 3 sugestões de resposta:
1. Uma resposta direta e objetiva (use dados da KB se aplicável)
2. Uma resposta mais empática e detalhada  
3. Uma resposta com pergunta de follow-up

Responda APENAS em formato JSON com a seguinte estrutura:
{
  "suggestions": [
    {"type": "direct", "text": "resposta aqui", "emoji": "✓", "source": "kb_article_title ou null"},
    {"type": "empathetic", "text": "resposta aqui", "emoji": "💬", "source": null},
    {"type": "followup", "text": "resposta aqui", "emoji": "❓", "source": null}
  ]
}`;

    const normalizedHistory = (Array.isArray(conversationHistory) ? conversationHistory : [])
      .slice(-20)
      .map((m) => ({
        role: m.role === 'agent' || m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || ''),
      }));

    const { response, data } = await callAiWithTracking({
      functionName: 'ai-suggest-reply',
      userId,
      apiKey: LOVABLE_API_KEY,
      body: {
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...normalizedHistory,
          { role: "user", content: "Gere 3 sugestões de resposta contextualizadas para a última mensagem do cliente." }
        ],
        temperature: 0.7,
      },
    });

    if (!response.ok || !data) {
      if (response.status === 429) return errorResponse("Rate limit exceeded. Please try again later.", 429, req);
      if (response.status === 402) return errorResponse("Payment required. Please add credits.", 402, req);
      throw new Error(`AI gateway error [${response.status}]`);
    }

    const content = (data?.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content;

    let suggestions;
    try {
      const jsonMatch = content?.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch {
      log.warn("Parse error, using fallback suggestions");
      suggestions = {
        suggestions: [
          { type: "direct", text: "Entendi sua solicitação. Vou verificar isso para você.", emoji: "✓", source: null },
          { type: "empathetic", text: "Compreendo sua situação. Estou aqui para ajudá-lo da melhor forma possível.", emoji: "💬", source: null },
          { type: "followup", text: "Poderia me fornecer mais detalhes sobre isso?", emoji: "❓", source: null }
        ]
      };
    }

    log.done(200);
    return jsonResponse(suggestions, 200, req);
  } catch (error: unknown) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse("Internal server error", 500, req);
  }
});
