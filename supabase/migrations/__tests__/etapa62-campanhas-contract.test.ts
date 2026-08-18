/**
 * E62 — Campanhas: RLS de escrita + dedup atômico + engine A/B.
 *
 * Contrato estático das migrations 20260818210000/220000/230000 (sem banco, sem MCP):
 *  - Filename YYYYMMDDHHMMSS snake_case.
 *  - Policies de escrita presentes com guard de dono/admin.
 *  - Dedup atômico: UNIQUE (campaign_id, contact_id) com guard + pré-dedupe.
 *  - Engine A/B: colunas variant/variant_weight + RPC SECURITY DEFINER com
 *    search_path fixo, persistência idempotente e GRANT autenticado.
 *  - Idempotência: só guards (DO blocks / to_regclass / IF NOT EXISTS); nunca
 *    statement destrutivo direto.
 *
 * Rodar: deno test --allow-read supabase/migrations/__tests__/etapa62-campanhas-contract.test.ts
 */
import { assertMatch, assertNotMatch } from "jsr:@std/assert";

const M1 = await Deno.readTextFile(
  new URL("../20260818210002_etapa62_campanhas_rls_escrita.sql", import.meta.url),
);
const M2 = await Deno.readTextFile(
  new URL("../20260818220002_etapa62_dedup_atomico_recipients.sql", import.meta.url),
);
const M3 = await Deno.readTextFile(
  new URL("../20260818230000_etapa62_engine_ab_variantes.sql", import.meta.url),
);

const FILES: Array<[string, string]> = [
  ["20260818210000_etapa62_campanhas_rls_escrita.sql", M1],
  ["20260818220000_etapa62_dedup_atomico_recipients.sql", M2],
  ["20260818230000_etapa62_engine_ab_variantes.sql", M3],
];

Deno.test("E62: filenames seguem YYYYMMDDHHMMSS_snake_case.sql", () => {
  for (const [name] of FILES) {
    assertMatch(name, /^\d{14}_[a-z0-9_]+\.sql$/, `filename inválido: ${name}`);
  }
});

// ─────────────────────────────────────────────────────────────
// M1 — RLS de escrita (campaign_ab_variants + campaign_contacts)
// ─────────────────────────────────────────────────────────────
Deno.test("E62 M1: campaign_ab_variants ganha policies INSERT/UPDATE/DELETE", () => {
  assertMatch(M1, /CREATE POLICY campaign_ab_variants_insert ON zapp\.campaign_ab_variants\s+FOR INSERT TO authenticated\s+WITH CHECK/);
  assertMatch(M1, /CREATE POLICY campaign_ab_variants_update ON zapp\.campaign_ab_variants\s+FOR UPDATE TO authenticated/);
  assertMatch(M1, /CREATE POLICY campaign_ab_variants_delete ON zapp\.campaign_ab_variants\s+FOR DELETE TO authenticated\s+USING/);
  // guard de dono/admin (espelha campaign_ab_select)
  assertMatch(M1, /zapp\.is_admin_or_supervisor\(auth\.uid\(\)\)/);
});

Deno.test("E62 M1: campaign_contacts ganha UPDATE/DELETE para dono/admin", () => {
  assertMatch(M1, /CREATE POLICY campaign_contacts_update ON zapp\.campaign_contacts\s+FOR UPDATE TO authenticated/);
  assertMatch(M1, /CREATE POLICY campaign_contacts_delete ON zapp\.campaign_contacts\s+FOR DELETE TO authenticated\s+USING/);
});

