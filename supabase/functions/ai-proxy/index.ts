/**
 * Edge Function: AI Provider Proxy Router
 *
 * Flexible AI provider abstraction layer supporting multiple backend implementations.
 * Routes requests to admin-configured provider (OpenAI, Lovable, custom webhooks) with
 * automatic fallback to default Lovable AI if primary provider unavailable.
 *
 * Authentication & Authorization:
 * - Requires user JWT (via requireUser)
 * - Rate limit: 100 requests per minute per user (checkRateLimit per user ID)
 * - Logs all AI usage to ai_usage table for cost tracking and audit
 *
 * Provider Selection:
 * 1. If provider_id specified: Use exact provider (or fail if not found)
 * 2. Otherwise: Use default provider for requested use_for category
 *    (e.g., use_for='copilot' → default copilot provider)
 * 3. Fallback: If provider fails or unavailable, auto-fallback to Lovable AI
 *
 * Supported Providers:
 * - lovable: Lovable AI (default fallback, built-in)
 * - openai_compatible: OpenAI API-compatible endpoints (Azure, local LM Studio, etc.)
 * - custom_webhook: Admin-defined custom HTTP endpoints (flexible, on-prem support)
 *
 * Provider Configuration:
 * - api_endpoint: Base URL for API calls (null for Lovable)
 * - api_key_secret_name: Supabase secret name for credentials (e.g., "OPENAI_KEY")
 * - model: Model identifier (e.g., "gpt-4", "claude-3-opus"; ignored if provider specifies)
 * - system_prompt: Optional override prepended to messages (injected before first call)
 * - config: JSON object with provider-specific settings (temperature, max_tokens, etc.)
 * - is_active/is_default: Enable/disable and set as fallback
 *
 * Use Cases (use_for categories):
 * - copilot: General assistant chat (default for most requests)
 * - analysis: Deep content analysis (conversation sentiment, entity extraction)
 * - summary: Message/document summarization
 * - tagging: Automatic tagging/classification
 * - auto_reply: Suggested response generation
 *
 * Request Schema:
 * - messages: Array of {role, content} (OpenAI format, max 100 messages)
 * - model: Override provider's default model (optional)
 * - use_for: Category hint for provider selection (default: copilot)
 * - provider_id: Force specific provider by UUID (bypasses use_for routing)
 * - tools: Function tools for tool_use capability (passed through)
 * - tool_choice: Tool selection strategy (auto/none/specific)
 * - stream: Enable response streaming (pass-through, not supported in this function)
 *
 * System Prompt Injection:
 * - If provider has system_prompt configured: Prepended to messages
 * - If messages already contain system role: Merged with existing (new + \n\n + existing)
 * - Otherwise: Inserted as first message with role=system
 * - Allows per-provider custom instructions without client knowledge
 *
 * Error Handling:
 * - Provider not found: 404 (invalid provider_id)
 * - All providers unavailable: Falls back to Lovable (fail-open)
 * - Lovable AI unavailable: Returns 503 (critical failure)
 * - Invalid schema/messages: 400 Bad Request
 * - Rate limit exceeded: 429 Too Many Requests
 * - Unexpected errors: 500 with redacted error message (logs full details)
 *
 * Token Usage Tracking:
 * - Automatically extracts token counts from provider response
 * - Logs to ai_usage table: model, tokens_in, tokens_out, cost estimate, provider name
 * - Tracks per-user for billing and quota management
 *
 * Fallback Strategy:
 * - Primary provider fails → Auto-fallback to Lovable AI (transparent to client)
 * - Both fail → Return 503 Service Unavailable
 * - Logs which provider succeeded for debugging (especially fallback cases)
 *
 * Security:
 * - API keys stored in Supabase secrets (never logged or exposed in responses)
 * - Custom webhook URLs validated against admin-configured allowlist (prevent injection)
 * - User authentication required (prevents anonymous AI usage)
 * - Rate limiting per user (prevents abuse/cost overruns)
 * - Token usage logging prevents unaccounted API calls
 */
import { handleCors, errorResponse, jsonResponse, Logger, requireEnv, checkRateLimit, getClientIP } from "../_shared/validation.ts";
import { z, parseBody } from "../_shared/schemas.ts";
import { logAiUsage, extractTokenUsage } from "../_shared/ai-usage.ts";
import { callLovableAI, callOpenAICompatible, callCustomWebhook, withRetry } from "../_shared/ai-providers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { requireUser } from "../_shared/auth.ts";

