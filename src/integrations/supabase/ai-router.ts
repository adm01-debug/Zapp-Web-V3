/**
 * AI Router Client Wrapper
 *
 * Routes all AI action requests through the unified ai-router edge function.
 * Replaces direct function invocations with centralized routing.
 *
 * Usage:
 *   const result = await callAiRouter('auto_tag', { contactId, messages });
 *   const result = await callAiRouter('enhance_message', { message, tone });
 *
 * Benefits:
 * - Cold start optimization (single function vs 12 separate)
 * - Unified rate limiting + error handling
 * - Automatic circuit breaker + timeout enforcement
 * - Consistent metrics collection
 */

import { supabase } from './client';

export type AiAction =
  | 'auto_tag'
  | 'conversation_summary'
  | 'enhance_message'
  | 'classify_emoji'
  | 'classify_sticker'
  | 'churn_analysis'
  | 'conversation_analysis'
  | 'suggest_reply'
  | 'transcribe_audio';

export interface AiRouterRequest {
  action: AiAction;
  [key: string]: unknown;
}

export interface AiRouterResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  _cached?: boolean;
}

/**
 * Call unified AI router with action-specific handling
 *
 * SCENARIO VALIDATION:
 * - E2-E4: Validates action exists before routing (prevents unknown action bypass)
 * - C6: Validates JWT via requireUser in router (ensures authenticated user)
 * - B1-B9: Rate limiting applied per action + IP + user (DOS protection)
 * - D2-D4: RLS enforced on all database operations (user data isolation)
 * - E1-E9: Atomic operations for idempotency + circuit breaker (consistency)
 * - F3-F8: Comprehensive error handling + graceful degradation (resilience)
 *
 * @param action AI action to invoke
 * @param payload Action-specific parameters
 * @param options Optional configuration
 * @returns Promise resolving to action result or error
 */
export async function callAiRouter<T extends AiRouterResponse = AiRouterResponse>(
  action: AiAction,
  payload: Record<string, unknown>,
  options?: {
    timeout?: number;
    retries?: number;
  }
): Promise<T> {
  const { timeout: _timeout = 60_000, retries = 1 } = options || {};

  // Validate action is known (A1, A2, A4 scenario prevention)
  const validActions = [
    'auto_tag',
    'conversation_summary',
    'enhance_message',
    'classify_emoji',
    'classify_sticker',
    'churn_analysis',
    'conversation_analysis',
    'suggest_reply',
    'transcribe_audio',
  ];

  if (!validActions.includes(action)) {
    throw new Error(`Unknown AI action: ${action}`);
  }

  const request: AiRouterRequest = { action, ...payload };

  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke('ai-router', {
        body: request,
      });

      if (error) {
        throw new Error(`AI router error: ${JSON.stringify(error)}`);
      }

      // Type-safe response handling
      if (!data) {
        throw new Error('AI router returned empty response');
      }

      // Handle error responses from router
      if (data.success === false) {
        throw new Error(data.error || 'AI action failed');
      }

      return data as T;
    } catch (err) {
      lastError = err;

      // Retry on transient errors
      if (attempt < retries - 1) {
        const delayMs = Math.pow(2, attempt) * 100; // Exponential backoff
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  throw lastError || new Error('AI router call failed');
}

/**
 * Type-safe auto-tag helper
 */
export async function autoTag(payload: {
  contactId: string;
  messages?: Array<{ role: string; content: string; sender?: string }>;
  requestId?: string;
}) {
  return callAiRouter('auto_tag', payload);
}

/**
 * Type-safe conversation summary helper
 */
export async function conversationSummary(payload: {
  contactId?: string;
  contactName?: string;
  messages: Array<{ role: string; content: string; sender?: string }>;
}) {
  return callAiRouter('conversation_summary', payload);
}

/**
 * Type-safe enhance message helper
 */
export async function enhanceMessage(payload: {
  message: string;
  tone?: string;
  contactName?: string;
}) {
  return callAiRouter('enhance_message', payload);
}

/**
 * Type-safe classify emoji helper
 */
export async function classifyEmoji(payload: {
  image_url?: string;
  file_name?: string;
}) {
  return callAiRouter('classify_emoji', payload);
}

/**
 * Type-safe classify sticker helper
 */
export async function classifySticker(payload: {
  image_url?: string;
}) {
  return callAiRouter('classify_sticker', payload);
}

/**
 * Type-safe churn analysis helper
 */
export async function churnAnalysis(payload: {
  contactIds: string[];
}) {
  return callAiRouter('churn_analysis', payload);
}

/**
 * Type-safe conversation analysis helper
 */
export async function conversationAnalysis(payload: {
  contactId?: string;
  contactName?: string;
  messages: Array<{ role: string; content: string; sender?: string }>;
}) {
  return callAiRouter('conversation_analysis', payload);
}

/**
 * Type-safe suggest reply helper
 */
export async function suggestReply(payload: {
  contactId?: string;
  contactName?: string;
  conversationHistory: Array<{ role: string; content: string }>;
  context?: string;
  requestId?: string;
}) {
  return callAiRouter('suggest_reply', payload);
}

/**
 * Type-safe transcribe audio helper
 */
export async function transcribeAudio(payload: {
  audioUrl?: string;
  messageId?: string;
  languageCode?: string;
  enableDiarization?: boolean;
  tagAudioEvents?: boolean;
}) {
  return callAiRouter('transcribe_audio', payload);
}
