/**
 * E62 (validação) — RLS de escrita de campanhas: NÃO-ADMIN não escreve.
 *
 * Contrato estático + simulação semântica da migration 20260818210000
 * (campanhas_rls_escrita). Sem banco/MCP: as âncoras são regex sobre o TEXTO
 * da migration (padrão da casa) e a semântica do guard
 * (dono OU admin/supervisor, fail-closed) é provada por um modelo JS que
 * espelha o EXISTS do SQL linha a linha.
 *
 * Estado do banco vivo (2026-08-18, verificado via MCP):
 *   - RLS habilitada em zapp.campaigns/campaign_ab_variants/campaign_contacts
 *     (relrowsecurity = true) — fail-closed POR PADRÃO: sem policy de escrita,
 *     INSERT/UPDATE/DELETE de authenticated = 403 (bug findings-09/10 que a
 *     migration corrige: DONO também era bloqueado).
 *   - Em prod HOJE só existem: campaign_ab_select (SELECT), campaign_contacts_insert
 *     (guarded) e service_full_access — as policies de escrita da E62 ainda NÃO
 *     estão aplicadas (branch não mergeada). Após merge+aplicação, rodar a
 *     verificação live (pg_policies) para fechar a prova em runtime.
 *
 * Rodar: deno test --allow-read supabase/migrations/__tests__/etapa62-rls-nao-admin.test.ts
 */
import { assert, assertMatch, assertNotMatch } from "jsr:@std/assert";

const M1 = await Deno.readTextFile(
  new URL("../20260818210002_etapa62_campanhas_rls_escrita.sql", import.meta.url),
);

// ─────────────────────────────────────────────────────────────
// 1. Âncoras estáticas — policies de escrita só para authenticated,
//    com guard de dono/admin e SEM bypass (USING/WITH CHECK true)
// ─────────────────────────────────────────────────────────────
Deno.test("E62-RLS: 5 policies de escrita (INSERT/UPDATE/DELETE) dirigidas a authenticated, nunca public/anon", () => {
  const targets: Array<[string, string, "USING" | "WITH CHECK"]> = [
    ["campaign_ab_variants_insert", "FOR INSERT TO authenticated", "WITH CHECK"],
    ["campaign_ab_variants_update", "FOR UPDATE TO authenticated", "USING"],
    ["campaign_ab_variants_delete", "FOR DELETE TO authenticated", "USING"],
    ["campaign_contacts_update", "FOR UPDATE TO authenticated", "USING"],
    ["campaign_contacts_delete", "FOR DELETE TO authenticated", "USING"],
  ];
  for (const [pol, clause, exprKind] of targets) {
    assertMatch(M1, new RegExp(`CREATE POLICY ${pol} ON zapp\\.${pol.startsWith("campaign_ab") ? "campaign_ab_variants" : "campaign_contacts"}\\s+${clause}`), `${pol} ausente`);
    assertMatch(M1, new RegExp(`CREATE POLICY ${pol}[\\s\\S]*?${exprKind}`), `${pol} sem ${exprKind} (fail-closed)`);
  }
  // nenhuma policy para anon/public: a palavra só pode aparecer em comentário
  assertNotMatch(M1, /FOR (INSERT|UPDATE|DELETE) TO (anon|public)/);
});

Deno.test("E62-RLS: guard dono-OU-admin em TODAS as policies de escrita (fail-closed)", () => {
  const polBlocks = M1.split(/CREATE POLICY /).slice(1);
  assert(polBlocks.length >= 5, `esperava ≥5 policies, achei ${polBlocks.length}`);
  for (const block of polBlocks) {
    // só blocos de policy de escrita REAL (com cláusula FOR ... TO authenticated);
    // o split também pega o comentário de header que cita "CREATE POLICY "
    if (!/FOR (INSERT|UPDATE|DELETE) TO authenticated/.test(block)) continue;
    assertMatch(block, /c\.created_by = \(SELECT p\.id FROM zapp\.profiles p WHERE p\.user_id = auth\.uid\(\)\)/, "guard de dono ausente");
    assertMatch(block, /zapp\.is_admin_or_supervisor\(auth\.uid\(\)\)/, "guard de admin ausente");
    assertMatch(block, /c\.id = (campaign_ab_variants|campaign_contacts)\.campaign_id/, "join com campaigns ausente");
  }
  // zero bypass: nenhum USING (true) / WITH CHECK (true) em policy de escrita
  assertNotMatch(M1, /(USING|WITH CHECK) \(\s*true\s*\)/);
});

