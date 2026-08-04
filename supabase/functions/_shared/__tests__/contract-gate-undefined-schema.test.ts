/**
 * contract-gate-undefined-schema.test.ts — regressão P0 2026-08-04
 *
 * Incidente: ai-churn-analysis e classify-emoji chamavam o gate com
 * `CONTRACT_SCHEMAS['<nome>']` para chaves AUSENTES do registro. Em
 * contract-kit.ts, `Object.keys(undefined)` lançava TypeError → o catch global
 * respondia 502/500 em TODA requisição — as duas funções ficaram quebradas em
 * produção.
 *
 * Garantias (valem para SEMPRE, não só para as funções do incidente):
 *   1. parseOrReject com schemas undefined → NUNCA lança; retorna ParseFail
 *      com envelope canônico 422 (code contract_violation).
 *   2. parseOrReject com schemas vazio {} → idem.
 *   3. parseRequestOrReject com schemas undefined → idem (sem lançar).
 *
 * Rodar: deno test supabase/functions/_shared/__tests__/contract-gate-undefined-schema.test.ts
 */

import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { parseOrReject, parseRequestOrReject, type ContractErrorBody } from "../contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../contract-schemas.ts";
import { CONTRACTS } from "../contract-versions.ts";

function req(): Request {
  return new Request("https://edge.local/fn", { method: "POST" });
}

async function readEnvelope(res: Response): Promise<ContractErrorBody> {
  assertEquals(res.status, 422, "status deve ser 422");
  assertEquals(res.headers.get("Content-Type"), "application/json");
  const body = (await res.json()) as ContractErrorBody;
  assertEquals(body.error, true);
  assert(body.code === "contract_violation" || body.code === "invalid_json",
    `código inesperado: ${body.code}`);
  assert(typeof body.contract === "string" && body.contract.includes("@"));
  assert(Array.isArray(body.details) && body.details.length > 0);
  return body;
}

Deno.test("P0 regressão: parseOrReject com schemas undefined NUNCA lança — 422 contract_violation", async () => {
  // Chave propositalmente NÃO registrada → CONTRACT_SCHEMAS["chave-inexistente"] é undefined
  const r = parseOrReject("chave-inexistente", CONTRACT_SCHEMAS["chave-inexistente"], req(), { any: 1 });
  assertEquals(r.ok, false);
  if (!r.ok) {
    const body = await readEnvelope(r.response);
    assertEquals(body.code, "contract_violation", "schema ausente deve ser contract_violation");
    assertEquals(body.contract, "chave-inexistente@v1");
    assert(body.details.some((d) => d.path === "root"), "detail deve apontar para root");
  }
});

Deno.test("P0 regressão: parseOrReject com schemas {} vazio → 422 sem lançar", async () => {
  const r = parseOrReject("x", {}, req(), { any: 1 });
  assertEquals(r.ok, false);
  if (!r.ok) {
    const body = await readEnvelope(r.response);
    assertEquals(body.code, "contract_violation");
  }
});

Deno.test("P0 regressão: parseRequestOrReject com schemas undefined → 422 sem lançar", async () => {
  const r = await parseRequestOrReject("outra-inexistente", CONTRACT_SCHEMAS["outra-inexistente"], req(), {});
  assertEquals(r.ok, false);
  if (!r.ok) {
    const body = await readEnvelope(r.response);
    assertEquals(body.code, "contract_violation");
  }
});

Deno.test("P0 fix: ai-churn-analysis, classify-emoji e classify-sticker têm schema registrado", () => {
  for (const name of ["ai-churn-analysis", "classify-emoji", "classify-sticker"]) {
    assert(CONTRACT_SCHEMAS[name] !== undefined, `${name} deve existir em CONTRACT_SCHEMAS`);
    assert(CONTRACTS[name] !== undefined, `${name} deve existir em CONTRACTS`);
    assertEquals(CONTRACTS[name].current, "v1");
  }
});
