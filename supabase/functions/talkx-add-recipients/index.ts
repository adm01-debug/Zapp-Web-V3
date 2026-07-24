/**
 * talkx-add-recipients — Adiciona contatos como destinatários de uma campanha Talk X.
 *
 * Recebe { campaignId, contactIds } do frontend, valida auth, busca phone/nome dos
 * contatos e faz upsert em batch em talkx_recipients (ON CONFLICT DO NOTHING para
 * evitar duplicatas no mesmo campaignId+contactId).
 *
 * Auth: qualquer usuário autenticado (a campanha pertence ao workspace do usuário).
 */
import { createZappAdminClient, createZappClient } from '../_shared/db-client.ts';
import { getCorsHeaders, handleCors, Logger } from "../_shared/validation.ts";
import { requireUser } from "../_shared/auth.ts";

interface AddRecipientsBody {
  campaignId: string;
  contactIds: string[];
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  const log = new Logger("talkx-add-recipients", req);

  const authed = await requireUser(req);
  if (authed instanceof Response) return authed;

  try {
    const raw = await req.json().catch(() => null);
    if (!raw || typeof raw !== 'object') {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
    }

    const { campaignId, contactIds } = raw as Partial<AddRecipientsBody>;

    if (typeof campaignId !== 'string' || !campaignId) {
      return new Response(JSON.stringify({ error: "campaignId is required" }), { status: 400, headers });
    }
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return new Response(JSON.stringify({ error: "contactIds must be a non-empty array" }), { status: 400, headers });
    }
    if (contactIds.length > 1000) {
      return new Response(JSON.stringify({ error: "contactIds exceeds maximum batch size of 1000" }), { status: 400, headers });
    }

    const admin = createZappAdminClient();

    // Verify campaign exists
    const { data: campaign, error: campErr } = await admin
      .from("talkx_campaigns")
      .select("id, status")
      .eq("id", campaignId)
      .maybeSingle();

    if (campErr) {
      log.error("Campaign lookup error", { error: campErr.message });
      return new Response(JSON.stringify({ error: "Failed to verify campaign" }), { status: 500, headers });
    }
    if (!campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), { status: 404, headers });
    }

    // Prevent adding recipients to active/completed campaigns
    const lockedStatuses = ["sending", "completed", "cancelled"];
    if (lockedStatuses.includes((campaign as Record<string, unknown>).status as string)) {
      return new Response(
        JSON.stringify({ error: `Cannot add recipients to campaign with status '${(campaign as Record<string, unknown>).status}'` }),
        { status: 409, headers }
      );
    }

    // Lookup contacts to get phone + name
    const { data: contacts, error: contactsErr } = await admin
      .from("contacts")
      .select("id, name, nickname, phone")
      .in("id", contactIds);

    if (contactsErr) {
      log.error("Contacts lookup error", { error: contactsErr.message });
      return new Response(JSON.stringify({ error: "Failed to fetch contacts" }), { status: 500, headers });
    }

    const contactMap = new Map(
      (contacts ?? [])
        .filter((c): c is { id: string; name: string | null; nickname: string | null; phone: string } =>
          typeof c === 'object' && c !== null && typeof (c as Record<string, unknown>).id === 'string'
        )
        .map((c) => [c.id, c])
    );

    const rows = contactIds
      .filter((id) => contactMap.has(id))
      .map((id) => {
        const c = contactMap.get(id)!;
        return {
          campaign_id: campaignId,
          contact_id: id,
          name: c.name ?? c.nickname ?? null,
          phone: c.phone ?? "",
          status: "pending" as const,
        };
      });

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ added: 0, skipped: contactIds.length, reason: "No matching contacts found" }),
        { headers }
      );
    }

    // Upsert — ON CONFLICT DO NOTHING prevents duplicates (same campaign_id + contact_id)
    const { error: insertErr, count } = await admin
      .from("talkx_recipients")
      .upsert(rows, { onConflict: "campaign_id,contact_id", ignoreDuplicates: true })
      .select("id", { count: "exact", head: true });

    if (insertErr) {
      log.error("Insert recipients error", { error: insertErr.message });
      return new Response(JSON.stringify({ error: "Failed to add recipients" }), { status: 500, headers });
    }

    const skipped = contactIds.length - rows.length;
    log.done(200, { added: count ?? rows.length, skipped });

    return new Response(
      JSON.stringify({
        success: true,
        added: count ?? rows.length,
        skipped,
        total_requested: contactIds.length,
      }),
      { headers }
    );
  } catch (err) {
    log.error("Unexpected error", { error: err instanceof Error ? err.message : String(err) });
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers });
  }
});
