/**
 * db-columns.test.ts — guardrails contra regressão MED-7
 *
 * Falha se uma Edge Function crítica tornar a referir `instance_id` como
 * chave lógica novamente. As referências permitidas são apenas ao UUID
 * interno em `details.instance_id` (payload de log) e comentários.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { WHATSAPP_CONNECTIONS, CONTACTS, MESSAGES, col } from "../db-columns.ts";

Deno.test("db-columns · WHATSAPP_CONNECTIONS mapping estável", () => {
  assertEquals(col(WHATSAPP_CONNECTIONS, "instance_name"), "instance_name");
  assertEquals(col(WHATSAPP_CONNECTIONS, "instance_id"), "instance_id");
  assertEquals(WHATSAPP_CONNECTIONS.table, "whatsapp_connections");
});

Deno.test("db-columns · CONTACTS mapping estável", () => {
  assertEquals(col(CONTACTS, "phone"), "phone");
  assertEquals(col(CONTACTS, "remote_jid"), "remote_jid");
});

Deno.test("db-columns · MESSAGES mapping estável", () => {
  assertEquals(col(MESSAGES, "contact_id"), "contact_id");
  assertEquals(col(MESSAGES, "created_at"), "created_at");
});

Deno.test("evolution-api · não usa .eq('instance_id', ...) para filtrar por nome (regressão histórica)", async () => {
  const src = await Deno.readTextFile(
    new URL("../../evolution-api/index.ts", import.meta.url).pathname,
  );
  // Permitimos ocorrências em strings de log/payload (details.instance_id, mensagem de erro)
  // e em COMENTÁRIOS. Proibimos apenas o padrão .eq('instance_id', ...
  const bad = /\.eq\(\s*['"]instance_id['"]/;
  if (bad.test(src)) {
    throw new Error(
      "REGRESSÃO: evolution-api voltou a usar .eq('instance_id', ...). Use .eq('instance_name', ...) — vide MED-7 em docs/AUDITORIA_BACKEND_SENIOR_2026-07-11.md",
    );
  }
});
