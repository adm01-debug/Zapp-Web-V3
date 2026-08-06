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
 *   4. (Hardening fuzz 2026-08-04) schema com valor NÃO-ZodType (objeto cru)
 *      → NUNCA lança TypeError; vira 422 contract_violation.
 *   5. (Hardening fuzz 2026-08-04) schema cujo safeParse LANÇA (superRefine/
 *      z.custom com bug) → NUNCA vira 500; vira 422 contract_violation com o
 *      erro em details[0].message.
 *
 * Rodar: deno test supabase/functions/_shared/__tests__/contract-gate-undefined-schema.test.ts
 */

import { assertEquals, assert } from "jsr:@std/assert";
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

Deno.test("P0 fix: ai-churn-analysis e classify-sticker têm schema registrado", () => {
  for (const name of ["ai-churn-analysis", "classify-sticker"]) {
    assert(CONTRACT_SCHEMAS[name] !== undefined, `${name} deve existir em CONTRACT_SCHEMAS`);
    assert(CONTRACTS[name] !== undefined, `${name} deve existir em CONTRACTS`);
    assertEquals(CONTRACTS[name].current, "v1");
  }
});

// ─── Hardening fuzz 2026-08-04: schema NÃO-ZodType e safeParse que lança ────

Deno.test("Hardening: schema com valor NÃO-ZodType (objeto cru) NUNCA lança — 422", async () => {
  // Reproduzia TypeError: schema.safeParse is not a function → 500.
  const fakeSchema = { v1: { notAZod: true } } as unknown as Record<string, never>;
  const r = await parseOrReject("fn-hardening", fakeSchema as never, req(), { a: 1 });
  assertEquals(r.ok, false);
  if (!r.ok) {
    const body = await readEnvelope(r.response);
    assert(body.details.length > 0, "deve ter details");
  }
});

Deno.test("Hardening: schema cujo safeParse LANÇA nunca vira 500 — 422 com erro em details", async () => {
  // Reproduzia: exceção propagava pelo gate → 500.
  const z = await import("https://esm.sh/zod@3.23.8");
  const boomSchema = z.object({ x: z.string() }).superRefine(() => {
    throw new Error("boom no refine");
  });
  const r = await parseOrReject("fn-hardening", { v1: boomSchema } as never, req(), { x: "ok" });
  assertEquals(r.ok, false);
  if (!r.ok) {
    const body = await readEnvelope(r.response);
    assertEquals(body.code, "contract_violation");
    assert(
      body.details.some((d) => (d.message as string).includes("boom no refine")),
      "erro do schema deve aparecer em details",
    );
  }
});

Deno.test("Hardening: safeParse normal continua funcionando (sem regressão)", () => {
  const r = parseOrReject("evolution-credentials", CONTRACT_SCHEMAS["evolution-credentials"], req(), {});
  assertEquals(r.ok, true);
});
