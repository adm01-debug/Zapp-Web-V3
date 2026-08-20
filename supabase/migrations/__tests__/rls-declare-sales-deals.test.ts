/**
 * Regression test — 20260820170000_rls_declare_sales_deals.sql
 *
 * Protege a classe de falha encontrada na validação CP-3 / quality-gate E34:
 * o DB tinha zapp.sales_deals com RLS ativo (relrowsecurity=true) mas NENHUM
 * arquivo de migration declarava o ENABLE ROW LEVEL SECURITY — o auditor
 * estático (scripts/audit-rls-coverage.mjs) falhava com:
 *   🔴 zapp.sales_deals — add ALTER TABLE zapp.sales_deals ENABLE RLS
 *
 * Contrato testado: a migration DEVE conter a linha literal
 * `ALTER TABLE zapp.sales_deals ENABLE ROW LEVEL SECURITY;` — exatamente no
 * formato que o auditor detecta (o regex do auditor não casa com
 * `ALTER TABLE ONLY`; usar `ONLY` regride o gate E34). O auditor roda no CI
 * (quality-gate), este teste é a proteção estática do contrato.
 *
 * Rodar: deno test --allow-read supabase/migrations/__tests__/
 */
import { assert, assertMatch } from "jsr:@std/assert";

const MIG = await Deno.readTextFile(
  new URL("../20260820170000_rls_declare_sales_deals.sql", import.meta.url),
);

Deno.test("201700: declara ENABLE RLS no formato literal detectável pelo auditor E34", () => {
  // Contrato exato do auditor: "ALTER TABLE zapp.sales_deals ENABLE ROW LEVEL SECURITY"
  // (sem ONLY, sem IF EXISTS — o regex do auditor casa com `ALTER TABLE [schema.]table`)
  assertMatch(
    MIG,
    /ALTER TABLE zapp\.sales_deals ENABLE ROW LEVEL SECURITY;/,
  );
  // Proibido o formato ALTER TABLE ONLY ... — quebra a detecção do auditor
  assert(
    !/ALTER TABLE ONLY zapp\.sales_deals/.test(MIG),
    "não use ALTER TABLE ONLY: o auditor E34 não detecta (grupo come em ONLY)",
  );
  // Regra do AGENTS: nome de arquivo 14 dígitos + snake_case
  assertMatch(
    "20260820170000_rls_declare_sales_deals.sql",
    /^\d{14}_[a-z0-9_]+\.sql$/,
  );
});

Deno.test("201700: tem DO block de verificação que falha se o RLS não estiver ativo", () => {
  assertMatch(MIG, /DO\s*\$/);
  assertMatch(MIG, /relrowsecurity/);
  assertMatch(MIG, /RAISE EXCEPTION/);
});