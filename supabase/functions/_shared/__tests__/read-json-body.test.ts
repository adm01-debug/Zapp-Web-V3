/**
 * readJsonBodyOrEmpty (_shared/validation.ts) — Bloco 6 follow-up, correção
 * do antipadrão `req.json().catch(() => ({}))` (D1/etapa 27) sem quebrar
 * os ~35 endpoints cron/GET/health-check cujo contrato aceita "sem body".
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { readJsonBodyOrEmpty } from "../validation.ts";

function reqWithBody(body?: BodyInit): Request {
  return new Request("http://localhost", { method: "POST", body });
}

Deno.test("readJsonBodyOrEmpty: corpo genuinamente vazio → {}", async () => {
  const result = await readJsonBodyOrEmpty(reqWithBody(undefined));
  assertEquals(result, {});
});

Deno.test("readJsonBodyOrEmpty: corpo string vazia → {}", async () => {
  const result = await readJsonBodyOrEmpty(reqWithBody(""));
  assertEquals(result, {});
});

Deno.test("readJsonBodyOrEmpty: corpo só espaços em branco → {}", async () => {
  const result = await readJsonBodyOrEmpty(reqWithBody("   \n  "));
  assertEquals(result, {});
});

Deno.test("readJsonBodyOrEmpty: JSON válido → objeto parseado", async () => {
  const result = await readJsonBodyOrEmpty(reqWithBody(JSON.stringify({ limit: 20, dryRun: true })));
  assertEquals(result, { limit: 20, dryRun: true });
});

Deno.test("readJsonBodyOrEmpty: JSON válido mas array → array parseado (não é {})", async () => {
  const result = await readJsonBodyOrEmpty(reqWithBody(JSON.stringify([1, 2, 3])));
  assertEquals(result, [1, 2, 3]);
});

Deno.test("readJsonBodyOrEmpty: JSON malformado (não-vazio) → null (dispara invalid_json no gate)", async () => {
  const result = await readJsonBodyOrEmpty(reqWithBody("{invalid json"));
  assertEquals(result, null);
});

Deno.test("readJsonBodyOrEmpty: corpo é só uma string JSON válida (\"oi\") → string, não {}", async () => {
  // Regressão do antipadrão original: `{}`-catch mascarava ISSO também como
  // corpo vazio. O helper preserva a string real (não-estruturada — quem
  // consome via parseOrReject vai rejeitar por não ser objeto, corretamente,
  // via invalid_json — mas não é o helper que decide isso, é o gate).
  const result = await readJsonBodyOrEmpty(reqWithBody(JSON.stringify("oi")));
  assertEquals(result, "oi");
});
