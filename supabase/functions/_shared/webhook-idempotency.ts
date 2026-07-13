import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Logger } from "./validation.ts";

/**
 * Webhook idempotency tracker
 * Prevents duplicate processing of the same webhook event
 */

export interface IdempotencyCheckResult {
  isNew: boolean;
  id: string;
  alreadyProcessed: boolean;
}

/**
 * Check if webhook has been processed before
 * Returns immediately if already processed
 * Creates new idempotency record if new
 */
export async function checkWebhookIdempotency(
  supabase: SupabaseClient,
  source: string,
  webhookId: string,
  log: Logger
): Promise<IdempotencyCheckResult> {
  try {
    // Check if webhook already processed
    const { data: existing, error: selectError } = await supabase
      .from("webhook_idempotency")
      .select("id, status")
      .eq("source", source)
      .eq("webhook_id", webhookId)
      .single();

    if (selectError && selectError.code !== "PGRST116") {
      // PGRST116 = not found, which is expected for new webhooks
      log.warn("Error checking webhook idempotency", {
        source,
        webhookId,
        error: selectError.message,
      });
    }

    if (existing) {
      log.info("Webhook already processed", {
        source,
        webhookId,
        status: existing.status,
      });
      return {
        isNew: false,
        id: existing.id,
        alreadyProcessed: existing.status === "success",
      };
    }

    // Create new idempotency record
    const { data: created, error: insertError } = await supabase
      .from("webhook_idempotency")
      .insert({
        source,
        webhook_id: webhookId,
        status: "processing",
      })
      .select("id")
      .single();

    if (insertError) {
      // Unique constraint violation means another process inserted first
      // Check again in that case
      if (insertError.code === "23505") {
        log.warn("Race condition: webhook already exists", {
          source,
          webhookId,
        });
        return checkWebhookIdempotency(supabase, source, webhookId, log);
      }

      log.error("Failed to create webhook idempotency record", {
        source,
        webhookId,
        error: insertError.message,
      });
      throw insertError;
    }

    log.info("Created webhook idempotency record", {
      source,
      webhookId,
      id: created.id,
    });

    return {
      isNew: true,
      id: created.id,
      alreadyProcessed: false,
    };
  } catch (error) {
    log.error("Webhook idempotency check failed", {
      source,
      webhookId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Mark webhook as successfully processed
 */
export async function markWebhookProcessed(
  supabase: SupabaseClient,
  idempotencyId: string,
  log: Logger
): Promise<void> {
  try {
    const { error } = await supabase
      .from("webhook_idempotency")
      .update({
        status: "success",
        processed_at: new Date().toISOString(),
      })
      .eq("id", idempotencyId);

    if (error) {
      log.error("Failed to mark webhook as processed", {
        idempotencyId,
        error: error.message,
      });
      throw error;
    }

    log.info("Marked webhook as processed", { idempotencyId });
  } catch (error) {
    log.error("Failed to update webhook status", {
      idempotencyId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Mark webhook processing as failed
 */
export async function markWebhookFailed(
  supabase: SupabaseClient,
  idempotencyId: string,
  errorMessage: string,
  log: Logger
): Promise<void> {
  try {
    const { error } = await supabase
      .from("webhook_idempotency")
      .update({
        status: "failed",
        error_message: errorMessage,
        processed_at: new Date().toISOString(),
      })
      .eq("id", idempotencyId);

    if (error) {
      log.error("Failed to mark webhook as failed", {
        idempotencyId,
        error: error.message,
      });
      throw error;
    }

    log.info("Marked webhook as failed", { idempotencyId, errorMessage });
  } catch (error) {
    log.error("Failed to update webhook failure status", {
      idempotencyId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
