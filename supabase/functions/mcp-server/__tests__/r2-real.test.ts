import {
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { readSource } from "../../evolution-api/__tests__/_helpers.ts";

/**
 * Locks the R2 hardening contract (mcp-server REAL, 2026-08-18):
 *  - fachada removida: sem "In a real implementation", sem retorno fixo de
 *    sucesso para métodos desconhecidos;
 *  - protocolo JSON-RPC 2.0: initialize, tools/list, tools/call;
 *  - tools READ-ONLY (whoami / list_whatsapp_connections / search_contacts)
 *    com RLS via createZappClient(req) (user-scoped);
 *  - auth obrigatória (requireUser) antes de QUALQUER tool;
 *  - zero escrita e zero SQL público.
 */
Deno.test("mcp-server: implementação REAL (R2) — JSON-RPC + tools read-only + auth", async () => {
  const source = await readSource("../../mcp-server/index.ts");
  // Fachada removida.
  assert(!source.includes("In a real implementation"), "fachada removida");
  assert(!source.includes("MCP Server is active"), "sucesso fixo removido");
  // Protocolo JSON-RPC.
  assert(source.includes("jsonrpc"), "envelope JSON-RPC");
  assert(source.includes("initialize"), "método initialize");
  assert(source.includes("tools/list"), "método tools/list");
  assert(source.includes("tools/call"), "método tools/call");
  assert(source.includes("-32601"), "método desconhecido → erro JSON-RPC");
  // Auth antes de tools.
  const authIdx = source.indexOf("requireUser");
  const callIdx = source.indexOf("tools/call");
  assert(authIdx !== -1 && callIdx !== -1 && authIdx < callIdx, "requireUser antes do dispatch de tools");
  // Tools read-only com RLS (client user-scoped).
  assert(source.includes("createZappClient(req)"), "client user-scoped (RLS)");
  assert(source.includes("whoami"), "tool whoami");
  assert(source.includes("list_whatsapp_connections"), "tool list_whatsapp_connections");
  assert(source.includes("search_contacts"), "tool search_contacts");
  // Sem escrita / SQL público.
  assert(!source.includes("exec_sql"), "sem SQL público");
  assert(!source.includes(".insert(") && !source.includes(".update(") && !source.includes(".delete("), "sem escrita");
});
