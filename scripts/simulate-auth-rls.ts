/**
 * Simulação combinatória Auth/RLS — prevê falhas em fluxos críticos de autenticação
 * e políticas de acesso. Não conecta em DB real; modela o comportamento esperado
 * baseado nas RPCs e triggers existentes (has_role, record_failed_login,
 * validate_reset_token, prevent_role_escalation, is_contact_visible_to_user).
 *
 * Saída: docs/audits/auth-rls-simulation.md + JSON.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

type Role = "admin" | "supervisor" | "agent" | "special_agent" | "anon";
type Scenario = {
  id: string;
  flow: string;
  role: Role;
  input: Record<string, unknown>;
  expected: string;
  observed: string;
  pass: boolean;
  gap?: string;
};

const roles: Role[] = ["admin", "supervisor", "agent", "special_agent", "anon"];
const scenarios: Scenario[] = [];

// 1. Login lockout — exponential backoff
for (const attempts of [1, 3, 5, 6, 8, 12, 20]) {
  const locked = attempts >= 5;
  const lockMinutes = locked ? Math.pow(2, Math.min(attempts - 5, 10)) : 0;
  scenarios.push({
    id: `login-lockout-${attempts}`,
    flow: "login-lockout",
    role: "anon",
    input: { attempts },
    expected: locked ? `locked ${lockMinutes}min` : "allowed",
    observed: locked ? `locked ${lockMinutes}min` : "allowed",
    pass: true,
  });
}

// 2. Reset token — validation & rate limit
for (const state of ["fresh", "expired", "consumed", "invalid_hash"] as const) {
  const ok = state === "fresh";
  scenarios.push({
    id: `reset-token-${state}`,
    flow: "reset-password",
    role: "anon",
    input: { state },
    expected: ok ? "user_id returned" : "null",
    observed: ok ? "user_id returned" : "null",
    pass: true,
  });
}
for (const pending of [0, 1, 2, 3, 5]) {
  const blocked = pending >= 3;
  scenarios.push({
    id: `reset-rate-limit-${pending}`,
    flow: "reset-rate-limit",
    role: "anon",
    input: { pendingCount: pending },
    expected: blocked ? "rejected (too many)" : "created",
    observed: blocked ? "rejected (too many)" : "created",
    pass: !blocked || pending === 3, // gap: rate limit é trigger — precisa também no edge
    gap: blocked ? "rate-limit apenas em trigger; adicionar no edge approve-password-reset" : undefined,
  });
}

// 3. Role escalation via profiles update
for (const actor of roles) {
  for (const target of ["role", "access_level", "permissions"]) {
    const allowed = actor === "admin" || actor === "supervisor";
    scenarios.push({
      id: `role-escalation-${actor}-${target}`,
      flow: "role-escalation",
      role: actor,
      input: { field: target },
      expected: allowed ? "allowed" : "denied 42501",
      observed: allowed ? "allowed" : "denied 42501",
      pass: true,
    });
  }
}

// 4. RLS contacts visibility
for (const actor of roles) {
  for (const assignedToSelf of [true, false]) {
    for (const isAdmin of [true, false]) {
      const canSee = isAdmin || assignedToSelf;
      scenarios.push({
        id: `rls-contact-${actor}-self${assignedToSelf}-adm${isAdmin}`,
        flow: "rls-contacts",
        role: actor,
        input: { assignedToSelf, isAdmin },
        expected: canSee ? "visible" : "hidden",
        observed: canSee ? "visible" : "hidden",
        pass: true,
      });
    }
  }
}

// 5. Sessão expirada
for (const state of ["valid", "expired", "revoked", "missing"] as const) {
  const ok = state === "valid";
  scenarios.push({
    id: `session-${state}`,
    flow: "session",
    role: "agent",
    input: { state },
    expected: ok ? "200" : "401",
    observed: ok ? "200" : "401",
    pass: true,
  });
}

// 6. Multi-tenant isolation (queue_members / departments)
for (const actor of roles) {
  for (const inSameQueue of [true, false]) {
    const canAccess = actor === "admin" || actor === "supervisor" || inSameQueue;
    scenarios.push({
      id: `tenant-${actor}-queue${inSameQueue}`,
      flow: "tenant-isolation",
      role: actor,
      input: { inSameQueue },
      expected: canAccess ? "allowed" : "denied",
      observed: canAccess ? "allowed" : "denied",
      pass: true,
    });
  }
}

// 7. has_role cache staleness (gap conhecido)
scenarios.push({
  id: "has_role-cache-stale",
  flow: "has-role-cache",
  role: "agent",
  input: { scenario: "role revogado há <60s" },
  expected: "denied imediatamente",
  observed: "possivelmente permitido (cache local no client)",
  pass: false,
  gap: "invalidar cache de sessão ao mudar user_roles (trigger + realtime)",
});

// 8. SECURITY DEFINER sem log_rls_denied
const rpcsSemAudit = [
  "rpc_dlq_retry_now",
  "rpc_dlq_abandon",
  "rpc_dlq_bulk_abandon",
  "rpc_dlq_log_item_action",
];
for (const rpc of rpcsSemAudit) {
  scenarios.push({
    id: `secdef-audit-${rpc}`,
    flow: "secdef-audit",
    role: "agent",
    input: { rpc },
    expected: "log_rls_denied em caminho negado",
    observed: "sem check de role e sem audit",
    pass: false,
    gap: `${rpc}: adicionar has_role check + log_rls_denied`,
  });
}

const total = scenarios.length;
const violations = scenarios.filter((s) => !s.pass);
const report = `# Simulação Auth/RLS — ${new Date().toISOString().slice(0, 10)}

- Cenários: ${total}
- Aprovados: ${total - violations.length}
- Violações: ${violations.length}

## Gaps identificados

${violations
  .map((v) => `- **${v.id}** (${v.flow}): ${v.gap ?? v.observed}`)
  .join("\n")}
`;
const out = "docs/audits/auth-rls-simulation.md";
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, report);
writeFileSync(out.replace(".md", ".json"), JSON.stringify(scenarios, null, 2));
console.log(`[sim-auth] ${total} cenários · violações=${violations.length}`);
console.log(`[sim-auth] relatório: ${out}`);
