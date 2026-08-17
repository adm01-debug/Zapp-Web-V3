// followup-bridge v2 — AUTOMACOES-09 / G8
// Bridges zapp.evolution_followup_rules → zapp.evolution_followups
// Called by the frontend when a trigger_event fires for a contact (or a
// manual trigger from the Follow-up settings panel).
//
// v2 (2026-08-17, G8): passou a ler as tabelas REAIS do motor
//   (zapp.evolution_followup_rules, agrupadas por sequence_group). v1 lia
//   zapp.followup_sequences/followup_steps — tabelas mortas (0 rows no prod,
//   sem consumidor) → qualquer disparo retornava 404 "Sequence not found".
//   sequence_id agora aceita o sequence_group (texto, ex. 'stage_change_rules')
//   ou o id da regra (UUID).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createZappAdminClient } from '../_shared/db-client.ts';
import { requireUser } from '../_shared/auth.ts';
import { handleCorsPreflight, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { parseOrReject } from '../_shared/contract-kit.ts';
import { FollowupBridgeV1Schema } from '../_shared/contract-schemas.ts';

// Re-use a single admin client instance per isolate lifetime
const admin = createZappAdminClient();

// ─── Types ─────────────────────────────────────────────────────────────────

/** Linha real do motor — zapp.evolution_followup_rules (view proxy). */
interface FollowupRule {
  id: string | null;
  name: string | null;
  trigger_type: string | null;
  trigger_config: Record<string, unknown> | null;
  delay_hours: number | null;
  sequence_group: string | null;
  sequence_order: number | null;
  template_id: string | null;
  description: string | null;
  is_active: boolean | null;
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

  const parsed = parseOrReject('followup-bridge', { v1: FollowupBridgeV1Schema }, req, rawBody);
  if (parsed.ok === false) return parsed.response;
  const { sequence_id, contact_jid, instance_name, trigger_event } = parsed.data;

  try {
    // ── 1. Load active rules for the sequence group (real engine table) ────
    // sequence_id = sequence_group (texto, padrão do motor) — fallback: id da
    // regra quando sequence_group é NULL (regras avulsas criadas por RPC).
    let { data: rules, error: rulesErr } = await admin
      .from('evolution_followup_rules')
      .select(
        'id, name, trigger_type, trigger_config, delay_hours, sequence_group, sequence_order, template_id, description, is_active'
      )
      .eq('sequence_group', sequence_id)
      .eq('is_active', true)
      .order('sequence_order', { ascending: true });

    if (rulesErr) {
      console.error('[followup-bridge] rules fetch error:', rulesErr.message);
      return errorResponse(req, `DB error fetching rules: ${rulesErr.message}`, 500);
    }

    const isUuidLike = /^[0-9a-f-]{32,36}$/i.test(sequence_id);
    if ((rules ?? []).length === 0 && isUuidLike) {
      const byId = await admin
        .from('evolution_followup_rules')
        .select(
          'id, name, trigger_type, trigger_config, delay_hours, sequence_group, sequence_order, template_id, description, is_active'
        )
        .is('sequence_group', null)
        .eq('id', sequence_id)
        .eq('is_active', true)
        .order('sequence_order', { ascending: true });
      if (byId.error) {
        console.error('[followup-bridge] rules by-id fetch error:', byId.error.message);
        return errorResponse(req, `DB error fetching rules: ${byId.error.message}`, 500);
      }
      rules = byId.data;
    }

    const activeRules: FollowupRule[] = (rules ?? []) as FollowupRule[];
    if (activeRules.length === 0) {
      return errorResponse(
        req,
        `Sequence not found or has no active rules (sequence_id=${sequence_id})`,
        404,
      );
    }

    const sequenceName = activeRules[0].name ?? sequence_id;
    const resolvedTrigger =
      trigger_event ?? activeRules[0].trigger_type ?? 'manual';

    // ── 2. Resolve contact_id from JID (best-effort; nullable in evo table) ─
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

    // ── 3. Build followup inserts from rules (delay_hours por passo) ────────
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const inserts = activeRules.map((rule) => {
      const delayMs = (rule.delay_hours ?? 0) * 3_600_000;
      const scheduledAt = new Date(nowMs + delayMs).toISOString();
      const cfg = rule.trigger_config ?? {};

      return {
        contact_id: resolvedContactId,
        // followup_type é obrigatório — derive do trigger_config ou fallback
        followup_type:
          typeof cfg['followup_type'] === 'string' && cfg['followup_type']
            ? String(cfg['followup_type'])
            : 'sequence',
        scheduled_at: scheduledAt,
        custom_message:
          rule.description ??
          (typeof cfg['default_message'] === 'string' ? String(cfg['default_message']) : null),
        template_id: rule.template_id ?? null,
        instance_name,
        status: 'pending',
        triggered_at: nowIso,
        metadata: {
          sequence_id,
          sequence_name: sequenceName,
          rule_id: rule.id,
          step_order: rule.sequence_order,
          contact_jid,
          trigger_event: resolvedTrigger,
          bridge_version: 'v2',
        },
      };
    });

    // ── 4. Insert into evolution_followups (via zapp auto-updatable view) ───
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
      `"${sequenceName}" (${sequence_id}), contact_jid=${contact_jid}`,
    );

    return jsonResponse(req, {
      success: true,
      steps_queued: inserts.length,
      sequence_name: sequenceName,
      contact_resolved: resolvedContactId !== null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[followup-bridge] unhandled error:', e);
    return errorResponse(req, `Internal server error: ${msg}`, 500);
  }
});
