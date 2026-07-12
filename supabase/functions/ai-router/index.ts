/**
 * AI Router - Unified entry point for all AI-powered actions
 *
 * LOW-6 Consolidation: Routes 12+ individual ai-* and classify-* functions
 * through a single dispatcher to reduce cold starts and improve cache efficiency.
 *
 * Usage:
 *   POST /ai-router
 *   { "action": "conversation_summary", "messages": [...], "contact_name": "..." }
 *
 * Supported actions:
 *   - conversation_summary: Analyze conversation with rich context
 *   - enhance_message: Rewrite message in specific tone
 *   - classify_emoji: Classify custom emoji/emoticon
 *   - classify_sticker: Classify custom sticker
 *   - auto_tag: Auto-tag conversation with ML
 *   - churn_analysis: Detect churn risk signals
 *   - classify_tickets: Classify support tickets
 *   - conversation_analysis: Multi-dimensional conversation analysis
 *   - suggest_reply: Generate suggested replies with KB context
 *   - transcribe_audio: Transcribe audio to text
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import {
  handleCors, errorResponse, jsonResponse, requireEnv, Logger,
  checkRateLimit, getClientIP, sanitizeString, isValidUUID,
} from "../_shared/validation.ts";
import {
  AiConversationSummarySchema, AiEnhanceMessageSchema, ClassifyEmojiSchema,
  ClassifyStickerSchema, AiAutoTagSchema, AiChurnAnalysisSchema,
  AiClassifyTicketsSchema, AiConversationAnalysisSchema, AiSuggestReplySchema,
  TranscribeAudioSchema, parseBody, z,
} from "../_shared/schemas.ts";
import { callAiWithTracking, extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { requireUser } from "../_shared/auth.ts";

type ActionType =
  | 'conversation_summary' | 'enhance_message' | 'classify_emoji'
  | 'classify_sticker' | 'auto_tag' | 'churn_analysis'
  | 'classify_tickets' | 'conversation_analysis' | 'suggest_reply'
  | 'transcribe_audio';

interface AiRouterRequest {
  action: ActionType;
  [key: string]: unknown;
}

const tonePrompts: Record<string, string> = {
  professional: "Reescreva a mensagem abaixo de forma mais profissional, clara e educada. Mantenha o mesmo significado mas use linguagem corporativa e polida.",
  casual: "Reescreva a mensagem abaixo de forma mais casual, amigável e descontraída. Mantenha o mesmo significado mas use linguagem informal e acolhedora.",
  persuasive: "Reescreva a mensagem abaixo de forma mais persuasiva e convincente. Mantenha o mesmo significado mas torne-a mais impactante e motivadora.",
  empathetic: "Reescreva a mensagem abaixo de forma mais empática e acolhedora. Mantenha o mesmo significado mas demonstre compreensão e cuidado com o cliente.",
  concise: "Reescreva a mensagem abaixo de forma mais concisa e direta. Remova redundâncias e mantenha apenas o essencial, sem perder o significado.",
  detailed: "Reescreva a mensagem abaixo de forma mais detalhada e explicativa. Expanda as ideias para que fique mais completa e informativa.",
};

const EMOJI_CATEGORIES = [
  'sorriso', 'riso', 'amor', 'triste', 'raiva',
  'surpresa', 'medo', 'nojo', 'pensativo', 'legal',
  'festa', 'comida', 'animal', 'natureza', 'esporte',
  'trabalho', 'música', 'tech', 'viagem', 'meme',
  'deboche', 'fofo', 'fantasia', 'bandeira', 'outros'
];

// ============================================================================
// Utility: Timeout wrapper for API calls (P0-FIX-004)
// ============================================================================

async function callAiWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = 30_000,
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`API call timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

// ============================================================================
// Handlers for each AI action
// ============================================================================

async function handleConversationSummary(
  req: Request,
  body: any,
  log: InstanceType<typeof Logger>,
  userId: string,
  supabase: any,
  lovableApiKey: string,
) {
  const { allowed } = checkRateLimit(`summary:${getClientIP(req)}`, 10, 60_000);
  if (!allowed) return errorResponse("Rate limit exceeded. Please try again later.", 429, req);

  const parsed = parseBody(AiConversationSummarySchema, body);
  if (!parsed.success) return errorResponse(parsed.error, 400, req);

  const { messages, contactName, contactId } = parsed.data;
  const callerClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { authorization: req.headers.get("authorization") || "" } },
  });

  let contactContext = '';
  if (contactId) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('name, company, tags, ai_priority, ai_sentiment, notes')
      .eq('id', contactId)
      .maybeSingle();

    if (contact) {
      contactContext = `\nContexto: ${contact.name || 'Cliente'}, Empresa: ${contact.company || 'N/A'}, Tags: ${contact.tags?.join(', ') || 'Nenhuma'}`;
    }

    const { data: prevAnalyses } = await supabase
      .from('conversation_analyses')
      .select('sentiment, summary, created_at')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(3);

    if (prevAnalyses && prevAnalyses.length > 0) {
      contactContext += `\nHistórico: ${prevAnalyses.map((a: any) => `[${a.sentiment}] ${a.summary}`).join(' | ')}`;
    }
  }

  const conversationText = messages
    .map((msg: any) =>
      `[${msg.role === 'agent' || msg.sender === 'agent' ? 'Atendente' : contactName || 'Cliente'}]: ${msg.content || ''}`
    )
    .join('\n');

  const systemPrompt = `Você é um analista sênior de inteligência conversacional de uma empresa distribuidora/comercial.

CONTEXTO DO NEGÓCIO — Nossa empresa opera múltiplos departamentos que se comunicam via WhatsApp:
• VENDAS: Vendedores atendem clientes (empresas/lojistas) — pedidos, condições, follow-ups comerciais.
• COMPRAS: Time de compras interage com FORNECEDORES — cotações, prazos, acompanhamento de produção.
• LOGÍSTICA: Logística cota e acompanha TRANSPORTADORAS — fretes, rastreio, ocorrências.
• RH: Interage com COLABORADORES — questões trabalhistas, benefícios, comunicação interna.
• FINANCEIRO: Cobranças com clientes, pagamentos com fornecedores.
• SAC/SUPORTE: Reclamações, trocas, devoluções, pós-venda.

REGRA: Identifique o departamento e tipo de relação antes de analisar. Isso muda a interpretação.
${contactContext}

Foque em:
- Identificar o problema/necessidade REAL do interlocutor (não apenas o que ele disse)
- Avaliar a qualidade do atendimento do nosso colaborador
- Detectar oportunidades de melhoria ou negócio
- Identificar riscos (churn, rompimento com fornecedor, turnover)
- Sugerir ações concretas e mensuráveis`;

  const { response, data } = await callAiWithTimeout(
    () => callAiWithTracking({
      functionName: 'ai-router',
      userId,
      apiKey: lovableApiKey,
      body: {
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Conversa com ${contactName || 'Cliente'}:\n\n${conversationText}` }
        ],
        tools: [
        {
          type: "function",
          function: {
            name: "generate_analysis",
            description: "Generate a comprehensive analysis of the conversation",
            parameters: {
              type: "object",
              properties: {
                department: { type: "string", enum: ["vendas", "compras", "logistica", "rh", "financeiro", "sac", "outros"], description: "Departamento identificado" },
                relationshipType: { type: "string", description: "Tipo de relação identificada (ex: vendedor→cliente)" },
                summary: { type: "string", description: "Brief summary (max 3 sentences)" },
                status: { type: "string", enum: ["resolvido", "pendente", "aguardando_cliente", "aguardando_atendente", "escalado"] },
                keyPoints: { type: "array", items: { type: "string" }, description: "Key points (max 5)" },
                nextSteps: { type: "array", items: { type: "string" }, description: "Actionable next steps" },
                sentiment: { type: "string", enum: ["positivo", "neutro", "negativo", "critico"] },
                sentimentScore: { type: "number", description: "Sentiment score 0-100 (100=very positive)" },
                customerSatisfaction: { type: "number", description: "Estimated CSAT 1-5" },
                churnRisk: { type: "string", enum: ["low", "medium", "high"] },
                salesOpportunity: { type: "string", description: "Description of sales opportunity or null" },
                topics: { type: "array", items: { type: "string" }, description: "Main topics discussed" },
                urgency: { type: "string", enum: ["baixa", "media", "alta", "critica"] },
              },
              required: ["department", "summary", "status", "keyPoints", "sentiment", "sentimentScore", "customerSatisfaction", "topics", "urgency"],
              additionalProperties: false,
            }
          }
        }
      ],
      tool_choice: { type: "function", function: { name: "generate_analysis" } }
    },
    }),
    30_000
  );

  if (!response.ok || !data) {
    if (response.status === 429) return errorResponse("Rate limit exceeded", 429, req);
    if (response.status === 402) return errorResponse("Payment required", 402, req);
    throw new Error(`AI gateway error: ${response.status}`);
  }

  const toolCall = (data.choices as any)?.[0]?.message?.tool_calls?.[0];
  let analysisData;

  if (toolCall?.function?.arguments) {
    try {
      analysisData = JSON.parse(toolCall.function.arguments);
    } catch (parseErr) {
      const jsonMatch = toolCall.function.arguments.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("AI returned malformed JSON in tool_call");
      }
    }
  } else {
    const content = (data.choices as any)?.[0]?.message?.content;
    let parsed = null;
    if (content) {
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch { /* fallback below */ }
    }
    analysisData = parsed || { summary: content || 'Não foi possível gerar análise.', status: 'pendente', keyPoints: [], sentiment: 'neutro', sentimentScore: 50, customerSatisfaction: 3, topics: [], urgency: 'media' };
  }

  analysisData = {
    summary: analysisData.summary || 'Resumo não disponível',
    status: ['resolvido', 'pendente', 'aguardando_cliente', 'aguardando_atendente', 'escalado'].includes(analysisData.status) ? analysisData.status : 'pendente',
    keyPoints: Array.isArray(analysisData.keyPoints) ? analysisData.keyPoints : [],
    nextSteps: Array.isArray(analysisData.nextSteps) ? analysisData.nextSteps : [],
    sentiment: ['positivo', 'neutro', 'negativo', 'critico'].includes(analysisData.sentiment) ? analysisData.sentiment : 'neutro',
    sentimentScore: typeof analysisData.sentimentScore === 'number' ? Math.max(0, Math.min(100, analysisData.sentimentScore)) : 50,
    customerSatisfaction: typeof analysisData.customerSatisfaction === 'number' ? Math.max(1, Math.min(5, analysisData.customerSatisfaction)) : 3,
    churnRisk: analysisData.churnRisk || 'low',
    salesOpportunity: analysisData.salesOpportunity || null,
    topics: Array.isArray(analysisData.topics) ? analysisData.topics : [],
    urgency: ['baixa', 'media', 'alta', 'critica'].includes(analysisData.urgency) ? analysisData.urgency : 'media',
  };

  let persistenceWarning: string | undefined;
  if (contactId) {
    const { error: insertErr } = await callerClient.from('conversation_analyses').insert({
      contact_id: contactId,
      summary: analysisData.summary,
      sentiment: analysisData.sentiment,
      sentiment_score: analysisData.sentimentScore,
      customer_satisfaction: analysisData.customerSatisfaction,
      key_points: analysisData.keyPoints,
      next_steps: analysisData.nextSteps || [],
      topics: analysisData.topics,
      urgency: analysisData.urgency,
      status: analysisData.status,
      message_count: messages.length,
    });
    if (insertErr) {
      console.error('[ai-router] insert failed', insertErr);
      persistenceWarning = 'analysis_not_persisted';
    }

    const { error: updateErr } = await callerClient.from('contacts').update({
      ai_sentiment: analysisData.sentiment,
      ai_priority: analysisData.urgency === 'critica' ? 'urgent' : analysisData.urgency,
    }).eq('id', contactId);
    if (updateErr) {
      console.error('[ai-router] contact update failed', updateErr);
      persistenceWarning = persistenceWarning ?? 'contact_not_updated';
    }
  }

  log.done(200);
  return jsonResponse(persistenceWarning ? { ...analysisData, _warning: persistenceWarning } : analysisData, 200, req);
}

