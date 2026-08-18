import {
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { readSourceFrom } from "../../_shared/test-helpers.ts";

/**
 * Locks the R1-EXT/F2 hardening contract for whatsapp-cloud-send:
 *  - gate de alvo (p.to) com exceção de bootstrap: contato EXISTE e não é
 *    visível/fila/admin → 403 SEND_FORBIDDEN antes do build do payload;
 *  - contato INEXISTENTE → permite (número novo);
 *  - mesmo padrão das edges evolution-api (lookup evolution_contacts via
 *    admin client + is_contact_visible_to_user/is_queue_member_of_contact/
 *    is_admin_or_supervisor).
 */
Deno.test("whatsapp-cloud-send: gate de alvo R1-EXT/F2 (SEND_FORBIDDEN)", async () => {
  const source = await readSourceFrom(import.meta.url, "../../whatsapp-cloud-send/index.ts");
  assert(source.includes("SEND_FORBIDDEN"), "code SEND_FORBIDDEN presente");
  assert(source.includes("createZappAdminClient"), "admin client para lookup");
  assert(source.includes("evolution_contacts"), "lookup evolution_contacts");
  assert(source.includes("is_contact_visible_to_user"), "visibilidade de contato");
  assert(source.includes("is_queue_member_of_contact"), "helper de fila");
  assert(source.includes("is_admin_or_supervisor"), "helper de admin/supervisor");
  // Gate antes do envio (build do payload Graph vem depois).
  const gateIdx = source.indexOf("SEND_FORBIDDEN");
  const payloadIdx = source.indexOf("messaging_product");
  assert(gateIdx !== -1 && payloadIdx !== -1 && gateIdx < payloadIdx, "gate antes do payload");
  // Exceção de bootstrap: sem contato → segue.
  assert(source.includes("if (contato)"), "gate só quando contato existe (bootstrap permite)");
});