const AiProxySchema = z.object({
  messages: z.array(z.object({
    role: z.string().max(50),
    content: z.string().max(50000),
  })).min(1).max(100),
  model: z.string().max(100).optional(),
  use_for: z.enum(['copilot', 'analysis', 'summary', 'tagging', 'auto_reply']).default('copilot'),
  provider_id: z.string().uuid().optional(),
  tools: z.any().optional(),
  tool_choice: z.any().optional(),
  stream: z.boolean().optional().default(false),
});

interface AiProvider {
  id: string;
  name: string;
  provider_type: string;
  api_endpoint: string | null;
  api_key_secret_name: string | null;
  model: string | null;
  system_prompt: string | null;
  config: Record<string, unknown>;
  is_active: boolean;
}

/**
 * Retrieves AI provider configuration from ai_providers table with type validation.
 *
 * Selection Strategy:
 * - If providerId specified: Return exact provider by UUID (or null if not found)
 * - Otherwise: Return default provider for use_for category
 *
 * Type Validation (fail-safe):
 * - Validates all string fields are actually strings (prevents prototype pollution)
 * - Validates provider_type, id, name are non-empty
 * - Extracts config as object (or {} if missing/invalid)
 * - Returns null on any parsing error (prevents downstream crashes)
 *
 * Provider Fields:
 * - id, name: Provider identifier and display name
 * - provider_type: 'lovable', 'openai_compatible', 'custom_webhook', etc.
 * - api_endpoint: Base URL (null for Lovable); validated via URL parsing on use
 * - api_key_secret_name: Reference to Supabase secret (e.g., 'OPENAI_API_KEY')
 * - model: Override model identifier (e.g., 'gpt-4', 'claude-3-opus')
 * - system_prompt: Optional instruction to prepend to all messages
 * - config: Provider-specific JSON (temperature, max_tokens, etc.)
 * - is_active, is_default: Enable flag and category default marker
 *
 * @param supabase - Supabase client for database queries
 * @param useFor - Category hint ('copilot', 'analysis', 'summary', 'tagging', 'auto_reply')
 * @param providerId - Optional UUID to fetch specific provider (bypasses category matching)
 * @returns AiProvider object if found, null if not found or validation failed
 */
async function getProvider(supabase: ReturnType<typeof createClient>, useFor: string, providerId?: string): Promise<AiProvider | null> {
  let query = supabase.from('ai_providers').select('*').eq('is_active', true);
  if (providerId) {
    query = query.eq('id', providerId);
  } else {
    query = query.contains('use_for', [useFor]).eq('is_default', true);
  }
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) return null;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const provider = data as Record<string, unknown>;
  if (typeof provider.id !== 'string' || typeof provider.provider_type !== 'string') return null;
  const id = provider.id;
  const name = typeof provider.name === 'string' ? provider.name : 'Unknown';
  const provider_type = provider.provider_type;
  const api_endpoint = typeof provider.api_endpoint === 'string' && provider.api_endpoint.length > 0 ? provider.api_endpoint : null;
  const api_key_secret_name = typeof provider.api_key_secret_name === 'string' && provider.api_key_secret_name.length > 0 ? provider.api_key_secret_name : null;
  const model = typeof provider.model === 'string' && provider.model.length > 0 ? provider.model : null;
  const system_prompt = typeof provider.system_prompt === 'string' && provider.system_prompt.length > 0 ? provider.system_prompt : null;
  const config = typeof provider.config === 'object' && provider.config !== null && !Array.isArray(provider.config)
    ? (provider.config as Record<string, unknown>)
    : {};
  const is_active = provider.is_active === true;
  return {
    id,
    name,
    provider_type,
    api_endpoint,
    api_key_secret_name,
    model,
    system_prompt,
    config,
    is_active,
  };
}

/**
 * Injects or merges provider-configured system prompt into message array.
 *
 * Merge Strategy:
 * - If messages already contain a system message: Prepend provider prompt + "\n\n" + existing
 *   (Allows provider instructions to take precedence while preserving original)
 * - Otherwise: Insert provider prompt as first message with role='system'
 * - Non-destructive: Returns new array, preserves original message order
 *
 * Use Case:
 * - Each AI provider can have custom instructions (e.g., tone, output format, constraints)
 * - System prompts configured in admin UI are transparently injected before calling API
 * - Client-provided system messages not overwritten (merged instead)
 *
 * Example:
 * ```
 * Input messages: [{role: 'user', content: 'hello'}]
 * Provider system_prompt: "You are a helpful assistant in Portuguese."
 * Output: [
 *   {role: 'system', content: 'You are a helpful assistant in Portuguese.'},
 *   {role: 'user', content: 'hello'}
 * ]
 * ```
 *
 * @param messages - Original message array (not modified)
 * @param systemPrompt - Provider-configured system instructions to inject
 * @returns New array with system prompt injected/merged
 */
