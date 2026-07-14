import { v4 as uuidv4 } from "https://deno.land/std@0.208.0/uuid/mod.ts";

/**
 * Webhook Idempotency Handler
 *
 * Ensures webhook payloads are processed exactly-once even if delivered multiple times.
 * Supports multiple sources of idempotency keys:
 * - X-Idempotency-Key header (standard pattern)
 * - X-Webhook-Delivery-Id header (GitHub/Meta pattern)
 * - Payload event_id field
 * - Generated request ID as fallback
 *
 * Usage:
 *   const idempotencyKey = extractIdempotencyKey(req, payload);
 *   const isDuplicate = await checkAndMarkIdempotent(supabase, idempotencyKey, context);
 *   if (isDuplicate) return { success: true, duplicate: true };
 */

export function extractIdempotencyKey(
  req: Request,
  payload?: Record<string, unknown>
): string {
  const headers = req.headers;

  // Try standard idempotency header first
  const headerKey = headers.get("x-idempotency-key");
  if (headerKey) return headerKey;

  // Try webhook delivery ID (GitHub, Meta pattern)
  const deliveryId = headers.get("x-webhook-delivery-id") || headers.get("x-delivery-id");
  if (deliveryId) return deliveryId;

  // Try event ID from payload
  if (payload?.event_id && typeof payload.event_id === "string") {
    return payload.event_id;
  }

  // Fallback: generate unique ID
  return `webhook-${uuidv4()}`;
}

interface IdempotencyContext {
  webhookType: string;
  instance?: string;
  userId?: string;
  timestamp?: number;
}

export async function checkAndMarkIdempotent(
  supabase: any,
  idempotencyKey: string,
  context: IdempotencyContext
): Promise<{
  isDuplicate: boolean;
  processedAt?: string;
}> {
  try {
    // Check if already processed
    const { data: existing, error: selectError } = await supabase
      .from("webhook_idempotency_keys")
      .select("processed_at")
      .eq("idempotency_key", idempotencyKey)
      .eq("webhook_type", context.webhookType)
      .maybeSingle();

    if (selectError && selectError.code !== "PGRST116") {
      console.error(
        `[idempotency] select error for key=${idempotencyKey.slice(0, 16)}…:`,
        selectError
      );
      return { isDuplicate: false };
    }

    if (existing) {
      console.debug(
        `[idempotency] duplicate detected: key=${idempotencyKey.slice(0, 16)}… processed at ${existing.processed_at}`
      );
      return { isDuplicate: true, processedAt: existing.processed_at };
    }

    // Mark as processed
    const now = new Date().toISOString();
    const { error: insertError } = await supabase
      .from("webhook_idempotency_keys")
      .insert({
        idempotency_key: idempotencyKey,
        webhook_type: context.webhookType,
        instance_name: context.instance || null,
        user_id: context.userId || null,
        processed_at: now,
      });

    if (insertError) {
      console.error(
        `[idempotency] insert error for key=${idempotencyKey.slice(0, 16)}…:`,
        insertError
      );
      return { isDuplicate: false };
    }

    return { isDuplicate: false };
  } catch (error) {
    console.error(
      `[idempotency] exception checking key=${idempotencyKey.slice(0, 16)}…:`,
      error
    );
    // Fail open — allow processing on error rather than blocking
    return { isDuplicate: false };
  }
}

/**
 * Cleanup old idempotency keys (run in scheduled job)
 * Keep keys for 24 hours to catch retries
 */
export async function cleanupOldIdempotencyKeys(
  supabase: any,
  maxAgeHours: number = 24
): Promise<number> {
  const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("webhook_idempotency_keys")
    .delete()
    .lt("processed_at", cutoffTime);

  if (error) {
    console.error("[idempotency-cleanup] delete error:", error);
    return 0;
  }

  return (data as any[])?.length ?? 0;
}