async function handleEnhanceMessage(
  req: Request,
  body: any,
  log: InstanceType<typeof Logger>,
  userId: string,
  lovableApiKey: string,
) {
  const { allowed } = checkRateLimit(`enhance:${getClientIP(req)}`, 20, 60_000);
  if (!allowed) return errorResponse("Limite de requisições excedido. Tente novamente em 1 minuto.", 429, req);

  const parsed = parseBody(AiEnhanceMessageSchema, body);
  if (!parsed.success) return errorResponse(parsed.error, 400, req);

  const { message, tone, contactName } = parsed.data;
  const systemPrompt = tonePrompts[tone as string];

  const sanitizeForPrompt = (s: string) => s.replace(/[\n\r\t"'`\\]/g, ' ').trim().slice(0, 50);
  const rawFirst = contactName ? contactName.split(' ')[0] : null;
  const firstName = rawFirst ? sanitizeForPrompt(rawFirst) : null;
  const humanizationRule = firstName && firstName !== 'Cliente'
    ? `\n- REGRA CRÍTICA DE HUMANIZAÇÃO: O nome do cliente é "${firstName}". A mensagem reescrita DEVE obrigatoriamente começar mencionando o nome "${firstName}" de forma natural e humana (ex: "${firstName}, entendi sua solicitação..." ou "${firstName}, vou verificar isso..."). O cliente JAMAIS deve perceber que a resposta foi gerada por IA. Isso é OBRIGATÓRIO.`
    : '';

  log.info("Enhancing message", { tone, len: message.length, hasContactName: !!firstName });

  const { response, data } = await callAiWithTimeout(
    () => callAiWithTracking({
      functionName: 'ai-router',
      userId,
      apiKey: lovableApiKey,
      body: {
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'system',
            content: `${systemPrompt}${humanizationRule}`,
          },
          {
            role: 'user',
            content: `Reescreva esta mensagem:\n\n"${message}"`,
          }
        ],
        temperature: 0.7,
      },
    }),
    30_000
  );

  if (!response.ok || !data) {
    if (response.status === 429) return errorResponse("Limite de requisições excedido. Tente novamente.", 429, req);
    if (response.status === 402) return errorResponse("Créditos insuficientes. Adicione créditos.", 402, req);
    throw new Error(`AI error: ${response.status}`);
  }

  const content = (data.choices as any)?.[0]?.message?.content;
  const result = {
    message: message,
    enhanced_message: content || message,
    tone: tone,
  };

  log.done(200, { tone });
  return jsonResponse(result, 200, req);
}

