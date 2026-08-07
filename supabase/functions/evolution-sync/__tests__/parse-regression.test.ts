/**
 * Regression test — evolution-sync (parse error PR #932 / commit 1f5352264).
 *
 * O merge do "contracts wave 2" inseriu a função `contractViolation422`
 * DENTRO do bloco `import {` (entre a abertura e o fechamento do import de
 * `../_shared/evolution-sync-actions.ts`), quebrando o parse do módulo:
 *   Expected ',', got 'contractViolation422'  → worker 500 em produção.
 *
 * Este teste protege a classe de falha: o bloco de imports deve fechar ANTES
 * de qualquer declaração de função. Se o import voltar a ser quebrado
 * (função posicionada antes do `} from ...`), importEnd > fnStart → FAIL.
 *
 * Rodar: deno test --allow-read supabase/functions/evolution-sync/__tests__/parse-regression.test.ts
 */
import { assert, assertMatch } from "jsr:@std/assert";
import { readSourceFrom } from "../../_shared/test-helpers.ts";

const SOURCE = await readSourceFrom(import.meta.url, "../index.ts");

Deno.test("evolution-sync: import de evolution-sync-actions fecha ANTES de contractViolation422", () => {
  const importEnd = SOURCE.indexOf('} from "../_shared/evolution-sync-actions.ts";');
  const fnStart = SOURCE.indexOf("function contractViolation422");
  assert(importEnd !== -1, "import de evolution-sync-actions deve existir no módulo");
  assert(fnStart !== -1, "contractViolation422 deve existir no módulo");
  assert(
    importEnd < fnStart,
    "o bloco de imports deve fechar ANTES da função — função dentro do import = parse error (PR #932)",
  );
});

Deno.test("evolution-sync: imports agrupados no topo do módulo (antes de Deno.serve)", () => {
  const serveStart = SOURCE.indexOf("Deno.serve");
  const lastImportClose = SOURCE.lastIndexOf("} from ");
  assert(serveStart !== -1, "Deno.serve deve existir");
  assert(lastImportClose !== -1, "deve haver ao menos um import");
  assert(
    lastImportClose < serveStart,
    "todos os imports devem preceder Deno.serve — imports no meio do corpo quebram o parse",
  );
});

Deno.test("evolution-sync: contrato de roteamento por action preservado", () => {
  // Guardrails estruturais do roteador (evita regressão silenciosa de ações).
  for (const action of ["sync-contacts", "sync-messages", "setup-webhook", "cleanup-mock", "full-sync", "sync-all-messages"]) {
    assertMatch(SOURCE, new RegExp(`action === '${action.replace(/-/g, "\\-")}'`));
  }
  assertMatch(SOURCE, /contractViolation422\('action', 'Unknown action'/);
});
