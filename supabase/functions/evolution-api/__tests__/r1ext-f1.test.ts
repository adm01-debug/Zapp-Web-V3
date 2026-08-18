import {
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  readSource,
} from "./_helpers.ts";

/**
 * Locks the R1-EXT/F1 hardening contract (fail-closed de conversa):
 *  - find-messages (leitura) e delete-message (destrutiva) exigem prova de
 *    acesso à conversa ANTES do proxy — padrão #1240 (MEDIA_FORBIDDEN).
 *  - Helper compartilhado assertConversationAccess: lookup evolution_contacts
 *    por (remote_jid, instance_name, deleted_at null) + RPCs de visibilidade
 *    (is_contact_visible_to_user / is_queue_member_of_contact /
 *    is_admin_or_supervisor) → 403 <ACTION>_FORBIDDEN.
 */

Deno.test("R1-EXT/F1: find-messages e delete-message com fail-closed de conversa", async () => {
  const source = await readSource();

  // Helper compartilhado presente.
  assert(source.includes("assertConversationAccess"), "helper compartilhado deve existir");
  assert(source.includes("conversationForbidden"), "helper de 403 deve existir");
  assert(source.includes("evolution_contacts"), "deve consultar evolution_contacts");
  assert(source.includes("is_contact_visible_to_user"), "deve usar visibilidade de contato");
  assert(source.includes("is_queue_member_of_contact"), "deve usar helper de fila");
  assert(source.includes("is_admin_or_supervisor"), "deve usar helper de admin/supervisor");

  // find-messages: gate ANTES do proxy.
  const fmIdx = source.indexOf("action === 'find-messages'");
  assert(fmIdx !== -1, "action find-messages deve existir");
  const fmBlock = source.slice(fmIdx, fmIdx + 400);
  assert(fmBlock.includes("assertConversationAccess"), "find-messages deve ter o gate");
  assert(fmBlock.includes("FIND_MESSAGES_FORBIDDEN"), "code FIND_MESSAGES_FORBIDDEN");
  const fmGateIdx = fmBlock.indexOf("assertConversationAccess");
  const fmProxyIdx = fmBlock.indexOf("findMessages");
  assert(fmGateIdx !== -1 && fmProxyIdx !== -1 && fmGateIdx < fmProxyIdx, "gate deve vir antes do proxy");

  // delete-message: gate ANTES do proxy.
  const dmIdx = source.indexOf("action === 'delete-message'");
  assert(dmIdx !== -1, "action delete-message deve existir");
  const dmBlock = source.slice(dmIdx, dmIdx + 400);
  assert(dmBlock.includes("assertConversationAccess"), "delete-message deve ter o gate");
  assert(dmBlock.includes("DELETE_MESSAGE_FORBIDDEN"), "code DELETE_MESSAGE_FORBIDDEN");
  const dmGateIdx = dmBlock.indexOf("assertConversationAccess");
  const dmProxyIdx = dmBlock.indexOf("message/delete");
  assert(dmGateIdx !== -1 && dmProxyIdx !== -1 && dmGateIdx < dmProxyIdx, "gate deve vir antes do proxy");
});