async function handleClassifyEmoji(
  req: Request,
  body: any,
  log: InstanceType<typeof Logger>,
  userId: string,
  lovableApiKey: string,
) {
  const parsed = parseBody(ClassifyEmojiSchema, body);
  if (!parsed.success) return errorResponse(parsed.error, 400, req);

  const { image_url, file_name } = parsed.data;

  if (!image_url && !file_name) {
    log.warn("Empty input, defaulting to outros");
    return jsonResponse({ category: 'outros' }, 200, req);
  }

  const prompt = `Você é um classificador de emojis/emoticons customizados para uma plataforma de atendimento via WhatsApp.
Analise a imagem e o nome do arquivo "${file_name || 'emoji'}" para classificar em EXATAMENTE UMA das categorias abaixo.
Responda APENAS com o nome da categoria, sem explicação.

Categorias: ${EMOJI_CATEGORIES.join(', ')}`;

  type ContentPart = { type: 'image_url'; image_url: { url: string } } | { type: 'text'; text: string };
  const contentParts: ContentPart[] = [];

  if (image_url) {
    contentParts.push({
      type: 'image_url',
      image_url: { url: image_url },
    });
  }

  contentParts.push({
    type: 'text',
    text: prompt,
  });

  const { response, data } = await callAiWithTimeout(
    () => callAiWithTracking({
      functionName: 'ai-router',
      userId,
      apiKey: lovableApiKey,
      body: {
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'user',
            content: contentParts,
          }
        ],
      },
    }),
    15_000
  );

  if (!response.ok || !data) {
    log.error("Classify emoji error", { status: response.status });
    return jsonResponse({ category: 'outros' }, 200, req);
  }

  const content = (data.choices as any)?.[0]?.message?.content || 'outros';
  const category = EMOJI_CATEGORIES.includes(content.toLowerCase())
    ? content.toLowerCase()
    : 'outros';

  log.done(200, { category });
  return jsonResponse({ category }, 200, req);
}