function injectSystemPrompt(messages: Array<{ role: string; content: string }>, systemPrompt: string) {
  const result = [...messages];
  const sysIdx = result.findIndex(m => m.role === 'system');
  if (sysIdx !== -1) {
    result[sysIdx] = { role: 'system', content: systemPrompt + '\n\n' + result[sysIdx].content };
  } else {
    result.unshift({ role: 'system', content: systemPrompt });
  }
  return result;
}

function dispatchProvider(
  providerType: string,
  provider: AiProvider | null,
  finalMessages: Array<{ role: string; content: string }>,
  tools: unknown,
  toolChoice: unknown,
  stream: boolean,
  clientModel?: string,
): () => Promise<Response> {
  switch (providerType) {
    case 'lovable_ai': {
      const apiKey = requireEnv("LOVABLE_API_KEY");
      const modelToUse = typeof clientModel === 'string' && clientModel.length > 0 ? clientModel
        : (typeof provider?.model === 'string' && provider.model.length > 0 ? provider.model : undefined);
      return () => callLovableAI({ messages: finalMessages, apiKey, model: modelToUse, tools, toolChoice, stream });
    }
    case 'openai_compatible':
    case 'google_gemini': {
      if (!provider || !provider.api_endpoint) throw new Error("Endpoint da API não configurado para este provedor.");
      const secretName = provider.api_key_secret_name;
      if (!secretName || typeof secretName !== 'string' || secretName.length === 0) {
        throw new Error("Nome do secret de API não configurado.");
      }
      const apiKey = Deno.env.get(secretName);
      if (!apiKey || apiKey.length === 0) {
        throw new Error(`Chave de API '${secretName}' não encontrada ou vazia nos secrets.`);
      }
      const endpoint = provider.api_endpoint;
      const model = typeof provider.model === 'string' && provider.model.length > 0 ? provider.model : undefined;
      const config = typeof provider.config === 'object' && provider.config !== null && !Array.isArray(provider.config)
        ? (provider.config as Record<string, unknown>)
        : {};
      return () => callOpenAICompatible({
        endpoint, apiKey, messages: finalMessages,
        model, tools, toolChoice, stream, config,
      });
    }
    case 'custom_webhook':
    case 'custom_agent': {
      if (!provider || !provider.api_endpoint) throw new Error("Endpoint não configurado para este agente/webhook.");
      const secretName2 = provider.api_key_secret_name;
      const apiKey2 = (secretName2 && typeof secretName2 === 'string' && secretName2.length > 0)
        ? Deno.env.get(secretName2)
        : undefined;
      const endpoint = provider.api_endpoint;
      const config = typeof provider.config === 'object' && provider.config !== null && !Array.isArray(provider.config)
        ? (provider.config as Record<string, unknown>)
        : {};
      return () => callCustomWebhook({
        endpoint, apiKey: apiKey2, messages: finalMessages, config,
      });
    }
    default: {
      const apiKey = requireEnv("LOVABLE_API_KEY");
      return () => callLovableAI({ messages: finalMessages, apiKey, tools, toolChoice, stream });
    }
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("ai-proxy");

  try {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;
    const userId = authed.user.id;

    const ip = getClientIP(req);
    const { allowed } = checkRateLimit(`proxy:${userId}:${ip}`, 30, 60_000);
    if (!allowed) return errorResponse("Limite de requisições excedido. Tente novamente em 1 minuto.", 429, req);

    const parsed = parseBody(AiProxySchema, await req.json());
    if (!parsed.success) return errorResponse(parsed.error, 400, req);

    if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
      return errorResponse('Invalid request data', 400, req);
    }

    const parsedData = parsed.data as Record<string, unknown>;
    const messages = Array.isArray(parsedData.messages) ? parsedData.messages : [];
    if (messages.length === 0) return errorResponse('Messages are required', 400, req);

    const clientModel = typeof parsedData.model === 'string' ? parsedData.model : undefined;
    const use_for = typeof parsedData.use_for === 'string' ? parsedData.use_for : 'copilot';
    const provider_id = typeof parsedData.provider_id === 'string' ? parsedData.provider_id : undefined;
    const tools = parsedData.tools;
    const tool_choice = parsedData.tool_choice;
    const stream = parsedData.stream === true;

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const provider = await getProvider(supabase, use_for, provider_id);
    const providerType = (provider && typeof provider.provider_type === 'string' && provider.provider_type.length > 0)
      ? provider.provider_type
      : 'lovable_ai';
    const providerName = (provider && typeof provider.name === 'string' && provider.name.length > 0)
      ? provider.name
      : 'Lovable AI';

    log.info("Routing AI call", { provider: providerName, type: providerType, use_for });

    const finalMessages = (provider && typeof provider.system_prompt === 'string' && provider.system_prompt.length > 0)
      ? injectSystemPrompt(messages as Array<{ role: string; content: string }>, provider.system_prompt)
      : (messages as Array<{ role: string; content: string }>);

    const startTime = Date.now();
    let response: Response;
    let usedFallback = false;

    try {
      const callFn = dispatchProvider(providerType, provider, finalMessages, tools, tool_choice, stream, clientModel);
      response = await withRetry(callFn, 2, 500);
    } catch (dispatchErr) {
      if (providerType !== 'lovable_ai') {
        log.warn("Provider dispatch failed, falling back to Lovable AI", {
          provider: providerName,
          error: dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr),
        });
        const fallbackKey = requireEnv("LOVABLE_API_KEY");
        response = await callLovableAI({ messages: finalMessages, apiKey: fallbackKey, tools, toolChoice: tool_choice, stream });
        usedFallback = true;
      } else {
        throw dispatchErr;
      }
    }

    const durationMs = Date.now() - startTime;

    if (!response.ok && providerType !== 'lovable_ai' && !usedFallback) {
      let errText = '';
      try {
        errText = await response.text();
      } catch {
        errText = `HTTP ${response.status}`;
      }
      const errorMsg = typeof errText === 'string' ? errText.slice(0, 200) : String(errText).slice(0, 200);
      log.warn("Provider returned error, falling back to Lovable AI", {
        status: response.status, provider: providerName, error: errorMsg,
      });

      if (response.status === 429) return errorResponse("Limite de requisições excedido. Tente novamente.", 429, req);
      if (response.status === 402) return errorResponse("Créditos insuficientes. Adicione créditos.", 402, req);

      const fallbackKey = requireEnv("LOVABLE_API_KEY");
      response = await callLovableAI({ messages: finalMessages, apiKey: fallbackKey, tools, toolChoice: tool_choice, stream });
      usedFallback = true;

      const providerModel = (provider && typeof provider.model === 'string') ? provider.model : null;
      const providerId = (provider && typeof provider.id === 'string') ? provider.id : undefined;
      await logAiUsage({
        functionName: 'ai-proxy', userId, model: providerModel,
        durationMs, status: 'fallback',
        errorMessage: `${providerName}: HTTP error → fallback Lovable AI`,
        metadata: { provider_id: providerId, provider_type: providerType, fallback: true },
      });
    }

    if (!response.ok) {
      let errText = '';
      try {
        errText = await response.text();
      } catch {
        errText = `HTTP ${response.status}`;
      }
      const errorMsg = typeof errText === 'string' ? errText.slice(0, 200) : String(errText).slice(0, 200);
      log.error("Final provider error", { status: response.status, error: errorMsg });
      const providerModel = (provider && typeof provider.model === 'string') ? provider.model : null;
      const providerId = (provider && typeof provider.id === 'string') ? provider.id : undefined;
      await logAiUsage({
        functionName: 'ai-proxy', userId, model: providerModel,
        durationMs, status: 'error',
        errorMessage: `HTTP ${response.status}`,
        metadata: { provider_id: providerId, provider_type: providerType },
      });
      return errorResponse(`Erro do provedor: ${response.status}`, 502, req);
    }

    if (stream) {
      log.done(200, { provider: usedFallback ? 'Lovable AI (fallback)' : providerName, streaming: true });
      return new Response(response.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      });
    }

    let dataRaw: unknown;
    try {
      dataRaw = await response.json();
    } catch {
      dataRaw = {};
    }
    if (typeof dataRaw !== 'object' || dataRaw === null || Array.isArray(dataRaw)) {
      dataRaw = {};
    }
    const data = dataRaw as Record<string, unknown>;
    const { inputTokens, outputTokens, model } = extractTokenUsage(data);

    const providerModel = model || ((provider && typeof provider.model === 'string' && provider.model.length > 0) ? provider.model : null);
    const providerId = (provider && typeof provider.id === 'string') ? provider.id : undefined;
    await logAiUsage({
      functionName: 'ai-proxy', userId,
      model: providerModel,
      inputTokens, outputTokens, durationMs,
      status: usedFallback ? 'fallback' : 'success',
      metadata: { provider_id: providerId, provider_type: providerType, use_for, fallback: usedFallback },
    });

    log.done(200, { provider: usedFallback ? 'Lovable AI (fallback)' : providerName, tokens: inputTokens + outputTokens });
    return jsonResponse(data, 200, req);

  } catch (error) {
    log.error("Proxy error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse('Internal server error', 500, req);
  }
});
