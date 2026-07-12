import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  handleCors, errorResponse, jsonResponse,
  sanitizeString, isValidUUID, checkRateLimit, getClientIP, requireEnv, Logger,
} from "../_shared/validation.ts";
import { AiAutoTagSchema, parseBody } from "../_shared/schemas.ts";
import { callAiWithTracking, extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { requireUser } from "../_shared/auth.ts";
import { withCircuitBreaker } from "../_shared/circuit-breaker.ts";
import { callAiWithTimeout } from "../_shared/timeout-wrapper.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("ai-auto-tag");
  const userId = extractUserIdFromRequest(req);

  try {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;

    const ip = getClientIP(req);
    const { allowed } = checkRateLimit(`autotag:${ip}`, 20, 60_000);
    if (!allowed) return errorResponse("Rate limit exceeded", 429, req);

    const parsed = parseBody(AiAutoTagSchema, await req.json());
    if (!parsed.success) return errorResponse(parsed.error, 400, req);

    // P1-FIX-008: Check for duplicate request (idempotency)
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // GAP-1 FIX: Wrap RPC call with try-catch for graceful degradation
    // This allows function to work even if RPC doesn't exist (e.g., during CI tests before migrations)
    let dupCheck: unknown = null;
    if (parsed.data.requestId) {
      try {
        const result = await supabase.rpc('check_duplicate_request', {
          p_request_id: parsed.data.requestId,
          p_action: 'auto-tag',
          p_user_id: authed.user.id,
        });
        dupCheck = result.data;
      } catch (error) {
        // GAP-1: RPC function may not exist if migrations not yet applied
        // Log warning but don't fail - proceed without deduplication
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('does not exist') || errorMsg.includes('Unknown function')) {
          log.warn("Deduplication RPC not available (migrations may not be applied)", {
            error: errorMsg,
            requestId: parsed.data.requestId
          });
        } else {
          log.warn("Deduplication check failed, proceeding without cache", {
            error: errorMsg,
            requestId: parsed.data.requestId
          });
        }
        dupCheck = null;
      }

      // GAP-2 FIX: Add null safety checks
      if (dupCheck && Array.isArray(dupCheck) && dupCheck.length > 0 && dupCheck[0]?.is_duplicate) {
        const cachedResult = dupCheck[0].cached_result;
        const statusCode = typeof dupCheck[0].status_code === 'number' ? dupCheck[0].status_code : 200;

        // Validate cached result before returning
        if (typeof cachedResult === 'object' && cachedResult !== null) {
          log.info("Duplicate request detected, returning cached result", {
            requestId: parsed.data.requestId,
            statusCode
          });
          return jsonResponse(cachedResult, statusCode, req);
        }
      }
    }

    const { contactId, messages: inputMessages } = parsed.data;
    const validContactId = contactId && isValidUUID(contactId) ? contactId : null;

    const LOVABLE_API_KEY = requireEnv("LOVABLE_API_KEY");

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
      .map((m) =>
        `${sanitizeString(String(m.sender || 'unknown'), 50)}: ${sanitizeString(String(m.content || ''), 1000)}`
      )
      .join('\n');

    const { data: queues } = await supabase
      .from('queues')
      .select('id, name, description')
      .eq('is_active', true);

    const queueList = queues && queues.length > 0
      ? queues.map((q: { name: string; id: string; description: string | null }) =>
          `- "${q.name}" (${q.id}): ${q.description || 'Sem descrição'}`
        ).join('\n')
      : '';

    log.info("Classifying conversation", { contactId: validContactId, msgCount: conversationMessages.length });

    // GAP-9 FIX: Use performance.now() for higher precision timing
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let response, data;
    let metricsStatus = 'success';
    let errorMessage: string | null = null;
    let metricsMetadata: Record<string, unknown> = { requestId: parsed.data.requestId };

    try {
      // P1: Circuit breaker + P0: Timeout wrapper
      const { response: resp, data: d } = await withCircuitBreaker(
        'lovable-auto-tag',
        () => callAiWithTimeout(
          'auto-tag',
          () => callAiWithTracking({
            functionName: 'ai-auto-tag',
            userId,
            apiKey: LOVABLE_API_KEY,
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
          })
        )
      );
      response = resp;
      data = d;
    } catch (error) {
      // GAP-9 FIX: Use performance.now() for precision
      const durationMs = typeof performance !== 'undefined'
        ? Math.round((performance.now() - (startTime as number)) * 100) / 100
        : Date.now() - (startTime as number);
      const errorMsg = error instanceof Error ? error.message : String(error);

      // GAP-3 FIX: Better error context for timeouts
      if (errorMsg.includes('timeout')) {
        metricsStatus = 'timeout';
        errorMessage = `AI API timeout (30s) - ${errorMsg}`;
        metricsMetadata.timeout_duration_ms = durationMs;
      }
      // GAP-4 FIX: Export circuit breaker state for debugging
      else if (errorMsg.includes('Circuit breaker OPEN')) {
        metricsStatus = 'circuit_open';
        errorMessage = `Circuit breaker open for lovable-auto-tag - service degraded (${errorMsg})`;
        metricsMetadata.circuit_breaker_state = 'OPEN';
      } else {
        metricsStatus = 'error';
        errorMessage = errorMsg;
      }

      // Record metrics before throwing
      await supabase.rpc('record_ai_metrics', {
        p_function_name: 'ai-auto-tag',
        p_action: 'classification',
        p_duration_ms: Math.round(durationMs),
        p_status: metricsStatus,
        p_user_id: userId,
        p_error_message: errorMessage,
        p_metadata: metricsMetadata,
      }).catch(() => {}); // Metrics not critical

      throw error;
    }

    if (!response.ok || !data) {
      if (response.status === 429) return errorResponse("Rate limit exceeded", 429, req);
      if (response.status === 402) return errorResponse("Payment required", 402, req);
      throw new Error(`AI error: ${response.status}`);
    }

    const content = (data.choices as Array<{message: {content: string}}>)?.[0]?.message?.content;

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
    // Prevent prompt injection from assigning a queue_id that wasn't in the fetched set
    const validQueueIds = new Set((queues ?? []).map((q: { id: string }) => q.id));
    if (result.suggested_queue_id && !validQueueIds.has(result.suggested_queue_id)) {
      result.suggested_queue_id = null;
    }

    // P0-FIX-003: Use atomic tag upsert to prevent race conditions
    // GAP-5 FIX: Properly track and return tag upsert errors
    const tagUpdateResult: Record<string, unknown> = {
      attempted: false,
      success: false,
      error: null,
    };

    if (validContactId && result.tags?.length > 0) {
      const tagData = result.tags.map((t: { name: string; confidence: number }) => ({
        name: sanitizeString(t.name, 100) || 'unknown',
        confidence: Math.min(Math.max(Number(t.confidence) || 0, 0), 1),
      }));

      try {
        const { data: atomicResult, error: atomicErr } = await supabase.rpc('upsert_conversation_tags_atomic', {
          p_contact_id: validContactId,
          p_new_tags: JSON.stringify(tagData),
          p_should_delete_stale: true,
        });

        tagUpdateResult.attempted = true;

        if (atomicErr) {
          tagUpdateResult.error = atomicErr.message;
          log.warn("Failed to atomically upsert tags", {
            error: atomicErr.message,
            contactId: validContactId,
            tagCount: tagData.length
          });
        } else if (atomicResult && typeof atomicResult === 'object' && 'success' in atomicResult) {
          tagUpdateResult.success = (atomicResult as any).success === true;
          if (!(atomicResult as any).success) {
            tagUpdateResult.error = (atomicResult as any).error || "Unknown error";
            log.warn("Atomic upsert failed", {
              error: tagUpdateResult.error,
              contactId: validContactId
            });
          }
        }
      } catch (error) {
        tagUpdateResult.attempted = true;
        tagUpdateResult.error = error instanceof Error ? error.message : String(error);
        log.error("Unexpected error during tag upsert", {
          error: tagUpdateResult.error,
          contactId: validContactId
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
        // GAP-7 FIX: Handle contact update errors
        try {
          const { error: updateErr } = await supabase.from('contacts').update(updateData).eq('id', validContactId);
          if (updateErr) {
            log.warn("Failed to update contact metadata", {
              error: updateErr.message,
              contactId: validContactId,
              updateFields: Object.keys(updateData)
            });
          }
        } catch (error) {
          log.error("Unexpected error updating contact", {
            error: error instanceof Error ? error.message : String(error),
            contactId: validContactId
          });
        }
      }

      if (result.requires_immediate_attention && result.priority === 'urgent') {
        // GAP-8 FIX: Handle admin notification errors
        try {
          const { data: admins } = await supabase
            .from('user_roles')
            .select('user_id')
            .in('role', ['admin', 'supervisor'])
            .limit(5);

          if (admins && Array.isArray(admins) && admins.length > 0) {
            const { error: insertErr } = await supabase.from('notifications').insert(
              admins.map((a: { user_id: string }) => ({
                user_id: a.user_id,
                type: 'urgent_conversation',
                title: '🚨 Conversa Urgente Detectada',
                message: `${sanitizeString(result.summary, 200) || 'Conversa requer atenção imediata'}. Motivo: ${sanitizeString(result.escalation_reason || result.priority_reason, 200) || 'Alta prioridade'}`,
                metadata: { contact_id: validContactId, priority: result.priority, sentiment: result.sentiment },
              }))
            );

            if (insertErr) {
              log.error("Failed to insert urgent notifications", {
                error: insertErr.message,
                contactId: validContactId,
                adminCount: admins.length
              });
            }
          } else {
            log.info("No admins found to notify for urgent conversation", { contactId: validContactId });
          }
        } catch (error) {
          log.error("Unexpected error creating urgent notifications", {
            error: error instanceof Error ? error.message : String(error),
            contactId: validContactId
          });
        }
      }
    }

    // P1-FIX-008: Record result for idempotency deduplication
    if (parsed.data.requestId) {
      await supabase.rpc('record_processed_request', {
        p_request_id: parsed.data.requestId,
        p_action: 'auto-tag',
        p_user_id: authed.user.id,
        p_contact_id: validContactId,
        p_status_code: 200,
        p_result_payload: result,
      }).catch(() => {}); // Not critical if this fails
    }

    // Record success metrics
    const durationMs = typeof performance !== 'undefined'
      ? Math.round((performance.now() - (startTime as number)) * 100) / 100
      : Date.now() - (startTime as number);

    await supabase.rpc('record_ai_metrics', {
      p_function_name: 'ai-auto-tag',
      p_action: 'classification',
      p_duration_ms: Math.round(durationMs),
      p_status: 'success',
      p_user_id: userId,
      p_error_message: null,
      p_metadata: {
        tags_count: result.tags?.length || 0,
        sentiment: result.sentiment,
        priority: result.priority,
        requestId: parsed.data.requestId,
        tag_update_success: tagUpdateResult.success,
      },
    }).catch(() => {}); // Metrics not critical

    log.done(200, { tags: result.tags?.length || 0, durationMs });

    // Return response with tag update status (GAP-5 fix)
    const responsePayload = {
      ...result,
      tagUpdateResult: {
        attempted: tagUpdateResult.attempted,
        success: tagUpdateResult.success,
        error: tagUpdateResult.error,
      }
    };

    return jsonResponse(responsePayload, 200, req);
  } catch (error: unknown) {
    const durationMs = typeof performance !== 'undefined' && typeof startTime === 'number'
      ? Math.round((performance.now() - startTime) * 100) / 100
      : typeof startTime === 'number'
        ? Date.now() - startTime
        : 0;
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Record error metrics
    await supabase.rpc('record_ai_metrics', {
      p_function_name: 'ai-auto-tag',
      p_action: 'classification',
      p_duration_ms: Math.round(durationMs),
      p_status: 'error',
      p_user_id: userId,
      p_error_message: errorMsg,
      p_metadata: { requestId: parsed?.data?.requestId },
    }).catch(() => {}); // Metrics not critical

    log.error("Unhandled error in ai-auto-tag", { error: errorMsg, duration: durationMs });
    return errorResponse("Internal server error", 500, req);
  }
});