Deno.test("E62 M1: verificação RAISE EXCEPTION se policy faltar + rollback documentado", () => {
  assertMatch(M1, /RAISE EXCEPTION 'MISSING after 20260818210000/);
  assertMatch(M1, /Rollback/);
});

// ─────────────────────────────────────────────────────────────
// M2 — Dedup atômico + coluna variant
// ─────────────────────────────────────────────────────────────
Deno.test("E62 M2: UNIQUE (campaign_id, contact_id) nas duas tabelas de destinatários", () => {
  // talkx_recipients
  assertMatch(M2, /talkx_recipients/);
  assertMatch(M2, /UNIQUE \(campaign_id, contact_id\)/);
  assertMatch(M2, /campaign_contacts/);
  // guard de existência (idempotente) + pré-dedupe de duplicatas antes da constraint
  assertMatch(M2, /pg_constraint/);
  assertMatch(M2, /DELETE FROM zapp\.talkx_recipients/);
  assertMatch(M2, /DELETE FROM zapp\.campaign_contacts/);
});

Deno.test("E62 M2: coluna variant adicionada com guard nas duas tabelas", () => {
  assertMatch(M2, /variant uuid/);
  assertMatch(M2, /information_schema\.columns/);
});

Deno.test("E62 M2: verificação RAISE EXCEPTION + rollback documentado", () => {
  assertMatch(M2, /RAISE EXCEPTION 'MISSING after 20260818220000/);
  assertMatch(M2, /Rollback/);
});

// ─────────────────────────────────────────────────────────────
// M3 — Engine A/B
// ─────────────────────────────────────────────────────────────
Deno.test("E62 M3: colunas variant/variant_weight em campaigns e variantes", () => {
  assertMatch(M3, /ADD COLUMN IF NOT EXISTS variant uuid/);
  assertMatch(M3, /ADD COLUMN IF NOT EXISTS variant_weight numeric/);
  assertMatch(M3, /campaign_ab_variants/);
  assertMatch(M3, /variant_weight numeric NOT NULL DEFAULT 1/);
});

Deno.test("E62 M3: RPC rpc_campaign_assign_variant SECURITY DEFINER com search_path fixo", () => {
  assertMatch(M3, /CREATE OR REPLACE FUNCTION zapp\.rpc_campaign_assign_variant\(p_campaign_id uuid, p_contact_id uuid, p_variant_id uuid\)/);
  assertMatch(M3, /SECURITY DEFINER/);
  assertMatch(M3, /SET search_path TO 'zapp', 'pg_catalog'/);
  // checagem de permissão: dono ou admin/supervisor (fail-closed)
  assertMatch(M3, /insufficient_privilege/);
  // idempotência por destinatário: reatribuição não sobrescreve variante existente
  assertMatch(M3, /ON CONFLICT \(campaign_id, contact_id\)\s+DO UPDATE SET variant = EXCLUDED\.variant\s+WHERE zapp\.campaign_contacts\.variant IS NULL/);
});

Deno.test("E62 M3: GRANT EXECUTE para authenticated + verificação + rollback", () => {
  assertMatch(M3, /GRANT EXECUTE ON FUNCTION zapp\.rpc_campaign_assign_variant\(uuid, uuid, uuid\) TO authenticated/);
  assertMatch(M3, /RAISE EXCEPTION 'MISSING after 20260818230000/);
  assertMatch(M3, /Rollback/);
});

// ─────────────────────────────────────────────────────────────
// Idempotência global: nenhum statement destrutivo direto
// ─────────────────────────────────────────────────────────────
Deno.test("E62: nenhum DROP/ALTER destrutivo direto fora de guard (idempotência)", () => {
  for (const [name, sql] of FILES) {
    // DROP POLICY IF EXISTS é permitido (padrão da casa); DROP direto de tabela/constraint/função não
    assertNotMatch(sql, /^DROP (TABLE|CONSTRAINT|FUNCTION|INDEX|VIEW|TRIGGER)/m, `${name}: DROP direto`);
    assertNotMatch(sql, /^\s*ALTER TABLE .* DROP (COLUMN|CONSTRAINT)/m, `${name}: ALTER DROP direto`);
    // migration com policies usa DROP POLICY IF EXISTS (idempotente) antes de criar
    if (/CREATE POLICY/.test(sql)) {
      assertMatch(sql, /DROP POLICY IF EXISTS/, `${name}: policies usam DROP IF EXISTS`);
    }
    // função/constraint criadas condicionalmente (DO block ou IF NOT EXISTS)
    assertMatch(sql, /DO \$\$/, `${name}: DO block de guard presente`);
  }
});
