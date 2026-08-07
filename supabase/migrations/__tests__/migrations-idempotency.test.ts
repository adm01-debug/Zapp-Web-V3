/**
 * Regression test — idempotência da migration 20260808150000 (P0 exec_sql + D-8).
 *
 * A validação VAL-T1 encontrou que o REVOKE direto de
 * `evo.p_backfill_evolution_messages()` quebrava a re-execução da migration
 * (a procedure foi removida por onda de higiene → `procedure does not exist` →
 * ERROR em `supabase db reset`/ambiente novo).
 *
 * Este teste protege a classe de falha: o REVOKE da procedure DEVE estar
 * dentro de DO block condicional (to_regprocedure), nunca como statement
 * direto. Também garante que os REVOKEs das funções existentes permanecem.
 *
 * Rodar: deno test --allow-read supabase/migrations/__tests__/migrations-idempotency.test.ts
 */
import { assert, assertMatch } from "jsr:@std/assert";

const MIG = await Deno.readTextFile(
  new URL("../20260808150000_hotfix_revoke_exec_sql_anon.sql", import.meta.url),
);

Deno.test("150000: REVOKE de p_backfill é condicional (idempotente)", () => {
  // O guard de existência deve estar presente
  assertMatch(MIG, /to_regprocedure\('evo\.p_backfill_evolution_messages\(\)'\)/);
  // O REVOKE da procedure deve ser via EXECUTE dinâmico DENTRO do DO block
  assertMatch(MIG, /EXECUTE 'REVOKE EXECUTE ON PROCEDURE evo\.p_backfill_evolution_messages\(\) FROM PUBLIC, anon'/);
  // NUNCA como statement direto no corpo da migration (quebra re-execução)
  const direct = MIG.match(/^REVOKE EXECUTE ON PROCEDURE evo\.p_backfill_evolution_messages/m);
  assert(!direct, "REVOKE direto da procedure reintroduziria a não-idempotência (VAL-T1 FAIL)");
});

Deno.test("150000: REVOKEs das funções existentes preservados", () => {
  const fns = [
    "REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM anon, authenticated;",
    "REVOKE EXECUTE ON FUNCTION evo.fn_dedup_alert() FROM PUBLIC, anon;",
    "REVOKE EXECUTE ON FUNCTION ops.fn_alert_policy_churn() FROM PUBLIC, anon;",
    "REVOKE EXECUTE ON FUNCTION zapp.rpc_insert_message(text, text, boolean, text, text, text, text, text, jsonb) FROM PUBLIC;",
  ];
  for (const stmt of fns) {
    assert(MIG.includes(stmt), `statement ausente: ${stmt}`);
  }
});