async function handleAutoTag(
  req: Request,
  body: any,
  log: InstanceType<typeof Logger>,
  userId: string,
  supabase: any,
  lovableApiKey: string,
) {
  const { allowed } = checkRateLimit(`autotag:${getClientIP(req)}`, 20, 60_000);
  if (!allowed) return errorResponse("Rate limit exceeded", 429, req);

  const parsed = parseBody(AiAutoTagSchema, body);
  if (!parsed.success) return errorResponse(parsed.error, 400, req);

  const { contactId, messages: inputMessages, requestId } = parsed.data;
  const validContactId = contactId && isValidUUID(contactId) ? contactId : null;

  // P1-FIX-008: Idempotency check - prevent duplicate processing of retried requests
  if (requestId) {
    try {
      const { data: dupCheck } = await supabase.rpc('check_duplicate_request', {
        p_request_id: requestId,
        p_action: 'auto_tag',
        p_user_id: userId,
      });

      if (dupCheck && dupCheck.length > 0 && dupCheck[0].is_duplicate) {
        log.info('Duplicate request detected, returning cached result', { requestId });
        return jsonResponse(
          dupCheck[0].cached_result || { tags: [], status: 'duplicate' },
          dupCheck[0].status_code || 200,
          req
        );
      }
    } catch (e) {
      // Log but continue - dedup is an optimization, not a blocker
      log.warn('Dedup check failed, proceeding with processing', {
        error: e instanceof Error ? e.message : String(e),
        requestId,
      });
    }
  }

  let conversationMessages = inputMessages;
  if (!conversationMessages && validContactId) {
    const { data } = await supabase
      .from('messages')
      .select('content, sender, message_type')
      .eq('contact_id', validContactId)
      .order('created_at', { ascending: false })
      .limit(20);
    conversationMessages = data || [];
  }

  if (!conversationMessages || conversationMessages.length === 0) {
    return jsonResponse({ tags: [], priority: 'normal', sentiment: 'neutral' }, 200, req);
  }

  const conversationText = conversationMessages
    .map((m: any) =>
      `${sanitizeString(String(m.sender || 'unknown'), 50)}: ${sanitizeString(String(m.content || ''), 1000)}`
    )
    .join('\n');

  const { data: queues } = await supabase
    .from('queues')
    .select('id, name, description')
    .eq('is_active', true);

  const queueList = queues && queues.length > 0
    ? queues.map((q: any) =>
        `- "${q.name}" (${q.id}): ${q.description || 'Sem descrição'}`
      ).join('\n')
    : '';

  log.info("Classifying conversation", { contactId: validContactId, msgCount: conversationMessages.length });

  const { response, data } = await callAiWithTimeout(
    () => callAiWithTracking({
      functionName: 'ai-router',
      userId,
      apiKey: lovableApiKey,
      body: {
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Você é um classificador avançado de conversas de atendimento ao cliente. Analise a conversa e retorne classificação completa.

Categorias possíveis: suporte_tecnico, vendas, financeiro, reclamacao, elogio, duvida, urgente, cancelamento, troca, entrega, pagamento, produto, servico, feedback, agendamento, orcamento

${queueList ? `FILAS DISPONÍVEIS:\n${queueList}` : ''}

Responda APENAS em JSON:
{
  "tags": [{"name": "tag_name", "confidence": 0.95}],
  "sentiment": "positive|neutral|negative|critical",
  "priority": "low|normal|high|urgent",
  "priority_reason": "motivo da prioridade",
  "summary": "resumo em 1 linha",
  "suggested_queue_id": "uuid da fila sugerida ou null",
  "suggested_queue_reason": "motivo da sugestão",
  "customer_intent": "o que o cliente quer resolver",
  "requires_immediate_attention": false,
  "escalation_reason": null
}`
          },
          { role: "user", content: conversationText }
        ],
        temperature: 0.3,
      },
    }),
    30_000
  );

  if (!response.ok || !data) {
    if (response.status === 429) return errorResponse("Rate limit exceeded", 429, req);
    if (response.status === 402) return errorResponse("Payment required", 402, req);
    throw new Error(`AI error: ${response.status}`);
  }

  const content = (data.choices as any)?.[0]?.message?.content;

  let result;
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    result = jsonMatch ? JSON.parse(jsonMatch[0]) : { tags: [], sentiment: 'neutral', summary: '', priority: 'normal' };
  } catch {
    result = { tags: [], sentiment: 'neutral', summary: '', priority: 'normal' };
  }

  if (result.suggested_queue_id && !isValidUUID(result.suggested_queue_id)) {
    result.suggested_queue_id = null;
  }
  const validQueueIds = new Set((queues ?? []).map((q: any) => q.id));
  if (result.suggested_queue_id && !validQueueIds.has(result.suggested_queue_id)) {
    result.suggested_queue_id = null;
  }

  // P0-FIX-003: Atomic tag upsert/delete using database transaction
  // Prevents race condition where concurrent requests can corrupt tag state
  if (validContactId && result.tags?.length > 0) {
    const tagsPayload = result.tags.map((t: any) => ({
      name: sanitizeString(t.name, 100) || 'unknown',
      confidence: Math.min(Math.max(Number(t.confidence) || 0, 0), 1),
    }));

    // Call atomic RPC that wraps upsert + delete in database transaction
    const { data: rpcResult, error: rpcErr } = await supabase
      .rpc('upsert_conversation_tags_atomic', {
        p_contact_id: validContactId,
        p_new_tags: tagsPayload,
        p_should_delete_stale: true,
      });

    if (rpcErr) {
      log.error('Atomic tag upsert failed', {
        error: rpcErr.message,
        contactId: validContactId,
        tagsCount: tagsPayload.length,
      });
      // Fail gracefully - don't stop classification if tagging fails
    } else if (rpcResult && !rpcResult.success) {
      log.warn('Tag operation returned error status', {
        detail: rpcResult.detail,
        contactId: validContactId,
      });
    }
  }

  if (validContactId) {
    const validSentiments = ['positive', 'neutral', 'negative', 'critical'];
    const validPriorities = ['low', 'normal', 'high', 'urgent'];

    const updateData: Record<string, string> = {};
    if (validSentiments.includes(result.sentiment)) updateData.ai_sentiment = result.sentiment;
    if (validPriorities.includes(result.priority)) updateData.ai_priority = result.priority;

    if (result.suggested_queue_id && isValidUUID(result.suggested_queue_id)) {
      updateData.queue_id = result.suggested_queue_id;
    }

    if (Object.keys(updateData).length > 0) {
      await supabase.from('contacts').update(updateData).eq('id', validContactId);
    }

    if (result.requires_immediate_attention && result.priority === 'urgent') {
      const { data: admins } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['admin', 'supervisor'])
        .limit(5);

      if (admins) {
        await supabase.from('notifications').insert(
          admins.map((a: any) => ({
            user_id: a.user_id,
            type: 'urgent_conversation',
            title: '🚨 Conversa Urgente Detectada',
            message: `${sanitizeString(result.summary, 200) || 'Conversa requer atenção imediata'}. Motivo: ${sanitizeString(result.escalation_reason || result.priority_reason, 200) || 'Alta prioridade'}`,
            metadata: { contact_id: validContactId, priority: result.priority, sentiment: result.sentiment },
          }))
        );
      }
    }
  }

  // P1-FIX-008: Cache the result for idempotency on retries
  if (requestId) {
    try {
      await supabase.rpc('record_processed_request', {
        p_request_id: requestId,
        p_action: 'auto_tag',
        p_user_id: userId,
        p_contact_id: validContactId,
        p_status_code: 200,
        p_result_payload: result,
      });
    } catch (e) {
      log.warn('Failed to cache request for dedup', {
        error: e instanceof Error ? e.message : String(e),
        requestId,
      });
    }
  }

  log.done(200, { tags: result.tags?.length || 0 });
  return jsonResponse(result, 200, req);
}

async function handleSuggestReply(
  req: Request,
  body: any,
  log: InstanceType<typeof Logger>,
  userId: string,
  supabase: any,
  lovableApiKey: string,
) {
  const { allowed } = checkRateLimit(`suggest:${getClientIP(req)}`, 15, 60_000);
  if (!allowed) return errorResponse("Rate limit exceeded. Please try again later.", 429, req);

  const parsed = parseBody(AiSuggestReplySchema, body);
  if (!parsed.success) return errorResponse(parsed.error, 400, req);

  const { conversationHistory, contactName, contactId, context } = parsed.data;

  // P1-FIX-007: Parallelize database queries to eliminate N+1 problem
  // Previously: 4 sequential queries (400ms+) → Now: parallel queries (~100ms)
  let knowledgeContext = '';
  try {
    // Execute all queries in parallel instead of sequentially
    const [kbResult, contactResult, notesResult, fieldsResult] = await Promise.all([
      // Query 1: Knowledge base articles
      supabase
        .from('knowledge_base_articles')
        .select('title, content, category')
        .eq('is_published', true)
        .limit(10),

      // Query 2: Check contact ownership
      contactId
        ? supabase
            .from('contacts')
            .select('id')
            .eq('id', contactId)
            .eq('user_id', userId)
            .maybeSingle()
        : Promise.resolve({ data: null }),

      // Query 3: Contact notes (will be filtered below)
      contactId
        ? supabase
            .from('contact_notes')
            .select('content')
            .eq('contact_id', contactId)
            .order('created_at', { ascending: false })
            .limit(5)
        : Promise.resolve({ data: null }),

      // Query 4: Contact custom fields (will be filtered below)
      contactId
        ? supabase
            .from('contact_custom_fields')
            .select('field_name, field_value')
            .eq('contact_id', contactId)
        : Promise.resolve({ data: null }),
    ]);

    // Process results
    const articles = kbResult.data ?? [];
    if (articles.length > 0) {
      knowledgeContext = `\n\nBASE DE CONHECIMENTO DA EMPRESA (use como referência para suas respostas):\n${
        articles.map((a: any) =>
          `[${a.category || 'Geral'}] ${a.title}: ${a.content.substring(0, 500)}`
        ).join('\n---\n')
      }`;
    }

    // Only add contact context if contact exists and is owned by user
    if (contactResult.data) {
      const notes = notesResult.data ?? [];
      if (notes.length > 0) {
        knowledgeContext += `\n\nNOTAS DO CONTATO:\n${notes.map((n: any) => n.content).join('\n')}`;
      }

      const customFields = fieldsResult.data ?? [];
      if (customFields.length > 0) {
        knowledgeContext += `\n\nDADOS DO CONTATO:\n${customFields.map((f: any) => `${f.field_name}: ${f.field_value}`).join('\n')}`;
      }
    }
  } catch (e) {
    log.warn("Error fetching knowledge base context", { error: e instanceof Error ? e.message : String(e) });
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

${firstName ? `HUMANIZAÇÃO: O cliente é ${firstName}. Cite o nome com naturalidade nas sugestões.` : ''}
${safeContext ? `CONTEXTO ADICIONAL: ${safeContext}` : ''}
${knowledgeContext}`;

  const conversationText = conversationHistory
    .map((msg: any) => `${msg.role === 'user' ? (contactName || 'Cliente') : 'Você'}: ${msg.content}`)
    .join('\n');

  const { response, data } = await callAiWithTimeout(
    () => callAiWithTracking({
      functionName: 'ai-router',
      userId,
      apiKey: lovableApiKey,
      body: {
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Conversa:\n${conversationText}\n\nGere 3 sugestões de resposta concisas e naturais.` }
        ],
        temperature: 0.7,
      },
    }),
    30_000
  );

  if (!response.ok || !data) {
    if (response.status === 429) return errorResponse("Rate limit exceeded. Please try again later.", 429, req);
    if (response.status === 402) return errorResponse("Créditos insuficientes. Adicione créditos.", 402, req);
    throw new Error(`AI error: ${response.status}`);
  }

  const content = (data.choices as any)?.[0]?.message?.content;
  const suggestions = content?.split('\n')?.filter((s: string) => s.trim().length > 0).slice(0, 3) || [];

  log.done(200, { suggestions: suggestions.length });
  return jsonResponse({ suggestions }, 200, req);
}

async function handleChurnAnalysis(
  req: Request,
  body: any,
  log: InstanceType<typeof Logger>,
  userId: string,
  supabase: any,
  lovableApiKey: string,
) {
  const { allowed } = checkRateLimit(`churn:${getClientIP(req)}`, 10, 60_000);
  if (!allowed) return errorResponse("Rate limit exceeded", 429, req);

  const parsed = parseBody(AiChurnAnalysisSchema, body);
  if (!parsed.success) return errorResponse(parsed.error, 400, req);

  const { contactIds = [] } = parsed.data;

  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return jsonResponse({ results: [] }, 200, req);
  }

  const results = [];
  for (const contactId of contactIds.slice(0, 20)) {
    if (!isValidUUID(contactId)) continue;

    try {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id, name, ai_sentiment, updated_at, created_at')
        .eq('id', contactId)
        .maybeSingle();

      if (!contact) continue;

      const now = new Date();
      const daysSinceUpdate = Math.floor((now.getTime() - new Date(contact.updated_at).getTime()) / (1000 * 60 * 60 * 24));
      const daysSinceCreation = Math.floor((now.getTime() - new Date(contact.created_at).getTime()) / (1000 * 60 * 60 * 24));

      let riskScore = 0;
      const signals: string[] = [];

      if (daysSinceUpdate > 30) {
        riskScore += Math.min(40, (daysSinceUpdate - 30) * 2);
        signals.push(`Inativo por ${daysSinceUpdate} dias`);
      }

      if (contact.ai_sentiment === 'negative' || contact.ai_sentiment === 'critical') {
        riskScore += 30;
        signals.push('Sentimento negativo/crítico detectado');
      }

      if (daysSinceCreation < 7 && daysSinceUpdate > 3) {
        riskScore += 20;
        signals.push('Novo contato sem follow-up adequado');
      }

      if (daysSinceUpdate > 60) {
        riskScore += 10;
        signals.push('Inativo por mais de 60 dias');
      }

      riskScore = Math.min(100, riskScore);
      const riskLevel = riskScore > 70 ? 'critical' : riskScore > 50 ? 'high' : riskScore > 30 ? 'medium' : 'low';

      results.push({
        contactId,
        contactName: contact.name,
        riskScore,
        riskLevel,
        signals,
      });

      await supabase
        .from('contacts')
        .update({ churn_risk_score: riskScore, churn_risk_level: riskLevel })
        .eq('id', contactId)
        .catch(() => null);
    } catch (e) {
      log.warn(`Error analyzing churn for ${contactId}`, { error: e instanceof Error ? e.message : String(e) });
    }
  }

  log.done(200, { count: results.length });
  return jsonResponse({ results }, 200, req);
}

async function handleClassifySticker(
  req: Request,
  body: any,
  log: InstanceType<typeof Logger>,
  userId: string,
  lovableApiKey: string,
) {
  const parsed = parseBody(ClassifyStickerSchema, body);
  if (!parsed.success) return errorResponse(parsed.error, 400, req);

  const { image_url, file_name } = parsed.data;

  if (!image_url && !file_name) {
    log.warn("Empty input, defaulting to others");
    return jsonResponse({ category: 'others', confidence: 0 }, 200, req);
  }

  const stickerCategories = ['funny', 'cute', 'anime', 'meme', 'animal', 'political', 'esoteric', 'nsfw', 'others'];

  const prompt = `Você é um classificador de stickers para uma plataforma de WhatsApp Business.
Analise o sticker na imagem e classifique em UMA das categorias: ${stickerCategories.join(', ')}
Responda APENAS em JSON: {"category": "categoria_aqui", "confidence": 0.95, "description": "breve descrição"}`;

  type ContentPart = { type: 'image_url'; image_url: { url: string } } | { type: 'text'; text: string };
  const contentParts: ContentPart[] = [];

  if (image_url) {
    contentParts.push({ type: 'image_url', image_url: { url: image_url } });
  }

  contentParts.push({ type: 'text', text: prompt });

  try {
    const { response, data } = await callAiWithTimeout(
      () => callAiWithTracking({
        functionName: 'ai-router',
        userId,
        apiKey: lovableApiKey,
        body: {
          model: 'google/gemini-3-flash-preview',
          messages: [{ role: 'user', content: contentParts }],
        },
      }),
      15_000
    );

    if (!response.ok || !data) {
      log.error("Classify sticker error", { status: response.status });
      return jsonResponse({ category: 'others', confidence: 0 }, 200, req);
    }

    const content = (data.choices as any)?.[0]?.message?.content;
    const jsonMatch = content?.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { category: 'others', confidence: 0 };

    if (!stickerCategories.includes(result.category)) {
      result.category = 'others';
    }

    log.done(200, { category: result.category });
    return jsonResponse(result, 200, req);
  } catch (e) {
    log.error("Sticker classification failed", { error: e instanceof Error ? e.message : String(e) });
    return jsonResponse({ category: 'others', confidence: 0 }, 200, req);
  }
}

async function handleConversationAnalysis(
  req: Request,
  body: any,
  log: InstanceType<typeof Logger>,
  userId: string,
  supabase: any,
  lovableApiKey: string,
) {
  const { allowed } = checkRateLimit(`analysis:${getClientIP(req)}`, 10, 60_000);
  if (!allowed) return errorResponse("Rate limit exceeded", 429, req);

  const parsed = parseBody(AiConversationAnalysisSchema, body);
  if (!parsed.success) return errorResponse(parsed.error, 400, req);

  const { messages, contactId } = parsed.data;

  const conversationText = messages
    .map((m: any) => `[${m.role || m.sender}]: ${m.content}`)
    .join('\n');

  const systemPrompt = `Analise esta conversa sob múltiplas dimensões:
1. Sentimento geral (escala 0-100, onde 100 é muito positivo)
2. Satisfação do cliente (escala 1-5)
3. Risco de churn (baixo/médio/alto)
4. Oportunidade de venda (descrição ou null)
5. Tópicos principais (array)
6. Próximos passos recomendados (array)

Responda APENAS em JSON com essas chaves.`;

  const { response, data } = await callAiWithTimeout(
    () => callAiWithTracking({
      functionName: 'ai-router',
      userId,
      apiKey: lovableApiKey,
      body: {
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: conversationText }
        ],
        temperature: 0.3,
      },
    }),
    30_000
  );

  if (!response.ok || !data) {
    log.error("Conversation analysis error", { status: response.status });
    return errorResponse("Analysis failed", 500, req);
  }

  const content = (data.choices as any)?.[0]?.message?.content;
  const jsonMatch = content?.match(/\{[\s\S]*\}/);
  const result = jsonMatch ? JSON.parse(jsonMatch[0]) : {
    sentimentScore: 50,
    customerSatisfaction: 3,
    churnRisk: 'low',
    salesOpportunity: null,
    topics: [],
    nextSteps: []
  };

  if (contactId && isValidUUID(contactId)) {
    await supabase
      .from('conversation_analyses')
      .insert({
        contact_id: contactId,
        sentiment: result.sentimentScore >= 75 ? 'positive' : result.sentimentScore >= 40 ? 'neutral' : 'negative',
        sentiment_score: result.sentimentScore || 50,
        customer_satisfaction: result.customerSatisfaction || 3,
        topics: result.topics || [],
        next_steps: result.nextSteps || [],
        status: 'pendente',
        message_count: messages.length,
      })
      .catch(() => null);
  }

  log.done(200);
  return jsonResponse(result, 200, req);
}

async function handleTranscribeAudio(
  req: Request,
  body: any,
  log: InstanceType<typeof Logger>,
  userId: string,
  lovableApiKey: string,
) {
  const parsed = parseBody(TranscribeAudioSchema, body);
  if (!parsed.success) return errorResponse(parsed.error, 400, req);

  const { audio_url, language = 'pt-BR' } = parsed.data;

  if (!audio_url) {
    return errorResponse("Missing audio_url", 400, req);
  }

  const systemPrompt = `Você é um transcritor de áudio de alta precisão.
Transcreva o áudio do WhatsApp com exatidão, mantendo pontuação apropriada.
Idioma esperado: ${language}
Responda APENAS com o texto transcrito, sem explicações.`;

  type ContentPart = { type: 'image_url'; image_url: { url: string } } | { type: 'text'; text: string };
  const contentParts: ContentPart[] = [
    { type: 'image_url', image_url: { url: audio_url } },
    { type: 'text', text: systemPrompt }
  ];

  try {
    const { response, data } = await callAiWithTimeout(
      () => callAiWithTracking({
        functionName: 'ai-router',
        userId,
        apiKey: lovableApiKey,
        body: {
          model: 'google/gemini-3-flash-preview',
          messages: [{ role: 'user', content: contentParts }],
        },
      }),
      60_000
    );

    if (!response.ok || !data) {
      log.error("Transcribe error", { status: response.status });
      return errorResponse("Transcription failed", 500, req);
    }

    const transcription = (data.choices as any)?.[0]?.message?.content || '';

    log.done(200, { length: transcription.length });
    return jsonResponse({ transcription, language }, 200, req);
  } catch (e) {
    log.error("Transcription failed", { error: e instanceof Error ? e.message : String(e) });
    return errorResponse("Transcription failed", 500, req);
  }
}

// ============================================================================
// Main dispatcher
// ============================================================================

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("ai-router");

  try {
    // P0-FIX-001: Rate limit BEFORE authentication to prevent brute force
    const clientIP = getClientIP(req);
    const { allowed: globalRateLimited } = checkRateLimit(`router:global:${clientIP}`, 50, 60_000);
    if (!globalRateLimited) return errorResponse("Rate limit exceeded. Please try again later.", 429, req);

    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;
    const userId = authed.user.id;

    // P0-FIX-002: Validate JWT algorithm to prevent algorithm confusion attacks
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const parts = token.split('.');
        if (parts.length !== 3) throw new Error('Invalid JWT format');
        const header = JSON.parse(atob(parts[0]));
        if (header.alg !== 'HS256' && header.alg !== 'RS256') {
          log.warn('JWT with unexpected algorithm', { alg: header.alg });
          return errorResponse('Invalid authentication', 401, req);
        }
      } catch (e) {
        log.warn('JWT validation failed', { error: e instanceof Error ? e.message : String(e) });
        return errorResponse('Invalid authentication', 401, req);
      }
    }

    const body = await req.json();
    const { action } = body as AiRouterRequest;

    if (!action) {
      return errorResponse("Missing required field: action", 400, req);
    }

    const lovableApiKey = requireEnv("LOVABLE_API_KEY");
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    log.info("Routing AI action", { action });

    switch (action) {
      case 'conversation_summary':
        return await handleConversationSummary(req, body, log, userId, supabase, lovableApiKey);
      case 'enhance_message':
        return await handleEnhanceMessage(req, body, log, userId, lovableApiKey);
      case 'classify_emoji':
        return await handleClassifyEmoji(req, body, log, userId, lovableApiKey);
      case 'classify_sticker':
        return await handleClassifySticker(req, body, log, userId, lovableApiKey);
      case 'auto_tag':
        return await handleAutoTag(req, body, log, userId, supabase, lovableApiKey);
      case 'churn_analysis':
        return await handleChurnAnalysis(req, body, log, userId, supabase, lovableApiKey);
      case 'classify_tickets':
        return errorResponse(`Action 'classify_tickets' not yet implemented`, 501, req);
      case 'conversation_analysis':
        return await handleConversationAnalysis(req, body, log, userId, supabase, lovableApiKey);
      case 'suggest_reply':
        return await handleSuggestReply(req, body, log, userId, supabase, lovableApiKey);
      case 'transcribe_audio':
        return await handleTranscribeAudio(req, body, log, userId, lovableApiKey);
      default:
        return errorResponse(`Unknown action: ${action}`, 400, req);
    }
  } catch (error) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse('Internal server error', 500, req);
  }
});
