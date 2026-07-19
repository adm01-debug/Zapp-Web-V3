/**
 * Suite de RLS por role — admin | supervisor | agent | special_agent
 *
 * Roda com: bunx vitest run scripts/rls-role-matrix.test.ts
 *
 * Requer variáveis de ambiente:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_PUBLISHABLE_KEY   (anon)
 *   RLS_TEST_ADMIN_EMAIL / RLS_TEST_ADMIN_PASSWORD
 *   RLS_TEST_SUPERVISOR_EMAIL / RLS_TEST_SUPERVISOR_PASSWORD
 *   RLS_TEST_AGENT_EMAIL / RLS_TEST_AGENT_PASSWORD
 *   RLS_TEST_SPECIAL_AGENT_EMAIL / RLS_TEST_SPECIAL_AGENT_PASSWORD
 *
 * Objetivo: garantir que o hardening não regrediu — cada role só enxerga/muta
 * o que a matriz declara. Tabelas cobertas correspondem ao security_hardening.sql
 * mais as tabelas críticas de atendimento.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL!;
const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
if (!url || !anon) throw new Error("VITE_SUPABASE_URL/PUBLISHABLE_KEY ausentes");

type Role = "admin" | "supervisor" | "agent" | "special_agent";

const CREDS: Record<Role, { email: string; password: string }> = {
  admin: { email: process.env.RLS_TEST_ADMIN_EMAIL!, password: process.env.RLS_TEST_ADMIN_PASSWORD! },
  supervisor: { email: process.env.RLS_TEST_SUPERVISOR_EMAIL!, password: process.env.RLS_TEST_SUPERVISOR_PASSWORD! },
  agent: { email: process.env.RLS_TEST_AGENT_EMAIL!, password: process.env.RLS_TEST_AGENT_PASSWORD! },
  special_agent: { email: process.env.RLS_TEST_SPECIAL_AGENT_EMAIL!, password: process.env.RLS_TEST_SPECIAL_AGENT_PASSWORD! },
};

async function clientFor(role: Role): Promise<SupabaseClient> {
  const c = createClient(url, anon, { auth: { persistSession: false }, db: { schema: "zapp" } });
  const { error } = await c.auth.signInWithPassword(CREDS[role]);
  if (error) throw new Error(`sign-in ${role}: ${error.message}`);
  return c;
}

/** Matriz esperada — true = deve conseguir, false = deve ser negado */
type Op = "select" | "insert" | "update" | "delete";
interface Case { table: string; op: Op; expect: Record<Role, boolean>; }

const MATRIX: Case[] = [
  // --- credenciais Evolution: apenas admin acessa
  { table: "evolution_instance_credentials", op: "select",
    expect: { admin: true, supervisor: false, agent: false, special_agent: false } },
  { table: "evolution_instance_credentials", op: "insert",
    expect: { admin: true, supervisor: false, agent: false, special_agent: false } },

  // --- password reset requests: só admin lê, ninguém edita direto
  { table: "password_reset_requests", op: "select",
    expect: { admin: true, supervisor: false, agent: false, special_agent: false } },
  { table: "password_reset_requests", op: "update",
    expect: { admin: false, supervisor: false, agent: false, special_agent: false } },

  // --- credenciais WhatsApp Cloud (oficial)
  { table: "whatsapp_official_credentials", op: "select",
    expect: { admin: true, supervisor: false, agent: false, special_agent: false } },

  // --- audit logs: admin + supervisor leem, ninguém escreve
  { table: "audit_logs", op: "select",
    expect: { admin: true, supervisor: true, agent: false, special_agent: false } },
  { table: "audit_logs", op: "insert",
    expect: { admin: false, supervisor: false, agent: false, special_agent: false } },

  // --- contacts: todos podem ler os atribuídos; special_agent lê tudo
  { table: "contacts", op: "select",
    expect: { admin: true, supervisor: true, agent: true, special_agent: true } },

  // --- user_roles: só admin escreve
  { table: "user_roles", op: "insert",
    expect: { admin: true, supervisor: false, agent: false, special_agent: false } },
];

async function tryOp(c: SupabaseClient, tbl: string, op: Op): Promise<boolean> {
  try {
    if (op === "select") {
      const { error } = await c.from(tbl).select("*", { head: true, count: "exact" }).limit(1);
      return !error;
    }
    if (op === "insert") {
      const { error } = await c.from(tbl).insert({ __rls_probe__: true } as never).select();
      // Aceitamos erro de coluna inexistente/validação como "permitido a nível RLS"
      if (!error) return true;
      const msg = error.message.toLowerCase();
      if (msg.includes("row-level security") || msg.includes("permission denied") || msg.includes("policy")) return false;
      return true;
    }
    if (op === "update") {
      const { error } = await c.from(tbl).update({ __rls_probe__: true } as never).eq("id", "00000000-0000-0000-0000-000000000000");
      if (!error) return true;
      const msg = error.message.toLowerCase();
      if (msg.includes("row-level security") || msg.includes("permission denied") || msg.includes("policy")) return false;
      return true;
    }
    if (op === "delete") {
      const { error } = await c.from(tbl).delete().eq("id", "00000000-0000-0000-0000-000000000000");
      if (!error) return true;
      const msg = error.message.toLowerCase();
      if (msg.includes("row-level security") || msg.includes("permission denied") || msg.includes("policy")) return false;
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

const roles: Role[] = ["admin", "supervisor", "agent", "special_agent"];

describe("RLS role matrix", () => {
  const clients: Partial<Record<Role, SupabaseClient>> = {};

  beforeAll(async () => {
    for (const r of roles) {
      if (!CREDS[r].email) {
        console.warn(`Credenciais para role ${r} ausentes — testes serão pulados.`);
        continue;
      }
      clients[r] = await clientFor(r);
    }
  }, 60_000);

  for (const c of MATRIX) {
    for (const role of roles) {
      const label = `[${role}] ${c.op.toUpperCase()} ${c.table} → ${c.expect[role] ? "permitido" : "negado"}`;
      it(label, async () => {
        const client = clients[role];
        if (!client) return; // credencial ausente
        const ok = await tryOp(client, c.table, c.op);
        expect(ok).toBe(c.expect[role]);
      });
    }
  }
});