Deno.test("E62-RLS: DO block de verificação falha (RAISE EXCEPTION) se policy faltar", () => {
  assertMatch(M1, /RAISE EXCEPTION 'MISSING after 20260818210000/);
  assertMatch(M1, /campaign_ab_variants_insert; /);
  assertMatch(M1, /campaign_contacts_delete; /);
});

// ─────────────────────────────────────────────────────────────
// 2. Simulação semântica do guard (espelho do EXISTS do SQL)
//    Condição: campanha criada pelo ATOR (profile do auth.uid) OU
//              is_admin_or_supervisor(auth.uid)
// ─────────────────────────────────────────────────────────────
type Actor = { profileId: string; admin: boolean };

/** Espelho linha a linha do EXISTS da policy: `c.created_by = profile(actor) OR is_admin_or_supervisor(actor)`. */
function policyAllowsWrite(actor: Actor, campaignCreatedBy: string): boolean {
  const isOwner = campaignCreatedBy === actor.profileId; // c.created_by = (SELECT p.id ... WHERE p.user_id = auth.uid())
  const isAdminOrSupervisor = actor.admin; // zapp.is_admin_or_supervisor(auth.uid())
  return isOwner || isAdminOrSupervisor;
}

const OWNER: Actor = { profileId: "prof-dono", admin: false };
const ADMIN: Actor = { profileId: "prof-admin", admin: true };
const STRANGER: Actor = { profileId: "prof-estranho", admin: false };

const CAMPAIGN = { created_by: "prof-dono" };

Deno.test("E62-RLS: simulação — dono escreve (INSERT/UPDATE/DELETE), admin escreve, NÃO-dono/NÃO-admin NUNCA", () => {
  const cases: Array<[string, Actor, boolean]> = [
    ["dono da campanha", OWNER, true],
    ["admin/supervisor", ADMIN, true],
    ["usuário comum sem vínculo", STRANGER, false],
    ["usuário sem profile (auth.uid sem row em profiles)", { profileId: null as unknown as string, admin: false }, false],
  ];
  for (const [label, actor, expected] of cases) {
    const allowed = policyAllowsWrite(actor, CAMPAIGN.created_by);
    assert(allowed === expected, `[${label}] esperado ${expected ? "PERMITIDO" : "NEGADO"}, veio ${allowed}`);
  }
});

Deno.test("E62-RLS: simulação — usuário comum NUNCA escreve em campanha de outro dono (cross-tenant)", () => {
  for (const otherOwner of ["prof-outro1", "prof-outro2", "prof-dono"]) {
    // mesmo o dono REAL de 'prof-dono' é outro profile — STRANGER nunca coincide
    const allowed = policyAllowsWrite(STRANGER, otherOwner);
    assert(allowed === false, `campanha de ${otherOwner}: esperado NEGADO`);
  }
});

Deno.test("E62-RLS: simulação — admin escreve em campanha de QUALQUER dono (superuser de negócio)", () => {
  for (const owner of ["prof-x", "prof-y", "prof-z"]) {
    assert(policyAllowsWrite(ADMIN, owner), `admin deve escrever na campanha de ${owner}`);
  }
});

Deno.test("E62-RLS: simulação — matiz completo 4 atores × 3 donos com veredito agregado", () => {
  const actors: Array<[string, Actor]> = [
    ["dono", OWNER], ["admin", ADMIN], ["estranho", STRANGER],
    // sem row em zapp.profiles → subquery do SQL devolve NULL; profileId null nunca coincide
    ["sem-profile", { profileId: null as unknown as string, admin: false }],
  ];
  const owners = ["prof-dono", "prof-outro", "prof-outro2"];
  const verdicts: Array<[string, string, boolean]> = [];
  for (const [aLabel, actor] of actors) {
    for (const owner of owners) {
      verdicts.push([aLabel, owner, policyAllowsWrite(actor, owner)]);
    }
  }
  // 12 células: só (dono, própria) e (admin, qualquer) permitem = 1 + 3 = 4
  const allowed = verdicts.filter(([, , v]) => v);
  assert(allowed.length === owners.length + 1, `esperado 4 permitidos (3 admin + 1 dono), veio ${allowed.length}: ${JSON.stringify(allowed)}`);
  for (const [aLabel, owner, v] of allowed) {
    assert(v === true && (aLabel === "admin" || (aLabel === "dono" && owner === "prof-dono")), `célula inesperada permitida: ${aLabel}/${owner}`);
  }
  // e as negadas: dono em campanhas alheias, estranho em TODAS, sem-profile em TODAS
  const denied = verdicts.filter(([, , v]) => !v);
  assert(denied.length === 8, `esperado 8 negados, veio ${denied.length}`);
});
