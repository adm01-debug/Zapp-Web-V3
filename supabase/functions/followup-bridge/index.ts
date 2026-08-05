// followup-bridge v1 — AUTOMACOES-09
// Bridges zapp.followup_sequences → evo.evolution_followups
// Called by the frontend when a trigger_event fires for a contact.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createZappAdminClient } from '../_shared/db-client.ts';
import { requireUser } from '../_shared/auth.ts';
import { getCorsHeaders, handleCorsPreflight, jsonResponse, errorResponse } from '../_shared/cors.ts';

// Re-use a single admin client instance per isolate lifetime
const admin = createZappAdminClient();

// ─── Types ─────────────────────────────────────────────────────────────────

interface BridgeBody {
  sequence_id: string;
  contact_jid: string;
  instance_name: string;
  trigger_event?: string;
}

interface FollowupStep {
  id: string | null;
  step_order: number | null;
  delay_hours: number | null;
  message_type: string | null;
  message_template: string | null;
}

// ─── Validation ────────────────────────────────────────────────────────────

function validateBody(raw: unknown): { ok: true; body: BridgeBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Body must be a JSON object' };
  }
  const b = raw as Record<string, unknown>;

  if (!b.sequence_id || typeof b.sequence_id !== 'string' || b.sequence_id.length < 1) {
    return { ok: false, error: 'sequence_id is required (string UUID)' };
  }
  // Basic UUID shape check (relaxed — PostgREST will reject malformed UUIDs)
  if (!/^[0-9a-f-]{32,36}$/i.test(b.sequence_id)) {
    return { ok: false, error: 'sequence_id must be a valid UUID' };
  }
  if (!b.contact_jid || typeof b.contact_jid !== 'string' || b.contact_jid.length < 1) {
    return { ok: false, error: 'contact_jid is required (string)' };
  }
  if (b.contact_jid.length > 200) {
    return { ok: false, error: 'contact_jid too long (max 200 chars)' };
  }
  if (!b.instance_name || typeof b.instance_name !== 'string' || b.instance_name.length < 1) {
    return { ok: false, error: 'instance_name is required (string)' };
  }
  if (b.instance_name.length > 100) {
    return { ok: false, error: 'instance_name too long (max 100 chars)' };
  }
  if (b.trigger_event !== undefined && typeof b.trigger_event !== 'string') {
    return { ok: false, error: 'trigger_event must be a string if provided' };
  }

  return {
    ok: true,
    body: {
      sequence_id: b.sequence_id,
      contact_jid: b.contact_jid,
      instance_name: b.instance_name,
      trigger_event: typeof b.trigger_event === 'string' ? b.trigger_event : undefined,
    },
  };
}

// ─── Handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  // Authenticated frontend call — must present a valid Supabase JWT
  const authed = await requireUser(req);
  if (authed instanceof Response) return authed;

  if (req.method !== 'POST') {
    return errorResponse(req, 'Method not allowed', 405);
  }

  // Parse body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errorResponse(req, 'Invalid JSON body', 400);
  }

  const validation = validateBody(rawBody);
  if (!validation.ok) {
    return errorResponse(req, validation.error, 422);
  }
  const { sequence_id, contact_jid, instance_name, trigger_event } = validation.body;

  try {
    // ── 1. Load sequence (must be active) ──────────────────────────────────
    const { data: sequence, error: seqErr } = await admin
      .from('followup_sequences')
      .select('id, name, is_active, trigger_event')
      .eq('id', sequence_id)
      .eq('is_active', true)
      .maybeSingle();

    if (seqErr) {
      console.error('[followup-bridge] sequence fetch error:', seqErr.message);
      return errorResponse(req, `DB error fetching sequence: ${seqErr.message}`, 500);
    }
    if (!sequence) {
      return errorResponse(req, 'Sequence not found or is inactive', 404);
    }

    // ── 2. Load active steps ordered by step_order ─────────────────────────
    const { data: steps, error: stepsErr } = await admin
      .from('followup_steps')
      .select('id, step_order, delay_hours, message_type, message_template')
      .eq('sequence_id', sequence_id)
      .eq('is_active', true)
      .order('step_order', { ascending: true });

    if (stepsErr) {
      console.error('[followup-bridge] steps fetch error:', stepsErr.message);
      return errorResponse(req, `DB error fetching steps: ${stepsErr.message}`, 500);
    }

    const activeSteps: FollowupStep[] = steps ?? [];
    if (activeSteps.length === 0) {
      return jsonResponse(req, {
        success: true,
        steps_queued: 0,
        sequence_name: sequence.name,
        message: 'No active steps in sequence',
      });
    }

    // ── 3. Resolve contact_id from JID (best-effort; nullable in evo table) ─
    const { data: contact } = await admin
      .from('evolution_contacts')
      .select('id')
      .eq('remote_jid', contact_jid)
      .maybeSingle();
    // contact may be null — processor will mark as failed if contact_id is null
    // but we store the jid in metadata so a future enrichment pass can recover

    const resolvedContactId: string | null = contact?.id ?? null;
    if (!resolvedContactId) {
      console.warn(
        `[followup-bridge] contact not found for jid=${contact_jid}; ` +
        `inserting with contact_id=null (processor will handle)`,
      );
    }

    // ── 4. Build followup inserts ────────────────────────────────────────────
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const resolvedTrigger = trigger_event ?? (sequence.trigger_event as string | null) ?? 'manual';

    const inserts = activeSteps.map((step) => {
      const delayMs = (step.delay_hours ?? 0) * 3_600_000;
      const scheduledAt = new Date(nowMs + delayMs).toISOString();

      return {
        contact_id: resolvedContactId,
        // followup_type is the REQUIRED field — map from step.message_type or fallback to 'sequence'
        followup_type: step.message_type ?? 'sequence',
        scheduled_at: scheduledAt,
        custom_message: step.message_template ?? null,
        instance_name,
        status: 'pending',
        triggered_at: nowIso,
        metadata: {
          sequence_id,
          sequence_name: sequence.name,
          step_id: step.id,
          step_order: step.step_order,
          contact_jid,
          trigger_event: resolvedTrigger,
          bridge_version: 'v1',
        },
      };
    });

    // ── 5. Insert into evolution_followups (via zapp auto-updatable view) ───
    const { error: insertErr } = await admin
      .from('evolution_followups')
      .insert(inserts);

    if (insertErr) {
      console.error('[followup-bridge] insert error:', insertErr.message, { inserts });
      return errorResponse(
        req,
        `Failed to queue followup steps: ${insertErr.message}`,
        500,
      );
    }

    console.log(
      `[followup-bridge] queued ${inserts.length} step(s) for sequence ` +
      `"${sequence.name}" (${sequence_id}), contact_jid=${contact_jid}`,
    );

    return jsonResponse(req, {
      success: true,
      steps_queued: inserts.length,
      sequence_name: sequence.name,
      contact_resolved: resolvedContactId !== null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[followup-bridge] unhandled error:', e);
    return errorResponse(req, `Internal server error: ${msg}`, 500);
  }
});
